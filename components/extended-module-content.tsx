'use client';

import { useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
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
import { Textarea } from '@/components/ui/textarea';

type Kind =
  | 'requests'
  | 'budgets'
  | 'approvals'
  | 'closing'
  | 'assistant'
  | 'settings';

const requests = [
  [
    'REQ-2026-0198',
    'Software renewal',
    'Technology',
    '$18,400',
    'Pending Approval',
  ],
  [
    'REQ-2026-0197',
    'Supplier settlement',
    'Operations',
    '$6,284',
    'Finance Review',
  ],
  ['REQ-2026-0194', 'Client travel claim', 'Commercial', '$1,260', 'Approved'],
];
const budgetLines = [
  ['Technology', '$92,000', '$80,040', '$6,800', '87%'],
  ['Operations', '$118,000', '$74,340', '$12,200', '63%'],
  ['Commercial', '$96,000', '$57,600', '$8,400', '60%'],
  ['People', '$59,000', '$36,220', '$4,000', '61%'],
];
type ApprovalItem = {
  id: string;
  name: string;
  owner: string;
  amount: string;
  status: string;
  reference: string;
  department: string;
  date: string;
};
type ComplianceState = {
  jurisdiction: string;
  reportingFramework: string;
  taxpayerClassification: string;
  statutoryCurrency: string;
  secondaryCurrency: string;
  recordLanguage: string;
  standardVatRate: number;
  fiscalYearStartMonth: number;
  recordRetentionYears: number;
  gdtFilingMethod: string;
  reviewedAt?: string;
};
const closingSeed = [
  'Bank reconciliation',
  'AR review',
  'AP review',
  'Expense review',
  'Missing-document review',
  'Outstanding advances',
  'Budget review',
  'Tax review',
  'Accrual review',
  'Management report',
];

export function ExtendedModuleContent({ kind }: { kind: Kind }) {
  if (kind === 'requests') return <Requests />;
  if (kind === 'budgets') return <Budgets />;
  if (kind === 'approvals') return <Approvals />;
  if (kind === 'closing') return <Closing />;
  if (kind === 'assistant') return <Assistant />;
  return <SettingsPanel />;
}

function Requests() {
  const [items, setItems] = useState(requests);
  const createRequest = () =>
    setItems((current) =>
      current.some((item) => item[0] === 'REQ-2026-0199')
        ? current
        : [
            [
              'REQ-2026-0199',
              'New expense request',
              'Operations',
              '$0',
              'Draft',
            ],
            ...current,
          ],
    );
  return (
    <div className="space-y-5">
      <Header
        crumb="Finance / Payment Requests"
        title="Payment requests"
        copy="Submit, review, authorize, pay, and close requests in one controlled workflow."
        action={<Button onClick={createRequest}>New request</Button>}
      />
      <Metrics
        values={[
          ['$26.7K', 'Pending value'],
          [String(items.length), 'Requests in queue'],
          ['96%', 'On-time processing'],
        ]}
      />
      <ListCard
        title="Request queue"
        description="Approval levels are selected from configured amount rules"
      >
        {items.map((r) => (
          <Row
            key={r[0]}
            title={r[1]}
            subtitle={`${r[0]} · ${r[2]}`}
            value={r[3]}
            status={r[4]}
          />
        ))}
      </ListCard>
    </div>
  );
}

function Budgets() {
  return (
    <div className="space-y-5">
      <Header
        crumb="Finance / Budgets"
        title="Budget control"
        copy="Monitor actual and committed spending before limits are exceeded."
        action={
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = '/settings';
            }}
          >
            Edit thresholds
          </Button>
        }
      />
      <Metrics
        values={[
          ['$365K', 'Monthly budget'],
          ['$248.2K', 'Actual spending'],
          ['$85.4K', 'Remaining'],
        ]}
      />
      <ListCard
        title="Department utilization"
        description="Actual and committed spend compared with August budget"
      >
        {budgetLines.map((r) => (
          <div
            key={r[0]}
            className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[1fr_120px_120px_120px_90px] md:items-center"
          >
            <div>
              <p className="text-sm font-medium">{r[0]}</p>
              <Progress
                value={Number(r[4].replace('%', ''))}
                className="mt-2 h-1.5"
              />
            </div>
            <Value label="Budget" value={r[1]} />
            <Value label="Actual" value={r[2]} />
            <Value label="Committed" value={r[3]} />
            <Badge
              variant="outline"
              className={
                r[4] === '87%'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }
            >
              {r[4]} used
            </Badge>
          </div>
        ))}
      </ListCard>
    </div>
  );
}

