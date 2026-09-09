import { getChatGPTUser } from '@/app/chatgpt-auth';
import { listBudgets, saveBudget } from '@/db/budgets';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    return Response.json({ budgets: await listBudgets() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Budgets could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const body = await request.json() as { department: string; monthlyLimit: number };
    return Response.json({ budgets: await saveBudget(body.department, body.monthlyLimit, user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Budget could not be saved.' }, { status: 400 });
  }
}
