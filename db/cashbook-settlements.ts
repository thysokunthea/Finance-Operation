import { authorize, type ChatGPTUser } from '@/app/chatgpt-auth';
import { planCashbookImport, type CashbookRow } from '@/lib/cashbook-import';
import { getGdtRate } from '@/lib/gdt-exchange-rates';
import { isoDate, minor } from '@/lib/finance';
import { query, executeBatch } from './neon';
import {
  listTransactionRecords,
  type TransactionRecord,
} from './transaction-register';

/** Historical settlement evidence from a parsed cash book, not a bank transfer or approval. */
export async function applyCashbookSettlement(
  record: TransactionRecord,
  entry: CashbookRow,
  user: ChatGPTUser,
) {
  authorize(user, 'write');
  if (!entry.cashMovement) return record;
  if (entry.issues.length)
    throw new Error(
      'Cash book source row requires review: ' + entry.issues.join(' '),
    );
  const source = entry.draft.sourceDocument;
  if (
    !source ||
    isoDate(record.date) !== entry.draft.date ||
    record.currency !== entry.draft.currency ||
    record.type !== entry.draft.type ||
    minor(record.amount) !== minor(entry.draft.amount)
  )
    throw new Error(
      'The saved transaction does not match its cash book source. Review it before recording settlement.',
    );
  if (
    record.status === 'Paid' &&
    Number(record.balance) === 0 &&
    (record.cashbookSettlement?.state === 'valued' ||
      (record.payments?.length && !record.cashbookSettlement))
  )
    return record;
  if (record.status === 'Partially Paid')
    throw new Error(
      'Review the existing partial payments before applying cash book settlement.',
    );
  let rate = record.currency === 'KHR' ? '1' : record.exchangeRate || '';
  let quote = record.currency === 'USD' ? record.exchangeRateSource : undefined;
  if (record.currency === 'USD' && !(Number(rate) > 0)) {
    try {
      quote =
        entry.draft.exchangeRateSource || (await getGdtRate(entry.draft.date));
      rate = quote.rate;
    } catch {
      rate = '';
      quote = undefined;
    }
  }
  const valued = Number.isFinite(Number(rate)) && Number(rate) > 0;
  if (record.cashbookSettlement?.state === 'awaiting_gdt' && !valued)
    return record;
  const paymentId = 'CBPAY-' + record.id;
  const settlement = {
    documentId: source.id,
    sheet: source.sheet,
    row: source.row,
    date: entry.draft.date,
    state: valued ? ('valued' as const) : ('awaiting_gdt' as const),
    paymentId,
  };
  const promote =
    valued && record.approval === 'draft' && !(Number(record.exchangeRate) > 0);
  const patch = {
    cashbookSettlement: settlement,
    exchangeRate: rate,
    exchangeRateSource: quote,
    ...(promote ? { approval: 'Finance review' } : {}),
  };
  const statements: Array<{ text: string; parameters: unknown[] }> = [
    {
      text: `SELECT ledgerflow_assert(EXISTS(SELECT 1 FROM document_transaction_links l JOIN documents d ON d.id=l.document_id WHERE l.document_id=$1 AND l.transaction_id=$2 AND l.organization_id=$3 AND d.organization_id=$3 AND l.source_sheet=$4 AND l.source_row=$5), 'Cash book evidence is unavailable.')`,
      parameters: [
        source.id,
        record.id,
        user.organizationId,
        source.sheet,
        source.row,
      ],
    },
    {
      text: `SELECT ledgerflow_assert(EXISTS(SELECT 1 FROM transactions WHERE id=$1 AND organization_id=$2 AND version=$3 AND posting_status!='deleted' AND transaction_date=$4::date AND total_minor=$5 AND currency=$6 AND type=$7), 'The transaction changed. Reload before applying cash book settlement.')`,
      parameters: [
        record.id,
        user.organizationId,
        record.version,
        entry.draft.date,
        minor(entry.draft.amount),
        record.currency,
        record.type,
      ],
    },
    {
      text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transaction_payments WHERE transaction_id=$1 AND id!=$2), 'Review existing payments before importing cash book settlement.')`,
      parameters: [record.id, paymentId],
    },
    {
      text: `UPDATE transactions SET payment_status='Paid',approval_status=CASE WHEN $4::boolean AND LOWER(approval_status)='draft' THEN 'Finance review' ELSE approval_status END,metadata_json=(COALESCE(metadata_json,'{}')::jsonb || $3::jsonb)::text,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2`,
      parameters: [
        record.id,
        user.organizationId,
        JSON.stringify(patch),
        promote,
      ],
    },
    {
      text: `INSERT INTO audit_logs(id,organization_id,action,resource_type,resource_id,new_json,correlation_id) VALUES($1,$2,'cashbook_settlement_import','transaction',$3,$4,$1)`,
      parameters: [
        crypto.randomUUID(),
        user.organizationId,
        record.id,
        JSON.stringify({
          actor: user.userId,
          ...settlement,
          amountMinor: minor(entry.draft.amount),
          exchangeRate: rate,
          exchangeRateSource: quote,
        }),
      ],
    },
  ];
  if (valued)
    statements.push({
      text: `INSERT INTO transaction_payments(id,organization_id,transaction_id,payment_date,amount_minor,exchange_rate,method,reference,recorded_by,exchange_rate_source_json) VALUES($1,$2,$3,$4,$5,$6,'Cash book',$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
      parameters: [
        paymentId,
        user.organizationId,
        record.id,
        entry.draft.date,
        minor(entry.draft.amount),
        Number(rate),
        'cashbook:' + source.sheet + ':' + source.row,
        user.userId,
        quote ? JSON.stringify(quote) : null,
      ],
    });
  try {
    await executeBatch(statements, {
      organizationId: user.organizationId,
      dates: [entry.draft.date],
    });
  } catch (error) {
    const current = (await listTransactionRecords()).find(
      (row) => row.id === record.id,
    );
    if (
      current?.status === 'Paid' &&
      current.currency === entry.draft.currency &&
      current.type === entry.draft.type &&
      isoDate(current.date) === entry.draft.date &&
      minor(current.amount) === minor(entry.draft.amount)
    )
      return current;
    throw error;
  }
  const saved = (await listTransactionRecords()).find(
    (row) => row.id === record.id,
  );
  if (!saved) throw new Error('Cash book settlement could not be reloaded.');
  return saved;
}

