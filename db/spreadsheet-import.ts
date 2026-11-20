import { createHash } from 'node:crypto';
import { authorize, type ChatGPTUser } from '@/app/chatgpt-auth';
import {
  planCashbookImport,
  type CashbookOptions,
} from '@/lib/cashbook-import';
import { readSpreadsheetText } from '@/lib/spreadsheet-document';
import { automaticDocumentFormat } from '@/lib/document-format';
import { isoDate } from '@/lib/finance';
import { getGdtRate } from '@/lib/gdt-exchange-rates';
import { applyCashbookSettlement } from './cashbook-settlements';
import { createAutomaticTransaction } from './automatic-transactions';
import { query, executeBatch } from './neon';
import {
  listTransactionRecords,
  saveTransactionRecord,
  type TransactionRecord,
} from './transaction-register';

export async function createSpreadsheetTransactions(
  documentId: string,
  options: CashbookOptions & { offset?: number },
  user: ChatGPTUser,
) {
  authorize(user, 'write');
  const document = (
    await query<{
      id: string;
      filename: string;
      mimetype: string;
      content: string;
      hash: string;
      linkedid: string | null;
      extraction: string | null;
    }>(
      'SELECT id,file_name AS filename,mime_type AS mimetype,content_base64 AS content,content_hash AS hash,linked_transaction_id AS linkedid,extraction_json AS extraction FROM documents WHERE id=$1 AND organization_id=$2',
      [documentId, user.organizationId],
    )
  )[0];
  if (!document) throw new Error('Document not found.');
  if (
    automaticDocumentFormat(document.filename, document.mimetype) !== 'excel' &&
    !/\.csv$/i.test(document.filename)
  )
    throw new Error('Select an Excel workbook.');
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000)
    throw new Error('Invalid import offset.');
  const data = Buffer.from(document.content, 'base64');
  const array = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  const plan = planCashbookImport(array, documentId, {
    ...options,
    cashbook: /cash[\s_\u200b-\u200f-]*book/i.test(document.filename),
    salesbook: /sale(?:s)?[\s_\u200b-\u200f-]*book/i.test(document.filename),
  });
  if (
    !plan.foundTable &&
    /(?:cash|sales?)[\s_\u200b-\u200f-]*book/i.test(document.filename)
  ) {
    const issues = [
      'Workbook transaction columns could not be recognized. The file was kept for review; it has not been treated as a single invoice.',
      ...plan.sheetIssues,
    ];
    await executeBatch([
      {
        text: 'UPDATE documents SET processing_status=$3,extraction_json=$4 WHERE id=$1 AND organization_id=$2',
        parameters: [
          documentId,
          user.organizationId,
          'Needs review',
          JSON.stringify({ batch: true, issues, reviewRows: [] }),
        ],
      },
    ]);
    return {
      batch: true,
      status: 'needs_review' as const,
      issues,
      rows: [],
      transactions: [],
      createdCount: 0,
      duplicateCount: 0,
      reviewCount: 1,
      nextOffset: null,
      totalRows: 0,
    };
  }
  if (!plan.foundTable)
    return createAutomaticTransaction(
      documentId,
      { ...options, text: readSpreadsheetText(array) },
      user,
    );
  if (document.linkedid)
    throw new Error(
      'This workbook already has a single-invoice record. Review it before importing its table.',
    );
  const fileHash =
    document.hash || createHash('sha256').update(data).digest('hex');
  for (const entry of plan.entries)
    entry.draft.id =
      'IMP-' +
      createHash('sha256')
        .update(
          [user.organizationId, fileHash, entry.sheet, entry.row].join('\0'),
        )
        .digest('hex')
        .slice(0, 32);
  const existing = await listTransactionRecords();
  const linkSource = async (
    record: TransactionRecord,
    entry: { sheet: string; row: number },
  ) => {
    const linked = await query(
      'SELECT transaction_id FROM document_transaction_links WHERE document_id=$1 AND transaction_id=$2 AND organization_id=$3',
      [documentId, record.id, user.organizationId],
    );
    if (!linked.length)
      await executeBatch(
        [
          {
            text: 'INSERT INTO document_transaction_links(document_id,transaction_id,organization_id,source_sheet,source_row) VALUES($1,$2,$3,$4,$5) ON CONFLICT(document_id,transaction_id) DO NOTHING',
            parameters: [
              documentId,
              record.id,
              user.organizationId,
              entry.sheet,
              entry.row,
            ],
          },
        ],
        { organizationId: user.organizationId, dates: [isoDate(record.date)] },
      );
  };
  const rows: {
    sheet: string;
    row: number;
    status: string;
    issues: string[];
    warnings: string[];
    draft?: TransactionRecord;
    transaction?: TransactionRecord;
  }[] = [];
  for (const entry of plan.entries.slice(offset, offset + 20)) {
    const id = entry.draft.id;
    let record = existing.find((t) => t.id === id);
    if (
      entry.draft.currency === 'USD' &&
      entry.draft.date &&
      (!record || record.approval === 'draft')
    ) {
      entry.warnings = entry.warnings.filter(
        (warning) => !warning.includes('exchange rate'),
      );
      try {
        const quote = await getGdtRate(entry.draft.date);
        entry.draft.exchangeRate = quote.rate;
        entry.draft.exchangeRateSource = quote;
        entry.draft.approval = 'Finance review';
      } catch {
        entry.draft.exchangeRate = '';
        entry.draft.approval = 'draft';
        entry.warnings.push(
          'The GDT rate is unavailable for this date. This row stays Draft until an official rate is available.',
        );
      }
    } else if (record)
      entry.warnings = entry.warnings.filter(
        (warning) => !warning.includes('exchange rate'),
      );
    if (
      record &&
      !entry.cashMovement &&
      record.approval === 'draft' &&
      !record.exchangeRate &&
      Number(entry.draft.exchangeRate) > 0
    )
      record = await saveTransactionRecord(
        {
          ...record,
          exchangeRate: entry.draft.exchangeRate,
          exchangeRateSource: entry.draft.exchangeRateSource,
          approval: 'Finance review',
        },
        user,
      );
    if (record) {
      await linkSource(record, entry);
      try {
        record = await applyCashbookSettlement(record, entry, user);
        rows.push({ ...entry, status: 'existing', transaction: record });
      } catch (error) {
        rows.push({
          ...entry,
          status: 'needs_review',
          transaction: record,
          issues: [
            error instanceof Error
              ? error.message
              : 'Cash book settlement needs review.',
          ],
        });
      }
    } else if (entry.issues.length)
      rows.push({ ...entry, status: 'needs_review' });
    else {
      try {
        let transaction = await saveTransactionRecord(entry.draft, user);
        transaction = await applyCashbookSettlement(transaction, entry, user);
        rows.push({ ...entry, status: 'created', transaction });
      } catch (error) {
        const concurrent = (await listTransactionRecords()).find(
          (t) => t.id === id,
        );
        if (concurrent) {
          await linkSource(concurrent, entry);
          rows.push({
            ...entry,
            status:
              concurrent.status === 'Paid' || !entry.cashMovement
                ? 'existing'
                : 'needs_review',
            transaction: concurrent,
            issues:
              concurrent.status === 'Paid' || !entry.cashMovement
                ? entry.issues
                : [
                    error instanceof Error
                      ? error.message
                      : 'Cash book settlement needs review.',
                  ],
          });
        } else
          rows.push({
            ...entry,
            status: 'needs_review',
            issues: [error instanceof Error ? error.message : 'Import failed.'],
          });
      }
    }
  }
  const createdCount = rows.filter((r) => r.status === 'created').length;
  const duplicateCount = rows.filter((r) => r.status === 'existing').length;
  const reviewCount = rows.filter(
    (r) => r.status === 'needs_review' || r.transaction?.approval === 'draft',
  ).length;
  const issues = [...plan.sheetIssues];
  if (!plan.entries.length)
    issues.push('No Receipt, Payment or Amount transaction rows were found.');
  const nextOffset = offset + 20 < plan.entries.length ? offset + 20 : null;
  const saved = await listTransactionRecords();
  const previous = document.extraction ? JSON.parse(document.extraction) : {};
  const runtimeIssues = new Map<string, (typeof rows)[number]>(
    (Array.isArray(previous.reviewRows) ? previous.reviewRows : []).map(
      (row: (typeof rows)[number]) => [row.sheet + ':' + row.row, row],
    ),
  );
  for (const row of rows) {
    runtimeIssues.delete(row.sheet + ':' + row.row);
    if (row.status === 'needs_review')
      runtimeIssues.set(row.sheet + ':' + row.row, row);
  }
  const reviewRows = plan.entries.flatMap((entry) => {
    const record = saved.find((t) => t.id === entry.draft.id);
    const runtime = runtimeIssues.get(entry.sheet + ':' + entry.row);
    if (runtime?.issues.length)
      return [{ ...entry, transaction: record, issues: runtime.issues }];
    if (record)
      return record.approval === 'draft'
        ? [{ ...entry, transaction: record, issues: entry.warnings }]
        : [];
    const failed = runtimeIssues.get(entry.sheet + ':' + entry.row);
    return [
      {
        ...entry,
        issues:
          failed?.issues ||
          (entry.issues.length
            ? entry.issues
            : ['This row has not been imported. Retry the workbook.']),
      },
    ];
  });
  await executeBatch([
    {
      text: 'UPDATE documents SET processing_status=$3,extraction_json=$4 WHERE id=$1 AND organization_id=$2',
      parameters: [
        documentId,
        user.organizationId,
        nextOffset !== null
          ? 'Importing'
          : reviewRows.length
            ? 'Needs review'
            : 'Imported',
        JSON.stringify({
          batch: true,
          totalRows: plan.entries.length,
          issues,
          reviewRows,
          currency: options.defaultCurrency,
        }),
      ],
    },
  ]);
  return {
    batch: true,
    status: createdCount
      ? ('created' as const)
      : duplicateCount
        ? ('existing' as const)
        : ('needs_review' as const),
    transactions: rows.flatMap((r) => (r.transaction ? [r.transaction] : [])),
    rows,
    issues,
    createdCount,
    duplicateCount,
    reviewCount,
    nextOffset,
    totalRows: plan.entries.length,
  };
}
