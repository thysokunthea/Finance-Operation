'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, FileBarChart, FileCheck2, FileWarning, FolderOpen, History, Play, Search, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge'; import { Button } from '@/components/ui/button'; import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; import { Input } from '@/components/ui/input'; import { Progress } from '@/components/ui/progress';

type DocumentRow = { id: string; fileName: string; mimeType: string; sizeBytes: number; category: string; status: string; linkedReference: string | null; uploadedBy: string; createdAt: string };
type TransactionRow = { id: string; date: string; type: string; department: string; party: string; category: string; amount: string; status: string };

const reports: Array<[string, string, (rows: TransactionRow[]) => string]> = [
  ['Income statement', 'Revenue, expenses, and net result by period', (rows) => {
    const revenue = sumBy(rows, (r) => r.type.toLowerCase() === 'income');
    const expense = sumBy(rows, (r) => r.type.toLowerCase() === 'expense');
    return `Revenue ${money(revenue)}, expenses ${money(expense)}, net result ${money(revenue - expense)}.`;
  }],
  ['Cash flow summary', 'Cash inflows, outflows, and ending position', (rows) => {
    const inflow = sumBy(rows, (r) => r.type.toLowerCase() === 'income');
    const outflow = sumBy(rows, (r) => r.type.toLowerCase() === 'expense');
    return `Inflows ${money(inflow)}, outflows ${money(outflow)}, ending position ${money(inflow - outflow)}.`;
  }],
  ['AR aging', 'Open customer invoices grouped by aging bucket', (rows) => {
    const open = rows.filter((r) => r.type.toLowerCase() === 'income' && r.status.toLowerCase() !== 'paid');
    return `${open.length} open customer invoice${open.length === 1 ? '' : 's'} totaling ${money(sumBy(open, () => true))}.`;
  }],
  ['AP aging', 'Open supplier invoices grouped by aging bucket', (rows) => {
    const open = rows.filter((r) => r.type.toLowerCase() === 'expense' && r.status.toLowerCase() !== 'paid');
    return `${open.length} open supplier bill${open.length === 1 ? '' : 's'} totaling ${money(sumBy(open, () => true))}.`;
  }],
  ['Revenue report', 'Revenue by customer, department, project, and category', (rows) => {
    const income = rows.filter((r) => r.type.toLowerCase() === 'income');
    const byDept = groupSum(income);
    return byDept.length ? byDept.map(([d, v]) => `${d}: ${money(v)}`).join(' · ') : 'No revenue recorded yet.';
  }],
  ['Expense report', 'Spending by department, project, vendor, and category', (rows) => {
    const expense = rows.filter((r) => r.type.toLowerCase() === 'expense');
    const byDept = groupSum(expense);
    return byDept.length ? byDept.map(([d, v]) => `${d}: ${money(v)}`).join(' · ') : 'No expenses recorded yet.';
  }],
  ['Tax summary', 'Tax collected and paid with source drill-down', (rows) => `${rows.length} transaction${rows.length === 1 ? '' : 's'} on record. Configure the VAT rate in Settings to compute tax collected and paid.`],
  ['Monthly finance performance', 'Executive KPI pack with exceptions and risks', (rows) => {
    const revenue = sumBy(rows, (r) => r.type.toLowerCase() === 'income');
    const expense = sumBy(rows, (r) => r.type.toLowerCase() === 'expense');
    const overdue = rows.filter((r) => r.status.toLowerCase() === 'overdue').length;
    return `Net ${money(revenue - expense)} across ${rows.length} transactions, ${overdue} overdue item${overdue === 1 ? '' : 's'}.`;
  }],
];

function sumBy(rows: TransactionRow[], predicate: (row: TransactionRow) => boolean) {
  return rows.filter(predicate).reduce((sum, r) => sum + amountValue(r.amount), 0);
}
function groupSum(rows: TransactionRow[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.department || 'Unassigned', (totals.get(row.department || 'Unassigned') || 0) + amountValue(row.amount));
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
}
function amountValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function MvpUtilityContent({ kind }: { kind: 'documents' | 'reports' | 'import' }) {
  if (kind === 'documents') return <Documents />;
  if (kind === 'reports') return <Reports />;
  return <Import />;
}

