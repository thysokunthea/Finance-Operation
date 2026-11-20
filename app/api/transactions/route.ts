import { executeBatch } from '@/db/neon';
import { isoDate } from '@/lib/finance';
import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import {
  listTransactionRecords,
  saveTransactionRecord,
  type TransactionRecord,
} from '@/db/transaction-register';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    authorize(user, 'read');
    return Response.json(
      { transactions: await listTransactionRecords() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Transactions could not be loaded.',
      },
      {
        status:
          error instanceof Error && error.message.startsWith('Forbidden:')
            ? 403
            : 500,
      },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    authorize(user, 'write');
    const record = (await request.json()) as TransactionRecord;
    return Response.json({
      transaction: await saveTransactionRecord(record, user),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Transaction could not be saved.',
      },
      {
        status:
          error instanceof Error && error.message.startsWith('Forbidden:')
            ? 403
            : 400,
      },
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    authorize(user, 'write');
    const { id } = (await request.json()) as { id: string };
    const record = (await listTransactionRecords()).find(
      (item) => item.id === id,
    );
    if (!record) throw new Error('Transaction not found.');
    if (record.currency === 'USD' && !(Number(record.exchangeRate) > 0))
      throw new Error(
        'Enter the KHR per USD exchange rate before submitting this draft.',
      );
    await executeBatch(
      [
        {
          text: `SELECT ledgerflow_assert((SELECT LOWER(approval_status) IN ('draft','rejected') AND posting_status != 'deleted' FROM transactions WHERE id = $1 AND organization_id = $2), 'Only drafts or rejected transactions can be submitted.')`,
          parameters: [id, user.organizationId],
        },
        {
          text: `UPDATE transactions SET approval_status = 'Finance review', version = version + 1, updated_at = now() WHERE id = $1 AND organization_id = $2`,
          parameters: [id, user.organizationId],
        },
        {
          text: `INSERT INTO audit_logs(id,organization_id,action,resource_type,resource_id,new_json,correlation_id) VALUES($1,$2,'submit','transaction',$3,$4,$1)`,
          parameters: [
            crypto.randomUUID(),
            user.organizationId,
            id,
            JSON.stringify({ actor: user.userId }),
          ],
        },
      ],
      { organizationId: user.organizationId, dates: [isoDate(record.date)] },
    );
    return Response.json({
      transaction: (await listTransactionRecords()).find(
        (item) => item.id === id,
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Submission failed.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 400 },
    );
  }
}
