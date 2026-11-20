'use client';
import { useGdtRate } from '@/hooks/use-gdt-rate';
import { Input } from '@/components/ui/input';
export function GdtRateField({
  date,
  currency = 'USD',
}: {
  date: string;
  currency?: string;
}) {
  const { quote, error, loading } = useGdtRate(date, currency);
  return (
    <div className="mt-2 space-y-1">
      <Input
        aria-label="GDT KHR per USD"
        readOnly
        value={currency === 'KHR' ? '1' : quote?.rate || ''}
        placeholder={loading ? 'Loading GDT rate…' : 'GDT rate'}
      />
      {currency === 'USD' ? (
        <a
          className="text-xs underline"
          target="_blank"
          rel="noreferrer"
          href={quote?.sourceUrl || 'https://www.tax.gov.kh/en/exchange-rate'}
        >
          GDT · {quote?.date || date}
          {quote?.selection === 'previous-published'
            ? ' · latest published before transaction date'
            : ''}
        </a>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-amber-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