function Approvals() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/approvals', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          approvals?: ApprovalItem[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || 'Approvals could not be loaded.');
        return payload.approvals || [];
      })
      .then((approvals) => {
        if (active) setItems(approvals);
      })
      .catch((error: unknown) => {
        if (active)
          setNotice(
            error instanceof Error
              ? error.message
              : 'Approvals could not be loaded.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const approve = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setNotice('Saving approval…');
    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: id, action: 'approve' }),
      });
      const payload = (await response.json()) as {
        approval?: ApprovalItem;
        error?: string;
      };
      if (!response.ok || !payload.approval)
        throw new Error(payload.error || 'Approval could not be saved.');
      setItems((current) => current.filter((item) => item.id !== id));
      setNotice(`${id} approved. The decision was saved with an audit trail.`);
      window.dispatchEvent(new Event('ledgerflow-approvals-changed'));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Approval could not be saved.',
      );
    } finally {
      setBusyId('');
    }
  };
  const pendingValue = items.reduce(
    (sum, item) => sum + Number(item.amount.replace(/[^0-9.-]/g, '') || 0),
    0,
  );
  const valueLabel = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(pendingValue);
  return (
    <div className="space-y-5">
      <Header
        crumb="Workflow / Approvals"
        title="Approval center"
        copy="Review evidence, coding, and authority before finance processes payment."
      />
      {notice ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${/could not|required|not found|rejected/i.test(notice) ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          {notice}
        </div>
      ) : null}
      <Metrics
        values={[
          [loading ? '…' : String(items.length), 'Pending approvals'],
          [loading ? '…' : valueLabel, 'Value awaiting review'],
          ['Audited', 'Decision record'],
        ]}
      />
      <ListCard
        title="Items requiring your decision"
        description="Pending saved transactions are shown here automatically"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-3 border-b p-4 last:border-0 sm:flex-row sm:items-center"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-primary/8 text-primary">
              <ClipboardCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.id}
                {item.reference ? ` · ${item.reference}` : ''} · Submitted by{' '}
                {item.owner}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.department || 'No department'} · {item.date}
              </p>
            </div>
            <p className="font-mono text-sm font-semibold">{item.amount}</p>
            <Button
              size="sm"
              disabled={busyId === item.id}
              onClick={() => approve(item.id)}
            >
              {busyId === item.id ? 'Approving…' : 'Approve'}
            </Button>
          </div>
        ))}
        {!loading && items.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-600" />
              <p className="font-medium">No approvals waiting</p>
              <p className="mt-1 text-sm text-muted-foreground">
                New or edited transactions will appear here for review.
              </p>
            </div>
          </div>
        ) : null}
        {loading ? (
          <div className="grid min-h-48 place-items-center p-6 text-sm text-muted-foreground">
            Loading saved approvals…
          </div>
        ) : null}
      </ListCard>
    </div>
  );
}

