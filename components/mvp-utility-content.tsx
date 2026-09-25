'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, FileBarChart, FileCheck2, FileWarning, FolderOpen, History, Play, Search, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge'; import { Button } from '@/components/ui/button'; import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; import { Input } from '@/components/ui/input'; import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/lib/i18n';

type DocumentRow = { id: string; fileName: string; mimeType: string; sizeBytes: number; category: string; status: string; linkedReference: string | null; uploadedBy: string; createdAt: string };
type TransactionRow = { id: string; date: string; type: string; department: string; party: string; category: string; amount: string; status: string };
type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

type ReportDef = { id: string; nameKey: string; descKey: string; compute: (rows: TransactionRow[], t: TranslateFn) => string };

const reports: ReportDef[] = [
  {
    id: 'income-statement',
    nameKey: 'report.incomeStatement',
    descKey: 'report.incomeStatementDesc',
    compute: (rows, t) => {
      const revenue = sumBy(rows, (row) => row.type.toLowerCase() === 'income');
      const expense = sumBy(rows, (row) => row.type.toLowerCase() === 'expense');
      return t('report.incomeStatementResult', { revenue: money(revenue), expense: money(expense), net: money(revenue - expense) });
    },
  },
  {
    id: 'cash-flow-summary',
    nameKey: 'report.cashFlowSummary',
    descKey: 'report.cashFlowSummaryDesc',
    compute: (rows, t) => {
      const inflow = sumBy(rows, (row) => row.type.toLowerCase() === 'income');
      const outflow = sumBy(rows, (row) => row.type.toLowerCase() === 'expense');
      return t('report.cashFlowResult', { inflow: money(inflow), outflow: money(outflow), ending: money(inflow - outflow) });
    },
  },
  {
    id: 'ar-aging',
    nameKey: 'report.arAging',
    descKey: 'report.arAgingDesc',
    compute: (rows, t) => {
      const open = rows.filter((row) => row.type.toLowerCase() === 'income' && row.status.toLowerCase() !== 'paid');
      return t('report.arAgingResult', { count: open.length, plural: open.length === 1 ? '' : 's', total: money(sumBy(open, () => true)) });
    },
  },
  {
    id: 'ap-aging',
    nameKey: 'report.apAging',
    descKey: 'report.apAgingDesc',
    compute: (rows, t) => {
      const open = rows.filter((row) => row.type.toLowerCase() === 'expense' && row.status.toLowerCase() !== 'paid');
      return t('report.apAgingResult', { count: open.length, plural: open.length === 1 ? '' : 's', total: money(sumBy(open, () => true)) });
    },
  },
  {
    id: 'revenue-report',
    nameKey: 'report.revenueReport',
    descKey: 'report.revenueReportDesc',
    compute: (rows, t) => {
      const income = rows.filter((row) => row.type.toLowerCase() === 'income');
      const byDept = groupSum(income);
      return byDept.length ? byDept.map(([department, value]) => `${department}: ${money(value)}`).join(' · ') : t('report.noRevenueYet');
    },
  },
  {
    id: 'expense-report',
    nameKey: 'report.expenseReport',
    descKey: 'report.expenseReportDesc',
    compute: (rows, t) => {
      const expense = rows.filter((row) => row.type.toLowerCase() === 'expense');
      const byDept = groupSum(expense);
      return byDept.length ? byDept.map(([department, value]) => `${department}: ${money(value)}`).join(' · ') : t('report.noExpensesYet');
    },
  },
  {
    id: 'tax-summary',
    nameKey: 'report.taxSummary',
    descKey: 'report.taxSummaryDesc',
    compute: (rows, t) => t('report.taxSummaryResult', { count: rows.length, plural: rows.length === 1 ? '' : 's' }),
  },
  {
    id: 'monthly-performance',
    nameKey: 'report.monthlyPerformance',
    descKey: 'report.monthlyPerformanceDesc',
    compute: (rows, t) => {
      const revenue = sumBy(rows, (row) => row.type.toLowerCase() === 'income');
      const expense = sumBy(rows, (row) => row.type.toLowerCase() === 'expense');
      const overdue = rows.filter((row) => row.status.toLowerCase() === 'overdue').length;
      return t('report.monthlyPerformanceResult', { net: money(revenue - expense), count: rows.length, overdue, plural: overdue === 1 ? '' : 's' });
    },
  },
];

