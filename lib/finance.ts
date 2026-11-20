export type MoneyRow = {
  amount: string;
  currency?: string;
  exchangeRate?: string;
  reportingAmount?: number | null;
  balance?: number;
  paidAmount?: number;
  cashReportingAmount?: number;
};
export function amountValue(value: string | number) {
  const parsed =
    typeof value === 'number' ? value : Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
export function reportingValue(row: MoneyRow): number | null {
  const currency = row.currency || (row.amount.includes('$') ? 'USD' : 'KHR');
  const rate = currency === 'KHR' ? 1 : Number(row.exchangeRate);
  return Number.isFinite(rate) && rate > 0
    ? Math.round(amountValue(row.amount) * rate * 100) / 100
    : null;
}
export function money(value: number, currency = 'KHR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    value,
  );
}
export function isoDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const direct = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    const d = new Date(direct + 'T00:00:00Z');
    if (Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === direct)
      return direct;
    throw new Error('A valid date is required.');
  }
  // Calendar labels must not shift to yesterday when the server runs in UTC+7.
  const label = value.match(/^(\d{1,2})[\s-]+([A-Za-z]+)[\s,-]+(\d{2}|\d{4})$/);
  if (label) {
    const month = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ].indexOf(label[2].slice(0, 3).toLowerCase());
    if (month < 0) throw new Error('A valid date is required.');
    const year = label[3].length === 2 ? '20' + label[3] : label[3];
    return isoDate(
      `${year}-${String(month + 1).padStart(2, '0')}-${label[1].padStart(2, '0')}`,
    );
  }
  const monthFirst = value.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthFirst)
    return isoDate(`${monthFirst[2]} ${monthFirst[1]} ${monthFirst[3]}`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error('A valid date is required.');
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}
export function periodKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return (
    parts.find((p) => p.type === 'year')!.value +
    '-' +
    parts.find((p) => p.type === 'month')!.value
  );
}
export function validatePeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw new Error('A valid YYYY-MM period is required.');
  return period;
}
export function minor(value: string | number) {
  const result = Math.round(amountValue(value) * 100);
  if (!Number.isSafeInteger(result))
    throw new Error('Amount is outside the supported range.');
  return result;
}
