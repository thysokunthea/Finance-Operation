import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import { updateTask, createTask, listTasks } from '@/db/tasks';

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
      { tasks: await listTasks() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Tasks could not be loaded.',
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
      name: string;
      category: string;
      due: string;
      priority: string;
      related?: string;
      status?: string;
    };
    return Response.json({ tasks: await createTask(body, user) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Task could not be saved.',
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
    const body = (await request.json()) as Parameters<typeof updateTask>[0];
    return Response.json({
      tasks: await updateTask({ ...body, status: body.status || 'Completed' }),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Task could not be updated.',
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