function sumBy(rows: TransactionRow[], predicate: (row: TransactionRow) => boolean) {
  return rows.filter(predicate).reduce((sum, row) => sum + amountValue(row.amount), 0);
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
  const { t } = useLanguage();
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
        if (!response.ok) throw new Error(payload.error || t('docs.loadFailed'));
        setDocs(payload.documents || []);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : t('docs.loadFailed')))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (!response.ok || !payload.document) throw new Error(payload.error || t('docs.uploadFailed', { name: file.name }));
        uploaded += 1;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('docs.uploadFailed', { name: file.name }));
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      setMessage(t('docs.uploadedSuccess', { count: uploaded }));
      load();
    }
  };

  const filtered = docs.filter((doc) => `${doc.fileName} ${doc.category} ${doc.linkedReference || ''}`.toLowerCase().includes(query.toLowerCase()));
  const missing = docs.filter((doc) => doc.status !== 'Verified').length;

  return (
    <div className="space-y-5">
      <Header
        crumb={`${t('section.workflow')} / ${t('nav.documents')}`}
        title={t('docs.title')}
        copy={t('docs.copy')}
        action={
          <>
            <input id="document-upload" type="file" multiple className="sr-only" onChange={(event) => onFiles(event.target.files)} />
            <Button onClick={() => document.getElementById('document-upload')?.click()} disabled={uploading}>
              <Upload /> {uploading ? t('docs.uploading') : t('docs.uploadDocuments')}
            </Button>
          </>
        }
      />
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<FolderOpen />} value={loading ? '…' : String(docs.length)} label={t('docs.onFile')} />
        <Metric icon={<FileWarning />} value={loading ? '…' : String(missing)} label={t('docs.missingEvidence')} tone="amber" />
        <Metric icon={<ShieldCheck />} value="100%" label={t('docs.downloadsAuthorized')} tone="green" />
      </div>
      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle>{t('docs.registry')}</CardTitle>
          <CardDescription>{t('docs.registryDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative border-b p-3">
            <Search className="absolute left-5.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-8" placeholder={t('docs.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="divide-y">
            {filtered.map((doc) => (
              <a key={doc.id} href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer" className="grid gap-3 p-4 transition hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_160px_180px_130px] md:items-center">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/8 text-primary"><FileCheck2 className="size-4" /></span>
                  <div>
                    <p className="text-sm font-medium">{doc.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">{doc.category} · {formatBytes(doc.sizeBytes)}</p>
                  </div>
                </div>
                <p className="text-xs">{doc.linkedReference || '—'}</p>
                <p className="text-xs text-muted-foreground">{doc.uploadedBy}</p>
                <Badge variant="outline" className={doc.status === 'Verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-orange-200 bg-orange-50 text-orange-700'}>{doc.status}</Badge>
              </a>
            ))}
            {!loading && filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{t('docs.noneYet')}</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Reports() {
  const { t, lang } = useLanguage();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState('');
  const [results, setResults] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/transactions', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { transactions?: TransactionRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error || t('reports.loadFailed'));
        setRows(payload.transactions || []);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : t('reports.loadFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (id: string, compute: (rows: TransactionRow[], t: TranslateFn) => string) => {
    setRunning(id);
    setTimeout(() => {
      setResults((current) => ({ ...current, [id]: compute(rows, t) }));
      setRunning('');
    }, 250);
  };

  const asOf = new Date().toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-5">
      <Header
        crumb={`${t('tx.breadcrumbFinance')} / ${t('nav.reports')}`}
        title={t('reports.title')}
        copy={t('reports.copy')}
        action={<Button variant="outline" onClick={() => downloadText('report-export-history.csv', `Report,As of\n${reports.filter((report) => results[report.id]).map((report) => `${t(report.nameKey)},${asOf}`).join('\n') || `${t('reports.noReportsYet')},${asOf}`}`)}><History />{t('reports.exportHistory')}</Button>}
      />
      {message ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <Card key={report.id} className="flex flex-col transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader>
              <span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/8 text-primary"><FileBarChart className="size-5" /></span>
              <CardTitle>{t(report.nameKey)}</CardTitle>
              <CardDescription>{t(report.descKey)}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              {results[report.id] ? <p className="rounded-lg bg-muted/50 p-2.5 text-xs leading-5">{results[report.id]}</p> : null}
              <div className="flex items-center justify-between">
                <Badge variant="outline">{t('reports.asOf', { date: asOf })}</Badge>
                <Button size="sm" variant="ghost" disabled={running === report.id} onClick={() => run(report.id, report.compute)}>
                  {running === report.id ? t('reports.running') : t('reports.run')} <ArrowRight />
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
  const { t } = useLanguage();
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
    setRows(body.map((cells) => Object.fromEntries(head.map((header, index) => [header, cells[index] ?? '']))));
    setMapping(autoMap(head, targetFields));
    setStep(2);
  };

  const validate = () => {
    const issues: Array<{ row: number; issue: string }> = [];
    rows.forEach((row, index) => {
      const amount = Number((row[mapping.amount] || '').replace(/[^0-9.-]/g, ''));
      if (!row[mapping.reference]) issues.push({ row: index + 2, issue: t('imp.missingReference') });
      if (!row[mapping.party]) issues.push({ row: index + 2, issue: t('imp.missingCounterparty') });
      if (!Number.isFinite(amount) || amount <= 0) issues.push({ row: index + 2, issue: t('imp.invalidAmount') });
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

  const steps: Array<[string, string]> = [['1', t('imp.stepUpload')], ['2', t('imp.stepMap')], ['3', t('imp.stepValidate')], ['4', t('imp.stepCommit')]];

  return (
    <div className="space-y-5">
      <Header crumb={`${t('nav.settings')} / ${t('nav.import')}`} title={t('imp.title')} copy={t('imp.copy')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('imp.transactionImport')}</CardTitle>
          <CardDescription>{fileName ? `${fileName} · ${t('imp.rowsSuffix', { count: rows.length })}` : t('imp.uploadPrompt')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-4">
            {steps.map(([n, label]) => (
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
                <p className="mt-3 font-medium">{t('imp.chooseCsv')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('imp.columnsHint')}</p>
                <input id="import-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                <Button onClick={() => document.getElementById('import-file')?.click()} className="mt-4">{t('imp.chooseFile')} <ArrowRight /></Button>
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div>
              <div className="grid gap-2 md:grid-cols-2">
                {targetFields.map((field) => (
                  <div key={field} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border p-3 text-xs">
                    <select value={mapping[field] || ''} onChange={(e) => setMapping((current) => ({ ...current, [field]: e.target.value }))} className="h-8 rounded-lg border bg-card px-2 text-xs">
                      <option value="">{t('imp.notMapped')}</option>
                      {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                    </select>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-primary capitalize">{field}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end"><Button onClick={validate}>{t('imp.validateRows', { count: rows.length })} <Play /></Button></div>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric icon={<CheckCircle2 />} value={String(rows.length - errors.length)} label={t('imp.validRows')} tone="green" />
                <Metric icon={<FileWarning />} value={String(errors.length)} label={t('imp.rowsWithIssues')} tone="amber" />
                <Metric icon={<XCircle />} value={String(new Set(errors.map((error) => error.row)).size)} label={t('imp.rowsBlocked')} tone="red" />
              </div>
              <Progress value={rows.length ? Math.round(((rows.length - errors.length) / rows.length) * 100) : 0} />
              {errors.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                  <p className="font-semibold">{t('imp.issuesFound', { count: errors.length })}</p>
                  <p className="mt-1">{errors.slice(0, 5).map((error) => t('imp.rowIssue', { row: error.row, issue: error.issue })).join('; ')}{errors.length > 5 ? '…' : ''}</p>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => downloadText('import-issues.csv', `Row,Issue\n${errors.map((error) => `${error.row},${error.issue}`).join('\n')}`)} disabled={errors.length === 0}><Download />{t('imp.downloadIssues')}</Button>
                <Button onClick={commit} disabled={committing || rows.length === errors.length}>{committing ? t('imp.committing') : t('imp.commitValidRows')}</Button>
              </div>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="grid min-h-56 place-items-center text-center">
              <div>
                <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
                <p className="mt-3 font-semibold">{t('imp.importCommitted')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('imp.recordsCreated', { count: committed })}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function parseCsv(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
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
    const match = headers.find((header) => header.toLowerCase().replace(/[^a-z]/g, '').includes(target.replace(/[^a-z]/g, '')));
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
function Metric({ icon, value, label, tone = 'blue' }: { icon: React.ReactNode; value: string; label: string; tone?: string }) { const toneClass = tone === 'green' ? 'bg-emerald-50 text-emerald-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'; return <Card className="gap-0"><CardContent className="flex items-center gap-4 p-5"><span className={`grid size-10 place-items-center rounded-xl [&>svg]:size-5 ${toneClass}`}>{icon}</span><div><p className="metric-value text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>; }
