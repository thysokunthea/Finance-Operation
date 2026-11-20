import { isoDate } from './finance';
const khmerMonths = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
];
export function documentDate(value: string) {
  const raw = value
    .replace(/[\u200b-\u200f\ufeff]/g, '')
    .replace(/[០-៩]/g, (digit) =>
      String(digit.charCodeAt(0) - '០'.charCodeAt(0)),
    )
    .trim();
  const match = raw.match(/^(\d{1,2})[- /]+([^0-9]+?)[- /]+(\d{2}|\d{4})$/);
  if (match) {
    const month = khmerMonths.indexOf(match[2].trim());
    if (month >= 0) {
      const year = match[3].length === 2 ? '20' + match[3] : match[3];
      return isoDate(
        `${year}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`,
      );
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) && !/[A-Za-z]{3}/.test(raw))
    throw new Error('Unambiguous date required.');
  return isoDate(raw);
}
