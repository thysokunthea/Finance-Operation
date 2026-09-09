'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, Download, Mail, Plus, Search, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type TransactionRow = {
  id: string;
  date: string;
  type: string;
  reference: string;
  party: string;
  department: string;
  amount: string;
  status: string;
  owner: string;
  dueDate?: string;
};

type LedgerRow = {
  party: string;
  invoice: string;
  issued: string;
  due: string;
  amount: string;
  balance: string;
  days: number;
  status: string;
  owner: string;
};

const styles: Record<string, string> = {
  Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Pending: 'border-amber-200 bg-amber-50 text-amber-700',
  Overdue: 'border-red-200 bg-red-50 text-red-700',
};

function amountValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (match) {
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[2]);
    if (month >= 0) return new Date(Number(match[3]), month, Number(match[1]));
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function money(value: number, compact = false) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 2 }).format(value);
}

export function LedgerModule({ kind }: { kind: 'ar' | 'ap' }) {
  const ar = kind === 'ar';
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    let active = true;
    fetch('/api/transactions', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { transactions?: TransactionRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Ledger data could not be loaded.');
        if (active) setTransactions(payload.transactions || []);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Ledger data could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const today = useMemo(() => new Date(new Date().toDateString()), []);

  const rows = useMemo<LedgerRow[]>(() => {
    const wantType = ar ? 'income' : 'expense';
    return transactions
      .filter((t) => t.type.toLowerCase() === wantType && t.status.toLowerCase() !== 'paid')
      .map((t) => {
        const due = parseDate(t.dueDate);
        const days = due ? Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000)) : 0;
        const status = due && due.getTime() < today.getTime() ? 'Overdue' : t.status || 'Pending';
        return {
          party: t.party || 'Unknown counterparty',
          invoice: t.reference || t.id,
          issued: t.date,
          due: t.dueDate || '—',
          amount: money(amountValue(t.amount)),
          balance: money(amountValue(t.amount)),
          days,
          status,
          owner: t.owner || '—',
        };
      });
  }, [transactions, ar, today]);

  const filtered = useMemo(
    () => rows.filter((r) => `${r.party} ${r.invoice}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || r.status === filter)),
    [rows, query, filter],
  );

  const outstanding = rows.reduce((sum, r) => sum + amountValue(r.balance), 0);
  const overdueRows = rows.filter((r) => r.status === 'Overdue');
  const overdueTotal = overdueRows.reduce((sum, r) => sum + amountValue(r.balance), 0);
  const dueSoonRows = rows.filter((r) => {
    const due = parseDate(r.due);
    if (!due) return false;
    const days = (due.getTime() - today.getTime()) / 86400000;
    return days >= 0 && days <= 7;
  });
  const dueSoonTotal = dueSoonRows.reduce((sum, r) => sum + amountValue(r.balance), 0);

  const aging = [
    { label: 'Current', rows: rows.filter((r) => r.days === 0) },
    { label: '1–30 days', rows: rows.filter((r) => r.days >= 1 && r.days <= 30) },
    { label: '31–60 days', rows: rows.filter((r) => r.days >= 31 && r.days <= 60) },
    { label: '60+ days', rows: rows.filter((r) => r.days > 60) },
  ].map((bucket) => ({ ...bucket, total: bucket.rows.reduce((sum, r) => sum + amountValue(r.balance), 0) }));
  const agingMax = Math.max(1, ...aging.map((bucket) => bucket.total));

  const title = ar ? 'Accounts receivable' : 'Accounts payable';
  const metrics: Array<[string, string, string]> = ar
    ? [
        ['Outstanding', money(outstanding, true), `${rows.length} open invoice${rows.length === 1 ? '' : 's'}`],
        ['Overdue', money(overdueTotal, true), `${overdueRows.length} require follow-up`],
        ['Due next 7 days', money(dueSoonTotal, true), `${dueSoonRows.length} invoice${dueSoonRows.length === 1 ? '' : 's'}`],
      ]
    : [
        ['Outstanding', money(outstanding, true), `${rows.length} open bill${rows.length === 1 ? '' : 's'}`],
        ['Overdue', money(overdueTotal, true), `${overdueRows.length} supplier${overdueRows.length === 1 ? '' : 's'}`],
        ['Due next 7 days', money(dueSoonTotal, true), `${dueSoonRows.length} scheduled`],
      ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Finance / {ar ? 'Receivables' : 'Payables'}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{ar ? 'Collect faster and keep every customer follow-up visible.' : 'Plan supplier payments and prevent late-payment risk.'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-card" onClick={() => exportRows(rows, ar ? 'receivables.csv' : 'payables.csv')}>
            <Download /> Export
          </Button>
          <Button onClick={() => { window.location.href = '/transactions?new=1'; }}>
            <Plus /> {ar ? 'New invoice' : 'Record bill'}
          </Button>
        </div>
      </div>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, note], i) => (
          <Card key={label} className="gap-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                {i === 1 ? <CalendarClock className="size-4 text-red-500" /> : <TrendingUp className="size-4 text-primary" />}
              </div>
              <p className="metric-value mt-2 text-2xl font-semibold">{loading ? '…' : value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{loading ? ' ' : note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 gap-0">
          <CardHeader className="border-b">
            <CardTitle>{ar ? 'Customer invoices' : 'Supplier invoices'}</CardTitle>
            <CardDescription>{loading ? 'Loading…' : `${filtered.length} records in the current view`}</CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="flex flex-col gap-2 border-b p-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search party or invoice" className="h-9 pl-8" />
              </div>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-lg border bg-card px-3 text-sm">
                <option>All</option>
                {Array.from(new Set(rows.map((r) => r.status))).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'Customer' : 'Vendor'}</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.invoice}>
                    <TableCell>
                      <p className="font-medium">{row.party}</p>
                      <p className="text-[11px] text-muted-foreground">{row.invoice} · {row.issued}</p>
                    </TableCell>
                    <TableCell>
                      <p>{row.due}</p>
                      {row.days ? <p className="text-[11px] font-medium text-red-600">{row.days} days overdue</p> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={styles[row.status] || 'border-slate-200 bg-slate-50 text-slate-700'}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{row.owner}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">{row.balance}</TableCell>
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No open {ar ? 'invoices' : 'bills'} recorded.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'Receivable aging' : 'Payable aging'}</CardTitle>
              <CardDescription>Open balance by age</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {aging.map((bucket) => (
                <div key={bucket.label}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span>{bucket.label}</span>
                    <span className="font-mono">{money(bucket.total, true)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((bucket.total / agingMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'Collection queue' : 'Payment calendar'}</CardTitle>
              <CardDescription>{ar ? `${overdueRows.length} overdue invoice${overdueRows.length === 1 ? '' : 's'} need follow-up` : `${dueSoonRows.length} payment${dueSoonRows.length === 1 ? '' : 's'} due within 7 days`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 rounded-xl bg-muted/45 p-3">
                <Mail className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold">{ar ? `${overdueRows.length} customer${overdueRows.length === 1 ? '' : 's'} overdue` : `${dueSoonRows.length} payment${dueSoonRows.length === 1 ? '' : 's'} due this week`}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Based on due dates recorded on saved transactions</p>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => { window.location.href = '/tasks'; }}>
                Open {ar ? 'follow-up tasks' : 'payment schedule'} <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function exportRows(rows: LedgerRow[], name: string) {
  const header = 'Party,Invoice,Issued,Due,Amount,Balance,Status,Owner';
  const body = rows.map((row) => [row.party, row.invoice, row.issued, row.due, row.amount, row.balance, row.status, row.owner].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
