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
import { useLanguage } from '@/lib/i18n';
import { departmentLabels, gdtFilingLabels, recordLanguageLabels, statusLabels, taxpayerClassLabels, translateEnum, type Lang } from '@/lib/translations';

type Kind =
  | 'requests'
  | 'budgets'
  | 'approvals'
  | 'closing'
  | 'assistant'
  | 'accounting'
  | 'settings';

type PaymentRequestItem = { id: string; title: string; category: string; amount: number; currency: string; status: string };
type BudgetLine = { department: string; monthlyLimit: number; actual: number; currency: string; utilization: number };
type AccountLine = { category: string; type: string; total: number; count: number };
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
export function ExtendedModuleContent({ kind }: { kind: Kind }) {
  if (kind === 'requests') return <Requests />;
  if (kind === 'budgets') return <Budgets />;
  if (kind === 'approvals') return <Approvals />;
  if (kind === 'closing') return <Closing />;
  if (kind === 'assistant') return <Assistant />;
  if (kind === 'accounting') return <Accounting />;
  return <SettingsPanel />;
}

function money(value: number, compact = false) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 2 }).format(value);
}

function Requests() {
  const { t } = useLanguage();
  const [items, setItems] = useState<PaymentRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/payment-requests', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { requests?: PaymentRequestItem[]; error?: string };
        if (!response.ok) throw new Error(payload.error || t('req.loadFailed'));
        setItems(payload.requests || []);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t('req.loadFailed')))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const createRequest = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New expense request', category: 'Operations', amount: 0.01 }),
      });
      const payload = (await response.json()) as { requests?: PaymentRequestItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || t('req.createFailed'));
      setItems(payload.requests || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('req.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const pendingValue = items.filter((item) => item.status !== 'Approved').reduce((sum, item) => sum + item.amount, 0);
  const onTime = items.length ? Math.round((items.filter((item) => item.status === 'Approved').length / items.length) * 100) : 100;

  return (
    <div className="space-y-5">
      <Header
        crumb={`${t('tx.breadcrumbFinance')} / ${t('nav.requests')}`}
        title={t('req.title')}
        copy={t('req.copy')}
        action={<Button onClick={createRequest} disabled={creating}>{creating ? t('req.creating') : t('req.newRequest')}</Button>}
      />
      {notice ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{notice}</div> : null}
      <Metrics
        values={[
          [loading ? '…' : money(pendingValue, true), t('req.pendingValue')],
          [loading ? '…' : String(items.length), t('req.requestsInQueue')],
          [loading ? '…' : `${onTime}%`, t('req.approvedSoFar')],
        ]}
      />
      <ListCard
        title={t('req.queueTitle')}
        description={t('req.queueDesc')}
      >
        {items.map((item) => (
          <Row
            key={item.id}
            title={item.title}
            subtitle={`${item.id} · ${item.category}`}
            value={money(item.amount)}
            status={item.status}
          />
        ))}
        {!loading && items.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{t('req.noneYet')}</div> : null}
      </ListCard>
    </div>
  );
}

function Budgets() {
  const { t } = useLanguage();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [department, setDepartment] = useState('');
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/budgets', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { budgets?: BudgetLine[]; error?: string };
        if (!response.ok) throw new Error(payload.error || t('budgets2.loadFailed'));
        setLines(payload.budgets || []);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t('budgets2.loadFailed')))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const addBudget = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, monthlyLimit: Number(limit) }),
      });
      const payload = (await response.json()) as { budgets?: BudgetLine[]; error?: string };
      if (!response.ok) throw new Error(payload.error || t('budgets2.saveFailed'));
      setLines(payload.budgets || []);
      setDepartment('');
      setLimit('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('budgets2.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const totalBudget = lines.reduce((sum, line) => sum + line.monthlyLimit, 0);
  const totalActual = lines.reduce((sum, line) => sum + line.actual, 0);

  return (
    <div className="space-y-5">
      <Header
        crumb={`${t('tx.breadcrumbFinance')} / ${t('nav.budgets')}`}
        title={t('budget.title')}
        copy={t('budgets2.copy')}
      />
      {notice ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{notice}</div> : null}
      <Metrics
        values={[
          [loading ? '…' : money(totalBudget, true), t('budgets2.monthlyBudget')],
          [loading ? '…' : money(totalActual, true), t('budgets2.actualSpending')],
          [loading ? '…' : money(Math.max(0, totalBudget - totalActual), true), t('budget.remaining')],
        ]}
      />
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-medium">{t('tx.department')}<Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={t('budgets2.departmentPlaceholder')} className="mt-2" /></label>
          <label className="w-40 text-xs font-medium">{t('budgets2.monthlyLimitUsd')}<Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" placeholder="0" className="mt-2" /></label>
          <Button onClick={addBudget} disabled={saving || !department || !limit}>{saving ? t('tx.saving') : t('budgets2.setBudget')}</Button>
        </CardContent>
      </Card>
      <ListCard
        title={t('budgets2.utilizationTitle')}
        description={t('budgets2.utilizationDesc')}
      >
        {lines.map((line) => (
          <div
            key={line.department}
            className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[1fr_120px_120px_120px_90px] md:items-center"
          >
            <div>
              <p className="text-sm font-medium">{line.department}</p>
              <Progress value={Math.min(100, line.utilization)} className="mt-2 h-1.5" />
            </div>
            <Value label={t('nav.budgets')} value={money(line.monthlyLimit)} />
            <Value label={t('budget.actual')} value={money(line.actual)} />
            <Value label={t('budget.committed')} value={money(0)} />
            <Badge
              variant="outline"
              className={
                line.utilization >= 95
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : line.utilization >= 80
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }
            >
              {line.utilization}% {t('budget.used')}
            </Badge>
          </div>
        ))}
        {!loading && lines.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{t('budgets2.noneYet')}</div> : null}
      </ListCard>
    </div>
  );
}

