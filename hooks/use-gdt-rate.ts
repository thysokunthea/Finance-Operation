'use client';
import { useEffect, useState } from 'react';
import type { GdtQuote } from '@/lib/gdt-exchange-rates';
export function useGdtRate(date: string, currency = 'USD') {
  const [result, setResult] = useState<{
    quote?: GdtQuote;
    error?: string;
    date: string;
  }>({ date: '' });
  useEffect(() => {
    if (currency !== 'USD' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const controller = new AbortController();
    fetch('/api/exchange-rate?date=' + encodeURIComponent(date), {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          quote?: GdtQuote;
          error?: string;
        };
        if (!response.ok || !data.quote)
          throw new Error(data.error || 'GDT rate unavailable.');
        if (!controller.signal.aborted) setResult({ quote: data.quote, date });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            date,
            error:
              error instanceof Error ? error.message : 'GDT rate unavailable.',
          });
      });
    return () => controller.abort();
  }, [date, currency]);
  return result.date === date && currency === 'USD'
    ? { ...result, loading: false }
    : {
        date,
        quote: undefined,
        error: undefined,
        loading: currency === 'USD' && !!date,
      };
}
