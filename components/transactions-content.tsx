'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  FileCheck2,
  Filter,
  Pencil,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DocumentScanner,
  type ScannedTransaction,
} from '@/components/document-scanner';
import { useLanguage } from '@/lib/i18n';
import { departmentLabels, statusLabels, taxTreatmentLabels, translateEnum, txTypeLabels } from '@/lib/translations';

type TransactionRow = {
  id: string;
  date: string;
  type: string;
  reference: string;
  party: string;
  department: string;
  category: string;
  amount: string;
  status: string;
  approval: string;
  owner: string;
  dueDate?: string;
  currency?: string;
  subtotal?: string;
  tax?: string;
  description?: string;
  paymentMethod?: string;
  purchaseOrder?: string;
  documentType?: string;
  taxTreatment?: string;
  exchangeRate?: string;
};
type TransactionDraft = Omit<ScannedTransaction, 'confidence' | 'warnings'> & {
  department: string;
  taxTreatment: string;
  exchangeRate: string;
};

const blankDraft = (type: 'All' | 'Income' | 'Expense'): TransactionDraft => ({
  type: type === 'All' ? 'Expense' : type,
  documentType: 'Manual entry',
  date: todayInputDate(),
  dueDate: '',
  reference: '',
  party: '',
  description: '',
  department: 'Operations',
  category: '',
  currency: 'KHR',
  subtotal: '',
  tax: '',
  amount: '',
  paymentMethod: '',
  purchaseOrder: '',
  taxTreatment: 'Standard VAT 10%',
  exchangeRate: '1',
});

const initialRows: TransactionRow[] = [];

const badgeStyles: Record<string, string> = {
  Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Approved: 'border-sky-200 bg-sky-50 text-sky-700',
  Pending: 'border-amber-200 bg-amber-50 text-amber-700',
  Overdue: 'border-red-200 bg-red-50 text-red-700',
  'Missing Document': 'border-orange-200 bg-orange-50 text-orange-700',
};

