import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

const organizationId = 'ledgerflow-org';

export type ApprovalItem = {
  id: string;
  name: string;
  owner: string;
  amount: string;
  status: string;
  reference: string;
  department: string;
  date: string;
};

export async function listPendingApprovals(): Promise<ApprovalItem[]> {
  const result = await query<{
    id: string; description: string; reference: string | null; transactiondate: string;
    totalminor: number | string; currency: string; status: string; owner: string; department: string;
  }>(`
    SELECT t.id, t.description, t.reference_number AS reference, t.transaction_date AS transactionDate,
      t.total_minor AS totalminor, t.currency, t.approval_status AS status,
      COALESCE(u.display_name, 'Finance staff') AS owner, COALESCE(d.name, '') AS department
    FROM transactions t
    LEFT JOIN users u ON u.id = t.created_by
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE t.organization_id = $1 AND t.posting_status != 'deleted'
      AND LOWER(t.approval_status) NOT IN ('approved', 'rejected')
    ORDER BY t.transaction_date DESC, t.created_at DESC
  `, [organizationId]);

  return result.map((row) => ({
    id: row.id,
    name: row.description || row.reference || row.id,
    owner: row.owner,
    amount: new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency || 'KHR' }).format(Number(row.totalminor) / 100),
    status: row.status,
    reference: row.reference || '',
    department: row.department,
    date: formatDate(row.transactiondate),
  }));
}

export async function approveTransaction(transactionId: string, user: ChatGPTUser): Promise<ApprovalItem> {
  const existing = (await query<{ id: string; approvalstatus: string; transactionnumber: string }>(`
    SELECT id, approval_status AS approvalStatus, transaction_number AS transactionNumber
    FROM transactions WHERE id = $1 AND organization_id = $2 AND posting_status != 'deleted'
  `, [transactionId, organizationId]))[0];
  if (!existing) throw new Error('Transaction was not found.');
  if (existing.approvalstatus.toLowerCase() === 'approved') throw new Error('This transaction is already approved.');
  if (existing.approvalstatus.toLowerCase() === 'rejected') throw new Error('A rejected transaction must be returned for review before approval.');

  const actorUserId = `user-${stableKey(user.userId)}`;
  const correlationId = crypto.randomUUID();
  await executeBatch([
    { text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`, parameters: [actorUserId, organizationId, user.userId, user.email, user.displayName] },
    { text: `UPDATE transactions SET approval_status = 'Approved', updated_at = CURRENT_TIMESTAMP,
      version = version + 1 WHERE id = $1 AND organization_id = $2`, parameters: [transactionId, organizationId] },
    { text: `INSERT INTO audit_logs
      (id, organization_id, actor_user_id, action, resource_type, resource_id, previous_json, new_json, reason, correlation_id)
      VALUES ($1, $2, $3, 'approve', 'transaction', $4, $5, $6, $7, $8)`, parameters: [crypto.randomUUID(), organizationId, actorUserId, transactionId,
        JSON.stringify({ approvalStatus: existing.approvalstatus }), JSON.stringify({ approvalStatus: 'Approved' }),
        `Transaction ${existing.transactionnumber} approved by an authorized finance user.`, correlationId] },
    { text: `INSERT INTO outbox_events
      (id, organization_id, event_type, aggregate_type, aggregate_id, payload_json, idempotency_key)
      VALUES ($1, $2, 'transaction.approved', 'transaction', $3, $4, $5)`, parameters: [crypto.randomUUID(), organizationId, transactionId,
        JSON.stringify({ transactionId, approvedBy: actorUserId }), `transaction-approved-${transactionId}-${correlationId}`] },
  ]);

  return { id: transactionId, name: existing.transactionnumber, owner: user.displayName, amount: '', status: 'Approved', reference: '', department: '', date: '' };
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}

function formatDate(value: string | Date) {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(match[2]) - 1];
  return `${Number(match[3])} ${month} ${match[1]}`;
}
