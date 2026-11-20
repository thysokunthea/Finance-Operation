import { changePeriod, isPeriodClosed } from '@/db/periods';
import { periodKey, validatePeriod } from '@/lib/finance';
import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import {
  closingChecklist,
  getClosingStatus,
  toggleClosingTask,
} from '@/db/closing';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  const period = new URL(request.url).searchParams.get('period') || periodKey();
  try {
    authorize(user, 'read');
    validatePeriod(period);
    return Response.json(
      {
        closed: await isPeriodClosed(period, user),
        period,
        tasks: closingChecklist,
        status: await getClosingStatus(period),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Closing status could not be loaded.',
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
    const body = (await request.json()) as {
      period?: string;
      taskName: string;
      completed: boolean;
      action?: string;
      reason?: string;
    };
    const period = body.period || periodKey();
    validatePeriod(period);
    if (body.action) {
      if (!['close', 'reopen'].includes(body.action))
        throw new Error('Invalid action.');
      await changePeriod(
        period,
        body.action === 'close',
        user,
        body.reason || '',
      );
      return Response.json({
        closed: await isPeriodClosed(period, user),
        period,
        status: await getClosingStatus(period),
      });
    }
    return Response.json({
      period,
      status: await toggleClosingTask(
        period,
        body.taskName,
        body.completed,
        user,
      ),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Closing task could not be saved.',
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
