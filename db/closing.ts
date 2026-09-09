import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

const organizationId = 'ledgerflow-org';

export const closingChecklist = [
  'Bank reconciliation',
  'AR review',
  'AP review',
  'Expense review',
  'Missing-document review',
  'Outstanding advances',
  'Budget review',
  'Tax review',
  'Accrual review',
  'Management report',
];

export async function getClosingStatus(period: string): Promise<Record<string, boolean>> {
  const rows = await query<{ taskname: string; completed: boolean }>(`
    SELECT task_name AS taskname, completed FROM closing_tasks WHERE organization_id = $1 AND period = $2
  `, [organizationId, period]);
  const status: Record<string, boolean> = {};
  for (const name of closingChecklist) status[name] = false;
  for (const row of rows) status[row.taskname] = row.completed;
  return status;
}

export async function toggleClosingTask(period: string, taskName: string, completed: boolean, user: ChatGPTUser): Promise<Record<string, boolean>> {
  if (!closingChecklist.includes(taskName)) throw new Error('Unknown closing task.');
  const id = `closing-${stableKey(`${period}-${taskName}`)}`;
  const userId = `user-${stableKey(user.userId)}`;
  await executeBatch([
    { text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, 'LedgerFlow Organization', 'LEDGERFLOW', 'KHR', 'Asia/Phnom_Penh', 1) ON CONFLICT(id) DO NOTHING`, parameters: [organizationId] },
    { text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`, parameters: [userId, organizationId, user.userId, user.email, user.displayName] },
    { text: `INSERT INTO closing_tasks (id, organization_id, period, task_name, completed, completed_at)
      VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT (organization_id, period, task_name) DO UPDATE SET completed = excluded.completed, completed_at = excluded.completed_at, updated_at = CURRENT_TIMESTAMP`, parameters: [id, organizationId, period, taskName, completed] },
  ]);
  return getClosingStatus(period);
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}