function Accounting() {
  const { t } = useLanguage();
  const [lines, setLines] = useState<AccountLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/transactions', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { transactions?: { type: string; category: string; amount: string }[]; error?: string };
        if (!response.ok) throw new Error(payload.error || t('acct.loadFailed'));
        const grouped = new Map<string, AccountLine>();
        for (const transaction of payload.transactions || []) {
          const key = `${transaction.type}::${transaction.category}`;
          const existing = grouped.get(key) || { category: transaction.category, type: transaction.type, total: 0, count: 0 };
          existing.total += Number(transaction.amount) || 0;
          existing.count += 1;
          grouped.set(key, existing);
        }
        setLines([...grouped.values()].sort((a, b) => b.total - a.total));
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t('acct.loadFailed')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalIncome = lines.filter((line) => line.type === 'Income').reduce((sum, line) => sum + line.total, 0);
  const totalExpense = lines.filter((line) => line.type === 'Expense').reduce((sum, line) => sum + line.total, 0);

  return (
    <div className="space-y-5">
      <Header
        crumb={`${t('tx.breadcrumbFinance')} / ${t('nav.accounting')}`}
        title={t('acct.title')}
        copy={t('acct.copy')}
      />
      {notice ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{notice}</div> : null}
      <Metrics
        values={[
          [loading ? '…' : money(totalIncome, true), t('acct.totalIncome')],
          [loading ? '…' : money(totalExpense, true), t('acct.totalExpense')],
          [loading ? '…' : money(totalIncome - totalExpense, true), t('acct.netPosition')],
        ]}
      />
      <ListCard
        title={t('acct.accountsByCategory')}
        description={t('acct.accountsByCategoryDesc')}
      >
        {lines.map((line) => (
          <div
            key={`${line.type}-${line.category}`}
            className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[1fr_120px_120px_120px] md:items-center"
          >
            <div>
              <p className="text-sm font-medium">{line.category}</p>
              <p className="text-xs text-muted-foreground">{line.type}</p>
            </div>
            <Value label={t('acct.total')} value={money(line.total)} />
            <Value label={t('acct.entries')} value={String(line.count)} />
            <Badge variant="outline" className={line.type === 'Income' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}>
              {line.type}
            </Badge>
          </div>
        ))}
        {!loading && lines.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{t('acct.noneYet')}</div> : null}
      </ListCard>
    </div>
  );
}