function Closing() {
  const [done, setDone] = useState<string[]>(closingSeed.slice(0, 4));
  const progress = Math.round((done.length / closingSeed.length) * 100);
  const toggle = (name: string) =>
    setDone((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  return (
    <div className="space-y-5">
      <Header
        crumb="Workflow / Monthly Closing"
        title="August 2026 close"
        copy="Complete and evidence every control before the accounting period is locked."
        action={
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-700"
          >
            In progress
          </Badge>
        }
      />
      <Card>
        <CardContent className="p-5">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Closing progress</span>
            <span>
              {progress}% · {done.length}/{closingSeed.length} complete
            </span>
          </div>
          <Progress value={progress} className="mt-3" />
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {closingSeed.map((name) => {
          const checked = done.includes(name);
          return (
            <button
              key={name}
              onClick={() => toggle(name)}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-primary/40"
            >
              <span
                className={`grid size-8 place-items-center rounded-lg ${checked ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}
              >
                {checked ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <span className="size-3 rounded border" />
                )}
              </span>
              <span className="flex-1 text-sm font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">
                {checked ? 'Complete' : 'Open'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Assistant() {
  const [question, setQuestion] = useState(
    'Which customers have overdue invoices?',
  );
  const [answer, setAnswer] = useState('');
  const ask = () =>
    setAnswer(
      question.toLowerCase().includes('overdue')
        ? 'Two customers are overdue: Cedar & Stone owes $14,750 (41 days), and Aurora Hospitality owes $18,600 (3 days). Total overdue: $33,350.'
        : 'Based on the records available to your Finance Manager role, August revenue is $342,800, expenses are $248,200, and net profit is $94,600.',
    );
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Header
        crumb="Finance / AI Assistant"
        title="Finance assistant"
        copy="Ask questions only across records your current role is authorized to view."
      />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </span>
            <div>
              <CardTitle>Ask LedgerFlow</CardTitle>
              <CardDescription>
                Read-only analysis · no posting or approval authority
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-muted/50 p-4 text-sm">
            Try: “Which department is over budget?” or “What payments are due
            next week?”
          </div>
          {answer ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
              <div className="mb-2 flex items-center gap-2 font-semibold text-primary">
                <Sparkles className="size-4" /> Answer from authorized finance
                data
              </div>
              {answer}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Textarea
              aria-label="Ask the finance assistant"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-12 resize-none"
            />
            <Button
              aria-label="Send question"
              onClick={ask}
              className="self-end"
            >
              <Send />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<ComplianceState>({
    jurisdiction: 'Cambodia',
    reportingFramework: 'CIFRS for SMEs',
    taxpayerClassification: 'Unconfirmed',
    statutoryCurrency: 'KHR',
    secondaryCurrency: 'USD',
    recordLanguage: 'Khmer + English',
    standardVatRate: 10,
    fiscalYearStartMonth: 1,
    recordRetentionYears: 10,
    gdtFilingMethod: 'Online',
  });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch('/api/compliance-settings', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          settings?: ComplianceState;
          error?: string;
        };
        if (!response.ok || !payload.settings)
          throw new Error(
            payload.error || 'Compliance settings could not be loaded.',
          );
        setSettings(payload.settings);
      })
      .catch((error: unknown) =>
        setStatus(
          error instanceof Error
            ? error.message
            : 'Compliance settings could not be loaded.',
        ),
      );
  }, []);
  const save = async () => {
    setSaving(true);
    setStatus('Saving reviewed compliance profile…');
    try {
      const response = await fetch('/api/compliance-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as {
        settings?: ComplianceState;
        error?: string;
      };
      if (!response.ok || !payload.settings)
        throw new Error(
          payload.error || 'Compliance settings could not be saved.',
        );
      setSettings(payload.settings);
      setStatus('Cambodia compliance profile saved with an audit trail.');
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Compliance settings could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <Header
        crumb="Administration / Settings"
        title="Finance controls"
        copy="Configure accounting, tax, approval, and automation safeguards."
      />
      {status ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${/could not|must|valid|required/i.test(status) ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          {status}
        </div>
      ) : null}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Cambodia accounting and tax profile</CardTitle>
          <CardDescription>
            Statutory controls based on ACAR requirements and General Department
            of Taxation guidance. Confirm the entity classification with your
            Cambodian accountant or tax adviser.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium">
            Reporting framework
            <select
              value={settings.reportingFramework}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  reportingFramework: event.target.value,
                })
              }
              className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
            >
              <option>CIFRS</option>
              <option>CIFRS for SMEs</option>
              <option>CRFRF</option>
              <option>CFRS for NFPEs</option>
            </select>
          </label>
          <label className="text-xs font-medium">
            GDT taxpayer classification
            <select
              value={settings.taxpayerClassification}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  taxpayerClassification: event.target.value,
                })
              }
              className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
            >
              <option>Unconfirmed</option>
              <option>Small taxpayer</option>
              <option>Medium taxpayer</option>
              <option>Large taxpayer</option>
            </select>
          </label>
          <label className="text-xs font-medium">
            GDT filing method
            <select
              value={settings.gdtFilingMethod}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  gdtFilingMethod: event.target.value,
                })
              }
              className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
            >
              <option>Online</option>
              <option>Manual</option>
            </select>
          </label>
          <label className="text-xs font-medium">
            Statutory currency
            <Input value="KHR" disabled className="mt-2" />
          </label>
          <label className="text-xs font-medium">
            Secondary transaction currency
            <Input
              value={settings.secondaryCurrency}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  secondaryCurrency: event.target.value.toUpperCase(),
                })
              }
              className="mt-2"
            />
          </label>
          <label className="text-xs font-medium">
            Accounting record language
            <select
              value={settings.recordLanguage}
              onChange={(event) =>
                setSettings({ ...settings, recordLanguage: event.target.value })
              }
              className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
            >
              <option>Khmer</option>
              <option>Khmer + English</option>
            </select>
          </label>
          <label className="text-xs font-medium">
            Standard VAT rate (%)
            <Input value="10" disabled className="mt-2" />
          </label>
          <label className="text-xs font-medium">
            Fiscal year
            <Input value="January–December" disabled className="mt-2" />
          </label>
          <label className="text-xs font-medium">
            Record retention (years)
            <Input
              type="number"
              min="10"
              value={settings.recordRetentionYears}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  recordRetentionYears: Number(event.target.value),
                })
              }
              className="mt-2"
            />
          </label>
          <div className="rounded-xl border bg-muted/30 p-3 text-xs leading-5 sm:col-span-2 lg:col-span-3">
            <p className="font-semibold">Required controls</p>
            <p className="mt-1 text-muted-foreground">
              Every entry requires a valid voucher. Statutory reporting remains
              in Khmer and KHR, foreign-currency entries require a KHR
              equivalent, records are retained for at least 10 years, and tax
              calculations require finance review before filing.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <a
                className="font-medium text-primary hover:underline"
                href="https://www.acar.gov.kh/"
                target="_blank"
                rel="noreferrer"
              >
                ACAR guidance
              </a>
              <a
                className="font-medium text-primary hover:underline"
                href="https://www.tax.gov.kh/en/"
                target="_blank"
                rel="noreferrer"
              >
                GDT Cambodia
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Budget alerts</CardTitle>
            <CardDescription>
              Notify responsible managers at these utilization levels.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Warning threshold (%)" value="80" />
            <Field label="Critical threshold (%)" value="95" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Approval reminder</CardTitle>
            <CardDescription>
              Escalate requests that remain pending beyond policy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="First reminder (hours)" value="24" />
            <Field label="Escalation (hours)" value="48" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ShieldCheck className="size-8 text-emerald-600" />
          <div className="flex-1">
            <p className="font-medium">Accounting safeguards remain enabled</p>
            <p className="text-xs text-muted-foreground">
              Cambodia profile, period locks, audit logs, debit/credit
              validation, and reversal-only posted entries.
            </p>
          </div>
          <Button onClick={save} disabled={saving}>
            <Save /> {saving ? 'Saving…' : 'Save reviewed settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
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
function Metrics({ values }: { values: string[][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {values.map(([value, label]) => (
        <Card key={label} className="gap-0">
          <CardContent className="p-5">
            <p className="metric-value text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
function ListCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}
function Row({
  title,
  subtitle,
  value,
  status,
}: {
  title: string;
  subtitle: string;
  value: string;
  status: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b p-4 last:border-0 sm:flex-row sm:items-center">
      <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-600">
        <DollarSign className="size-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <p className="font-mono text-sm font-semibold">{value}</p>
      <Badge variant="outline">{status}</Badge>
    </div>
  );
}
function Value({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-xs font-medium">
      {label}
      <Input defaultValue={value} inputMode="numeric" className="mt-2" />
    </label>
  );
}