export function TransactionsContent({
  type = 'All',
}: {
  type?: 'All' | 'Income' | 'Expense';
}) {
  const { t, lang } = useLanguage();
  const [records, setRecords] = useState<TransactionRow[]>(initialRows);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('search') || ''
      : '',
  );
  const [status, setStatus] = useState('All statuses');
  const [dialogOpen, setDialogOpen] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('new') === '1',
  );
  const [scannerMode, setScannerMode] = useState<'upload' | 'camera' | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => currentMonthRange().from);
  const [dateTo, setDateTo] = useState(() => currentMonthRange().to);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('All departments');
  const [draft, setDraft] = useState<TransactionDraft>(() => blankDraft(type));
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const showNotice = (message: string, isError: boolean) => {
    setNotice(message);
    setNoticeIsError(isError);
  };

  const typeRows = useMemo(
    () =>
      type === 'All' ? records : records.filter((row) => row.type === type),
    [records, type],
  );
  const filtered = useMemo(
    () =>
      typeRows.filter(
        (row) =>
          `${row.id} ${row.reference} ${row.party} ${row.category}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (status === 'All statuses' || row.status === status) &&
          (departmentFilter === 'All departments' ||
            row.department === departmentFilter) &&
          isWithinDateRange(row.date, dateFrom, dateTo),
      ),
    [typeRows, query, status, departmentFilter, dateFrom, dateTo],
  );
  const title =
    type === 'Income'
      ? t('tx.titleIncome')
      : type === 'Expense'
        ? t('tx.titleExpense')
        : t('tx.titleAll');
  const copy =
    type === 'Income'
      ? t('tx.copyIncome')
      : type === 'Expense'
        ? t('tx.copyExpense')
        : t('tx.copyAll');
  const scopeMismatch =
    type !== 'All' && typeRows.length === 0 && records.length > 0;
  const emptyTitle =
    records.length === 0
      ? t('tx.emptyNoneTitle')
      : scopeMismatch
        ? t('tx.emptyScopeMismatchTitle', { count: records.length, plural: records.length === 1 ? '' : 's', type: translateEnum(txTypeLabels, lang, type).toLowerCase() })
        : t('tx.emptyNoMatchTitle');
  const emptyCopy =
    records.length === 0
      ? t('tx.emptyNoneCopy')
      : scopeMismatch
        ? t('tx.emptyScopeMismatchCopy')
        : t('tx.emptyNoMatchCopy');

  useEffect(() => {
    let active = true;
    fetch('/api/transactions', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          transactions?: TransactionRow[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || t('tx.noticeLoadFailed'));
        return payload.transactions || [];
      })
      .then((rows) => {
        if (!active) return;
        setRecords(rows);
        const firstVisible =
          type === 'All' ? rows[0] : rows.find((row) => row.type === type);
        setSelected(firstVisible || null);
      })
      .catch((loadError) => {
        if (active)
          showNotice(
            loadError instanceof Error
              ? loadError.message
              : t('tx.noticeLoadFailed'),
            true,
          );
      })
      .finally(() => {
        if (active) setLoadingRecords(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const openNewTransaction = () => {
    setEditingId(null);
    setDraft(blankDraft(type));
    setNotice('');
    setDialogOpen(true);
  };

  const openEditTransaction = (record: TransactionRow) => {
    setEditingId(record.id);
    setDraft({
      type: record.type === 'Income' ? 'Income' : 'Expense',
      documentType: record.documentType || 'Financial document',
      date: toInputDate(record.date),
      dueDate: toInputDate(record.dueDate || ''),
      reference: record.reference,
      party: record.party,
      description: record.description || '',
      department: record.department,
      category: record.category,
      currency: record.currency || 'USD',
      subtotal: record.subtotal || '',
      tax: record.tax || '',
      amount: record.amount.replace(/[^0-9.-]/g, ''),
      paymentMethod: record.paymentMethod || '',
      purchaseOrder: record.purchaseOrder || '',
      taxTreatment: record.taxTreatment || 'Standard VAT 10%',
      exchangeRate:
        record.exchangeRate || (record.currency === 'KHR' ? '1' : ''),
    });
    setNotice('');
    setDialogOpen(true);
  };

  const saveTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const numericAmount = Number(draft.amount);
    const numericExchangeRate = Number(draft.exchangeRate);
    if (
      !draft.party.trim() ||
      !draft.reference.trim() ||
      !draft.date.trim() ||
      !draft.description.trim() ||
      !draft.category.trim() ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !Number.isFinite(numericExchangeRate) ||
      numericExchangeRate <= 0
    ) {
      showNotice(t('tx.noticeValidation'), true);
      return;
    }
    const currency = draft.currency || 'USD';
    const existing = editingId
      ? records.find((row) => row.id === editingId)
      : undefined;
    const record: TransactionRow = {
      id:
        existing?.id ||
        `TRX-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      date: draft.date,
      type: draft.type,
      reference: draft.reference.trim(),
      party: draft.party.trim(),
      department: draft.department,
      category: draft.category.trim(),
      amount: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).format(numericAmount),
      status: 'Pending',
      approval: 'Finance review',
      owner: existing?.owner || 'Jordan Lee',
      dueDate: draft.dueDate,
      currency,
      subtotal: draft.subtotal,
      tax: draft.tax,
      description: draft.description,
      paymentMethod: draft.paymentMethod,
      purchaseOrder: draft.purchaseOrder,
      documentType: draft.documentType,
      taxTreatment: draft.taxTreatment,
      exchangeRate: draft.currency === 'KHR' ? '1' : draft.exchangeRate,
    };
    setSaving(true);
    showNotice(t('tx.noticeSaving'), false);
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      const payload = (await response.json()) as {
        transaction?: TransactionRow;
        error?: string;
      };
      if (!response.ok || !payload.transaction)
        throw new Error(payload.error || t('tx.noticeSaveFailed'));
      const saved = payload.transaction;
      setRecords((current) =>
        existing
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [saved, ...current],
      );
      setSelected(saved);
      setDialogOpen(false);
      showNotice(
        existing
          ? t('tx.noticeUpdated', { id: saved.id })
          : t('tx.noticeSaved', { id: saved.id }),
        false,
      );
      setEditingId(null);
      setDraft(blankDraft(type));
    } catch (saveError) {
      showNotice(
        saveError instanceof Error
          ? saveError.message
          : t('tx.noticeSaveFailed'),
        true,
      );
    } finally {
      setSaving(false);
    }
  };

  const useScannedData = (scanned: ScannedTransaction) => {
    const { confidence: _confidence, warnings: _warnings, ...fields } = scanned;
    setEditingId(null);
    setDraft({
      ...fields,
      type: type === 'All' ? fields.type : type,
      date: toInputDate(fields.date) || todayInputDate(),
      dueDate: toInputDate(fields.dueDate),
      department: suggestDepartment(fields.category, fields.description),
      taxTreatment:
        Number(fields.tax || 0) > 0 ? 'Standard VAT 10%' : 'Review required',
      exchangeRate: fields.currency === 'KHR' ? '1' : '',
    });
    setScannerMode(null);
    showNotice(t('tx.noticeScanApplied'), false);
    setDialogOpen(true);
  };

  const resetFilters = () => {
    const range = currentMonthRange();
    setQuery('');
    setStatus('All statuses');
    setDepartmentFilter('All departments');
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const updateSubtotal = (value: string) => {
    const previousCalculated = sumDraft(draft.subtotal, draft.tax);
    setDraft({
      ...draft,
      subtotal: value,
      amount:
        !draft.amount || draft.amount === previousCalculated
          ? sumDraft(value, draft.tax)
          : draft.amount,
    });
  };

  const updateTax = (value: string) => {
    const previousCalculated = sumDraft(draft.subtotal, draft.tax);
    setDraft({
      ...draft,
      tax: value,
      amount:
        !draft.amount || draft.amount === previousCalculated
          ? sumDraft(draft.subtotal, value)
          : draft.amount,
    });
  };

  const updateTaxTreatment = (value: string) => {
    const calculatedTax =
      value === 'Standard VAT 10%' && Number(draft.subtotal) > 0
        ? (Number(draft.subtotal) * 0.1).toFixed(2)
        : value === 'Zero-rated 0%' ||
            value === 'Exempt' ||
            value === 'Non-taxable'
          ? '0.00'
          : draft.tax;
    setDraft({
      ...draft,
      taxTreatment: value,
      tax: calculatedTax,
      amount: sumDraft(draft.subtotal, calculatedTax) || draft.amount,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {t('tx.breadcrumbFinance')} / {translateEnum(txTypeLabels, lang, type)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/transactions/export"
            download
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium shadow-xs transition-colors hover:bg-muted"
          >
            <Download className="size-4" /> {t('tx.export')}
          </a>
          <Button
            variant="outline"
            className="bg-card"
            onClick={() => setScannerMode('upload')}
            title={t('tx.scanDocumentTitle')}
          >
            <FileCheck2 /> {t('tx.scanDocument')}
          </Button>
          <Button
            variant="outline"
            className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            onClick={() => setScannerMode('camera')}
            title={t('tx.ocrImportTitle')}
          >
            <ScanLine /> {t('tx.ocrImport')}
          </Button>
          <Button onClick={openNewTransaction}>
            <Plus /> {type === 'All' ? t('tx.newTransaction') : type === 'Income' ? t('tx.newIncome') : t('tx.newExpense')}
          </Button>
        </div>
      </div>
      {notice ? (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${noticeIsError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          <CheckCircle2 className="size-4" />
          {notice}
        </div>
      ) : null}
      {scannerMode ? (
        <DocumentScanner
          mode={scannerMode}
          onClose={() => setScannerMode(null)}
          onApply={useScannedData}
        />
      ) : null}

      <Card className="gap-0 shadow-[0_1px_2px_rgb(15_23_42/3%)]">
        <CardContent className="p-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('tx.searchPlaceholder')}
                className="h-9 pl-8"
              />
            </div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-9 rounded-lg border bg-card px-3 text-sm outline-none"
            >
              {Object.keys(statusLabels.en).map((value) => (
                <option key={value} value={value}>{translateEnum(statusLabels, lang, value)}</option>
              ))}
            </select>
            <Button
              variant="outline"
              className="h-9"
              onClick={() => setShowDatePicker((current) => !current)}
              aria-expanded={showDatePicker}
            >
              <CalendarDays />{' '}
              {dateFrom || dateTo
                ? `${formatPickerDate(dateFrom, lang) || t('tx.start')} – ${formatPickerDate(dateTo, lang) || t('tx.today')}`
                : t('tx.allDates')}
            </Button>
            <Button
              variant="outline"
              className="h-9"
              onClick={() => setShowAdvanced((current) => !current)}
              aria-expanded={showAdvanced}
            >
              <Filter /> {showAdvanced ? t('tx.hideFilters') : t('tx.moreFilters')}
            </Button>
          </div>
          {showDatePicker ? (
            <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-end">
              <label className="text-xs font-medium">
                {t('tx.quickYear')}
                <select
                  value={
                    dateFrom.endsWith('-01-01') &&
                    dateTo === `${dateFrom.slice(0, 4)}-12-31`
                      ? dateFrom.slice(0, 4)
                      : ''
                  }
                  onChange={(event) => {
                    const year = event.target.value;
                    if (year) {
                      setDateFrom(`${year}-01-01`);
                      setDateTo(`${year}-12-31`);
                    }
                  }}
                  className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                >
                  <option value="">{t('tx.custom')}</option>
                  <option>2026</option>
                  <option>2027</option>
                  <option>2028</option>
                  <option>2029</option>
                  <option>2030</option>
                </select>
              </label>
              <label className="text-xs font-medium">
                {t('tx.from')}
                <Input
                  type="date"
                  value={dateFrom}
                  min="2020-01-01"
                  max={dateTo || '2030-12-31'}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="mt-2"
                />
              </label>
              <label className="text-xs font-medium">
                {t('tx.to')}
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom || '2020-01-01'}
                  max="2030-12-31"
                  onChange={(event) => setDateTo(event.target.value)}
                  className="mt-2"
                />
              </label>
              <Button
                variant="outline"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                {t('tx.allDates')}
              </Button>
              <p className="text-xs text-muted-foreground sm:col-span-4">
                {t('tx.dateHelp')}
              </p>
            </div>
          ) : null}
          {showAdvanced ? (
            <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
              <label className="text-xs font-medium text-muted-foreground">
                {t('tx.department')}
              </label>
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                className="h-9 rounded-lg border bg-card px-3 text-sm"
              >
                {Object.keys(departmentLabels.en).map((value) => (
                  <option key={value} value={value}>{translateEnum(departmentLabels, lang, value)}</option>
                ))}
              </select>
              <Button
                variant="ghost"
                className="sm:ml-auto"
                onClick={resetFilters}
              >
                {t('tx.resetFilters')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid min-h-[590px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 gap-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="flex items-center justify-between">
              <span>
                {loadingRecords
                  ? t('tx.loading')
                  : t('tx.countTransactions', { count: filtered.length })}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {t('tx.financeRegister')}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.transaction')}</TableHead>
                  <TableHead>{t('table.counterparty')}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t('tx.department')}
                  </TableHead>
                  <TableHead>{t('table.status')}</TableHead>
                  <TableHead className="text-right">{t('table.amount')}</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => setSelected(row)}
                    data-state={
                      selected?.id === row.id ? 'selected' : undefined
                    }
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <p className="font-medium">{row.id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.date} · {translateEnum(txTypeLabels, lang, row.type)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p>{row.party}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.reference}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {translateEnum(departmentLabels, lang, row.department)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={badgeStyles[row.status]}
                      >
                        {translateEnum(statusLabels, lang, row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {row.amount}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!loadingRecords && filtered.length === 0 ? (
              <div className="grid min-h-56 place-items-center text-center">
                <div>
                  <Search className="mx-auto mb-2 size-7 text-muted-foreground" />
                  <p className="font-medium">{emptyTitle}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {emptyCopy}
                  </p>
                  {records.length > 0 ? (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        if (scopeMismatch)
                          window.location.href = '/transactions';
                        else resetFilters();
                      }}
                    >
                      {scopeMismatch
                        ? t('tx.viewAllTransactions')
                        : t('tx.clearFilters')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="h-fit gap-0 xl:sticky xl:top-20">
            <CardHeader className="border-b py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                  {t('tx.detailTitle')}
                </p>
                <CardTitle className="mt-1">{selected.id}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t('tx.totalAmount')}</p>
                  <p className="metric-value mt-1 text-2xl font-semibold">
                    {selected.amount}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={badgeStyles[selected.status]}
                >
                  {translateEnum(statusLabels, lang, selected.status)}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
                <Detail label={t('table.counterparty')} value={selected.party} />
                <Detail label={t('field.reference')} value={selected.reference} />
                <Detail label={t('field.issueDate')} value={selected.date} />
                <Detail label={t('tx.department')} value={translateEnum(departmentLabels, lang, selected.department)} />
                <Detail label={t('table.category')} value={selected.category} />
                <Detail label={t('field.responsible')} value={selected.owner} />
                <Detail label={t('field.approval')} value={selected.approval} />
                {selected.dueDate ? (
                  <Detail label={t('field.dueDate')} value={selected.dueDate} />
                ) : null}
                {selected.tax ? (
                  <Detail
                    label={t('field.taxVat')}
                    value={`${selected.currency || 'KHR'} ${selected.tax}`}
                  />
                ) : null}
                {selected.taxTreatment ? (
                  <Detail label={t('field.taxTreatment')} value={translateEnum(taxTreatmentLabels, lang, selected.taxTreatment)} />
                ) : null}
                {selected.exchangeRate ? (
                  <Detail
                    label={t('field.exchangeRate')}
                    value={selected.exchangeRate}
                  />
                ) : null}
                {selected.paymentMethod ? (
                  <Detail
                    label={t('field.paymentMethod')}
                    value={selected.paymentMethod}
                  />
                ) : null}
                {selected.purchaseOrder ? (
                  <Detail
                    label={t('field.purchaseOrder')}
                    value={selected.purchaseOrder}
                  />
                ) : null}
              </dl>
              {selected.description ? (
                <div className="rounded-xl border bg-muted/20 p-3 text-xs">
                  <p className="text-muted-foreground">{t('field.description')}</p>
                  <p className="mt-1">{selected.description}</p>
                </div>
              ) : null}
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <ArrowLeftRight className="size-4 text-primary" /> {t('tx.balancedJournal')}
                </div>
                <div className="mt-3 flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('tx.debit')}</span>
                  <span className="font-mono">{selected.amount}</span>
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('tx.credit')}</span>
                  <span className="font-mono">{selected.amount}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <FileCheck2 className="size-4 text-emerald-600" />
                  <span>{t('tx.voucherRecorded')}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <ShieldCheck className="size-4 text-emerald-600" />
                  <span>{t('tx.auditTrail')}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    window.location.href = '/documents';
                  }}
                >
                  {t('tx.viewDocuments')}
                </Button>
                <Button onClick={() => openEditTransaction(selected)}>
                  <Pencil /> {t('tx.editTransaction')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="h-fit gap-0 xl:sticky xl:top-20">
            <CardHeader className="border-b py-4">
              <CardTitle>{t('tx.detailTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="grid min-h-56 place-items-center p-6 text-center">
              <div>
                <FileCheck2 className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="font-medium">{t('tx.noSelectionTitle')}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('tx.noSelectionCopy')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close transaction dialog"
            className="absolute inset-0"
            onClick={() => setDialogOpen(false)}
          />
          <form
            aria-label={
              editingId ? 'Edit transaction form' : 'New transaction form'
            }
            onSubmit={saveTransaction}
            className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card shadow-2xl"
          >
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-xl font-semibold">
                  {editingId ? t('tx.editTitle', { id: editingId }) : t('tx.reviewTransaction')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {editingId
                    ? t('tx.editSubtitle')
                    : t('tx.newSubtitle')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close dialog"
                onClick={() => setDialogOpen(false)}
              >
                <X />
              </Button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('field.transactionType')}>
                <select
                  value={draft.type}
                  disabled={type !== 'All'}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      type: event.target.value as 'Income' | 'Expense',
                    })
                  }
                  className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                >
                  <option value="Income">{translateEnum(txTypeLabels, lang, 'Income')}</option>
                  <option value="Expense">{translateEnum(txTypeLabels, lang, 'Expense')}</option>
                </select>
              </Field>
              <Field label={t('field.documentType')}>
                <Input
                  value={draft.documentType}
                  onChange={(event) =>
                    setDraft({ ...draft, documentType: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.issueDate')}>
                <Input
                  required
                  type="date"
                  min="2020-01-01"
                  max="2030-12-31"
                  value={draft.date}
                  onChange={(event) =>
                    setDraft({ ...draft, date: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.dueDate')}>
                <Input
                  type="date"
                  min={draft.date || '2020-01-01'}
                  max="2030-12-31"
                  value={draft.dueDate}
                  onChange={(event) =>
                    setDraft({ ...draft, dueDate: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.invoiceReceiptNo')}>
                <Input
                  required
                  value={draft.reference}
                  onChange={(event) =>
                    setDraft({ ...draft, reference: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.purchaseOrder')}>
                <Input
                  value={draft.purchaseOrder}
                  onChange={(event) =>
                    setDraft({ ...draft, purchaseOrder: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.customerVendor')}>
                <Input
                  required
                  value={draft.party}
                  onChange={(event) =>
                    setDraft({ ...draft, party: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('tx.department')}>
                <select
                  value={draft.department}
                  onChange={(event) =>
                    setDraft({ ...draft, department: event.target.value })
                  }
                  className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                >
                  {Object.keys(departmentLabels.en).filter((value) => value !== 'All departments').map((value) => (
                    <option key={value} value={value}>{translateEnum(departmentLabels, lang, value)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('table.category')}>
                <Input
                  required
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.currency')}>
                <Input
                  value={draft.currency}
                  onChange={(event) => {
                    const currency = event.target.value.toUpperCase();
                    setDraft({
                      ...draft,
                      currency,
                      exchangeRate: currency === 'KHR' ? '1' : '',
                    });
                  }}
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.vatTreatment')}>
                <select
                  value={draft.taxTreatment}
                  onChange={(event) => updateTaxTreatment(event.target.value)}
                  className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                >
                  {Object.keys(taxTreatmentLabels.en).map((value) => (
                    <option key={value} value={value}>{translateEnum(taxTreatmentLabels, lang, value)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('field.exchangeRate')}>
                <Input
                  required
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={draft.currency === 'KHR' ? '1' : draft.exchangeRate}
                  disabled={draft.currency === 'KHR'}
                  onChange={(event) =>
                    setDraft({ ...draft, exchangeRate: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.subtotal')}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.subtotal}
                  onChange={(event) => updateSubtotal(event.target.value)}
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.taxVat')}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.tax}
                  onChange={(event) => updateTax(event.target.value)}
                  className="mt-2"
                />
              </Field>
              <Field label={t('tx.totalAmount')}>
                <Input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft({ ...draft, amount: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.statutoryKhr')}>
                <Input
                  value={
                    Number(draft.amount) > 0 &&
                    Number(draft.currency === 'KHR' ? 1 : draft.exchangeRate) >
                      0
                      ? new Intl.NumberFormat('en-US', {
                          maximumFractionDigits: 0,
                        }).format(
                          Number(draft.amount) *
                            Number(
                              draft.currency === 'KHR' ? 1 : draft.exchangeRate,
                            ),
                        )
                      : ''
                  }
                  disabled
                  placeholder={t('field.statutoryKhrPlaceholder')}
                  className="mt-2"
                />
              </Field>
              <Field label={t('field.paymentMethod')}>
                <Input
                  value={draft.paymentMethod}
                  onChange={(event) =>
                    setDraft({ ...draft, paymentMethod: event.target.value })
                  }
                  className="mt-2"
                />
              </Field>
              <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">
                {t('field.description')}
                <textarea
                  required
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                  rows={3}
                  className="mt-2 w-full rounded-lg border bg-card px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t p-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                {t('tx.cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? t('tx.saving')
                  : editingId
                    ? t('tx.saveChanges')
                    : t('tx.savePending')}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-medium">
      {label}
      {children}
    </label>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
function isWithinDateRange(value: string, from: string, to: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return true;
  if (from && timestamp < Date.parse(`${from}T00:00:00`)) return false;
  if (to && timestamp > Date.parse(`${to}T23:59:59`)) return false;
  return true;
}
function formatPickerDate(value: string, lang: 'en' | 'km') {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(lang === 'km' ? 'km-KH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
function todayInputDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function currentMonthRange() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    to: `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`,
  };
}
function toInputDate(value: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}
function sumDraft(subtotal: string, tax: string) {
  const total = Number(subtotal || 0) + Number(tax || 0);
  return Number.isFinite(total) && total > 0 ? total.toFixed(2) : '';
}
function suggestDepartment(category: string, description: string) {
  const value = `${category} ${description}`.toLowerCase();
  if (/software|cloud|hosting|technology|internet|it\b/.test(value))
    return 'Technology';
  if (/marketing|advertis|campaign|design/.test(value)) return 'Marketing';
  if (/revenue|sale|customer|service income/.test(value)) return 'Commercial';
  return 'Operations';
}
