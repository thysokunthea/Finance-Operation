'use client';

import { useState } from 'react';
import { Bot, Check, CheckCircle2, ClipboardCheck, DollarSign, Save, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';

type Kind = 'requests' | 'budgets' | 'approvals' | 'closing' | 'assistant' | 'settings';

const requests = [
  ['REQ-2026-0198', 'Software renewal', 'Technology', '$18,400', 'Pending Approval'],
  ['REQ-2026-0197', 'Supplier settlement', 'Operations', '$6,284', 'Finance Review'],
  ['REQ-2026-0194', 'Client travel claim', 'Commercial', '$1,260', 'Approved'],
];
const budgetLines = [
  ['Technology', '$92,000', '$80,040', '$6,800', '87%'],
  ['Operations', '$118,000', '$74,340', '$12,200', '63%'],
  ['Commercial', '$96,000', '$57,600', '$8,400', '60%'],
  ['People', '$59,000', '$36,220', '$4,000', '61%'],
];
const approvalSeed = [
  { id: 'APR-0828', name: 'Arden Cloud renewal', owner: 'Mina Park', amount: '$18,400', status: 'Pending' },
  { id: 'APR-0827', name: 'Juniper Logistics payment', owner: 'Sofia Chen', amount: '$6,284', status: 'Pending' },
  { id: 'APR-0824', name: 'Fieldstone marketing invoice', owner: 'Jordan Lee', amount: '$3,950', status: 'Pending' },
];
const closingSeed = ['Bank reconciliation', 'AR review', 'AP review', 'Expense review', 'Missing-document review', 'Outstanding advances', 'Budget review', 'Tax review', 'Accrual review', 'Management report'];

export function ExtendedModuleContent({ kind }: { kind: Kind }) {
  if (kind === 'requests') return <Requests />;
  if (kind === 'budgets') return <Budgets />;
  if (kind === 'approvals') return <Approvals />;
  if (kind === 'closing') return <Closing />;
  if (kind === 'assistant') return <Assistant />;
  return <SettingsPanel />;
}

function Requests() {
  return <div className="space-y-5"><Header crumb="Finance / Payment Requests" title="Payment requests" copy="Submit, review, authorize, pay, and close requests in one controlled workflow." action={<Button>New request</Button>} /><Metrics values={[["$26.7K","Pending value"],["3","Awaiting finance"],["96%","On-time processing"]]} /><ListCard title="Request queue" description="Approval levels are selected from configured amount rules">{requests.map((r) => <Row key={r[0]} title={r[1]} subtitle={`${r[0]} · ${r[2]}`} value={r[3]} status={r[4]} />)}</ListCard></div>;
}

function Budgets() {
  return <div className="space-y-5"><Header crumb="Finance / Budgets" title="Budget control" copy="Monitor actual and committed spending before limits are exceeded." action={<Button variant="outline">Edit thresholds</Button>} /><Metrics values={[["$365K","Monthly budget"],["$248.2K","Actual spending"],["$85.4K","Remaining"]]} /><ListCard title="Department utilization" description="Actual and committed spend compared with August budget">{budgetLines.map((r) => <div key={r[0]} className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[1fr_120px_120px_120px_90px] md:items-center"><div><p className="text-sm font-medium">{r[0]}</p><Progress value={Number(r[4].replace('%',''))} className="mt-2 h-1.5" /></div><Value label="Budget" value={r[1]} /><Value label="Actual" value={r[2]} /><Value label="Committed" value={r[3]} /><Badge variant="outline" className={r[4] === '87%' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>{r[4]} used</Badge></div>)}</ListCard></div>;
}

function Approvals() {
  const [items, setItems] = useState(approvalSeed);
  const approve = (id: string) => setItems((current) => current.map((item) => item.id === id ? { ...item, status: 'Approved' } : item));
  return <div className="space-y-5"><Header crumb="Workflow / Approvals" title="Approval center" copy="Review evidence, coding, and authority before finance processes payment." /><Metrics values={[[String(items.filter((i) => i.status === 'Pending').length),"Pending approvals"],["$28.6K","Value awaiting review"],["4.2 hrs","Average decision time"]]} /><ListCard title="Items requiring your decision" description="Actions below update the demo workflow immediately">{items.map((item) => <div key={item.id} className="flex flex-col gap-3 border-b p-4 last:border-0 sm:flex-row sm:items-center"><span className="grid size-10 place-items-center rounded-xl bg-primary/8 text-primary"><ClipboardCheck className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.id} · Submitted by {item.owner}</p></div><p className="font-mono text-sm font-semibold">{item.amount}</p>{item.status === 'Approved' ? <Badge className="bg-emerald-600"><Check /> Approved</Badge> : <Button size="sm" onClick={() => approve(item.id)}>Approve</Button>}</div>)}</ListCard></div>;
}

function Closing() {
  const [done, setDone] = useState<string[]>(closingSeed.slice(0, 4));
  const progress = Math.round((done.length / closingSeed.length) * 100);
  const toggle = (name: string) => setDone((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  return <div className="space-y-5"><Header crumb="Workflow / Monthly Closing" title="August 2026 close" copy="Complete and evidence every control before the accounting period is locked." action={<Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">In progress</Badge>} /><Card><CardContent className="p-5"><div className="flex justify-between text-sm"><span className="font-medium">Closing progress</span><span>{progress}% · {done.length}/{closingSeed.length} complete</span></div><Progress value={progress} className="mt-3" /></CardContent></Card><div className="grid gap-3 md:grid-cols-2">{closingSeed.map((name) => { const checked = done.includes(name); return <button key={name} onClick={() => toggle(name)} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-primary/40"><span className={`grid size-8 place-items-center rounded-lg ${checked ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{checked ? <CheckCircle2 className="size-4" /> : <span className="size-3 rounded border" />}</span><span className="flex-1 text-sm font-medium">{name}</span><span className="text-xs text-muted-foreground">{checked ? 'Complete' : 'Open'}</span></button>; })}</div></div>;
}

function Assistant() {
  const [question, setQuestion] = useState('Which customers have overdue invoices?');
  const [answer, setAnswer] = useState('');
  const ask = () => setAnswer(question.toLowerCase().includes('overdue') ? 'Two customers are overdue: Cedar & Stone owes $14,750 (41 days), and Aurora Hospitality owes $18,600 (3 days). Total overdue: $33,350.' : 'Based on the records available to your Finance Manager role, August revenue is $342,800, expenses are $248,200, and net profit is $94,600.');
  return <div className="mx-auto max-w-4xl space-y-5"><Header crumb="Finance / AI Assistant" title="Finance assistant" copy="Ask questions only across records your current role is authorized to view." /><Card><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></span><div><CardTitle>Ask LedgerFlow</CardTitle><CardDescription>Read-only analysis · no posting or approval authority</CardDescription></div></div></CardHeader><CardContent className="space-y-4"><div className="rounded-xl bg-muted/50 p-4 text-sm">Try: “Which department is over budget?” or “What payments are due next week?”</div>{answer ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6"><div className="mb-2 flex items-center gap-2 font-semibold text-primary"><Sparkles className="size-4" /> Answer from authorized finance data</div>{answer}</div> : null}<div className="flex gap-2"><Textarea aria-label="Ask the finance assistant" value={question} onChange={(e) => setQuestion(e.target.value)} className="min-h-12 resize-none" /><Button aria-label="Send question" onClick={ask} className="self-end"><Send /></Button></div></CardContent></Card></div>;
}

function SettingsPanel() {
  const [saved, setSaved] = useState(false);
  return <div className="space-y-5"><Header crumb="Administration / Settings" title="Finance controls" copy="Configure automation thresholds without changing application code." /><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Budget alerts</CardTitle><CardDescription>Notify responsible managers at these utilization levels.</CardDescription></CardHeader><CardContent className="space-y-4"><Field label="Warning threshold (%)" value="80" /><Field label="Critical threshold (%)" value="95" /></CardContent></Card><Card><CardHeader><CardTitle>Approval reminder</CardTitle><CardDescription>Escalate requests that remain pending beyond policy.</CardDescription></CardHeader><CardContent className="space-y-4"><Field label="First reminder (hours)" value="24" /><Field label="Escalation (hours)" value="48" /></CardContent></Card></div><Card><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><ShieldCheck className="size-8 text-emerald-600" /><div className="flex-1"><p className="font-medium">Accounting safeguards remain enabled</p><p className="text-xs text-muted-foreground">Period locks, audit logs, debit/credit validation, and reversal-only posted entries.</p></div><Button onClick={() => setSaved(true)}><Save /> {saved ? 'Saved' : 'Save settings'}</Button></CardContent></Card></div>;
}

function Header({ crumb, title, copy, action }: { crumb: string; title: string; copy: string; action?: React.ReactNode }) { return <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="mb-1 text-xs text-muted-foreground">{crumb}</p><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy}</p></div>{action}</div>; }
function Metrics({ values }: { values: string[][] }) { return <div className="grid gap-3 sm:grid-cols-3">{values.map(([value, label]) => <Card key={label} className="gap-0"><CardContent className="p-5"><p className="metric-value text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></CardContent></Card>)}</div>; }
function ListCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card className="gap-0"><CardHeader className="border-b"><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="p-0">{children}</CardContent></Card>; }
function Row({ title, subtitle, value, status }: { title: string; subtitle: string; value: string; status: string }) { return <div className="flex flex-col gap-3 border-b p-4 last:border-0 sm:flex-row sm:items-center"><span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-600"><DollarSign className="size-5" /></span><div className="flex-1"><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{subtitle}</p></div><p className="font-mono text-sm font-semibold">{value}</p><Badge variant="outline">{status}</Badge></div>; }
function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
function Field({ label, value }: { label: string; value: string }) { return <label className="block text-xs font-medium">{label}<Input defaultValue={value} inputMode="numeric" className="mt-2" /></label>; }
