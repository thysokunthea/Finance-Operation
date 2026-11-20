import { getChatGPTUser } from '@/app/chatgpt-auth';
import { listVendors, saveVendor } from '@/db/vendors';
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    return Response.json(
      {
        vendors: await listVendors(user),
        canWrite: ['admin', 'finance'].includes(user.role),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
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
    return Response.json({
      vendors: await saveVendor(await request.json(), user),
    });
  } catch (error) {
    return failure(error);
  }
}
function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Contacts could not be saved.';
  return Response.json(
    { error: message },
    { status: message.startsWith('Forbidden:') ? 403 : 400 },
  );
}
