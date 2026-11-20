import { cambodiaToday } from './cambodia-date';
export { cambodiaToday } from './cambodia-date';
export const GDT_RATE_URL = 'https://www.tax.gov.kh/en/exchange-rate';
export type GdtQuote = {
  provider: 'GDT';
  rate: string;
  date: string;
  requestedDate: string;
  sourceUrl: string;
  retrievedAt: string;
  selection: 'same-day' | 'previous-published';
};
export type PublishedRate = { date: string; rate: string };
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('A valid ISO transaction date is required.');
  const parsed = new Date(date + 'T00:00:00Z');
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error('A valid ISO transaction date is required.');
  return date;
}
/** Parse only the official USD/KHR table, not the headline or unrelated numbers. */
export function parseGdtRates(html: string, month: string): PublishedRate[] {
  if (!/Official\s+Rate\s+Riel\s*\/\s*USD/i.test(html))
    throw new Error('The GDT rate table could not be verified.');
  const result = new Map<string, string>();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) =>
        cell[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;|&#160;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
    );
    if (
      cells.length !== 4 ||
      cells[1] !== 'USD/KHR' ||
      !/National Bank of Cambodia/i.test(cells[3])
    )
      continue;
    const date = cells[0].match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
    const monthIndex = date ? months.indexOf(date[1]) : -1;
    if (!date || monthIndex < 0 || !/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(cells[2]))
      continue;
    const iso = validDate(
      `${date[3]}-${String(monthIndex + 1).padStart(2, '0')}-${date[2].padStart(2, '0')}`,
    );
    const rate = Number(cells[2].replaceAll(',', ''));
    if (!iso.startsWith(month + '-') || !Number.isFinite(rate) || rate <= 0)
      continue;
    if (result.has(iso) && result.get(iso) !== String(rate))
      throw new Error(
        'Conflicting GDT rates were published for the same date.',
      );
    result.set(iso, String(rate));
  }
  return [...result]
    .map(([date, rate]) => ({ date, rate }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
export function createGdtRateProvider(
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  const cache = new Map<
    string,
    {
      expires: number;
      data: Promise<{
        rates: PublishedRate[];
        retrievedAt: string;
        sourceUrl: string;
      }>;
    }
  >();
  const loadMonth = (month: string) => {
    const existing = cache.get(month);
    if (existing && existing.expires > now().getTime()) return existing.data;
    const sourceUrl =
      GDT_RATE_URL +
      '?for_year=' +
      month.slice(0, 4) +
      '&for_month=' +
      month.slice(5, 7);
    const data = (async () => {
      const response = await fetcher(sourceUrl, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error('GDT exchange rates are temporarily unavailable.');
      return {
        rates: parseGdtRates(await response.text(), month),
        retrievedAt: now().toISOString(),
        sourceUrl,
      };
    })();
    // Also cache failures briefly, preventing one failing network request for every imported row.
    cache.set(month, { expires: now().getTime() + 30 * 60 * 1000, data });
    void data.catch(() => {
      const item = cache.get(month);
      if (item?.data === data) item.expires = now().getTime() + 30000;
    });
    return data;
  };
  return async (requestedDate: string): Promise<GdtQuote> => {
    validDate(requestedDate);
    if (requestedDate > cambodiaToday(now()))
      throw new Error('A GDT rate is not available for a future date.');
    const month = requestedDate.slice(0, 7);
    let page = await loadMonth(month);
    let selected = page.rates.find((rate) => rate.date <= requestedDate);
    if (!selected) {
      const previous = new Date(month + '-01T00:00:00Z');
      previous.setUTCMonth(previous.getUTCMonth() - 1);
      page = await loadMonth(previous.toISOString().slice(0, 7));
      selected = page.rates.find((rate) => rate.date <= requestedDate);
    }
    if (
      !selected ||
      Date.parse(requestedDate) - Date.parse(selected.date) > 14 * 86400000
    )
      throw new Error(
        'No recent published GDT rate was found for this transaction date.',
      );
    return {
      provider: 'GDT',
      ...selected,
      requestedDate,
      sourceUrl: page.sourceUrl,
      retrievedAt: page.retrievedAt,
      selection:
        selected.date === requestedDate ? 'same-day' : 'previous-published',
    };
  };
}
export const getGdtRate = createGdtRateProvider();