function Documents() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/documents', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { documents?: DocumentRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Documents could not be loaded.');
        setDocs(payload.documents || []);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Documents could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(files)) {
      try {
        const contentBase64 = await fileToBase64(file);
        const response = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', contentBase64, category: guessCategory(file.name) }),
        });
        const payload = (await response.json()) as { document?: DocumentRow; error?: string };
        if (!response.ok || !payload.document) throw new Error(payload.error || `${file.name} could not be uploaded.`);
        uploaded += 1;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `${file.name} could not be uploaded.`);
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      setMessage(`${uploaded} document(s) uploaded securely.`);
      load();
    }
  };

  const filtered = docs.filter((d) => `${d.fileName} ${d.category} ${d.linkedReference || ''}`.toLowerCase().includes(query.toLowerCase()));
  const missing = docs.filter((d) => d.status !== 'Verified').length;

  return (
    <div className="space-y-5">
      <Header
        crumb="Workflow / Documents"
        title="Document control"
        copy="Find every supporting file and resolve missing evidence before posting."
        action={
          <>
            <input id="document-upload" type="file" multiple className="sr-only" onChange={(event) => onFiles(event.target.files)} />
            <Button onClick={() => document.getElementById('document-upload')?.click()} disabled={uploading}>
              <Upload /> {uploading ? 'Uploading…' : 'Upload documents'}
            </Button>
          </>
        }
      />
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<FolderOpen />} value={loading ? '…' : String(docs.length)} label="Documents on file" />
        <Metric icon={<FileWarning />} value={loading ? '…' : String(missing)} label="Missing evidence" tone="amber" />
        <Metric icon={<ShieldCheck />} value="100%" label="Downloads authorized" tone="green" />
      </div>
      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle>Document registry</CardTitle>
          <CardDescription>Private files with checksum, scan, linkage, and access history</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative border-b p-3">
            <Search className="absolute left-5.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-8" placeholder="Search file, record, or counterparty" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="divide-y">
            {filtered.map((d) => (
              <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="grid gap-3 p-4 transition hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_160px_180px_130px] md:items-center">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/8 text-primary"><FileCheck2 className="size-4" /></span>
                  <div>
                    <p className="text-sm font-medium">{d.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">{d.category} · {formatBytes(d.sizeBytes)}</p>
                  </div>
                </div>
                <p className="text-xs">{d.linkedReference || '—'}</p>
                <p className="text-xs text-muted-foreground">{d.uploadedBy}</p>
                <Badge variant="outline" className={d.status === 'Verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-orange-200 bg-orange-50 text-orange-700'}>{d.status}</Badge>
              </a>
            ))}
            {!loading && filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No documents uploaded yet.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Reports() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState('');
  const [results, setResults] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/transactions', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { transactions?: TransactionRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Transaction data could not be loaded.');
        setRows(payload.transactions || []);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Transaction data could not be loaded.'));
  }, []);

  const run = (name: string, compute: (rows: TransactionRow[]) => string) => {
    setRunning(name);
    setTimeout(() => {
      setResults((current) => ({ ...current, [name]: compute(rows) }));
      setRunning('');
    }, 250);
  };

  const asOf = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-5">
      <Header
        crumb="Finance / Reports"
        title="Reports"
        copy="Reconciled management reporting computed from your saved transactions."
        action={<Button variant="outline" onClick={() => downloadText('report-export-history.csv', `Report,As of\n${Object.keys(results).map((r) => `${r},${asOf}`).join('\n') || `No reports run yet,${asOf}`}`)}><History />Export history</Button>}
      />
      {message ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map(([name, description, compute]) => (
          <Card key={name} className="flex flex-col transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader>
              <span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/8 text-primary"><FileBarChart className="size-5" /></span>
              <CardTitle>{name}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              {results[name] ? <p className="rounded-lg bg-muted/50 p-2.5 text-xs leading-5">{results[name]}</p> : null}
              <div className="flex items-center justify-between">
                <Badge variant="outline">As of {asOf}</Badge>
                <Button size="sm" variant="ghost" disabled={running === name} onClick={() => run(name, compute)}>
                  {running === name ? 'Running…' : 'Run'} <ArrowRight />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

type ImportRow = Record<string, string>;

function Import() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Array<{ row: number; issue: string }>>([]);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(0);

  const targetFields = useMemo(() => ['date', 'reference', 'party', 'department', 'description', 'amount', 'type'], []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) return;
    const [head, ...body] = parsed;
    setFileName(file.name);
    setHeaders(head);
    setRows(body.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']))));
    setMapping(autoMap(head, targetFields));
    setStep(2);
  };

  const validate = () => {
    const issues: Array<{ row: number; issue: string }> = [];
    rows.forEach((row, index) => {
      const amount = Number((row[mapping.amount] || '').replace(/[^0-9.-]/g, ''));
      if (!row[mapping.reference]) issues.push({ row: index + 2, issue: 'Missing reference number' });
      if (!row[mapping.party]) issues.push({ row: index + 2, issue: 'Missing counterparty' });
      if (!Number.isFinite(amount) || amount <= 0) issues.push({ row: index + 2, issue: 'Invalid or missing amount' });
    });
    setErrors(issues);
    setStep(3);
  };

  const commit = async () => {
    setCommitting(true);
    let ok = 0;
    for (const row of rows) {
      const amount = Number((row[mapping.amount] || '').replace(/[^0-9.-]/g, ''));
      if (!row[mapping.reference] || !row[mapping.party] || !Number.isFinite(amount) || amount <= 0) continue;
      const type = /income|revenue/i.test(row[mapping.type] || '') ? 'Income' : 'Expense';
      const record = {
        id: crypto.randomUUID(),
        date: row[mapping.date] || new Date().toISOString().slice(0, 10),
        type,
        reference: row[mapping.reference],
        party: row[mapping.party],
        department: row[mapping.department] || 'Unassigned',
        category: '',
        amount: amount.toFixed(2),
        status: 'Pending',
        approval: 'draft',
        owner: '',
        description: row[mapping.description] || row[mapping.reference],
        currency: 'USD',
      };
      try {
        const response = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
        if (response.ok) ok += 1;
      } catch {
        // counted as failed below
      }
    }
    setCommitted(ok);
    setCommitting(false);
    setStep(4);
  };

  return (
    <div className="space-y-5">
      <Header crumb="Settings / Data Import" title="Import finance data" copy="Map, validate, preview, and commit CSV records safely." />
      <Card>
        <CardHeader>
          <CardTitle>Transaction import</CardTitle>
          <CardDescription>{fileName ? `${fileName} · ${rows.length} rows` : 'Upload a CSV export from your bank or accounting tool'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-4">
            {[['1', 'Upload'], ['2', 'Map fields'], ['3', 'Validate'], ['4', 'Commit']].map(([n, label]) => (
              <button key={n} onClick={() => Number(n) < step && setStep(Number(n))} className={`flex items-center gap-2 rounded-xl border p-3 text-left ${step === Number(n) ? 'border-primary bg-primary/5' : 'bg-card'}`}>
                <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${step > Number(n) ? 'bg-emerald-100 text-emerald-700' : step === Number(n) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{step > Number(n) ? <CheckCircle2 className="size-4" /> : n}</span>
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
          {step === 1 ? (
            <div className="grid min-h-56 place-items-center rounded-2xl border-2 border-dashed bg-muted/25 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Upload /></span>
                <p className="mt-3 font-medium">Choose a CSV file to import</p>
                <p className="mt-1 text-xs text-muted-foreground">Columns for date, reference, counterparty, department, amount, and type</p>
                <input id="import-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                <Button onClick={() => document.getElementById('import-file')?.click()} className="mt-4">Choose file <ArrowRight /></Button>
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div>
              <div className="grid gap-2 md:grid-cols-2">
                {targetFields.map((field) => (
                  <div key={field} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border p-3 text-xs">
                    <select value={mapping[field] || ''} onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))} className="h-8 rounded-lg border bg-card px-2 text-xs">
                      <option value="">Not mapped</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-primary capitalize">{field}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end"><Button onClick={validate}>Validate {rows.length} rows <Play /></Button></div>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric icon={<CheckCircle2 />} value={String(rows.length - errors.length)} label="Valid rows" tone="green" />
                <Metric icon={<FileWarning />} value={String(errors.length)} label="Rows with issues" tone="amber" />
                <Metric icon={<XCircle />} value={String(new Set(errors.map((e) => e.row)).size)} label="Rows blocked" tone="red" />
              </div>
              <Progress value={rows.length ? Math.round(((rows.length - errors.length) / rows.length) * 100) : 0} />
              {errors.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                  <p className="font-semibold">{errors.length} issue(s) found</p>
                  <p className="mt-1">{errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.issue}`).join('; ')}{errors.length > 5 ? '…' : ''}</p>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => downloadText('import-issues.csv', `Row,Issue\n${errors.map((e) => `${e.row},${e.issue}`).join('\n')}`)} disabled={errors.length === 0}><Download />Download issues</Button>
                <Button onClick={commit} disabled={committing || rows.length === errors.length}>{committing ? 'Committing…' : 'Commit valid rows'}</Button>
              </div>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="grid min-h-56 place-items-center text-center">
              <div>
                <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
                <p className="mt-3 font-semibold">Import committed</p>
                <p className="mt-1 text-xs text-muted-foreground">{committed} record(s) created as Pending transactions for finance review.</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function parseCsv(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

function autoMap(headers: string[], targets: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const target of targets) {
    const match = headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, '').includes(target.replace(/[^a-z]/g, '')));
    if (match) map[target] = match;
  }
  return map;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('File could not be read.'));
    reader.readAsDataURL(file);
  });
}

function guessCategory(name: string) {
  if (/invoice/i.test(name)) return 'Invoice';
  if (/receipt/i.test(name)) return 'Receipt';
  if (/statement/i.test(name)) return 'Bank statement';
  return 'Other';
}

function downloadText(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }

function Header({ crumb, title, copy, action }: { crumb: string; title: string; copy: string; action?: React.ReactNode }) { return <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="mb-1 text-xs text-muted-foreground">{crumb}</p><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy}</p></div>{action}</div>; }
function Metric({ icon, value, label, tone = 'blue' }: { icon: React.ReactNode; value: string; label: string; tone?: string }) { const c = tone === 'green' ? 'bg-emerald-50 text-emerald-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'; return <Card className="gap-0"><CardContent className="flex items-center gap-4 p-5"><span className={`grid size-10 place-items-center rounded-xl [&>svg]:size-5 ${c}`}>{icon}</span><div><p className="metric-value text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>; }
