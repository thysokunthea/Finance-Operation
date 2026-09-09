import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

const organizationId = 'ledgerflow-org';

export type PaymentRequestItem = {
  id: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
};

export async function listPaymentRequests(): Promise<PaymentRequestItem[]> {
  const rows = await query<{ id: string; title: string; category: string; amountminor: number | string; currency: string; status: string }>(`
    SELECT request_number AS id, title, category, amount_minor AS amountminor, currency, status
    FROM payment_requests WHERE organization_id = $1 ORDER BY created_at DESC
  `, [organizationId]);
  return rows.map((row) => ({ id: row.id, title: row.title, category: row.category, amount: Number(row.amountminor) / 100, currency: row.currency, status: row.status }));
}

export async function createPaymentRequest(input: { title: string; category: string; amount: number }, user: ChatGPTUser): Promise<PaymentRequestItem[]> {
  if (!input.title.trim()) throw new Error('A title is required.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Amount must be a positive number.');
  const userId = `user-${stableKey(user.userId)}`;
  const requestNumber = `REQ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  await executeBatch([
    { text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, 'LedgerFlow Organization', 'LEDGERFLOW', 'KHR', 'Asia/Phnom_Penh', 1) ON CONFLICT(id) DO NOTHING`, parameters: [organizationId] },
    { text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`, parameters: [userId, organizationId, user.userId, user.email, user.displayName] },
    { text: `INSERT INTO payment_requests (id, organization_id, request_number, title, category, amount_minor, currency, status, requested_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'USD', 'Draft', $7)`, parameters: [crypto.randomUUID(), organizationId, requestNumber, input.title, input.category || 'Operations', Math.round(input.amount * 100), userId] },
  ]);
  return listPaymentRequests();
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}
