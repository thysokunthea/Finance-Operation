import { amountValue, isoDate } from './finance';
export type DashboardBasis = 'recorded' | 'approved';
type Row = { date: string; type: string; amount: string; approval: string };
export function dashboardTotals<T extends Row>(
  rows: T[],
  period: string,
  basis: DashboardBasis,
) {
  const eligible = rows.filter(
    (row) =>
      ['income', 'expense'].includes(row.type.toLowerCase()) &&
      (row.approval.toLowerCase() === 'approved' ||
        (basis === 'recorded' &&
          row.approval.toLowerCase() === 'finance review')),
  );
  const inPeriod = (row: T) => {
    try {
      const month = isoDate(row.date).slice(0, 7);
      return period === 'all' || month === period;
    } catch {
      return false;
    }
  };
  const selected = eligible.filter(inPeriod);
  const total = (type: string, approval?: string) =>
    selected
      .filter(
        (row) =>
          row.type.toLowerCase() === type &&
          (!approval || row.approval.toLowerCase() === approval),
      )
      .reduce((sum, row) => sum + amountValue(row.amount), 0);
  return {
    rows: selected,
    revenue: total('income'),
    expenses: total('expense'),
    approvedRevenue: total('income', 'approved'),
    reviewRevenue: total('income', 'finance review'),
    reviewCount: selected.filter(
      (row) => row.approval.toLowerCase() === 'finance review',
    ).length,
  };
}
