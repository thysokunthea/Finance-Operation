import { amountValue } from './finance';

export function usdValue(
  amount: string | number,
  currency: string,
  khrPerUsd: number,
): number | null {
  if (currency === 'USD') return amountValue(amount);
  if (currency === 'KHR' && Number.isFinite(khrPerUsd) && khrPerUsd > 0)
    return amountValue(amount) / khrPerUsd;
  return amountValue(amount) === 0 ? 0 : null;
}

export function dashboardUsdRow<
  T extends {
    amount: string;
    currency?: string;
    balance?: number;
    payments?: Array<{ date: string; amount: number; reportingAmount: number }>;
  },
>(row: T, khrPerUsd: number) {
  const currency = row.currency || (row.amount.includes('$') ? 'USD' : 'KHR');
  const amount = usdValue(row.amount, currency, khrPerUsd);
  return {
    ...row,
    originalAmount: row.amount,
    amount: String(amount ?? 0),
    outstandingReporting: usdValue(row.balance ?? 0, currency, khrPerUsd) ?? 0,
    missingExchangeRate: amount === null,
    payments: (row.payments || []).map((payment) => ({
      ...payment,
      reportingAmount: usdValue(payment.amount, currency, khrPerUsd) ?? 0,
    })),
  };
}