export async function reconcileCashbookSettlements(
  user: ChatGPTUser,
  after = '',
) {
  authorize(user, 'write');
  const all = await listTransactionRecords();
  const candidates = all
    .filter(
      (row) =>
        row.sourceDocument &&
        ['cash_receipts', 'cash_disbursements'].includes(
          row.journalType || '',
        ) &&
        (row.status === 'Pending' ||
          row.cashbookSettlement?.state === 'awaiting_gdt') &&
        row.id > after,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const batch = candidates.slice(0, 20);
  const plans = new Map<string, ReturnType<typeof planCashbookImport>>();
  let updatedCount = 0;
  const issues: string[] = [];
  for (const record of batch) {
    const source = record.sourceDocument!;
    try {
      let plan = plans.get(source.id);
      if (!plan) {
        const document = (
          await query<{ filename: string; content: string }>(
            'SELECT file_name AS filename,content_base64 AS content FROM documents WHERE id=$1 AND organization_id=$2',
            [source.id, user.organizationId],
          )
        )[0];
        if (!document)
          throw new Error('The cash book source document is unavailable.');
        const bytes = Buffer.from(document.content, 'base64');
        plan = planCashbookImport(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
          source.id,
          {
            type: record.type === 'Income' ? 'Income' : 'Expense',
            defaultCurrency: record.currency === 'KHR' ? 'KHR' : 'USD',
            exchangeRate: record.exchangeRate,
            department: record.department,
            cashbook: /cash[\s_\u200b-\u200f-]*book/i.test(document.filename),
          },
        );
        plans.set(source.id, plan);
      }
      const entry = plan.entries.find(
        (entry) => entry.sheet === source.sheet && entry.row === source.row,
      );
      if (!entry || !entry.cashMovement) continue;
      const saved = await applyCashbookSettlement(record, entry, user);
      if (saved.version !== record.version) updatedCount++;
    } catch (error) {
      issues.push(
        record.id +
          ': ' +
          (error instanceof Error
            ? error.message
            : 'Settlement review required.'),
      );
    }
  }
  return {
    transactions: await listTransactionRecords(),
    updatedCount,
    issues,
    nextCursor: candidates.length > 20 ? batch[batch.length - 1].id : null,
  };
}
