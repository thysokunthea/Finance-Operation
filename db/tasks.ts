import { workspaceId, scopedKey } from '@/app/chatgpt-auth';
import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

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
  const organizationId = await workspaceId();
  const rows = await query<{
    id: string;
    title: string;
    category: string;
    relatedreference: string | null;
    duelabel: string | null;
    priority: string;
    status: string;
  }>(
    `
    SELECT id, title, category, related_reference AS relatedreference, due_label AS duelabel, priority, status
    FROM finance_tasks WHERE organization_id = $1 ORDER BY created_at DESC
  `,
    [organizationId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.title,
    category: row.category,
    related: row.relatedreference || 'Not linked',
    due: row.duelabel || 'No due date',
    priority: row.priority,
    status: row.status,
  }));
}

export async function createTask(
  input: {
    name: string;
    category: string;
    due: string;
    priority: string;
    related?: string;
    status?: string;
  },
  user: ChatGPTUser,
): Promise<FinanceTaskItem[]> {
  const organizationId = await workspaceId();
  if (!input.name?.trim()) throw new Error('Task name is required.');
  if (
    !['Low', 'Medium', 'High'].includes(input.priority) ||
    !['Not Started', 'In Progress', 'Waiting', 'Completed'].includes(
      input.status || 'Not Started',
    )
  )
    throw new Error('Select a valid priority and status.');
  if (input.due && !/^\d{4}-\d{2}-\d{2}$/.test(input.due))
    throw new Error('Select a valid due date.');
  const userId = `user-${stableKey(scopedKey(organizationId, user.userId))}`;
  await executeBatch([
    {
      text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, 'LedgerFlow Organization', $1, 'KHR', 'Asia/Phnom_Penh', 1) ON CONFLICT(id) DO NOTHING`,
      parameters: [organizationId],
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
      text: `INSERT INTO finance_tasks (id, organization_id, title, category, due_label, priority, status, created_by, related_reference)
      VALUES ($1, $2, $3, $4, $5, $6, $9, $7, $8)`,
      parameters: [
        crypto.randomUUID(),
        organizationId,
        input.name,
        input.category || 'Manual',
        input.due || '',
        input.priority || 'Medium',
        userId,
        input.related || null,
        input.status || 'Not Started',
      ],
    },
  ]);
  return listTasks();
}

export async function completeTask(id: string): Promise<FinanceTaskItem[]> {
  const organizationId = await workspaceId();
  await executeBatch([
    {
      text: `UPDATE finance_tasks SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2`,
      parameters: [id, organizationId],
    },
  ]);
  return listTasks();
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}

export async function updateTask(input: {
  id: string;
  name?: string;
  category?: string;
  due?: string;
  priority?: string;
  related?: string;
  status?: string;
}) {
  const organizationId = await workspaceId();
  const existing = (await listTasks()).find((task) => task.id === input.id);
  if (!existing) throw new Error('Task not found.');
  const next = { ...existing, ...input };
  if (
    !next.name.trim() ||
    !['Low', 'Medium', 'High'].includes(next.priority) ||
    !['Not Started', 'In Progress', 'Waiting', 'Completed'].includes(
      next.status,
    )
  )
    throw new Error('Enter a task name, priority and valid status.');
  if (input.due && !/^\d{4}-\d{2}-\d{2}$/.test(input.due))
    throw new Error('Select a due date.');
  await executeBatch([
    {
      text: 'UPDATE finance_tasks SET title=$3, category=$4, due_label=$5, priority=$6, related_reference=$7, status=$8, updated_at=now() WHERE id=$1 AND organization_id=$2',
      parameters: [
        input.id,
        organizationId,
        next.name,
        next.category,
        next.due,
        next.priority,
        next.related,
        next.status,
      ],
    },
  ]);
  return listTasks();
}
