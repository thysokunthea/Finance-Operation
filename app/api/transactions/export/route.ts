const rows = [
  ['TRX-2026-0841', '28 Aug 2026', 'Expense', 'INV-ACS-8821', 'Arden Cloud Services', 'Technology', 'Software & subscriptions', '8420.00', 'Pending'],
  ['TRX-2026-0840', '28 Aug 2026', 'Income', 'NS-INV-2048', 'Northline Retail Co.', 'Commercial', 'Product revenue', '24800.00', 'Paid'],
  ['TRX-2026-0839', '27 Aug 2026', 'Expense', 'FS-0927', 'Fieldstone Studio', 'Marketing', 'Marketing services', '3950.00', 'Missing Document'],
  ['TRX-2026-0838', '27 Aug 2026', 'Expense', 'JL-44710', 'Juniper Logistics', 'Operations', 'Freight & delivery', '6284.00', 'Approved'],
  ['TRX-2026-0837', '26 Aug 2026', 'Income', 'NS-INV-2039', 'Aurora Hospitality', 'Commercial', 'Service revenue', '18600.00', 'Overdue'],
  ['TRX-2026-0836', '25 Aug 2026', 'Expense', 'BR-1811', 'Blue Ridge Facilities', 'Operations', 'Facilities', '12480.00', 'Paid'],
  ['TRX-2026-0835', '25 Aug 2026', 'Income', 'NS-INV-2035', 'Solace Health Group', 'Commercial', 'Service revenue', '31200.00', 'Paid'],
];

export async function GET() {
  const headers = ['Transaction ID', 'Date', 'Type', 'Reference', 'Counterparty', 'Department', 'Category', 'Amount (USD)', 'Status'];
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
  return new Response(`\uFEFF${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ledgerflow-transactions-2026-08.csv"', 'Cache-Control': 'no-store' } });
}
