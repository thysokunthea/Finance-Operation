'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Download, FileWarning, Landmark, Plus, WalletCards } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLanguage, type Lang } from '@/lib/i18n';

const chartConfig = { inflow: { label: 'Cash inflow', color: 'var(--chart-1)' }, outflow: { label: 'Cash outflow', color: 'var(--chart-2)' } } satisfies ChartConfig;
const attentionTypes = ['approvals', 'receivables', 'documents', 'payables'] as const;
const attentionMeta: Record<(typeof attentionTypes)[number], { icon: typeof CheckCircle2; tone: string }> = {
  approvals: { icon: CheckCircle2, tone: 'amber' },
  receivables: { icon: Clock3, tone: 'red' },
  documents: { icon: FileWarning, tone: 'amber' },
  payables: { icon: CalendarDays, tone: 'blue' },
};
const statusStyles: Record<string, string> = { Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700', Approved: 'border-sky-200 bg-sky-50 text-sky-700', Pending: 'border-amber-200 bg-amber-50 text-amber-700', Overdue: 'border-red-200 bg-red-50 text-red-700', 'Missing Document': 'border-orange-200 bg-orange-50 text-orange-700' };

type DashboardTransaction = {
  id: string;
  date: string;
  type: string;
  party: string;
  department: string;
  category: string;
  amount: string;
  status: string;
  approval: string;
  dueDate?: string;
};

function parseDueDate(value?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (match) {
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[2]);
    if (month >= 0) return new Date(Number(match[3]), month, Number(match[1]));
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

const monthValues = Array.from({ length: 60 }, (_, index) => {
  const date = new Date(2026, index, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
});

function localeFor(lang: Lang) {
  return lang === 'km' ? 'km-KH' : 'en-US';
}

function formatMonthLabel(value: string, lang: Lang) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(localeFor(lang), { month: 'long', year: 'numeric' });
}

function currentMonthKey() {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return monthValues.includes(key) ? key : '2026-09';
}

function transactionMonth(dateValue: string) {
  const direct = dateValue.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const readable = dateValue.match(/^\d{1,2}\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!readable) return '';
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(readable[1].toLowerCase());
  return month < 0 ? '' : `${readable[2]}-${String(month + 1).padStart(2, '0')}`;
}

function amountValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, compact = false) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

function previousMonth(key: string) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function changePercent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? '0.0%' : '+100.0%';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

export function DashboardContent() {
  const { t, lang } = useLanguage();
  const [attentionFilter, setAttentionFilter] = useState('all');
  const [period, setPeriod] = useState(currentMonthKey);
  const [department, setDepartment] = useState('all');
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [missingDocuments, setMissingDocuments] = useState(0);
  const [monthlyBudget, setMonthlyBudget] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/budgets', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { budgets?: Array<{ monthlyLimit: number }>; error?: string };
        if (response.ok && active) setMonthlyBudget((payload.budgets || []).reduce((sum, b) => sum + b.monthlyLimit, 0));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/documents', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { documents?: Array<{ status: string }>; error?: string };
        if (response.ok && active) setMissingDocuments((payload.documents || []).filter((d) => d.status !== 'Verified').length);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/transactions', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { transactions?: DashboardTransaction[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Dashboard data could not be loaded.');
        if (active) setTransactions(payload.transactions || []);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : 'Dashboard data could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const periodLabel = formatMonthLabel(period, lang);
  const departments = useMemo(() => Array.from(new Set(transactions.map((transaction) => transaction.department).filter(Boolean))).sort(), [transactions]);
  const departmentRows = department === 'all' ? transactions : transactions.filter((transaction) => transaction.department === department);
  const periodRows = departmentRows.filter((transaction) => transactionMonth(transaction.date) === period);
  const priorRows = departmentRows.filter((transaction) => transactionMonth(transaction.date) === previousMonth(period));
  const revenue = periodRows.filter((transaction) => transaction.type.toLowerCase() === 'income').reduce((sum, transaction) => sum + amountValue(transaction.amount), 0);
  const expenses = periodRows.filter((transaction) => transaction.type.toLowerCase() === 'expense').reduce((sum, transaction) => sum + amountValue(transaction.amount), 0);
  const priorRevenue = priorRows.filter((transaction) => transaction.type.toLowerCase() === 'income').reduce((sum, transaction) => sum + amountValue(transaction.amount), 0);
  const priorExpenses = priorRows.filter((transaction) => transaction.type.toLowerCase() === 'expense').reduce((sum, transaction) => sum + amountValue(transaction.amount), 0);
  const netResult = revenue - expenses;
  const priorNet = priorRevenue - priorExpenses;
  const cashBalance = departmentRows.filter((transaction) => transactionMonth(transaction.date) <= period).reduce((sum, transaction) => sum + (transaction.type.toLowerCase() === 'income' ? amountValue(transaction.amount) : -amountValue(transaction.amount)), 0);
  const metrics = [
    { label: t('metric.cashBalance'), value: money(cashBalance, true), delta: changePercent(netResult, priorNet), note: t('metric.throughThisMonth'), icon: Landmark, positive: cashBalance >= 0 },
    { label: t('metric.revenue'), value: money(revenue, true), delta: changePercent(revenue, priorRevenue), note: t('metric.vsLastMonth'), icon: CircleDollarSign, positive: revenue >= priorRevenue },
    { label: t('metric.expenses'), value: money(expenses, true), delta: changePercent(expenses, priorExpenses), note: t('metric.vsLastMonth'), icon: WalletCards, positive: expenses <= priorExpenses },
    { label: t('metric.netResult'), value: money(netResult, true), delta: changePercent(netResult, priorNet), note: netResult >= 0 ? t('metric.profitThisMonth') : t('metric.lossThisMonth'), icon: Banknote, positive: netResult >= 0 },
  ];
  const cashflow = Array.from({ length: 6 }, (_, reverseIndex) => {
    const [year, month] = period.split('-').map(Number);
    const date = new Date(year, month - 1 - (5 - reverseIndex), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const rows = departmentRows.filter((transaction) => transactionMonth(transaction.date) === key);
    return {
      month: date.toLocaleDateString(localeFor(lang), { month: 'short' }),
      inflow: rows.filter((transaction) => transaction.type.toLowerCase() === 'income').reduce((sum, transaction) => sum + amountValue(transaction.amount), 0) / 1000,
      outflow: rows.filter((transaction) => transaction.type.toLowerCase() === 'expense').reduce((sum, transaction) => sum + amountValue(transaction.amount), 0) / 1000,
    };
  });
  const budget = monthlyBudget;
  const budgetUsed = budget > 0 ? Math.min(100, Math.round((expenses / budget) * 100)) : 0;
  const pendingApprovals = transactions.filter((transaction) => !['approved', 'rejected'].includes((transaction.approval || '').toLowerCase()));
  const pendingApprovalValue = pendingApprovals.reduce((sum, transaction) => sum + amountValue(transaction.amount), 0);
  const today = new Date(new Date().toDateString());
  const overdueReceivables = transactions.filter((transaction) => transaction.type.toLowerCase() === 'income' && transaction.status.toLowerCase() !== 'paid' && (() => { const due = parseDueDate(transaction.dueDate); return due ? due.getTime() < today.getTime() : transaction.status.toLowerCase() === 'overdue'; })());
  const overdueReceivablesValue = overdueReceivables.reduce((sum, transaction) => sum + amountValue(transaction.amount), 0);
  const payablesDueSoon = transactions.filter((transaction) => transaction.type.toLowerCase() === 'expense' && transaction.status.toLowerCase() !== 'paid' && (() => { const due = parseDueDate(transaction.dueDate); if (!due) return false; const days = (due.getTime() - today.getTime()) / 86400000; return days >= 0 && days <= 7; })());
  const payablesDueSoonValue = payablesDueSoon.reduce((sum, transaction) => sum + amountValue(transaction.amount), 0);
  const currentAttentionItems = [
    { type: 'approvals' as const, title: t('attention.approvalsTitle', { count: pendingApprovals.length, plural: pendingApprovals.length === 1 ? '' : 's' }), detail: t('attention.approvalsDetail', { amount: money(pendingApprovalValue, true) }) },
    { type: 'receivables' as const, title: t('attention.receivablesTitle', { count: overdueReceivables.length, plural: overdueReceivables.length === 1 ? '' : 's' }), detail: t('attention.receivablesDetail', { amount: money(overdueReceivablesValue, true) }) },
    { type: 'documents' as const, title: t('attention.documentsTitle', { count: missingDocuments, plural: missingDocuments === 1 ? '' : 's' }), detail: missingDocuments > 0 ? t('attention.documentsDetailPending') : t('attention.documentsDetailClear') },
    { type: 'payables' as const, title: t('attention.payablesTitle', { count: payablesDueSoon.length, plural: payablesDueSoon.length === 1 ? '' : 's' }), detail: t('attention.payablesDetail', { amount: money(payablesDueSoonValue, true) }) },
  ].map((item) => ({ ...item, ...attentionMeta[item.type] }));
  const visibleAttention = attentionFilter === 'all' ? currentAttentionItems : currentAttentionItems.filter((item) => item.type === attentionFilter);
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><span>Northstar Holdings</span><span>•</span><span>{periodLabel}</span></div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t('dashboard.title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative inline-flex items-center rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring/40"><CalendarDays className="pointer-events-none absolute left-3 size-4" /><span className="sr-only">{t('dashboard.selectMonth')}</span><select aria-label={t('dashboard.selectMonth')} value={period} onChange={(event) => setPeriod(event.target.value)} className="h-9 appearance-none bg-transparent pl-9 pr-9 text-sm font-medium outline-none"><option disabled>{t('dashboard.selectMonth')}</option>{monthValues.map((value) => <option key={value} value={value}>{formatMonthLabel(value, lang)}</option>)}</select><ChevronRight className="pointer-events-none absolute right-3 size-4 rotate-90 text-muted-foreground" /></label>
          <Select value={department} onValueChange={(value) => setDepartment(value || 'all')}><SelectTrigger className="bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('dashboard.allDepartments')}</SelectItem>{departments.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" className="bg-card" onClick={() => { window.location.href = '/api/transactions/export'; }}><Download /> {t('dashboard.export')}</Button><Button onClick={() => { window.location.href = '/transactions?new=1'; }}><Plus /> {t('dashboard.newTransaction')}</Button>
        </div>
      </section>

      <section aria-label="Key financial metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => { const Icon = metric.icon; return <Card key={metric.label} className="gap-0 shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{metric.label}</p><p className="metric-value mt-2 text-[28px] font-semibold">{metric.value}</p></div><span className="grid size-9 place-items-center rounded-xl bg-primary/8 text-primary"><Icon className="size-4" /></span></div><div className="mt-3 flex items-center gap-1.5 text-xs"><span className={metric.positive ? 'flex items-center font-semibold text-emerald-600' : 'flex items-center font-semibold text-amber-600'}>{metric.positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{metric.delta}</span><span className="text-muted-foreground">{metric.note}</span></div></CardContent></Card>; })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
        <Card className="shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardHeader><CardTitle>{t('chart.cashFlow')}</CardTitle><CardDescription>{t('chart.cashFlowDesc')}</CardDescription><CardAction><Badge variant="outline" className={netResult >= 0 ? 'text-emerald-700' : 'text-red-700'}>{money(netResult, true)} {t('chart.net')}</Badge></CardAction></CardHeader><CardContent><ChartContainer config={chartConfig} className="h-[265px] w-full aspect-auto"><AreaChart data={cashflow} margin={{ left: -16, right: 8, top: 8 }}><defs><linearGradient id="fillInflow" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-inflow)" stopOpacity={0.24} /><stop offset="95%" stopColor="var(--color-inflow)" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={10} /><YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}K`} width={52} /><ChartTooltip content={<ChartTooltipContent indicator="line" />} /><Area dataKey="inflow" type="monotone" fill="url(#fillInflow)" stroke="var(--color-inflow)" strokeWidth={2.5} /><Line dataKey="outflow" type="monotone" stroke="var(--color-outflow)" strokeWidth={2.25} dot={false} /></AreaChart></ChartContainer><div className="mt-2 flex items-center justify-center gap-6 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--chart-1)]" />{t('chart.cashInflow')}</span><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--chart-2)]" />{t('chart.cashOutflow')}</span></div></CardContent></Card>
        <Card className="shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardHeader><CardTitle>{t('attention.title')}</CardTitle><CardDescription>{t('attention.desc')}</CardDescription><CardAction><select aria-label="Filter attention items" value={attentionFilter} onChange={(e) => setAttentionFilter(e.target.value)} className="h-7 rounded-lg border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-ring/40"><option value="all">{t('attention.allItems')}</option><option value="approvals">{t('attention.approvals')}</option><option value="receivables">{t('attention.receivables')}</option><option value="documents">{t('attention.documents')}</option><option value="payables">{t('attention.payables')}</option></select></CardAction></CardHeader><CardContent className="space-y-2">{visibleAttention.map((item) => { const Icon = item.icon; const tone = item.tone === 'red' ? 'bg-red-50 text-red-600' : item.tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'; const route = item.type === 'approvals' ? '/approvals' : `/${item.type}`; return <button key={item.type} onClick={() => { window.location.href = route; }} className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition hover:border-border hover:bg-muted/40"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{item.title}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{item.detail}</span></span><ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></button>; })}<Button variant="ghost" className="mt-2 w-full text-primary" onClick={() => { window.location.href = '/approvals'; }}>{t('attention.openActionCenter')} <ArrowRight /></Button></CardContent></Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
        <Card className="shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardHeader><CardTitle>{t('recent.title')}</CardTitle><CardDescription>{loading ? t('recent.loading') : loadError || t('recent.savedRecords', { count: periodRows.length, plural: periodRows.length === 1 ? '' : 's', period: periodLabel })}</CardDescription><CardAction><a href="/transactions" className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium text-primary hover:bg-muted">{t('recent.viewAll')} <ArrowRight className="size-3.5" /></a></CardAction></CardHeader><CardContent className="px-2 pb-1"><Table><TableHeader><TableRow><TableHead>{t('table.transaction')}</TableHead><TableHead>{t('table.counterparty')}</TableHead><TableHead className="hidden md:table-cell">{t('table.category')}</TableHead><TableHead>{t('table.status')}</TableHead><TableHead className="text-right">{t('table.amount')}</TableHead></TableRow></TableHeader><TableBody>{periodRows.slice(0, 5).map((tx) => <TableRow key={tx.id} className="cursor-pointer"><TableCell><a href="/transactions" className="font-medium hover:text-primary">{tx.id}</a><span className="block text-[11px] text-muted-foreground">{tx.date}</span></TableCell><TableCell>{tx.party || '—'}</TableCell><TableCell className="hidden text-muted-foreground md:table-cell">{tx.category || t('table.uncategorized')}</TableCell><TableCell><Badge variant="outline" className={statusStyles[tx.status] || 'bg-muted text-muted-foreground'}>{tx.status}</Badge></TableCell><TableCell className="text-right font-mono text-xs font-medium">{tx.amount}</TableCell></TableRow>)}{!loading && !loadError && periodRows.length === 0 && <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">{t('recent.noTransactions', { period: periodLabel })}</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        <Card className="shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardHeader><CardTitle>{t('budget.title')}</CardTitle><CardDescription>{periodLabel} {t('budget.operatingBudget')}</CardDescription><CardAction><span className="text-xs font-medium">{budgetUsed}% {t('budget.used')}</span></CardAction></CardHeader><CardContent className="space-y-5"><div><div className="mb-2 flex items-baseline justify-between"><p className="metric-value text-2xl font-semibold">{money(expenses, true)}</p><p className="text-xs text-muted-foreground">{t('budget.of')} {money(budget, true)}</p></div><Progress value={budgetUsed} className="[&_[data-slot=progress-indicator]]:bg-primary" /></div><div className="grid grid-cols-3 gap-2 border-y py-4 text-center"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('budget.actual')}</p><p className="mt-1 text-sm font-semibold">{money(expenses, true)}</p></div><div className="border-x"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('budget.committed')}</p><p className="mt-1 text-sm font-semibold">{money(0, true)}</p></div><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('budget.remaining')}</p><p className="mt-1 text-sm font-semibold text-emerald-600">{money(Math.max(0, budget - expenses), true)}</p></div></div>{budgetUsed >= 80 ? <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"><AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" /><div><p className="text-xs font-semibold">{t('budget.thresholdReached')}</p><p className="mt-0.5 text-[11px] text-amber-700">{t('budget.thresholdDetail', { percent: budgetUsed })}</p></div></div> : <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">{t('budget.withinBudget')}</div>}<Button variant="outline" className="w-full" onClick={() => { window.location.href = '/budgets'; }}>{t('budget.reviewDetails')} <ArrowRight /></Button></CardContent></Card>
      </section>
    </div>
  );
}
