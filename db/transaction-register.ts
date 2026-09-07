import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

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
};

const organizationId = 'ledgerflow-org';

export async function listTransactionRecords(): Promise<TransactionRecord[]> {
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
    }>(`
    SELECT t.transaction_number AS id, t.transaction_date AS date, t.type, COALESCE(t.reference_number, '') AS reference,
      COALESCE(c.name, '') AS party, COALESCE(d.name, '') AS department,
      t.total_minor AS totalminor, t.payment_status AS status, t.approval_status AS approval,
      COALESCE(u.display_name, '') AS owner, t.due_date AS duedate, t.currency,
      t.subtotal_minor AS subtotalminor, t.tax_minor AS taxminor, t.description,
      (SELECT a.new_json FROM audit_logs a WHERE a.resource_type = 'transaction' AND a.resource_id = t.id ORDER BY a.occurred_at DESC LIMIT 1) AS payloadjson
    FROM transactions t
    LEFT JOIN counterparties c ON c.id = t.counterparty_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN users u ON u.id = t.responsible_user_id
    WHERE t.organization_id = $1 AND t.posting_status != 'deleted'
    ORDER BY t.transaction_date DESC, t.created_at DESC
  `, [organizationId]);

  return result.map((row) => {
    const payload = parsePayload(row.payloadjson);
    return {
      id: row.id,
      date: formatDate(row.date),
      type: row.type,
      reference: row.reference,
      party: row.party,
      department: row.department,
      category: payload.category || '',
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
      exchangeRate: payload.exchangeRate || '',
    };
  });
}

export async function saveTransactionRecord(
  record: TransactionRecord,
  user: ChatGPTUser,
): Promise<TransactionRecord> {
  const totalMinor = toMinor(record.amount);
  const taxMinor = Math.max(0, toMinor(record.tax || '0'));
  const suppliedSubtotal = record.subtotal
    ? toMinor(record.subtotal)
    : totalMinor - taxMinor;
  const subtotalMinor = Math.min(totalMinor, Math.max(0, suppliedSubtotal));
  const balancedTaxMinor = Math.max(0, totalMinor - subtotalMinor);
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

  const userId = `user-${stableKey(user.userId)}`;
  const counterpartyId = `counterparty-${stableKey(record.party.toLowerCase())}`;
  const departmentId = `department-${stableKey(record.department.toLowerCase())}`;
  const existing = (await query<Record<string, unknown>>(
    'SELECT * FROM transactions WHERE id = $1 AND organization_id = $2',
    [record.id, organizationId],
  ))[0];
  if (!existing) {
    const possibleDuplicates = await query<{ transaction_number: string; transaction_date: string }>(`SELECT transaction_number, transaction_date FROM transactions
      WHERE organization_id = $1 AND reference_number = $2 AND counterparty_id = $3 AND total_minor = $4
      AND posting_status != 'deleted' LIMIT 10`, [organizationId, record.reference, counterpartyId, totalMinor]);
    const duplicate = possibleDuplicates.find(
      (item) =>
        normalizeDate(item.transaction_date) === normalizeDate(record.date),
    );
    if (duplicate)
      throw new Error(
        `Possible duplicate of ${duplicate.transaction_number}. Open the existing transaction instead of saving it again.`,
      );
  }

  const statements = [
    { text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP`, parameters: [organizationId, 'LedgerFlow Organization', 'LEDGERFLOW', record.currency || 'KHR', 'Asia/Phnom_Penh', 1] },
    { text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`, parameters: [userId, organizationId, user.userId, user.email, user.displayName] },
    { text: `INSERT INTO counterparties (id, organization_id, type, code, name)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, updated_at = CURRENT_TIMESTAMP`, parameters: [counterpartyId, organizationId, record.type === 'Income' ? 'customer' : 'vendor', `CP-${stableKey(record.party)}`, record.party] },
    { text: `INSERT INTO departments (id, organization_id, code, name)
      VALUES ($1, $2, $3, $4) ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP`, parameters: [departmentId, organizationId, `DEPT-${stableKey(record.department)}`, record.department] },
    { text: `INSERT INTO transactions (
      id, organization_id, transaction_number, transaction_date, type, reference_number, description,
      counterparty_id, department_id, currency, subtotal_minor, tax_minor, total_minor, due_date,
      payment_status, approval_status, posting_status, responsible_user_id, created_by, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'unposted', $17, $18, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET transaction_date = excluded.transaction_date, type = excluded.type,
      reference_number = excluded.reference_number, description = excluded.description, counterparty_id = excluded.counterparty_id,
      department_id = excluded.department_id, currency = excluded.currency, subtotal_minor = excluded.subtotal_minor,
      tax_minor = excluded.tax_minor, total_minor = excluded.total_minor, due_date = excluded.due_date,
      payment_status = excluded.payment_status, approval_status = excluded.approval_status,
      responsible_user_id = excluded.responsible_user_id, updated_at = CURRENT_TIMESTAMP, version = transactions.version + 1`, parameters: [record.id, organizationId, record.id, normalizeDate(record.date), record.type, record.reference, record.description, counterpartyId, departmentId, record.currency || 'KHR', subtotalMinor, balancedTaxMinor, totalMinor, record.dueDate ? normalizeDate(record.dueDate) : null, record.status, record.approval, userId, userId] },
    { text: `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, resource_type, resource_id, previous_json, new_json, reason, correlation_id)
      VALUES ($1, $2, $3, $4, 'transaction', $5, $6, $7, $8, $9)`, parameters: [crypto.randomUUID(), organizationId, userId, existing ? 'update' : 'create', record.id, existing ? JSON.stringify(existing) : null, JSON.stringify(record), existing ? 'Transaction edited and returned for finance review.' : 'Transaction recorded.', crypto.randomUUID()] },
  ];
  await executeBatch(statements);
  const saved = (await listTransactionRecords()).find(
    (item) => item.id === record.id,
  );
  if (!saved)
    throw new Error('Transaction was saved but could not be reloaded.');
  return saved;
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

function normalizeDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (match) {
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
    ].indexOf(match[2].slice(0, 3));
    if (month >= 0)
      return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : value;
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
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
