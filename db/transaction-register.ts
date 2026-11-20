import { authorize } from '@/app/chatgpt-auth';
import { isoDate, minor, reportingValue } from '@/lib/finance';
import { workspaceId, scopedKey } from '@/app/chatgpt-auth';
import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';
import { getGdtRate, type GdtQuote } from '@/lib/gdt-exchange-rates';
import {
  classifyJournal,
  getAccount,
  suggestAccount,
} from '@/lib/chart-of-accounts';

export type TransactionRecord = {
  id: string;
  date: string;
  type: string;
  reference: string;
  party: string;
  department: string;
  category: string;
  amount: string;
  status: string;
  approval: string;
  owner: string;
  dueDate?: string;
  currency?: string;
  subtotal?: string;
  tax?: string;
  description?: string;
  paymentMethod?: string;
  purchaseOrder?: string;
  documentType?: string;
  taxTreatment?: string;
  exchangeRate?: string;
  exchangeRateSource?: GdtQuote;
  journalType?: string;
  accountCode?: string;
  accountName?: string;
  reportingAmount?: number | null;
  paidAmount?: number;
  balance?: number;
  version?: number;
  documentIds?: string[];
  sourceDocument?: { id: string; sheet: string; row: number };
  cashReportingAmount?: number;
  payments?: Array<{ date: string; amount: number; reportingAmount: number }>;
  missingExchangeRate?: boolean;
};

export async function listTransactionRecords(): Promise<TransactionRecord[]> {
  const organizationId = await workspaceId();
  const result = await query<{
    id: string;
    date: string;
    type: string;
    reference: string;
    party: string;
    department: string;
    totalminor: number | string;
    status: string;
    approval: string;
    owner: string;
    duedate: string | null;
    currency: string;
    subtotalminor: number | string;
    taxminor: number | string;
    description: string;
    payloadjson: string | null;
    version: number;
    paidminor: string;
    paymentsjson: string;
  }>(
    `
    SELECT t.transaction_number AS id, t.transaction_date AS date, t.type, COALESCE(t.reference_number, '') AS reference,
      COALESCE(c.name, '') AS party, COALESCE(d.name, '') AS department,
      t.total_minor AS totalminor, t.payment_status AS status, t.approval_status AS approval,
      COALESCE(u.display_name, '') AS owner, t.due_date AS duedate, t.currency,
      t.subtotal_minor AS subtotalminor, t.tax_minor AS taxminor, t.description,
      t.metadata_json AS payloadjson, t.version,
      COALESCE((SELECT SUM(p.amount_minor) FROM transaction_payments p WHERE p.transaction_id = t.id),
        CASE WHEN LOWER(t.payment_status) = 'paid' THEN t.total_minor ELSE 0 END) AS paidminor,
      COALESCE((SELECT json_agg(json_build_object('date',p.payment_date,'amount',p.amount_minor / 100.0,'reportingAmount',p.amount_minor / 100.0 * p.exchange_rate))::text
        FROM transaction_payments p WHERE p.transaction_id = t.id), '[]') AS paymentsjson
    FROM transactions t
    LEFT JOIN counterparties c ON c.id = t.counterparty_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN users u ON u.id = t.responsible_user_id
    WHERE t.organization_id = $1 AND t.posting_status != 'deleted'
    ORDER BY t.transaction_date DESC, t.created_at DESC
  `,
    [organizationId],
  );

  return result.map((row) => {
    const payload = parsePayload(row.payloadjson);
    const category = payload.category || '';
    const accountCode =
      payload.accountCode ||
      suggestAccount(row.type, category, row.description || '').code;
    const accountName =
      getAccount(accountCode)?.name ||
      suggestAccount(row.type, category, row.description || '').name;
    const amount = Number(row.totalminor) / 100;
    const paidAmount = Number(row.paidminor) / 100;
    const reportingAmount = reportingValue({
      amount: String(amount),
      currency: row.currency,
      exchangeRate: payload.exchangeRate,
    });
    const payments = JSON.parse(row.paymentsjson) as NonNullable<
      TransactionRecord['payments']
    >;
    if (!payments.length && paidAmount > 0 && reportingAmount !== null)
      payments.push({
        date: isoDate(row.date),
        amount: paidAmount,
        reportingAmount,
      });
    return {
      id: row.id,
      version: row.version,
      paidAmount,
      balance: Math.max(0, amount - paidAmount),
      reportingAmount,
      payments,
      sourceDocument: payload.sourceDocument,
      cashReportingAmount: payments.reduce(
        (sum, payment) => sum + payment.reportingAmount,
        0,
      ),
      missingExchangeRate: reportingAmount === null,
      date: formatDate(row.date),
      type: row.type,
      reference: row.reference,
      party: row.party,
      department: row.department,
      category,
      amount: formatMoney(Number(row.totalminor), row.currency),
      status: row.status,
      approval: row.approval,
      owner: row.owner,
      dueDate: row.duedate ? formatDate(row.duedate) : '',
      currency: row.currency,
      subtotal: (Number(row.subtotalminor) / 100).toFixed(2),
      tax: (Number(row.taxminor) / 100).toFixed(2),
      description: row.description,
      paymentMethod: payload.paymentMethod || '',
      purchaseOrder: payload.purchaseOrder || '',
      documentType: payload.documentType || '',
      taxTreatment: payload.taxTreatment || 'Standard VAT 10%',
      exchangeRate: row.currency === 'KHR' ? '1' : payload.exchangeRate || '',
      exchangeRateSource: payload.exchangeRateSource,
      journalType: payload.journalType || classifyJournal(row.type, row.status),
      accountCode,
      accountName,
    };
  });
}

