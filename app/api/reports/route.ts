import { authorize, getChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';
import { listTransactionRecords } from '@/db/transaction-register';
import { computeReport } from '@/lib/reports';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  try {
    authorize(user);
    const rows = await query<{
      id: string;
      payload: string;
      created_at: string;
    }>(
      'SELECT id,payload_json AS payload,created_at FROM report_runs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',
      [user.organizationId],
    );
    return Response.json(
      {
        reports: rows.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          report: JSON.parse(row.payload),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Load failed.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 500 },
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
    authorize(user);
    const body = (await request.json()) as { id: string; period: string };
    const report = computeReport(
      body.id,
      body.period,
      await listTransactionRecords(),
    );
    await executeBatch([
      {
        text: `INSERT INTO organizations(id,name,code) VALUES($1,'LedgerFlow Organization',$1) ON CONFLICT DO NOTHING`,
        parameters: [user.organizationId],
      },
      {
        text: 'INSERT INTO report_runs(id,organization_id,payload_json,created_by) VALUES($1,$2,$3,$4)',
        parameters: [
          crypto.randomUUID(),
          user.organizationId,
          JSON.stringify(report),
          user.userId,
        ],
      },
    ]);
    return Response.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report failed.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 400 },
    );
  }
}
