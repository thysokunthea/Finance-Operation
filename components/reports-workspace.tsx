'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n';
import { reportIds, reportCsv, type computeReport } from '@/lib/reports';
type Result = ReturnType<typeof computeReport>;
type History = { id: string; createdAt: string; report: Result };
const keys: Record<string, string> = {
  'income-statement': 'report.incomeStatement',
  'cash-flow-summary': 'report.cashFlowSummary',
  'ar-aging': 'report.arAging',
  'ap-aging': 'report.apAging',
  'revenue-report': 'report.revenueReport',
  'expense-report': 'report.expenseReport',
  'tax-summary': 'report.taxSummary',
  'monthly-performance': 'report.monthlyPerformance',
};
export function ReportsWorkspace() {
  const { t, lang } = useLanguage();
  const [period, setPeriod] = useState(() =>
    new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })
      .slice(0, 7),
  );
  const [history, setHistory] = useState<History[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/reports', { cache: 'no-store' });
    const p = await r.json();
    if (!r.ok) throw new Error(p.error);
    setHistory(p.reports);
  }, []);
  useEffect(() => {
    let active = true;
    fetch('/api/reports', { cache: 'no-store' })
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        if (active) setHistory(p.reports);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const download = (report: Result) => {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + reportCsv(report)], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = report.id + '-' + report.period + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t('reports.title')}</h1>
      <label className="block max-w-xs text-sm">
        {lang === 'km' ? 'ខែរបាយការណ៍' : 'Reporting period'}
        <Input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {reportIds.map((id) => (
          <Button
            key={id}
            variant="outline"
            disabled={busy || !period}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const r = await fetch('/api/reports', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, period }),
                });
                const p = await r.json();
                if (!r.ok) throw new Error(p.error);
                setResult(p.report);
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(keys[id])}
          </Button>
        ))}
      </div>
      {result ? (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">
            {t(keys[result.id])} · {result.period} · KHR
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {result.lines.map(([label, value]) => (
                <tr key={label} className="border-b">
                  <td className="py-2">{label}</td>
                  <td className="text-right font-mono">
                    {typeof value === 'number'
                      ? value.toLocaleString('en-US', {
                          maximumFractionDigits: 2,
                        })
                      : value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.excluded.length ? (
            <p role="alert" className="text-amber-700">
              {lang === 'km'
                ? 'មិនបានរាប់ដោយខ្វះអត្រាប្តូរប្រាក់៖ '
                : 'Excluded because exchange rates are missing: '}
              {result.excluded.join(', ')}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{result.note}</p>
          <Button onClick={() => download(result)}>{t('tx.export')} CSV</Button>
        </section>
      ) : null}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 font-semibold">
          {lang === 'km' ? 'ប្រវត្តិរបាយការណ៍' : 'Report history'}
        </h2>
        <div className="divide-y">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <Button variant="ghost" onClick={() => setResult(item.report)}>
                {t(keys[item.report.id])} · {item.report.period}
              </Button>
              <span className="flex-1 text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </span>
              <Button variant="outline" onClick={() => download(item.report)}>
                {t('tx.export')}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
