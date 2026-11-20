import { authorize, type ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch } from './neon';
import { listTransactionRecords } from './transaction-register';
import { isoDate, minor } from '@/lib/finance';

export async function recordPayment(
  input: {
    transactionId: string;
    amount: number;
    date: string;
    exchangeRate: number;
    method: string;
    reference: string;
    idempotencyKey: string;
  },
  user: ChatGPTUser,
) {
  authorize(user, 'write');
  const org = user.organizationId;
  const date = isoDate(input.date);
  const amount = minor(input.amount);
  const record = (await listTransactionRecords()).find(
    (row) => row.id === input.transactionId,
  );
  if (!record) throw new Error('Transaction not found.');
  if (
    !input.method?.trim() ||
    !input.reference?.trim() ||
    !input.idempotencyKey ||
    amount <= 0
  )
    throw new Error('Enter a positive amount, method and payment reference.');
  const rate = record.currency === 'KHR' ? 1 : Number(input.exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0)
    throw new Error('A positive KHR exchange rate is required.');
  await executeBatch(
    [
      {
        text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transaction_payments WHERE id = $1 AND
      (organization_id != $2 OR transaction_id != $3 OR amount_minor != $4 OR payment_date != $5::date OR exchange_rate != $6 OR method != $7 OR reference != $8)),
      'This payment retry does not match the original payment.')`,
        parameters: [
          input.idempotencyKey,
          org,
          record.id,
          amount,
          date,
          rate,
          input.method.trim(),
          input.reference.trim(),
        ],
      },
      {
        text: `SELECT ledgerflow_assert(EXISTS(SELECT 1 FROM transactions WHERE id = $1 AND organization_id = $2
      AND posting_status != 'deleted' AND LOWER(approval_status) = 'approved'), 'Approve the transaction before payment.')`,
        parameters: [record.id, org],
      },
      {
        text: `SELECT ledgerflow_assert(EXISTS(SELECT 1 FROM transaction_payments WHERE id = $3 AND organization_id = $2 AND transaction_id = $1)
      OR (SELECT total_minor - COALESCE((SELECT SUM(amount_minor) FROM transaction_payments WHERE transaction_id = $1),
        CASE WHEN LOWER(payment_status) = 'paid' THEN total_minor ELSE 0 END) >= $4 FROM transactions WHERE id = $1 AND organization_id = $2),
      'Payment exceeds the outstanding balance.')`,
        parameters: [record.id, org, input.idempotencyKey, amount],
      },
      {
        text: `INSERT INTO transaction_payments(id, organization_id, transaction_id, payment_date, amount_minor, exchange_rate, method, reference, recorded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
        parameters: [
          input.idempotencyKey,
          org,
          record.id,
          date,
          amount,
          rate,
          input.method.trim(),
          input.reference.trim(),
          user.userId,
        ],
      },
      {
        text: `UPDATE transactions SET payment_status = CASE WHEN (SELECT SUM(amount_minor) FROM transaction_payments WHERE transaction_id = $1) >= total_minor THEN 'Paid' ELSE 'Partially Paid' END,
      version = version + 1, updated_at = now() WHERE id = $1 AND organization_id = $2`,
        parameters: [record.id, org],
      },
      {
        text: `INSERT INTO audit_logs(id, organization_id, action, resource_type, resource_id, new_json, correlation_id)
      VALUES($1,$2,'payment','transaction',$3,$4,$1) ON CONFLICT(id) DO NOTHING`,
        parameters: [
          input.idempotencyKey,
          org,
          record.id,
          JSON.stringify({ ...input, actor: user.userId }),
        ],
      },
    ],
    { organizationId: org, dates: [date] },
  );
  return (await listTransactionRecords()).find((row) => row.id === record.id);
}
