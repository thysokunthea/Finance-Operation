import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

const organizationId = 'ledgerflow-org';

export type FinanceTaskItem = {
  id: string;
  name: string;
  category: string;
  related: string;
  due: string;
  priority: string;
  status: string;
};

export async function listTasks(): Promise<FinanceTaskItem[]> {
  const rows = await query<{ id: string; title: string; category: string; relatedreference: string | null; duelabel: string | null; priority: string; status: string }>(`
    SELECT id, title, category, related_reference AS relatedreference, due_label AS duelabel, priority, status
    FROM finance_tasks WHERE organization_id = $1 ORDER BY created_at DESC
  `, [organizationId]);
  return rows.map((row) => ({ id: row.id, name: row.title, category: row.category, related: row.relatedreference || 'Not linked', due: row.duelabel || 'No due date', priority: row.priority, status: row.status }));
}

export async function createTask(input: { name: string; category: string; due: string; priority: string }, user: ChatGPTUser): Promise<FinanceTaskItem[]> {
  if (!input.name.trim()) throw new Error('Task name is required.');
  const userId = `user-${stableKey(user.userId)}`;
  await executeBatch([
    { text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, 'LedgerFlow Organization', 'LEDGERFLOW', 'KHR', 'Asia/Phnom_Penh', 1) ON CONFLICT(id) DO NOTHING`, parameters: [organizationId] },
    { text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`, parameters: [userId, organizationId, user.userId, user.email, user.displayName] },
    { text: `INSERT INTO finance_tasks (id, organization_id, title, category, due_label, priority, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'Not Started', $7)`, parameters: [crypto.randomUUID(), organizationId, input.name, input.category || 'Manual', input.due || 'Today', input.priority || 'Medium', userId] },
  ]);
  return listTasks();
}

export async function completeTask(id: string): Promise<FinanceTaskItem[]> {
  await executeBatch([
    { text: `UPDATE finance_tasks SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2`, parameters: [id, organizationId] },
  ]);
  return listTasks();
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}
