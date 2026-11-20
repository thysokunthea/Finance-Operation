import { getChatGPTUser } from '@/app/chatgpt-auth';
import { recordPayment } from '@/db/payments';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    return Response.json({
      transaction: await recordPayment(await request.json(), user),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Payment could not be saved.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 400 },
    );
  }
}
