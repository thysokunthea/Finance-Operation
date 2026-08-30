'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Download, FileWarning, Landmark, Plus, WalletCards } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const cashflow = [{ month: 'Mar', inflow: 248, outflow: 186 }, { month: 'Apr', inflow: 276, outflow: 195 }, { month: 'May', inflow: 258, outflow: 207 }, { month: 'Jun', inflow: 312, outflow: 221 }, { month: 'Jul', inflow: 298, outflow: 230 }, { month: 'Aug', inflow: 342, outflow: 248 }];
const chartConfig = { inflow: { label: 'Cash inflow', color: 'var(--chart-1)' }, outflow: { label: 'Cash outflow', color: 'var(--chart-2)' } } satisfies ChartConfig;
const metrics = [
  { label: 'Cash balance', value: '$1.24M', delta: '+8.2%', note: 'vs. last month', icon: Landmark, positive: true },
  { label: 'Revenue', value: '$342.8K', delta: '+12.4%', note: 'this month', icon: CircleDollarSign, positive: true },
  { label: 'Expenses', value: '$248.2K', delta: '+5.1%', note: 'this month', icon: WalletCards, positive: false },
  { label: 'Net result', value: '$94.6K', delta: '+36.7%', note: 'profit this month', icon: Banknote, positive: true },
];
const attentionItems = [
  { type: 'approvals', title: '8 requests awaiting review', detail: '$87,450 total value', icon: CheckCircle2, tone: 'amber' },
  { type: 'receivables', title: '6 invoices overdue', detail: '$42,780 outstanding', icon: Clock3, tone: 'red' },
  { type: 'documents', title: '12 records missing evidence', detail: 'Oldest item is 9 days', icon: FileWarning, tone: 'amber' },
  { type: 'payables', title: '4 payments due this week', detail: '$31,200 scheduled', icon: CalendarDays, tone: 'blue' },
];
const transactions = [
  { id: 'TRX-2026-0841', date: '28 Aug', party: 'Arden Cloud Services', category: 'Software & subscriptions', amount: '$8,420.00', status: 'Pending' },
  { id: 'TRX-2026-0840', date: '28 Aug', party: 'Northline Retail Co.', category: 'Product revenue', amount: '$24,800.00', status: 'Paid' },
  { id: 'TRX-2026-0839', date: '27 Aug', party: 'Fieldstone Studio', category: 'Marketing services', amount: '$3,950.00', status: 'Missing Document' },
  { id: 'TRX-2026-0838', date: '27 Aug', party: 'Juniper Logistics', category: 'Freight & delivery', amount: '$6,284.00', status: 'Approved' },
  { id: 'TRX-2026-0837', date: '26 Aug', party: 'Aurora Hospitality', category: 'Service revenue', amount: '$18,600.00', status: 'Overdue' },
];
const statusStyles: Record<string, string> = { Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700', Approved: 'border-sky-200 bg-sky-50 text-sky-700', Pending: 'border-amber-200 bg-amber-50 text-amber-700', Overdue: 'border-red-200 bg-red-50 text-red-700', 'Missing Document': 'border-orange-200 bg-orange-50 text-orange-700' };

export function DashboardContent() {
  const [attentionFilter, setAttentionFilter] = useState('all');
  const visibleAttention = attentionFilter === 'all' ? attentionItems : attentionItems.filter((item) => item.type === attentionFilter);
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><span>Northstar Holdings</span><span>•</span><span>August 2026</span></div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Finance overview</h1><p className="mt-1 text-sm text-muted-foreground">Your cash position is healthy. Ten items need attention today.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Select defaultValue="aug-2026"><SelectTrigger className="bg-card"><CalendarDays /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aug-2026">August 2026</SelectItem><SelectItem value="q3-2026">Q3 2026</SelectItem><SelectItem value="ytd-2026">Year to date</SelectItem></SelectContent></Select>
          <Select defaultValue="all"><SelectTrigger className="bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem><SelectItem value="operations">Operations</SelectItem><SelectItem value="commercial">Commercial</SelectItem><SelectItem value="technology">Technology</SelectItem></SelectContent></Select>
          <Button variant="outline" className="bg-card"><Download /> Export</Button><Button><Plus /> New transaction</Button>
        </div>
      </section>

      <section aria-label="Key financial metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => { const Icon = metric.icon; return <Card key={metric.label} className="gap-0 shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{metric.label}</p><p className="metric-value mt-2 text-[28px] font-semibold">{metric.value}</p></div><span className="grid size-9 place-items-center rounded-xl bg-primary/8 text-primary"><Icon className="size-4" /></span></div><div className="mt-3 flex items-center gap-1.5 text-xs"><span className={metric.positive ? 'flex items-center font-semibold text-emerald-600' : 'flex items-center font-semibold text-amber-600'}>{metric.positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{metric.delta}</span><span className="text-muted-foreground">{metric.note}</span></div></CardContent></Card>; })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
        <Card className="shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardHeader><CardTitle>Cash flow</CardTitle><CardDescription>Monthly cash inflow and outflow, USD thousands</CardDescription><CardAction><Badge variant="outline" className="text-emerald-700">+$94.6K net</Badge></CardAction></CardHeader><CardContent><ChartContainer config={chartConfig} className="h-[265px] w-full aspect-auto"><AreaChart data={cashflow} margin={{ left: -16, right: 8, top: 8 }}><defs><linearGradient id="fillInflow" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-inflow)" stopOpacity={0.24} /><stop offset="95%" stopColor="var(--color-inflow)" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={10} /><YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}K`} width={52} /><ChartTooltip content={<ChartTooltipContent indicator="line" />} /><Area dataKey="inflow" type="monotone" fill="url(#fillInflow)" stroke="var(--color-inflow)" strokeWidth={2.5} /><Line dataKey="outflow" type="monotone" stroke="var(--color-outflow)" strokeWidth={2.25} dot={false} /></AreaChart></ChartContainer><div className="mt-2 flex items-center justify-center gap-6 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--chart-1)]" />Cash inflow</span><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--chart-2)]" />Cash outflow</span></div></CardContent></Card>
        <Card className="shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardHeader><CardTitle>Needs attention</CardTitle><CardDescription>Exceptions and deadlines requiring action</CardDescription><CardAction><select aria-label="Filter attention items" value={attentionFilter} onChange={(e) => setAttentionFilter(e.target.value)} className="h-7 rounded-lg border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-ring/40"><option value="all">All items</option><option value="approvals">Approvals</option><option value="receivables">Receivables</option><option value="documents">Documents</option><option value="payables">Payables</option></select></CardAction></CardHeader><CardContent className="space-y-2">{visibleAttention.map((item) => { const Icon = item.icon; const tone = item.tone === 'red' ? 'bg-red-50 text-red-600' : item.tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'; return <button key={item.type} className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition hover:border-border hover:bg-muted/40"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{item.title}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{item.detail}</span></span><ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></button>; })}<Button variant="ghost" className="mt-2 w-full text-primary">Open action center <ArrowRight /></Button></CardContent></Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
        <Card className="shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardHeader><CardTitle>Recent transactions</CardTitle><CardDescription>Latest activity across income and expenses</CardDescription><CardAction><Button render={<Link href="/transactions" />} variant="ghost" size="sm">View all <ArrowRight /></Button></CardAction></CardHeader><CardContent className="px-2 pb-1"><Table><TableHeader><TableRow><TableHead>Transaction</TableHead><TableHead>Counterparty</TableHead><TableHead className="hidden md:table-cell">Category</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{transactions.map((tx) => <TableRow key={tx.id} className="cursor-pointer"><TableCell><Link href="/transactions" className="font-medium hover:text-primary">{tx.id}</Link><span className="block text-[11px] text-muted-foreground">{tx.date}</span></TableCell><TableCell>{tx.party}</TableCell><TableCell className="hidden text-muted-foreground md:table-cell">{tx.category}</TableCell><TableCell><Badge variant="outline" className={statusStyles[tx.status]}>{tx.status}</Badge></TableCell><TableCell className="text-right font-mono text-xs font-medium">{tx.amount}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card className="shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardHeader><CardTitle>Budget control</CardTitle><CardDescription>August operating budget</CardDescription><CardAction><span className="text-xs font-medium">68% used</span></CardAction></CardHeader><CardContent className="space-y-5"><div><div className="mb-2 flex items-baseline justify-between"><p className="metric-value text-2xl font-semibold">$248.2K</p><p className="text-xs text-muted-foreground">of $365K</p></div><Progress value={68} className="[&_[data-slot=progress-indicator]]:bg-primary" /></div><div className="grid grid-cols-3 gap-2 border-y py-4 text-center"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Actual</p><p className="mt-1 text-sm font-semibold">$248.2K</p></div><div className="border-x"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Committed</p><p className="mt-1 text-sm font-semibold">$31.4K</p></div><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining</p><p className="mt-1 text-sm font-semibold text-emerald-600">$85.4K</p></div></div><div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"><AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" /><div><p className="text-xs font-semibold">Technology at 87%</p><p className="mt-0.5 text-[11px] text-amber-700">Projected to exceed budget by $6.8K.</p></div></div><Button variant="outline" className="w-full">Review budget details <ArrowRight /></Button></CardContent></Card>
      </section>
    </div>
  );
}