export async function saveTransactionRecord(
  record: TransactionRecord,
  user: ChatGPTUser,
): Promise<TransactionRecord> {
  const organizationId = await workspaceId();
  authorize(user, 'write');
  record.date = isoDate(record.date);
  if (record.dueDate) record.dueDate = isoDate(record.dueDate);
  if (
    !['Income', 'Expense'].includes(record.type) ||
    !['USD', 'KHR'].includes(record.currency || '')
  )
    throw new Error('Select a valid type and currency.');
  if (record.currency === 'KHR') {
    record.exchangeRate = '1';
    record.exchangeRateSource = undefined;
  }
  const importedDraft = record.approval === 'draft' && !!record.sourceDocument;
  if (record.currency === 'USD') {
    try {
      const quote = await getGdtRate(record.date);
      record.exchangeRate = quote.rate;
      record.exchangeRateSource = quote;
    } catch {
      if (!importedDraft)
        throw new Error(
          'The official GDT rate is unavailable for this date. Try again before saving.',
        );
      record.exchangeRate = '';
      record.exchangeRateSource = undefined;
    }
  }
  if (
    !importedDraft &&
    (!Number.isFinite(Number(record.exchangeRate)) ||
      Number(record.exchangeRate) <= 0)
  )
    throw new Error('Enter the KHR exchange rate for this transaction.');
  record.status = 'Pending';
  record.approval = record.approval === 'draft' ? 'draft' : 'Finance review';
  const totalMinor = minor(record.amount);
  const taxMinor = Math.max(0, toMinor(record.tax || '0'));
  const suppliedSubtotal = record.subtotal
    ? toMinor(record.subtotal)
    : totalMinor - taxMinor;
  const subtotalMinor = Math.min(totalMinor, Math.max(0, suppliedSubtotal));
  const balancedTaxMinor = taxMinor;
  if (subtotalMinor + taxMinor !== totalMinor)
    throw new Error('Subtotal plus tax must equal the total.');
  if (
    !record.id ||
    !record.reference ||
    !record.party ||
    !record.department ||
    !record.description ||
    totalMinor <= 0
  ) {
    throw new Error('Required transaction fields are missing.');
  }

  const userId = `user-${stableKey(scopedKey(organizationId, user.userId))}`;
  const counterpartyId = `counterparty-${stableKey(scopedKey(organizationId, record.party.toLowerCase()))}`;
  const departmentId = `department-${stableKey(scopedKey(organizationId, record.department.toLowerCase()))}`;
  const existing = (
    await query<Record<string, unknown>>(
      'SELECT * FROM transactions WHERE id = $1 AND organization_id = $2',
      [record.id, organizationId],
    )
  )[0];
  if (existing?.posting_status === 'deleted')
    throw new Error('Deleted transactions cannot be edited.');
  if (existing && Number(record.version) !== Number(existing.version))
    throw new Error('This transaction has changed. Reload before editing.');
  if (!existing) {
    const possibleDuplicates = await query<{
      transaction_number: string;
      transaction_date: string;
    }>(
      `SELECT transaction_number, transaction_date FROM transactions
      WHERE organization_id = $1 AND reference_number = $2 AND counterparty_id = $3 AND total_minor = $4 AND currency = $5
      AND posting_status != 'deleted'`,
      [
        organizationId,
        record.reference,
        counterpartyId,
        totalMinor,
        record.currency,
      ],
    );
    const duplicate = possibleDuplicates.find(
      (item) =>
        normalizeDate(item.transaction_date) === normalizeDate(record.date),
    );
    if (duplicate)
      throw new Error(
        `Possible duplicate of ${duplicate.transaction_number}. Open the existing transaction instead of saving it again.`,
      );
  }

  const documentIds = [...new Set(record.documentIds || [])];
  const source = record.sourceDocument;
  if (
    source &&
    (typeof source.id !== 'string' ||
      !source.id ||
      typeof source.sheet !== 'string' ||
      !source.sheet ||
      source.sheet.length > 200 ||
      !Number.isInteger(source.row) ||
      source.row < 1 ||
      source.row > 1001)
  )
    throw new Error('Invalid spreadsheet source row.');
  if (
    !Array.isArray(record.documentIds || []) ||
    documentIds.length > 20 ||
    documentIds.some((id) => typeof id !== 'string' || !id)
  )
    throw new Error('Invalid document attachments.');
  const statements = [
    {
      text: `SELECT ledgerflow_assert((SELECT COUNT(*) FROM documents WHERE organization_id=$1 AND id=ANY($2::text[]) AND (linked_transaction_id IS NULL OR linked_transaction_id=$3)) = cardinality($2::text[]), 'One or more attachments are unavailable or already linked to another transaction.')`,
      parameters: [organizationId, documentIds, record.id],
    },
    {
      text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transactions WHERE organization_id = $1 AND reference_number = $2
      AND counterparty_id = $3 AND total_minor = $4 AND currency = $5 AND transaction_date = $6::date AND id != $7 AND posting_status != 'deleted'), 'Possible duplicate transaction.')`,
      parameters: [
        organizationId,
        record.reference,
        counterpartyId,
        totalMinor,
        record.currency,
        record.date,
        record.id,
      ],
    },
    {
      text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transactions WHERE id = $1 AND (organization_id != $2 OR version != $3 OR posting_status = 'deleted' OR NOT $4::boolean)), 'Transaction changed or is not accessible.')`,
      parameters: [
        record.id,
        organizationId,
        existing ? Number(existing.version) : 1,
        !!existing,
      ],
    },
    {
      text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transaction_payments WHERE transaction_id = $1) AND NOT EXISTS(SELECT 1 FROM transactions WHERE id = $1 AND LOWER(payment_status) = 'paid'), 'Transactions with payments cannot be edited; record a separate adjustment.')`,
      parameters: [record.id],
    },
    {
      text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP`,
      parameters: [
        organizationId,
        'LedgerFlow Organization',
        organizationId,
        record.currency || 'KHR',
        'Asia/Phnom_Penh',
        1,
      ],
    },
    {
      text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`,
      parameters: [
        userId,
        organizationId,
        user.userId,
        user.email,
        user.displayName,
      ],
    },
    {
      text: `INSERT INTO counterparties (id, organization_id, type, code, name)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, updated_at = CURRENT_TIMESTAMP`,
      parameters: [
        counterpartyId,
        organizationId,
        record.type === 'Income' ? 'customer' : 'vendor',
        `CP-${stableKey(scopedKey(organizationId, record.party))}`,
        record.party,
      ],
    },
    {
      text: `INSERT INTO departments (id, organization_id, code, name)
      VALUES ($1, $2, $3, $4) ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP`,
      parameters: [
        departmentId,
        organizationId,
        `DEPT-${stableKey(scopedKey(organizationId, record.department))}`,
        record.department,
      ],
    },
    {
      text: `INSERT INTO transactions (
      id, organization_id, transaction_number, transaction_date, type, reference_number, description,
      counterparty_id, department_id, currency, subtotal_minor, tax_minor, total_minor, due_date,
      payment_status, approval_status, posting_status, responsible_user_id, created_by, updated_at, metadata_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'unposted', $17, $18, CURRENT_TIMESTAMP, $19)
    ON CONFLICT(id) DO UPDATE SET transaction_date = excluded.transaction_date, type = excluded.type,
      reference_number = excluded.reference_number, description = excluded.description, counterparty_id = excluded.counterparty_id,
      department_id = excluded.department_id, currency = excluded.currency, subtotal_minor = excluded.subtotal_minor,
      tax_minor = excluded.tax_minor, total_minor = excluded.total_minor, due_date = excluded.due_date,
      payment_status = excluded.payment_status, approval_status = excluded.approval_status, metadata_json = excluded.metadata_json,
      responsible_user_id = excluded.responsible_user_id, updated_at = CURRENT_TIMESTAMP, version = transactions.version + 1`,
      parameters: [
        record.id,
        organizationId,
        record.id,
        normalizeDate(record.date),
        record.type,
        record.reference,
        record.description,
        counterpartyId,
        departmentId,
        record.currency || 'KHR',
        subtotalMinor,
        balancedTaxMinor,
        totalMinor,
        record.dueDate ? normalizeDate(record.dueDate) : null,
        record.status,
        record.approval,
        userId,
        userId,
        JSON.stringify(record),
      ],
    },
    {
      text: `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, resource_type, resource_id, previous_json, new_json, reason, correlation_id)
      VALUES ($1, $2, $3, $4, 'transaction', $5, $6, $7, $8, $9)`,
      parameters: [
        crypto.randomUUID(),
        organizationId,
        userId,
        existing ? 'update' : 'create',
        record.id,
        existing ? JSON.stringify(existing) : null,
        JSON.stringify(record),
        existing
          ? 'Transaction edited and returned for finance review.'
          : 'Transaction recorded.',
        crypto.randomUUID(),
      ],
    },
  ];
  if (source)
    statements.unshift({
      text: `SELECT ledgerflow_assert(EXISTS(SELECT 1 FROM documents WHERE id=$1 AND organization_id=$2 AND (linked_transaction_id IS NULL OR linked_transaction_id=$3)), 'Spreadsheet source is unavailable or already linked.')`,
      parameters: [source.id, organizationId, record.id],
    });
  if (source)
    statements.push(
      {
        text: `INSERT INTO document_transaction_links(document_id,transaction_id,organization_id,source_sheet,source_row) VALUES($1,$2,$3,$4,$5) ON CONFLICT(document_id,transaction_id) DO NOTHING`,
        parameters: [
          source.id,
          record.id,
          organizationId,
          source.sheet,
          source.row,
        ],
      },
      {
        text: `UPDATE documents SET processing_status='Imported',status='Pending review' WHERE id=$1 AND organization_id=$2`,
        parameters: [source.id, organizationId],
      },
    );
  if (documentIds.length)
    statements.push(
      {
        text: `UPDATE documents SET linked_transaction_id=$3,linked_reference=$4,status='Pending review',processing_status='Created' WHERE organization_id=$1 AND id=ANY($2::text[])`,
        parameters: [organizationId, documentIds, record.id, record.reference],
      },
      {
        text: `INSERT INTO audit_logs(id,organization_id,actor_user_id,action,resource_type,resource_id,new_json,correlation_id) VALUES($1,$2,$3,'attach','transaction',$4,$5,$1)`,
        parameters: [
          crypto.randomUUID(),
          organizationId,
          userId,
          record.id,
          JSON.stringify({ documentIds }),
        ],
      },
    );
  await executeBatch(statements, {
    organizationId,
    dates: [
      record.date,
      ...(existing ? [isoDate(String(existing.transaction_date))] : []),
    ],
  });
  const saved = (await listTransactionRecords()).find(
    (item) => item.id === record.id,
  );
  if (!saved)
    throw new Error('Transaction was saved but could not be reloaded.');
  return saved;
}

export async function deleteTransactionRecord(
  id: string,
  user: ChatGPTUser,
): Promise<void> {
  const organizationId = await workspaceId();
  authorize(user, 'write');
  const existing = (
    await query<Record<string, unknown>>(
      `SELECT * FROM transactions WHERE id = $1 AND organization_id = $2 AND posting_status != 'deleted'`,
      [id, organizationId],
    )
  )[0];
  if (!existing) throw new Error('Transaction not found.');

  const userId = `user-${stableKey(scopedKey(organizationId, user.userId))}`;
  await executeBatch(
    [
      {
        text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transaction_payments WHERE transaction_id = $1) AND NOT EXISTS(SELECT 1 FROM transactions WHERE id = $1 AND LOWER(payment_status) = 'paid'), 'Transactions with payments cannot be deleted.')`,
        parameters: [id],
      },
      {
        text: `SELECT ledgerflow_assert((SELECT version = $3 FROM transactions WHERE id=$1 AND organization_id=$2), 'Transaction changed. Reload before deleting.')`,
        parameters: [id, organizationId, existing.version],
      },
      {
        text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(id) DO NOTHING`,
        parameters: [
          organizationId,
          'LedgerFlow Organization',
          organizationId,
          'KHR',
          'Asia/Phnom_Penh',
          1,
        ],
      },
      {
        text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`,
        parameters: [
          userId,
          organizationId,
          user.userId,
          user.email,
          user.displayName,
        ],
      },
      {
        text: `UPDATE transactions SET posting_status = 'deleted', updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = $1 AND organization_id = $2`,
        parameters: [id, organizationId],
      },
      {
        text: `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, resource_type, resource_id, previous_json, new_json, reason, correlation_id)
      VALUES ($1, $2, $3, 'delete', 'transaction', $4, $5, NULL, $6, $7)`,
        parameters: [
          crypto.randomUUID(),
          organizationId,
          userId,
          id,
          JSON.stringify(existing),
          'Transaction deleted by user.',
          crypto.randomUUID(),
        ],
      },
    ],
    { organizationId, dates: [isoDate(String(existing.transaction_date))] },
  );
}

function toMinor(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(minor / 100);
}

function normalizeDate(value: string | Date) {
  return isoDate(value);
}

function formatDate(value: string | Date) {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][Number(match[2]) - 1];
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}

function parsePayload(value: string | null): Partial<TransactionRecord> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Partial<TransactionRecord>;
  } catch {
    return {};
  }
}
