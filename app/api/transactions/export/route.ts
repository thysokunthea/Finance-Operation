import { csvCell } from '@/lib/reports';
import { getChatGPTUser, authorize } from '@/app/chatgpt-auth';
import { listTransactionRecords } from '@/db/transaction-register';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return new Response('Authentication required.', { status: 401 });
  try {
    authorize(user);
    const transactions = await listTransactionRecords();
    const headers = [
      'Transaction ID',
      'Date',
      'Type',
      'Reference',
      'Counterparty',
      'Department',
      'Category',
      'Amount',
      'Currency',
      'Status',
    ];
    const rows = transactions.map((row) => [
      row.id,
      row.date,
      row.type,
      row.reference,
      row.party,
      row.department,
      row.category,
      row.amount,
      row.currency || 'USD',
      row.status,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="ledgerflow-transactions.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed.';
    return Response.json(
      { error: message },
      { status: message.startsWith('Forbidden:') ? 403 : 500 },
    );
  }
}
