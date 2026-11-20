import {
  amountValue,
  isoDate,
  reportingValue,
  validatePeriod,
} from './finance';
import type { TransactionRecord } from '@/db/transaction-register';

export const reportIds = [
  'income-statement',
  'cash-flow-summary',
  'ar-aging',
  'ap-aging',
  'revenue-report',
  'expense-report',
  'tax-summary',
  'monthly-performance',
] as const;
export function computeReport(
  id: string,
  period: string,
  transactions: TransactionRecord[],
) {
  validatePeriod(period);
  if (!(reportIds as readonly string[]).includes(id))
    throw new Error('Unknown report.');
  const end = new Date(
    Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const approved = transactions.filter(
    (row) => row.approval.toLowerCase() === 'approved',
  );
  const selected = approved.filter((row) =>
    isoDate(row.date).startsWith(period),
  );
  const missing = approved.filter(
    (row) => isoDate(row.date) <= end && reportingValue(row) === null,
  );
  const value = (row: TransactionRecord) => reportingValue(row) ?? 0;
  const income = selected
    .filter((row) => row.type === 'Income')
    .reduce((n, row) => n + value(row), 0);
  const expenses = selected
    .filter((row) => row.type === 'Expense')
    .reduce((n, row) => n + value(row), 0);
  const lines: Array<[string, string | number]> = [];
  if (id === 'income-statement' || id === 'monthly-performance')
    lines.push(
      ['Revenue', income],
      ['Expenses', expenses],
      ['Net result', income - expenses],
    );
  if (id === 'monthly-performance')
    lines.push(['Approved transactions', selected.length]);
  if (id === 'cash-flow-summary') {
    let opening = 0,
      inflow = 0,
      outflow = 0;
    for (const row of approved)
      for (const payment of row.payments || []) {
        const sign = row.type === 'Income' ? 1 : -1;
        if (payment.date.slice(0, 7) < period)
          opening += sign * payment.reportingAmount;
        if (payment.date.startsWith(period)) {
          if (sign === 1) inflow += payment.reportingAmount;
          else outflow += payment.reportingAmount;
        }
      }
    lines.push(
      ['Opening recorded cash', opening],
      ['Cash receipts', inflow],
      ['Cash payments', outflow],
      ['Closing recorded cash', opening + inflow - outflow],
    );
  }
  if (id === 'ar-aging' || id === 'ap-aging') {
    const buckets = [0, 0, 0, 0];
    for (const row of approved.filter(
      (r) =>
        r.type === (id === 'ar-aging' ? 'Income' : 'Expense') &&
        isoDate(r.date) <= end,
    )) {
      const paid = (row.payments || [])
        .filter((p) => p.date <= end)
        .reduce((n, p) => n + p.amount, 0);
      const amount = amountValue(row.amount);
      const balance = Math.max(0, amount - paid);
      const base = amount > 0 ? (value(row) * balance) / amount : 0;
      const days = row.dueDate
        ? Math.max(
            0,
            Math.floor(
              (Date.parse(end) - Date.parse(isoDate(row.dueDate))) / 86400000,
            ),
          )
        : 0;
      buckets[days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3] += base;
    }
    lines.push(
      ['Current', buckets[0]],
      ['1–30 days', buckets[1]],
      ['31–60 days', buckets[2]],
      ['Over 60 days', buckets[3]],
      ['Total outstanding', buckets.reduce((a, b) => a + b, 0)],
    );
  }
  if (id === 'revenue-report' || id === 'expense-report') {
    const totals = new Map<string, number>();
    for (const row of selected.filter(
      (r) => r.type === (id === 'revenue-report' ? 'Income' : 'Expense'),
    ))
      totals.set(
        row.department,
        (totals.get(row.department) || 0) + value(row),
      );
    lines.push(...totals.entries());
  }
  if (id === 'tax-summary') {
    const tax = (type: string) =>
      selected
        .filter((r) => r.type === type)
        .reduce((n, row) => {
          const amount = amountValue(row.amount);
          return (
            n +
            (amount > 0
              ? (amountValue(row.tax || '0') * value(row)) / amount
              : 0)
          );
        }, 0);
    lines.push(
      ['Recorded output tax', tax('Income')],
      ['Recorded input tax', tax('Expense')],
      [
        'Recorded net tax (review eligibility before filing)',
        tax('Income') - tax('Expense'),
      ],
    );
  }
  return {
    id,
    period,
    currency: 'KHR',
    lines,
    excluded: missing.map((row) => row.id),
    note: 'Approved transactions. Recorded cash excludes unrecorded opening bank balances. Missing exchange rates are excluded.',
  };
}
export function csvCell(value: string | number | null | undefined) {
  const raw = String(value ?? '');
  return (
    '"' +
    (typeof value === 'string' && /^[=+\-@\t\r]/.test(raw)
      ? "'" + raw
      : raw
    ).replaceAll('"', '""') +
    '"'
  );
}
export function reportCsv(report: ReturnType<typeof computeReport>) {
  return [
    ['Report', report.id],
    ['Period', report.period],
    ['Currency', report.currency],
    ...report.lines,
    ['Excluded missing rates', report.excluded.join('; ')],
    ['Notes', report.note],
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}
