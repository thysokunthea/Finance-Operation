import { query } from '@/db/neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await query('SELECT 1 AS healthy');
    return Response.json({ status: 'ok' });
  } catch (error) {
    console.error('Database health check failed', error);
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