function Approvals() {
  const { t, lang } = useLanguage();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/approvals', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          approvals?: ApprovalItem[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || t('appr.loadFailed'));
        return payload.approvals || [];
      })
      .then((approvals) => {
        if (active) setItems(approvals);
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice(error instanceof Error ? error.message : t('appr.loadFailed'));
          setNoticeIsError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const approve = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setNotice(t('appr.savingApproval'));
    setNoticeIsError(false);
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
        throw new Error(payload.error || t('appr.saveFailed'));
      setItems((current) => current.filter((item) => item.id !== id));
      setNotice(t('appr.approvedNotice', { id }));
      setNoticeIsError(false);
      window.dispatchEvent(new Event('ledgerflow-approvals-changed'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('appr.saveFailed'));
      setNoticeIsError(true);
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
        crumb={`${t('section.workflow')} / ${t('nav.approvals')}`}
        title={t('appr.title')}
        copy={t('appr.copy')}
      />
      {notice ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${noticeIsError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          {notice}
        </div>
      ) : null}
      <Metrics
        values={[
          [loading ? '…' : String(items.length), t('appr.pendingApprovals')],
          [loading ? '…' : valueLabel, t('appr.valueAwaitingReview')],
          [t('appr.audited'), t('appr.decisionRecord')],
        ]}
      />
      <ListCard
        title={t('appr.itemsTitle')}
        description={t('appr.itemsDesc')}
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
                {item.reference ? ` · ${item.reference}` : ''} · {t('appr.submittedBy')}{' '}
                {item.owner}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.department ? translateEnum(departmentLabels, lang, item.department) : t('appr.noDepartment')} · {item.date}
              </p>
            </div>
            <p className="font-mono text-sm font-semibold">{item.amount}</p>
            <Button
              size="sm"
              disabled={busyId === item.id}
              onClick={() => approve(item.id)}
            >
              {busyId === item.id ? t('appr.approving') : t('appr.approve')}
            </Button>
          </div>
        ))}
        {!loading && items.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-600" />
              <p className="font-medium">{t('appr.noneWaiting')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('appr.noneWaitingCopy')}
              </p>
            </div>
          </div>
        ) : null}
        {loading ? (
          <div className="grid min-h-48 place-items-center p-6 text-sm text-muted-foreground">
            {t('appr.loadingApprovals')}
          </div>
        ) : null}
      </ListCard>
    </div>
  );
}

function currentPeriodLabel(lang: Lang) {
  return new Date().toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-US', { month: 'long', year: 'numeric' });
}

