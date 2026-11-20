'use client';
import { workflowLabel } from '@/lib/workflow-labels';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { parseCsv } from '@/lib/csv';
import { ReportsWorkspace } from './reports-workspace';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileCheck2,
  FileWarning,
  FolderOpen,
  Play,
  Search,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/lib/i18n';

type DocumentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  status: string;
  linkedReference: string | null;
  uploadedBy: string;
  createdAt: string;
  processingStatus?: string;
  linkedTransactionCount?: number;
};
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function MvpUtilityContent({
  kind,
}: {
  kind: 'documents' | 'reports' | 'import';
}) {
  if (kind === 'documents') return <Documents />;
  if (kind === 'reports') return <ReportsWorkspace />;
  return <Import />;
}

function Documents() {
  const { t, lang } = useLanguage();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const defaultReference = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('popstate', onChange);
      return () => window.removeEventListener('popstate', onChange);
    },
    () => new URLSearchParams(window.location.search).get('reference') || '',
    () => '',
  );
  const [referenceOverride, setLinkedReference] = useState<string | null>(null);
  const linkedReference = referenceOverride ?? defaultReference;
  const [reviewId, setReviewId] = useState('');
  const [references, setReferences] = useState<Record<string, string>>({});

  const review = async (doc: DocumentRow) => {
    setReviewId(doc.id);
    setMessage('');
    try {
      const response = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: doc.id,
          linkedReference:
            references[doc.id] || doc.linkedReference || linkedReference,
          verify: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setDocs(payload.documents);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Review failed.');
    } finally {
      setReviewId('');
    }
  };

  const load = useCallback(() => {
    fetch('/api/documents', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          documents?: DocumentRow[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || t('docs.loadFailed'));
        setDocs(payload.documents || []);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : t('docs.loadFailed'),
        ),
      )
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(load, [load]);

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
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            contentBase64,
            category: guessCategory(file.name),
            linkedReference,
          }),
        });
        const payload = (await response.json()) as {
          document?: DocumentRow;
          error?: string;
        };
        if (!response.ok || !payload.document)
          throw new Error(
            payload.error || t('docs.uploadFailed', { name: file.name }),
          );
        uploaded += 1;
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : t('docs.uploadFailed', { name: file.name }),
        );
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      setMessage(t('docs.uploadedSuccess', { count: uploaded }));
      load();
    }
  };

  const filtered = docs.filter((doc) =>
    `${doc.fileName} ${doc.category} ${doc.linkedReference || ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const missing = docs.filter((doc) => doc.status !== 'Verified').length;

  return (
    <div className="space-y-5">
      <Header
        crumb={`${t('section.workflow')} / ${t('nav.documents')}`}
        title={t('docs.title')}
        copy={t('docs.copy')}
        action={
          <>
            <label className="text-sm">
              {workflowLabel(lang, 'Transaction reference')}
              <Input
                value={linkedReference}
                onChange={(e) => setLinkedReference(e.target.value)}
              />
            </label>
            <input
              id="document-upload"
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => onFiles(event.target.files)}
            />
            <Button
              onClick={() =>
                document.getElementById('document-upload')?.click()
              }
              disabled={uploading}
            >
              <Upload />{' '}
              {uploading ? t('docs.uploading') : t('docs.uploadDocuments')}
            </Button>
          </>
        }
      />
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-muted/30 p-3 text-sm">
          {message}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          icon={<FolderOpen />}
          value={loading ? '…' : String(docs.length)}
          label={t('docs.onFile')}
        />
        <Metric
          icon={<FileWarning />}
          value={loading ? '…' : String(missing)}
          label={t('docs.missingEvidence')}
          tone="amber"
        />
        <Metric
          icon={<ShieldCheck />}
          value="100%"
          label={t('docs.downloadsAuthorized')}
          tone="green"
        />
      </div>
      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle>{t('docs.registry')}</CardTitle>
          <CardDescription>{t('docs.registryDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative border-b p-3">
            <Search className="absolute left-5.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder={t('docs.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="divide-y">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className="grid gap-3 p-4 transition hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_160px_180px_130px] md:items-center"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/8 text-primary">
                    <FileCheck2 className="size-4" />
                  </span>
                  <div>
                    <a
                      href={`/api/documents/${doc.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium underline"
                    >
                      {doc.fileName}
                    </a>
                    <p className="text-[11px] text-muted-foreground">
                      {doc.category} · {formatBytes(doc.sizeBytes)}
                    </p>
                  </div>
                </div>
                <label className="text-xs">
                  {workflowLabel(lang, 'Transaction reference')}
                  <Input
                    disabled={!!doc.linkedTransactionCount}
                    placeholder={
                      doc.linkedTransactionCount
                        ? String(doc.linkedTransactionCount) +
                          ' ' +
                          t('tx.importRows')
                        : ''
                    }
                    value={references[doc.id] ?? doc.linkedReference ?? ''}
                    onChange={(e) =>
                      setReferences({ ...references, [doc.id]: e.target.value })
                    }
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  {doc.uploadedBy}
                </p>
                <Badge
                  variant="outline"
                  className={
                    doc.status === 'Verified'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-orange-200 bg-orange-50 text-orange-700'
                  }
                >
                  {doc.status}
                </Badge>
                {doc.processingStatus && doc.processingStatus !== 'Uploaded' ? (
                  <Badge variant="outline">
                    {t(
                      'tx.autoStatus.' +
                        doc.processingStatus.toLowerCase().replaceAll(' ', '_'),
                    )}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  disabled={reviewId === doc.id}
                  onClick={() => void review(doc)}
                >
                  {workflowLabel(lang, 'Link & verify')}
                </Button>
                {!doc.linkedReference ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.location.href =
                        '/transactions?document=' + encodeURIComponent(doc.id);
                    }}
                  >
                    {t('docs.createRecord')}
                  </Button>
                ) : null}
              </div>
            ))}
            {!loading && filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t('docs.noneYet')}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
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
  const [errors, setErrors] = useState<Array<{ row: number; issue: string }>>(
    [],
  );
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(0);
  const [commitErrors, setCommitErrors] = useState<string[]>([]);
  const invalidCount = new Set(errors.map((error) => error.row)).size;

  const targetFields = useMemo(
    () => [
      'date',
      'reference',
      'party',
      'department',
      'description',
      'amount',
      'type',
      'currency',
      'exchangeRate',
    ],
    [],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    let parsed: string[][];
    try {
      parsed = parseCsv(text);
    } catch (error) {
      setCommitErrors([
        error instanceof Error ? error.message : 'Invalid CSV.',
      ]);
      return;
    }
    setCommitErrors([]);
    setErrors([]);
    setCommitted(0);
    if (parsed.length === 0) return;
    const [head, ...body] = parsed;
    setFileName(file.name);
    setHeaders(head);
    setRows(
      body.map((cells) =>
        Object.fromEntries(
          head.map((header, index) => [header, cells[index] ?? '']),
        ),
      ),
    );
    setMapping(autoMap(head, targetFields));
    setStep(2);
  };

  const validate = () => {
    const issues: Array<{ row: number; issue: string }> = [];
    rows.forEach((row, index) => {
      const amount = Number(
        (row[mapping.amount] || '').replace(/[^0-9.-]/g, ''),
      );
      const currency = row[mapping.currency];
      if (!['KHR', 'USD'].includes(currency))
        issues.push({ row: index + 2, issue: 'Currency must be KHR or USD.' });
      if (currency === 'USD' && !(Number(row[mapping.exchangeRate]) > 0))
        issues.push({
          row: index + 2,
          issue: 'A KHR per USD exchange rate is required.',
        });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row[mapping.date] || ''))
        issues.push({ row: index + 2, issue: 'Use YYYY-MM-DD dates.' });
      if (!/^(income|expense)$/i.test(row[mapping.type] || ''))
        issues.push({
          row: index + 2,
          issue: 'Type must be Income or Expense.',
        });
      if (!row[mapping.reference])
        issues.push({ row: index + 2, issue: t('imp.missingReference') });
      if (!row[mapping.party])
        issues.push({ row: index + 2, issue: t('imp.missingCounterparty') });
      if (!Number.isFinite(amount) || amount <= 0)
        issues.push({ row: index + 2, issue: t('imp.invalidAmount') });
    });
    setErrors(issues);
    setStep(3);
  };

  const commit = async () => {
    setCommitting(true);
    let ok = 0;
    const failures: string[] = [];
    for (const [index, row] of rows.entries()) {
      if (errors.some((issue) => issue.row === index + 2)) continue;
      const amount = Number(
        (row[mapping.amount] || '').replace(/[^0-9.-]/g, ''),
      );
      if (
        !row[mapping.reference] ||
        !row[mapping.party] ||
        !Number.isFinite(amount) ||
        amount <= 0
      )
        continue;
      const type = /income|revenue/i.test(row[mapping.type] || '')
        ? 'Income'
        : 'Expense';
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
        currency: row[mapping.currency],
        exchangeRate:
          row[mapping.currency] === 'KHR' ? '1' : row[mapping.exchangeRate],
      };
      try {
        const response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (response.ok) ok += 1;
        else {
          const p = await response.json();
          failures.push(`Row ${index + 2}: ${p.error || 'Save failed.'}`);
        }
      } catch {
        failures.push(`Row ${index + 2}: connection failed.`);
      }
    }
    setCommitted(ok);
    setCommitErrors(failures);
    setCommitting(false);
    setStep(4);
  };

  const steps: Array<[string, string]> = [
    ['1', t('imp.stepUpload')],
    ['2', t('imp.stepMap')],
    ['3', t('imp.stepValidate')],
    ['4', t('imp.stepCommit')],
  ];

  return (
    <div className="space-y-5">
      {commitErrors.length ? (
        <div
          role="alert"
          className="rounded-xl border p-3 text-sm text-red-600"
        >
          {commitErrors.join(' · ')}
        </div>
      ) : null}
      <Header
        crumb={`${t('nav.settings')} / ${t('nav.import')}`}
        title={t('imp.title')}
        copy={t('imp.copy')}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('imp.transactionImport')}</CardTitle>
          <CardDescription>
            {fileName
              ? `${fileName} · ${t('imp.rowsSuffix', { count: rows.length })}`
              : t('imp.uploadPrompt')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-4">
            {steps.map(([n, label]) => (
              <button
                key={n}
                onClick={() => Number(n) < step && setStep(Number(n))}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left ${step === Number(n) ? 'border-primary bg-primary/5' : 'bg-card'}`}
              >
                <span
                  className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${step > Number(n) ? 'bg-emerald-100 text-emerald-700' : step === Number(n) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  {step > Number(n) ? <CheckCircle2 className="size-4" /> : n}
                </span>
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
          {step === 1 ? (
            <div className="grid min-h-56 place-items-center rounded-2xl border-2 border-dashed bg-muted/25 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Upload />
                </span>
                <p className="mt-3 font-medium">{t('imp.chooseCsv')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('imp.columnsHint')}
                </p>
                <input
                  id="import-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <Button
                  onClick={() =>
                    document.getElementById('import-file')?.click()
                  }
                  className="mt-4"
                >
                  {t('imp.chooseFile')} <ArrowRight />
                </Button>
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div>
              <div className="grid gap-2 md:grid-cols-2">
                {targetFields.map((field) => (
                  <div
                    key={field}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border p-3 text-xs"
                  >
                    <select
                      value={mapping[field] || ''}
                      onChange={(e) =>
                        setMapping((current) => ({
                          ...current,
                          [field]: e.target.value,
                        }))
                      }
                      className="h-8 rounded-lg border bg-card px-2 text-xs"
                    >
                      <option value="">{t('imp.notMapped')}</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-primary capitalize">
                      {field}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={validate}>
                  {t('imp.validateRows', { count: rows.length })} <Play />
                </Button>
              </div>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  icon={<CheckCircle2 />}
                  value={String(rows.length - invalidCount)}
                  label={t('imp.validRows')}
                  tone="green"
                />
                <Metric
                  icon={<FileWarning />}
                  value={String(invalidCount)}
                  label={t('imp.rowsWithIssues')}
                  tone="amber"
                />
                <Metric
                  icon={<XCircle />}
                  value={String(new Set(errors.map((error) => error.row)).size)}
                  label={t('imp.rowsBlocked')}
                  tone="red"
                />
              </div>
              <Progress
                value={
                  rows.length
                    ? Math.round(
                        ((rows.length - invalidCount) / rows.length) * 100,
                      )
                    : 0
                }
              />
              {errors.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                  <p className="font-semibold">
                    {t('imp.issuesFound', { count: errors.length })}
                  </p>
                  <p className="mt-1">
                    {errors
                      .slice(0, 5)
                      .map((error) =>
                        t('imp.rowIssue', {
                          row: error.row,
                          issue: error.issue,
                        }),
                      )
                      .join('; ')}
                    {errors.length > 5 ? '…' : ''}
                  </p>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadText(
                      'import-issues.csv',
                      `Row,Issue\n${errors.map((error) => `${error.row},${error.issue}`).join('\n')}`,
                    )
                  }
                  disabled={errors.length === 0}
                >
                  <Download />
                  {t('imp.downloadIssues')}
                </Button>
                <Button
                  onClick={commit}
                  disabled={committing || rows.length === invalidCount}
                >
                  {committing ? t('imp.committing') : t('imp.commitValidRows')}
                </Button>
              </div>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="grid min-h-56 place-items-center text-center">
              <div>
                <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
                <p className="mt-3 font-semibold">{t('imp.importCommitted')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('imp.recordsCreated', { count: committed })}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function autoMap(headers: string[], targets: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const target of targets) {
    const match = headers.find((header) =>
      header
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .includes(target.replace(/[^a-z]/g, '')),
    );
    if (match) map[target] = match;
  }
  return map;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        (typeof reader.result === 'string' ? reader.result : '').split(
          ',',
        )[1] || '',
      );
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

function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Header({
  crumb,
  title,
  copy,
  action,
}: {
  crumb: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="mb-1 text-xs text-muted-foreground">{crumb}</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
      </div>
      {action}
    </div>
  );
}
function Metric({
  icon,
  value,
  label,
  tone = 'blue',
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone?: string;
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-emerald-50 text-emerald-600'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-600'
        : tone === 'red'
          ? 'bg-red-50 text-red-600'
          : 'bg-sky-50 text-sky-600';
  return (
    <Card className="gap-0">
      <CardContent className="flex items-center gap-4 p-5">
        <span
          className={`grid size-10 place-items-center rounded-xl [&>svg]:size-5 ${toneClass}`}
        >
          {icon}
        </span>
        <div>
          <p className="metric-value text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
