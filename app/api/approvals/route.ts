import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import {
  approveTransaction,
  listPendingApprovals,
} from '@/db/approval-workflow';

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
      { approvals: await listPendingApprovals() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Approvals could not be loaded.',
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
    authorize(user, 'approve');
    const body = (await request.json()) as {
      transactionId?: string;
      action?: string;
      reason?: string;
    };
    if (
      !body.transactionId ||
      !['approve', 'reject'].includes(body.action || '')
    )
      throw new Error('A valid approval action is required.');
    return Response.json({
      approval: await approveTransaction(
        body.transactionId,
        user,
        body.action as 'approve' | 'reject',
        body.reason,
      ),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Approval could not be saved.',
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
