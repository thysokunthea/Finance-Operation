import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

const organizationId = 'ledgerflow-org';

export type BudgetLine = {
  department: string;
  monthlyLimit: number;
  actual: number;
  currency: string;
  utilization: number;
};

export async function listBudgets(): Promise<BudgetLine[]> {
  const rows = await query<{ department: string; monthlylimitminor: number | string; currency: string; actualminor: number | string | null }>(`
    SELECT b.department, b.monthly_limit_minor AS monthlylimitminor, b.currency,
      COALESCE(SUM(CASE WHEN t.type = 'Expense' AND date_trunc('month', t.transaction_date) = date_trunc('month', CURRENT_DATE) AND t.posting_status != 'deleted' THEN t.total_minor END), 0) AS actualminor
    FROM budgets b
    LEFT JOIN departments d ON d.organization_id = b.organization_id AND d.name = b.department
    LEFT JOIN transactions t ON t.department_id = d.id AND t.organization_id = b.organization_id
    WHERE b.organization_id = $1
    GROUP BY b.department, b.monthly_limit_minor, b.currency
    ORDER BY b.department
  `, [organizationId]);

  return rows.map((row) => {
    const monthlyLimit = Number(row.monthlylimitminor) / 100;
    const actual = Number(row.actualminor || 0) / 100;
    return {
      department: row.department,
      monthlyLimit,
      actual,
      currency: row.currency,
      utilization: monthlyLimit > 0 ? Math.round((actual / monthlyLimit) * 100) : 0,
    };
  });
}

export async function saveBudget(department: string, monthlyLimit: number, user: ChatGPTUser): Promise<BudgetLine[]> {
  if (!department.trim()) throw new Error('Department name is required.');
  if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) throw new Error('Monthly limit must be a positive number.');
  const id = `budget-${stableKey(department.toLowerCase())}`;
  const userId = `user-${stableKey(user.userId)}`;
  await executeBatch([
    { text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, 'LedgerFlow Organization', 'LEDGERFLOW', 'KHR', 'Asia/Phnom_Penh', 1) ON CONFLICT(id) DO NOTHING`, parameters: [organizationId] },
    { text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`, parameters: [userId, organizationId, user.userId, user.email, user.displayName] },
    { text: `INSERT INTO departments (id, organization_id, code, name) VALUES ($1, $2, $3, $4) ON CONFLICT(organization_id, code) DO NOTHING`, parameters: [`department-${stableKey(department.toLowerCase())}`, organizationId, `DEPT-${stableKey(department)}`, department] },
    { text: `INSERT INTO budgets (id, organization_id, department, monthly_limit_minor, currency)
      VALUES ($1, $2, $3, $4, 'USD')
      ON CONFLICT (organization_id, department) DO UPDATE SET monthly_limit_minor = excluded.monthly_limit_minor, updated_at = CURRENT_TIMESTAMP, version = budgets.version + 1`, parameters: [id, organizationId, department, Math.round(monthlyLimit * 100)] },
  ]);
  return listBudgets();
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}
