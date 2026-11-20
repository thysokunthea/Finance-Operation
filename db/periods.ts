import { authorize, type ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from './neon';
import { closingChecklist } from './closing';
import { validatePeriod } from '@/lib/finance';

export async function isPeriodClosed(period: string, user: ChatGPTUser) {
  authorize(user);
  validatePeriod(period);
  return (
    (
      await query(
        'SELECT 1 FROM closed_periods WHERE organization_id = $1 AND period = $2',
        [user.organizationId, period],
      )
    ).length > 0
  );
}
export async function changePeriod(
  period: string,
  close: boolean,
  user: ChatGPTUser,
  reason: string,
) {
  authorize(user, 'admin');
  validatePeriod(period);
  if (!reason?.trim())
    throw new Error('Enter a reason for closing or reopening the period.');
  const org = user.organizationId;
  const statements = close
    ? [
        {
          text: `SELECT ledgerflow_assert((SELECT COUNT(*) FROM closing_tasks WHERE organization_id = $1 AND period = $2 AND completed) = $3, 'Complete all closing checks first.')`,
          parameters: [org, period, closingChecklist.length],
        },
        {
          text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transactions WHERE organization_id = $1 AND to_char(transaction_date,'YYYY-MM') = $2 AND posting_status != 'deleted' AND LOWER(approval_status) != 'approved'), 'Resolve all unapproved transactions before closing.')`,
          parameters: [org, period],
        },
        {
          text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transactions t WHERE t.organization_id = $1 AND to_char(t.transaction_date,'YYYY-MM') = $2 AND t.posting_status != 'deleted'
      AND NOT EXISTS(SELECT 1 FROM documents d WHERE d.organization_id = t.organization_id AND d.linked_transaction_id = t.id AND d.status = 'Verified')), 'Verify the linked evidence for each transaction before closing.')`,
          parameters: [org, period],
        },
        {
          text: `INSERT INTO closed_periods(organization_id,period,closed_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
          parameters: [org, period, user.userId],
        },
      ]
    : [
        {
          text: 'DELETE FROM closed_periods WHERE organization_id = $1 AND period = $2',
          parameters: [org, period],
        },
      ];
  statements.push({
    text: `INSERT INTO audit_logs(id,organization_id,action,resource_type,resource_id,new_json,reason,correlation_id) VALUES($1,$2,$3,'period',$4,$5,$6,$1)`,
    parameters: [
      crypto.randomUUID(),
      org,
      close ? 'close' : 'reopen',
      period,
      JSON.stringify({ actor: user.userId }),
      reason,
    ],
  });
  await executeBatch(statements, { organizationId: org });
}