function Closing() {
  const { t, lang } = useLanguage();
  const [tasks, setTasks] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/closing', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { tasks?: string[]; status?: Record<string, boolean>; error?: string };
        if (!response.ok) throw new Error(payload.error || t('close.loadFailed'));
        setTasks(payload.tasks || []);
        setStatus(payload.status || {});
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t('close.loadFailed')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneCount = tasks.filter((name) => status[name]).length;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  const toggle = async (name: string) => {
    setBusy(name);
    const next = !status[name];
    try {
      const response = await fetch('/api/closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskName: name, completed: next }),
      });
      const payload = (await response.json()) as { status?: Record<string, boolean>; error?: string };
      if (!response.ok) throw new Error(payload.error || t('close.saveFailed'));
      setStatus(payload.status || {});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('close.saveFailed'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-5">
      <Header
        crumb={`${t('section.workflow')} / ${t('nav.closing')}`}
        title={t('close.periodClose', { period: currentPeriodLabel(lang) })}
        copy={t('close.copy')}
        action={
          <Badge
            variant="outline"
            className={progress === 100 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}
          >
            {progress === 100 ? t('close.complete') : t('tasks.inProgress')}
          </Badge>
        }
      />
      {notice ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{notice}</div> : null}
      <Card>
        <CardContent className="p-5">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{t('close.progressLabel')}</span>
            <span>{loading ? '…' : t('close.progressDetail', { percent: progress, done: doneCount, total: tasks.length })}</span>
          </div>
          <Progress value={progress} className="mt-3" />
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {tasks.map((name) => {
          const checked = Boolean(status[name]);
          return (
            <button
              key={name}
              disabled={busy === name}
              onClick={() => toggle(name)}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 disabled:opacity-60"
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
                {checked ? t('close.complete') : t('tasks.filterOpen')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type AssistantTransaction = { type: string; party: string; department: string; amount: string; status: string; dueDate?: string; date: string };

function amountValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function assistantMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
function parseAssistantDate(value?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (match) {
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[2]);
    if (month >= 0) return new Date(Number(match[3]), month, Number(match[1]));
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function answerFromData(question: string, rows: AssistantTransaction[], budgets: BudgetLine[], t: (key: string, vars?: Record<string, string | number>) => string): string {
  const q = question.toLowerCase();
  const today = new Date(new Date().toDateString());

  if (q.includes('overdue') && (q.includes('customer') || q.includes('invoice') || q.includes('receivable'))) {
    const overdue = rows.filter((row) => row.type.toLowerCase() === 'income' && row.status.toLowerCase() !== 'paid' && (() => { const due = parseAssistantDate(row.dueDate); return due ? due.getTime() < today.getTime() : row.status.toLowerCase() === 'overdue'; })());
    if (overdue.length === 0) return t('asst.noOverdueInvoices');
    const total = overdue.reduce((sum, row) => sum + amountValue(row.amount), 0);
    const list = overdue.slice(0, 5).map((row) => t('asst.owesTemplate', { party: row.party || t('asst.unknown'), amount: assistantMoney(amountValue(row.amount)) })).join('; ');
    return t('asst.overdueSummary', { count: overdue.length, plural: overdue.length === 1 ? '' : 's', list, total: assistantMoney(total) });
  }

  if (q.includes('over budget') || (q.includes('budget') && q.includes('department'))) {
    const over = budgets.filter((budget) => budget.utilization >= 100);
    if (budgets.length === 0) return t('asst.noBudgetsConfigured');
    if (over.length === 0) {
      const top = budgets.slice().sort((a, b) => b.utilization - a.utilization)[0];
      return t('asst.noneOverBudget', { detail: top ? t('asst.atPercentOfBudget', { department: top.department, percent: top.utilization }) : t('asst.naDetail') });
    }
    return `${over.map((budget) => t('asst.overBudgetItem', { department: budget.department, percent: budget.utilization, limit: assistantMoney(budget.monthlyLimit) })).join('; ')}.`;
  }

  if (q.includes('payment') && (q.includes('due') || q.includes('week'))) {
    const dueSoon = rows.filter((row) => row.type.toLowerCase() === 'expense' && row.status.toLowerCase() !== 'paid' && (() => { const due = parseAssistantDate(row.dueDate); if (!due) return false; const days = (due.getTime() - today.getTime()) / 86400000; return days >= 0 && days <= 7; })());
    if (dueSoon.length === 0) return t('asst.noSupplierPaymentsDue');
    const total = dueSoon.reduce((sum, row) => sum + amountValue(row.amount), 0);
    const list = dueSoon.slice(0, 5).map((row) => `${row.party || t('asst.unknown')} (${assistantMoney(amountValue(row.amount))})`).join('; ');
    return t('asst.paymentsDueSummary', { count: dueSoon.length, plural: dueSoon.length === 1 ? '' : 's', total: assistantMoney(total), list });
  }

  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthRows = rows.filter((row) => {
    const date = parseAssistantDate(row.date);
    return date && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === currentMonth;
  });
  const revenue = monthRows.filter((row) => row.type.toLowerCase() === 'income').reduce((sum, row) => sum + amountValue(row.amount), 0);
  const expenses = monthRows.filter((row) => row.type.toLowerCase() === 'expense').reduce((sum, row) => sum + amountValue(row.amount), 0);
  return t('asst.monthlySummary', { revenue: assistantMoney(revenue), expenses: assistantMoney(expenses), net: assistantMoney(revenue - expenses) });
}

function Assistant() {
  const { t } = useLanguage();
  const [question, setQuestion] = useState(
    'Which customers have overdue invoices?',
  );
  const [answer, setAnswer] = useState('');
  const [rows, setRows] = useState<AssistantTransaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [source, setSource] = useState<'ai' | 'rules' | ''>('');

  useEffect(() => {
    Promise.all([
      fetch('/api/transactions', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/budgets', { cache: 'no-store' }).then((response) => response.json()),
    ])
      .then(([txPayload, budgetPayload]) => {
        setRows(txPayload.transactions || []);
        setBudgets(budgetPayload.budgets || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const ask = async () => {
    setAsking(true);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const payload = (await response.json()) as { answer?: string; error?: string };
      if (response.ok && payload.answer) {
        setAnswer(payload.answer);
        setSource('ai');
      } else {
        setAnswer(answerFromData(question, rows, budgets, t));
        setSource('rules');
      }
    } catch {
      setAnswer(answerFromData(question, rows, budgets, t));
      setSource('rules');
    } finally {
      setAsking(false);
    }
  };
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Header
        crumb={`${t('tx.breadcrumbFinance')} / ${t('nav.assistant')}`}
        title={t('asst.title')}
        copy={t('asst.copy')}
      />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </span>
            <div>
              <CardTitle>{t('asst.askLedgerFlow')}</CardTitle>
              <CardDescription>
                {t('asst.readOnly')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-muted/50 p-4 text-sm">
            {t('asst.tryPrompt')}
          </div>
          {answer ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
              <div className="mb-2 flex items-center gap-2 font-semibold text-primary">
                <Sparkles className="size-4" /> {source === 'ai' ? t('asst.aiAnswer') : t('asst.rulesAnswer')}
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
              disabled={loading || asking}
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
  const { t, lang } = useLanguage();
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
  const [statusIsError, setStatusIsError] = useState(false);
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
            payload.error || t('settings.loadFailed'),
          );
        setSettings(payload.settings);
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : t('settings.loadFailed'));
        setStatusIsError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = async () => {
    setSaving(true);
    setStatus(t('settings.savingProfile'));
    setStatusIsError(false);
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
          payload.error || t('settings.saveFailed'),
        );
      setSettings(payload.settings);
      setStatus(t('settings.savedProfile'));
      setStatusIsError(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('settings.saveFailed'));
      setStatusIsError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <Header
        crumb={`${t('section.administration')} / ${t('nav.settings')}`}
        title={t('settings.title')}
        copy={t('settings.copy')}
      />
      {status ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${statusIsError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          {status}
        </div>
      ) : null}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>{t('settings.profileTitle')}</CardTitle>
          <CardDescription>
            {t('settings.profileDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium">
            {t('settings.reportingFramework')}
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
            {t('settings.gdtClassification')}
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
              {Object.keys(taxpayerClassLabels.en).map((value) => (
                <option key={value} value={value}>{translateEnum(taxpayerClassLabels, lang, value)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            {t('settings.gdtFilingMethod')}
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
              {Object.keys(gdtFilingLabels.en).map((value) => (
                <option key={value} value={value}>{translateEnum(gdtFilingLabels, lang, value)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            {t('settings.statutoryCurrency')}
            <Input value="KHR" disabled className="mt-2" />
          </label>
          <label className="text-xs font-medium">
            {t('settings.secondaryCurrency')}
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
            {t('settings.recordLanguage')}
            <select
              value={settings.recordLanguage}
              onChange={(event) =>
                setSettings({ ...settings, recordLanguage: event.target.value })
              }
              className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
            >
              {Object.keys(recordLanguageLabels.en).map((value) => (
                <option key={value} value={value}>{translateEnum(recordLanguageLabels, lang, value)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            {t('settings.vatRate')}
            <Input value="10" disabled className="mt-2" />
          </label>
          <label className="text-xs font-medium">
            {t('settings.fiscalYear')}
            <Input value={t('settings.fiscalYearValue')} disabled className="mt-2" />
          </label>
          <label className="text-xs font-medium">
            {t('settings.retention')}
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
            <p className="font-semibold">{t('settings.requiredControls')}</p>
            <p className="mt-1 text-muted-foreground">
              {t('settings.requiredControlsDesc')}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <a
                className="font-medium text-primary hover:underline"
                href="https://www.acar.gov.kh/"
                target="_blank"
                rel="noreferrer"
              >
                {t('settings.acarGuidance')}
              </a>
              <a
                className="font-medium text-primary hover:underline"
                href="https://www.tax.gov.kh/en/"
                target="_blank"
                rel="noreferrer"
              >
                {t('settings.gdtCambodia')}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.budgetAlerts')}</CardTitle>
            <CardDescription>
              {t('settings.budgetAlertsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('settings.warningThreshold')} value="80" />
            <Field label={t('settings.criticalThreshold')} value="95" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.approvalReminder')}</CardTitle>
            <CardDescription>
              {t('settings.approvalReminderDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('settings.firstReminder')} value="24" />
            <Field label={t('settings.escalation')} value="48" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ShieldCheck className="size-8 text-emerald-600" />
          <div className="flex-1">
            <p className="font-medium">{t('settings.safeguardsEnabled')}</p>
            <p className="text-xs text-muted-foreground">
              {t('settings.safeguardsDesc')}
            </p>
          </div>
          <Button onClick={save} disabled={saving}>
            <Save /> {saving ? t('tx.saving') : t('settings.saveReviewed')}
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
  const { lang } = useLanguage();
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
      <Badge variant="outline">{translateEnum(statusLabels, lang, status)}</Badge>
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
