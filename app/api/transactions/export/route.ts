import { getChatGPTUser } from '@/app/chatgpt-auth';
import { listTransactionRecords } from '@/db/transaction-register';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return new Response('Authentication required.', { status: 401 });
  const transactions = await listTransactionRecords();
  const headers = ['Transaction ID', 'Date', 'Type', 'Reference', 'Counterparty', 'Department', 'Category', 'Amount', 'Currency', 'Status'];
  const rows = transactions.map((row) => [row.id, row.date, row.type, row.reference, row.party, row.department, row.category, row.amount, row.currency || 'USD', row.status]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
  return new Response(`\uFEFF${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ledgerflow-transactions.csv"', 'Cache-Control': 'no-store' } });
}
