import { getChatGPTUser } from '@/app/chatgpt-auth';
import { listTransactionRecords, saveTransactionRecord, type TransactionRecord } from '@/db/transaction-register';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    return Response.json({ transactions: await listTransactionRecords() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Transactions could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const record = await request.json() as TransactionRecord;
    return Response.json({ transaction: await saveTransactionRecord(record, user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Transaction could not be saved.' }, { status: 400 });
  }
}
