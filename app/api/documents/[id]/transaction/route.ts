import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createAutomaticTransaction } from '@/db/automatic-transactions';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    const { id } = await params;
    return Response.json(
      await createAutomaticTransaction(id, await request.json(), user),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Automatic transaction creation failed.';
    return Response.json(
      { error: message },
      {
        status: message.startsWith('Forbidden:')
          ? 403
          : message === 'Document not found.'
            ? 404
            : 400,
      },
    );
  }
}
