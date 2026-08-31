'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarDays, CheckCircle2, ChevronRight, Download, FileCheck2, Filter, Pencil, Plus, ScanLine, Search, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DocumentScanner, type ScannedTransaction } from '@/components/document-scanner';

type TransactionRow = {
  id: string; date: string; type: string; reference: string; party: string; department: string;
  category: string; amount: string; status: string; approval: string; owner: string;
  dueDate?: string; currency?: string; subtotal?: string; tax?: string; description?: string;
  paymentMethod?: string; purchaseOrder?: string; documentType?: string;
};
type TransactionDraft = Omit<ScannedTransaction, 'confidence' | 'warnings'> & { department: string };

const blankDraft = (type: 'All' | 'Income' | 'Expense'): TransactionDraft => ({
  type: type === 'All' ? 'Expense' : type, documentType: 'Manual entry', date: '31 Aug 2026', dueDate: '',
  reference: '', party: '', description: '', department: 'Operations', category: '', currency: 'USD',
  subtotal: '', tax: '', amount: '', paymentMethod: '', purchaseOrder: '',
});

const initialRows: TransactionRow[] = [
  { id: 'TRX-2026-0841', date: '28 Aug 2026', type: 'Expense', reference: 'INV-ACS-8821', party: 'Arden Cloud Services', department: 'Technology', category: 'Software & subscriptions', amount: '$8,420.00', status: 'Pending', approval: 'Finance review', owner: 'Mina Park' },
  { id: 'TRX-2026-0840', date: '28 Aug 2026', type: 'Income', reference: 'NS-INV-2048', party: 'Northline Retail Co.', department: 'Commercial', category: 'Product revenue', amount: '$24,800.00', status: 'Paid', approval: 'Approved', owner: 'Evan Ross' },
  { id: 'TRX-2026-0839', date: '27 Aug 2026', type: 'Expense', reference: 'FS-0927', party: 'Fieldstone Studio', department: 'Marketing', category: 'Marketing services', amount: '$3,950.00', status: 'Missing Document', approval: 'Action required', owner: 'Sofia Chen' },
  { id: 'TRX-2026-0838', date: '27 Aug 2026', type: 'Expense', reference: 'JL-44710', party: 'Juniper Logistics', department: 'Operations', category: 'Freight & delivery', amount: '$6,284.00', status: 'Approved', approval: 'Approved', owner: 'Mina Park' },
  { id: 'TRX-2026-0837', date: '26 Aug 2026', type: 'Income', reference: 'NS-INV-2039', party: 'Aurora Hospitality', department: 'Commercial', category: 'Service revenue', amount: '$18,600.00', status: 'Overdue', approval: 'Approved', owner: 'Evan Ross' },
  { id: 'TRX-2026-0836', date: '25 Aug 2026', type: 'Expense', reference: 'BR-1811', party: 'Blue Ridge Facilities', department: 'Operations', category: 'Facilities', amount: '$12,480.00', status: 'Paid', approval: 'Approved', owner: 'Mina Park' },
  { id: 'TRX-2026-0835', date: '25 Aug 2026', type: 'Income', reference: 'NS-INV-2035', party: 'Solace Health Group', department: 'Commercial', category: 'Service revenue', amount: '$31,200.00', status: 'Paid', approval: 'Approved', owner: 'Evan Ross' },
];

const badgeStyles: Record<string, string> = {
  Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700', Approved: 'border-sky-200 bg-sky-50 text-sky-700',
  Pending: 'border-amber-200 bg-amber-50 text-amber-700', Overdue: 'border-red-200 bg-red-50 text-red-700',
  'Missing Document': 'border-orange-200 bg-orange-50 text-orange-700',
};

