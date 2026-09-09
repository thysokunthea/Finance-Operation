import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createPaymentRequest, listPaymentRequests } from '@/db/payment-requests';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    return Response.json({ requests: await listPaymentRequests() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Payment requests could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const body = await request.json() as { title: string; category: string; amount: number };
    return Response.json({ requests: await createPaymentRequest(body, user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Payment request could not be saved.' }, { status: 400 });
  }
}
