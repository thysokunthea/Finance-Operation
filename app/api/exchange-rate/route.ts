import { getChatGPTUser } from '@/app/chatgpt-auth';
import { cambodiaToday, getGdtRate } from '@/lib/gdt-exchange-rates';
export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  const date = new URL(request.url).searchParams.get('date') || cambodiaToday();
  try {
    return Response.json(
      { quote: await getGdtRate(date) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'GDT rate unavailable.',
      },
      {
        status: /valid ISO|future date/.test(
          error instanceof Error ? error.message : '',
        )
          ? 400
          : 503,
      },
    );
  }
}
