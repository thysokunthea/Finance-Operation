import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import { deleteTransactionRecord } from '@/db/transaction-register';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  const { id } = await params;
  try {
    authorize(user, 'write');
    await deleteTransactionRecord(id, user);
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Transaction could not be deleted.';
    return Response.json(
      { error: message },
      { status: message === 'Transaction not found.' ? 404 : 400 },
    );
  }
}