export function TransactionsContent({ type = 'All' }: { type?: 'All' | 'Income' | 'Expense' }) {
  const [records, setRecords] = useState<TransactionRow[]>(initialRows);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<TransactionDraft>(() => blankDraft(type));
  const [selected, setSelected] = useState<TransactionRow>(type === 'Income' ? initialRows[1] : initialRows[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const typeRows = useMemo(() => type === 'All' ? records : records.filter((row) => row.type === type), [records, type]);
  const filtered = useMemo(() => typeRows.filter((row) => `${row.id} ${row.reference} ${row.party} ${row.category}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All statuses' || row.status === status)), [typeRows, query, status]);
  const title = type === 'Income' ? 'Income register' : type === 'Expense' ? 'Expense register' : 'Transaction register';
  const copy = type === 'Income' ? 'Track recognized revenue, collections, and supporting invoices.' : type === 'Expense' ? 'Control operating spend, evidence, approvals, and payment status.' : 'Review, trace, and control all financial activity.';

  const openNewTransaction = () => {
    setEditingId(null); setDraft(blankDraft(type)); setNotice(''); setDialogOpen(true);
  };

  const openEditTransaction = (record: TransactionRow) => {
    setEditingId(record.id);
    setDraft({
      type: record.type === 'Income' ? 'Income' : 'Expense', documentType: record.documentType || 'Financial document',
      date: record.date, dueDate: record.dueDate || '', reference: record.reference, party: record.party,
      description: record.description || '', department: record.department, category: record.category,
      currency: record.currency || 'USD', subtotal: record.subtotal || '', tax: record.tax || '',
      amount: record.amount.replace(/[^0-9.-]/g, ''), paymentMethod: record.paymentMethod || '',
      purchaseOrder: record.purchaseOrder || '',
    });
    setNotice(''); setDialogOpen(true);
  };

  const saveTransaction = (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(draft.amount);
    if (!draft.party.trim() || !draft.reference.trim() || !draft.date.trim() || !draft.description.trim() || !draft.category.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setNotice('Complete customer/vendor, reference, issue date, description, category, and a valid amount.'); return;
    }
    const currency = draft.currency || 'USD';
    const existing = editingId ? records.find((row) => row.id === editingId) : undefined;
    const record: TransactionRow = {
      id: existing?.id || `TRX-2026-${String(842 + records.length).padStart(4, '0')}`, date: draft.date, type: draft.type,
      reference: draft.reference.trim(), party: draft.party.trim(), department: draft.department,
      category: draft.category.trim(), amount: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(numericAmount),
      status: 'Pending', approval: 'Finance review', owner: existing?.owner || 'Jordan Lee', dueDate: draft.dueDate, currency,
      subtotal: draft.subtotal, tax: draft.tax, description: draft.description, paymentMethod: draft.paymentMethod,
      purchaseOrder: draft.purchaseOrder, documentType: draft.documentType,
    };
    setRecords((current) => existing ? current.map((row) => row.id === record.id ? record : row) : [record, ...current]);
    setSelected(record); setDialogOpen(false);
    setNotice(existing ? `${record.id} updated and returned to Pending finance review.` : `${record.id} saved as Pending.`);
    setEditingId(null); setDraft(blankDraft(type));
  };

  const useScannedData = (scanned: ScannedTransaction) => {
    const { confidence: _confidence, warnings: _warnings, ...fields } = scanned;
    setEditingId(null); setDraft({ ...fields, department: 'Operations' }); setScanOpen(false); setNotice(''); setDialogOpen(true);
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><p className="mb-1 text-xs text-muted-foreground">Finance / {type === 'All' ? 'Transactions' : type}</p><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy}</p></div>
      <div className="flex flex-wrap gap-2"><a href="/api/transactions/export" download className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium shadow-xs transition-colors hover:bg-muted"><Download className="size-4" /> Export</a><Button variant="outline" className="bg-card" onClick={() => setScanOpen(true)} title="Upload and review a supporting document"><FileCheck2 /> Scan document</Button><Button variant="outline" className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10" onClick={() => setScanOpen(true)} title="Extract transaction fields from PNG, JPG, or PDF"><ScanLine /> OCR Import</Button><Button onClick={openNewTransaction}><Plus /> New {type === 'All' ? 'transaction' : type.toLowerCase()}</Button></div>
    </div>
    {notice ? <div role="status" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${notice.includes('required') ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}><CheckCircle2 className="size-4" />{notice}</div> : null}
    {scanOpen ? <DocumentScanner onClose={() => setScanOpen(false)} onApply={useScannedData} /> : null}

    <Card className="gap-0 shadow-[0_1px_2px_rgb(15_23_42/3%)]"><CardContent className="p-3"><div className="flex flex-col gap-2 md:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, reference, counterparty or category" className="h-9 pl-8" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border bg-card px-3 text-sm outline-none"><option>All statuses</option><option>Paid</option><option>Pending</option><option>Approved</option><option>Overdue</option><option>Missing Document</option></select><Button variant="outline" className="h-9"><CalendarDays /> 1–31 Aug 2026</Button><Button variant="outline" className="h-9"><Filter /> More filters</Button></div></CardContent></Card>

    <div className="grid min-h-[590px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0 gap-0"><CardHeader className="border-b py-4"><CardTitle className="flex items-center justify-between"><span>{filtered.length} transactions</span><span className="text-xs font-normal text-muted-foreground">Finance register</span></CardTitle></CardHeader><CardContent className="px-2 pb-2"><Table><TableHeader><TableRow><TableHead>Transaction</TableHead><TableHead>Counterparty</TableHead><TableHead className="hidden lg:table-cell">Department</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-8" /></TableRow></TableHeader><TableBody>{filtered.map((row) => <TableRow key={row.id} onClick={() => setSelected(row)} data-state={selected.id === row.id ? 'selected' : undefined} className="cursor-pointer"><TableCell><p className="font-medium">{row.id}</p><p className="text-[11px] text-muted-foreground">{row.date} · {row.type}</p></TableCell><TableCell><p>{row.party}</p><p className="text-[11px] text-muted-foreground">{row.reference}</p></TableCell><TableCell className="hidden text-muted-foreground lg:table-cell">{row.department}</TableCell><TableCell><Badge variant="outline" className={badgeStyles[row.status]}>{row.status}</Badge></TableCell><TableCell className="text-right font-mono text-xs font-semibold">{row.amount}</TableCell><TableCell><ChevronRight className="size-4 text-muted-foreground" /></TableCell></TableRow>)}</TableBody></Table>{filtered.length === 0 ? <div className="grid min-h-56 place-items-center text-center"><div><Search className="mx-auto mb-2 size-7 text-muted-foreground" /><p className="font-medium">No matching transactions</p><p className="mt-1 text-sm text-muted-foreground">Adjust the search or status filter.</p></div></div> : null}</CardContent></Card>

      <Card className="h-fit gap-0 xl:sticky xl:top-20"><CardHeader className="border-b py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Transaction detail</p><CardTitle className="mt-1">{selected.id}</CardTitle></div></CardHeader><CardContent className="space-y-5 p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Total amount</p><p className="metric-value mt-1 text-2xl font-semibold">{selected.amount}</p></div><Badge variant="outline" className={badgeStyles[selected.status]}>{selected.status}</Badge></div><dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs"><Detail label="Counterparty" value={selected.party} /><Detail label="Reference" value={selected.reference} /><Detail label="Issue date" value={selected.date} /><Detail label="Department" value={selected.department} /><Detail label="Category" value={selected.category} /><Detail label="Responsible" value={selected.owner} /><Detail label="Approval" value={selected.approval} />{selected.dueDate ? <Detail label="Due date" value={selected.dueDate} /> : null}{selected.tax ? <Detail label="Tax / VAT" value={`${selected.currency || 'USD'} ${selected.tax}`} /> : null}{selected.paymentMethod ? <Detail label="Payment method" value={selected.paymentMethod} /> : null}{selected.purchaseOrder ? <Detail label="Purchase order" value={selected.purchaseOrder} /> : null}</dl>{selected.description ? <div className="rounded-xl border bg-muted/20 p-3 text-xs"><p className="text-muted-foreground">Description</p><p className="mt-1">{selected.description}</p></div> : null}<div className="rounded-xl border bg-muted/30 p-3"><div className="flex items-center gap-2 text-xs font-semibold"><ArrowLeftRight className="size-4 text-primary" /> Balanced journal</div><div className="mt-3 flex justify-between text-xs"><span className="text-muted-foreground">Debit</span><span className="font-mono">{selected.amount}</span></div><div className="mt-2 flex justify-between text-xs"><span className="text-muted-foreground">Credit</span><span className="font-mono">{selected.amount}</span></div></div><div className="space-y-2"><div className="flex items-center gap-2 text-xs"><FileCheck2 className="size-4 text-emerald-600" /><span>Supporting document linked</span></div><div className="flex items-center gap-2 text-xs"><ShieldCheck className="size-4 text-emerald-600" /><span>Audit trail intact</span></div></div><div className="grid grid-cols-2 gap-2"><Button variant="outline">View documents</Button><Button onClick={() => openEditTransaction(selected)}><Pencil /> Edit transaction</Button></div></CardContent></Card>
    </div>

    {dialogOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"><button type="button" aria-label="Close transaction dialog" className="absolute inset-0" onClick={() => setDialogOpen(false)} /><form aria-label={editingId ? 'Edit transaction form' : 'New transaction form'} onSubmit={saveTransaction} className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><h2 className="text-xl font-semibold">{editingId ? `Edit ${editingId}` : 'Review transaction'}</h2><p className="mt-1 text-xs text-muted-foreground">{editingId ? 'Changes return the record to Pending finance review and remain traceable.' : 'Confirm scanned values. Saving creates a Pending record for finance review.'}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Close dialog" onClick={() => setDialogOpen(false)}><X /></Button></div><div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Transaction type"><select value={draft.type} disabled={type !== 'All'} onChange={(event) => setDraft({ ...draft, type: event.target.value as 'Income' | 'Expense' })} className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"><option>Income</option><option>Expense</option></select></Field>
      <Field label="Document type"><Input value={draft.documentType} onChange={(event) => setDraft({ ...draft, documentType: event.target.value })} className="mt-2" /></Field>
      <Field label="Issue date"><Input required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className="mt-2" /></Field>
      <Field label="Due date"><Input value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className="mt-2" /></Field>
      <Field label="Invoice / Receipt no."><Input required value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} className="mt-2" /></Field>
      <Field label="Purchase order"><Input value={draft.purchaseOrder} onChange={(event) => setDraft({ ...draft, purchaseOrder: event.target.value })} className="mt-2" /></Field>
      <Field label="Customer / Vendor"><Input required value={draft.party} onChange={(event) => setDraft({ ...draft, party: event.target.value })} className="mt-2" /></Field>
      <Field label="Department"><select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"><option>Operations</option><option>Commercial</option><option>Technology</option><option>Marketing</option></select></Field>
      <Field label="Category"><Input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="mt-2" /></Field>
      <Field label="Currency"><Input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} className="mt-2" /></Field>
      <Field label="Subtotal"><Input type="number" min="0" step="0.01" value={draft.subtotal} onChange={(event) => setDraft({ ...draft, subtotal: event.target.value })} className="mt-2" /></Field>
      <Field label="Tax / VAT"><Input type="number" min="0" step="0.01" value={draft.tax} onChange={(event) => setDraft({ ...draft, tax: event.target.value })} className="mt-2" /></Field>
      <Field label="Total amount"><Input required type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} className="mt-2" /></Field>
      <Field label="Payment method"><Input value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })} className="mt-2" /></Field>
      <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">Description<textarea required value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className="mt-2 w-full rounded-lg border bg-card px-3 py-2 text-sm" /></label>
    </div><div className="flex justify-end gap-2 border-t p-5"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit">{editingId ? 'Save changes for review' : 'Save as Pending'}</Button></div></form></div> : null}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-medium">{label}{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>; }
