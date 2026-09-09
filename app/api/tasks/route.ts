import { getChatGPTUser } from '@/app/chatgpt-auth';
import { completeTask, createTask, listTasks } from '@/db/tasks';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    return Response.json({ tasks: await listTasks() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Tasks could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const body = await request.json() as { name: string; category: string; due: string; priority: string };
    return Response.json({ tasks: await createTask(body, user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Task could not be saved.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const body = await request.json() as { id: string };
    return Response.json({ tasks: await completeTask(body.id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Task could not be updated.' }, { status: 400 });
  }
}
