import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import {
  createPaymentRequest,
  listPaymentRequests,
  submitPaymentRequest,
  type RequestInput,
} from '@/db/payment-requests';

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
      { requests: await listPaymentRequests() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Payment requests could not be loaded.',
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
    const body = (await request.json()) as RequestInput;
    return Response.json({ requests: await createPaymentRequest(body, user) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Payment request could not be saved.',
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
    const body = (await request.json()) as { id: string };
    return Response.json({
      requests: await submitPaymentRequest(body.id, user),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Submission failed.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 400 },
    );
  }
}
