import { getChatGPTUser } from '@/app/chatgpt-auth';
import { closingChecklist, getClosingStatus, toggleClosingTask } from '@/db/closing';

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const period = new URL(request.url).searchParams.get('period') || currentPeriod();
  try {
    return Response.json({ period, tasks: closingChecklist, status: await getClosingStatus(period) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Closing status could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const body = await request.json() as { period?: string; taskName: string; completed: boolean };
    const period = body.period || currentPeriod();
    return Response.json({ period, status: await toggleClosingTask(period, body.taskName, body.completed, user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Closing task could not be saved.' }, { status: 400 });
  }
}
