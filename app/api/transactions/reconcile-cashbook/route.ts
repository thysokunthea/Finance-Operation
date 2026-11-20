import { getChatGPTUser } from '@/app/chatgpt-auth';
import { reconcileCashbookSettlements } from '@/db/cashbook-settlements';
export const maxDuration = 300;
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    const input = await request.json();
    const after = input.after ?? '';
    if (typeof after !== 'string' || after.length > 200)
      throw new Error('Invalid settlement cursor.');
    return Response.json(await reconcileCashbookSettlements(user, after));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Cash book settlement review failed.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 400 },
    );
  }
}
