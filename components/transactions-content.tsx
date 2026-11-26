'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { GdtRateField } from './gdt-rate-field';
import type { GdtQuote } from '@/lib/gdt-exchange-rates';
import { useGdtRate } from '@/hooks/use-gdt-rate';
import type { TransactionRecord } from '@/db/transaction-register';
import { PaymentForm } from './workflow-forms';
import { readDocumentText } from '@/lib/document-reader';
import { automaticDocumentFormat } from '@/lib/document-format';
import {
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
  Trash2,
  Upload,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DocumentScanner,
  type ScannedTransaction,
} from '@/components/document-scanner';
import { useLanguage } from '@/lib/i18n';
import {
  accountLabels,
  departmentLabels,
  journalLabels,
  statusLabels,
  taxTreatmentLabels,
  translateEnum,
  txTypeLabels,
} from '@/lib/translations';
import {
  chartOfAccounts,
  classifyJournal,
  getAccount,
  journalTypes,
  suggestAccount,
  type JournalType,
} from '@/lib/chart-of-accounts';

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
  exchangeRateSource?: GdtQuote;
  journalType?: string;
  accountCode?: string;
  accountName?: string;
  balance?: number;
  paidAmount?: number;
  version?: number;
  documentIds?: string[];
  sourceDocument?: { id: string; sheet: string; row: number };
  cashbookSettlement?: TransactionRecord['cashbookSettlement'];
};
type TransactionDraft = Omit<ScannedTransaction, 'confidence' | 'warnings'> & {
  department: string;
  taxTreatment: string;
  exchangeRate: string;
  journalType: JournalType;
  accountCode: string;
  sourceDocument?: TransactionRow['sourceDocument'];
  sourceRecordId?: string;
};
type UploadedSource = { id: string; fileName: string; file?: File };
type AutomaticResult = {
  status: 'created' | 'existing' | 'duplicate' | 'needs_review';
  transaction?: TransactionRow;
  draft?: TransactionRow;
  issues: string[];
  batch?: boolean;
  transactions?: TransactionRow[];
  createdCount?: number;
  duplicateCount?: number;
  reviewCount?: number;
  nextOffset?: number | null;
  rows?: {
    sheet: string;
    row: number;
    status: string;
    issues: string[];
    warnings: string[];
    draft?: TransactionRow;
    transaction?: TransactionRow;
  }[];
};
type UploadOutcome = UploadedSource & AutomaticResult;

const blankDraft = (type: 'All' | 'Income' | 'Expense'): TransactionDraft => {
  const resolvedType = type === 'All' ? 'Expense' : type;
  return {
    type: resolvedType,
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
    journalType: classifyJournal(resolvedType, 'Pending'),
    accountCode: suggestAccount(resolvedType, '', '').code,
  };
};

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
  const [vendorNames, setVendorNames] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    fetch('/api/vendors', { cache: 'no-store' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload?.vendors)
          setVendorNames(
            payload.vendors
              .filter((v: { status: string }) => v.status === 'Active')
              .map((v: { name: string }) => v.name),
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('All departments');
  const [draft, setDraft] = useState<TransactionDraft>(() => blankDraft(type));
  const draftOfficial = useGdtRate(
    dialogOpen ? draft.date : '',
    draft.currency,
  );
  const statutoryRate =
    draft.currency === 'KHR' ? '1' : draftOfficial.quote?.rate || '';
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TransactionRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<TransactionRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [automaticEnabled, setAutomaticEnabled] = useState(true);
  const [automaticType, setAutomaticType] = useState<'Income' | 'Expense'>(
    type === 'Income' ? 'Income' : 'Expense',
  );
  const [workbookCurrency, setWorkbookCurrency] = useState<'USD' | 'KHR'>(
    'USD',
  );
  const [automaticProgress, setAutomaticProgress] = useState('');
  const [uploadOutcomes, setUploadOutcomes] = useState<UploadOutcome[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<
    Array<{ id: string; fileName: string; file?: File }>
  >([]);
  const [scannerFile, setScannerFile] = useState<File | undefined>();
  const uploadBusy = useRef(false);
  const conversionRate = '';
  const openUploadedReview = (
    source: UploadedSource,
    suggestion?: TransactionRow,
    issues: string[] = [],
  ) => {
    const base = blankDraft(type);
    setEditingId(null);
    setDraft({
      ...base,
      ...(suggestion
        ? {
            type:
              suggestion.type === 'Income'
                ? ('Income' as const)
                : ('Expense' as const),
            date: suggestion.date || '',
            dueDate: suggestion.dueDate || '',
            reference: suggestion.reference || '',
            party: suggestion.party || '',
            description: suggestion.description || source.fileName,
            department: suggestion.department || base.department,
            category: suggestion.category || '',
            amount: suggestion.amount || '',
            subtotal: suggestion.subtotal || '',
            tax: suggestion.tax || '',
            currency: suggestion.currency || '',
            exchangeRate: suggestion.exchangeRate || '',
            taxTreatment: 'Review required',
            journalType: isJournalType(suggestion.journalType)
              ? suggestion.journalType
              : classifyJournal(suggestion.type, 'Pending'),
            accountCode: suggestion.accountCode || base.accountCode,
            sourceDocument: suggestion.sourceDocument,
            sourceRecordId: suggestion.sourceDocument
              ? suggestion.id
              : undefined,
          }
        : { description: source.fileName }),
      documentType: 'Uploaded document',
    });
    setPendingDocuments([source]);
    setNotice(issues.join(' '));
    setNoticeIsError(issues.length > 0);
    setDialogOpen(true);
  };
  const processAutomatic = async (
    source: UploadedSource,
    overrides?: {
      type: 'Income' | 'Expense';
      exchangeRate: string;
      department: string;
    },
  ): Promise<AutomaticResult> => {
    let text = '';
    let readingIssue = '';
    const spreadsheet =
      automaticDocumentFormat(source.fileName, source.file?.type) === 'excel' ||
      /\.csv$/i.test(source.fileName);
    try {
      if (!spreadsheet && !source.file)
        throw new Error('Open this file for manual review.');
      if (!spreadsheet)
        text = await readDocumentText(source.file!, (percent) =>
          setAutomaticProgress(source.fileName + ' · ' + percent + '%'),
        );
    } catch (error) {
      readingIssue =
        error instanceof Error ? error.message : 'Document reading failed.';
    }
    let offset = 0;
    let result: AutomaticResult = { status: 'needs_review', issues: [] };
    do {
      const response = await fetch(
        '/api/documents/' + encodeURIComponent(source.id) + '/transaction',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            spreadsheetImport: spreadsheet,
            defaultCurrency: workbookCurrency,
            offset,
            extractionError: readingIssue || undefined,
            type: type === 'All' ? automaticType : type,
            exchangeRate: conversionRate,
            department: 'Operations',
            ...overrides,
          }),
        },
      );
      const chunk = (await response.json()) as AutomaticResult & {
        error?: string;
      };
      if (!response.ok) throw new Error(chunk.error || t('tx.autoFailed'));
      result = chunk.batch
        ? {
            ...chunk,
            transactions: [
              ...(result.transactions || []),
              ...(chunk.transactions || []),
            ],
            rows: [...(result.rows || []), ...(chunk.rows || [])],
            issues: [...new Set([...result.issues, ...chunk.issues])],
            createdCount:
              (result.createdCount || 0) + (chunk.createdCount || 0),
            duplicateCount:
              (result.duplicateCount || 0) + (chunk.duplicateCount || 0),
            reviewCount: (result.reviewCount || 0) + (chunk.reviewCount || 0),
          }
        : chunk;
      const added =
        chunk.transactions || (chunk.transaction ? [chunk.transaction] : []);
      if (added.length) {
        const ids = new Set(added.map((row) => row.id));
        setRecords((rows) => [
          ...added,
          ...rows.filter((row) => !ids.has(row.id)),
        ]);
        setSelected(added[0]);
        setDateFrom('');
        setDateTo('');
        setQuery('');
        setStatus('All statuses');
        setDepartmentFilter('All departments');
        window.dispatchEvent(new Event('ledgerflow-approvals-changed'));
      }
      offset = chunk.nextOffset ?? 0;
      if (offset)
        setAutomaticProgress(
          source.fileName + ' · ' + offset + ' ' + t('tx.importRows'),
        );
    } while (offset);
    if (result.batch)
      result.status = result.createdCount
        ? 'created'
        : result.duplicateCount
          ? 'existing'
          : 'needs_review';
    return result;
  };
  const restoredDocument = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('document');
    if (!id || restoredDocument.current === id) return;
    let active = true;
    fetch('/api/documents', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          documents?: Array<{
            id: string;
            fileName: string;
            linkedReference: string | null;
            suggestedTransaction?: TransactionRow & { issues?: string[] };
          }>;
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || t('docs.loadFailed'));
        const doc = payload.documents?.find((item) => item.id === id);
        if (!doc) throw new Error(t('tx.uploadedDocumentUnavailable'));
        if (active) {
          restoredDocument.current = id;
          setEditingId(null);
          setDraft({
            ...blankDraft(type),
            ...(doc.suggestedTransaction
              ? {
                  type:
                    doc.suggestedTransaction.type === 'Income'
                      ? ('Income' as const)
                      : ('Expense' as const),
                  date: doc.suggestedTransaction.date || '',
                  reference: doc.suggestedTransaction.reference || '',
                  party: doc.suggestedTransaction.party || '',
                  amount: doc.suggestedTransaction.amount || '',
                  currency: doc.suggestedTransaction.currency || '',
                  tax: doc.suggestedTransaction.tax || '',
                  subtotal: doc.suggestedTransaction.subtotal || '',
                  category: doc.suggestedTransaction.category || '',
                  exchangeRate: doc.suggestedTransaction.exchangeRate || '',
                }
              : {}),
            documentType: 'Uploaded document',
            description: doc.suggestedTransaction?.description || doc.fileName,
          });
          setPendingDocuments([{ id: doc.id, fileName: doc.fileName }]);
          setNotice(doc.suggestedTransaction?.issues?.join(' ') || '');
          setDialogOpen(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice(
            error instanceof Error ? error.message : t('docs.loadFailed'),
          );
          setNoticeIsError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [t, type]);

  const chooseFiles = (transaction: TransactionRow | null) => {
    if (uploadBusy.current) return;
    uploadTarget.current = transaction;
    uploadInput.current?.click();
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length || uploadBusy.current) return;
    uploadBusy.current = true;
    const target = uploadTarget.current;
    if (!target) {
      setPendingDocuments([]);
      setDialogOpen(false);
    }
    setUploading(true);
    setUploadOutcomes([]);
    let uploaded = 0;
    const errors: string[] = [];
    const savedDocuments: Array<{ id: string; fileName: string; file: File }> =
      [];
    const reviewQueue: UploadOutcome[] = [];
    let createdCount = 0;
    let batchReviewCount = 0;
    let duplicateCount = 0;
    try {
      for (const file of files) {
        try {
          if (file.size > 8 * 1024 * 1024 || file.size === 0)
            throw new Error(t('tx.uploadSizeError', { name: file.name }));
          const contentBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== 'string') {
                reject(new Error(t('docs.uploadFailed', { name: file.name })));
                return;
              }
              resolve(reader.result.slice(reader.result.indexOf(',') + 1));
            };
            reader.onerror = () =>
              reject(new Error(t('docs.uploadFailed', { name: file.name })));
            reader.readAsDataURL(file);
          });
          const response = await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              contentBase64,
              category: 'Other',
              linkedReference: target?.reference,
            }),
          });
          const payload = (await response.json().catch(() => ({
            error:
              response.status === 413
                ? t('tx.uploadTransportSize')
                : t('docs.uploadFailed', { name: file.name }),
          }))) as {
            document?: { id: string };
            error?: string;
          };
          if (!response.ok || !payload.document)
            throw new Error(
              payload.error || t('docs.uploadFailed', { name: file.name }),
            );
          uploaded += 1;
          savedDocuments.push({
            id: payload.document.id,
            fileName: file.name,
            file,
          });
          if (!target && automaticEnabled) {
            const source = {
              id: payload.document.id,
              fileName: file.name,
              file,
            };
            setAutomaticProgress(file.name);
            let result: AutomaticResult;
            try {
              result = await processAutomatic(source);
            } catch (error) {
              result = {
                status: 'needs_review',
                issues: [
                  error instanceof Error ? error.message : t('tx.autoFailed'),
                ],
              };
            }
            const outcome = { ...source, ...result };
            setUploadOutcomes((outcomes) => [...outcomes, outcome]);
            createdCount += result.batch
              ? result.createdCount || 0
              : result.status === 'created'
                ? 1
                : 0;
            duplicateCount += result.batch
              ? result.duplicateCount || 0
              : result.status === 'duplicate' || result.status === 'existing'
                ? 1
                : 0;
            batchReviewCount += result.reviewCount || 0;
            if (result.status === 'needs_review' && !result.batch)
              reviewQueue.push(outcome);
          }
          if (target) {
            const linkResponse = await fetch('/api/documents', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: payload.document.id,
                linkedReference: target.id,
                verify: false,
              }),
            });
            if (!linkResponse.ok) {
              const linkPayload = (await linkResponse.json()) as {
                error?: string;
              };
              throw new Error(
                t('tx.uploadLinkFailed', { name: file.name }) +
                  (linkPayload.error ? ` ${linkPayload.error}` : ''),
              );
            }
          }
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error.message
              : t('docs.uploadFailed', { name: file.name }),
          );
        }
      }
      if (!target && savedDocuments.length && !automaticEnabled) {
        setEditingId(null);
        setDraft({
          ...blankDraft(type),
          documentType: 'Uploaded document',
          description: savedDocuments.map((doc) => doc.fileName).join(', '),
        });
        setPendingDocuments(savedDocuments);
        setDialogOpen(true);
      }
      if (reviewQueue.length) {
        openUploadedReview(reviewQueue[0], reviewQueue[0].draft);
      }
      showNotice(
        [
          uploaded ? t('docs.uploadedSuccess', { count: uploaded }) : '',
          !target && automaticEnabled
            ? t('tx.autoSummary', {
                created: createdCount,
                review: reviewQueue.length + batchReviewCount,
                duplicates: duplicateCount,
              })
            : '',
          ...errors,
          ...(reviewQueue[0]?.issues || []),
        ]
          .filter(Boolean)
          .join(' '),
        errors.length > 0,
      );
    } finally {
      setUploading(false);
      setAutomaticProgress('');
      uploadBusy.current = false;
    }
  };

  const showNotice = (message: string, isError: boolean) => {
    setNotice(message);
    setNoticeIsError(isError);
  };

  const typeRows = useMemo(
    () =>
      type === 'All' ? records : records.filter((row) => row.type === type),
    [records, type],
  );
  const paymentLabel = (row: { type: string; status: string }) => {
    if (row.status === 'Pending')
      return t(
        row.type === 'Income'
          ? 'tx.collectionNotRecorded'
          : 'tx.paymentNotRecorded',
      );
    if (row.status === 'Paid' && row.type === 'Income') return t('tx.received');
    if (row.status === 'Partially Paid' && row.type === 'Income')
      return t('tx.partiallyReceived');
    return translateEnum(statusLabels, lang, row.status);
  };
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
        ? t('tx.emptyScopeMismatchTitle', {
            count: records.length,
            plural: records.length === 1 ? '' : 's',
            type: translateEnum(txTypeLabels, lang, type).toLowerCase(),
          })
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
          canReconcileCashbook?: boolean;
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || t('tx.noticeLoadFailed'));
        let rows = payload.transactions || [];
        if (
          payload.canReconcileCashbook &&
          rows.some(
            (row) =>
              row.sourceDocument &&
              ['cash_receipts', 'cash_disbursements'].includes(
                row.journalType || '',
              ) &&
              (row.status === 'Pending' ||
                row.cashbookSettlement?.state === 'awaiting_gdt'),
          )
        ) {
          let after: string | null = '';
          do {
            const repair = await fetch('/api/transactions/reconcile-cashbook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ after }),
            });
            const result = (await repair.json()) as {
              transactions?: TransactionRow[];
              issues?: string[];
              nextCursor?: string | null;
              error?: string;
            };
            if (!repair.ok) {
              if (active)
                showNotice(result.error || t('tx.noticeLoadFailed'), true);
              break;
            }
            rows = result.transactions || rows;
            if (active && result.issues?.length)
              showNotice(result.issues.slice(0, 3).join(' '), true);
            after = result.nextCursor || null;
          } while (after && active);
        }
        return rows;
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
  }, [type, t]);

  const openNewTransaction = () => {
    setPendingDocuments([]);
    setEditingId(null);
    setDraft(blankDraft(type));
    setNotice('');
    setDialogOpen(true);
  };

  const openEditTransaction = (record: TransactionRow) => {
    setPendingDocuments([]);
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
      sourceDocument: record.sourceDocument,
      taxTreatment: record.taxTreatment || 'Standard VAT 10%',
      exchangeRate:
        record.exchangeRate || (record.currency === 'KHR' ? '1' : ''),
      journalType: isJournalType(record.journalType)
        ? record.journalType
        : classifyJournal(record.type, record.status),
      accountCode:
        record.accountCode ||
        suggestAccount(record.type, record.category, record.description || '')
          .code,
    });
    setNotice('');
    setDialogOpen(true);
  };

  const deleteTransaction = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/transactions/${encodeURIComponent(target.id)}`,
        { method: 'DELETE' },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok)
        throw new Error(payload.error || t('tx.deleteFailed'));
      setRecords((current) => current.filter((row) => row.id !== target.id));
      setSelected((current) => (current?.id === target.id ? null : current));
      setDeleteTarget(null);
      showNotice(t('tx.deletedNotice', { id: target.id }), false);
    } catch (deleteError) {
      showNotice(
        deleteError instanceof Error
          ? deleteError.message
          : t('tx.deleteFailed'),
        true,
      );
    } finally {
      setDeleting(false);
    }
  };

  const saveTransaction = async (
    event: React.SyntheticEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (saving) return;
    const numericAmount = Number(draft.amount);
    if (
      !draft.party.trim() ||
      !draft.reference.trim() ||
      !draft.date.trim() ||
      !draft.description.trim() ||
      !draft.category.trim() ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
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
        draft.sourceRecordId ||
        `TRX-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      version: existing?.version,
      documentIds: draft.sourceDocument
        ? []
        : pendingDocuments.map((doc) => doc.id),
      sourceDocument: draft.sourceDocument || existing?.sourceDocument,
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
      exchangeRate: statutoryRate,
      journalType: draft.journalType,
      accountCode: draft.accountCode,
      accountName: getAccount(draft.accountCode)?.name || '',
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
      setPendingDocuments([]);
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.delete('document');
      window.history.replaceState(
        null,
        '',
        returnUrl.pathname + returnUrl.search + returnUrl.hash,
      );
      setQuery('');
      setStatus('All statuses');
      setDepartmentFilter('All departments');
      const savedDate = toInputDate(saved.date);
      setDateFrom(savedDate);
      setDateTo(savedDate);
      window.dispatchEvent(new Event('ledgerflow-approvals-changed'));
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
    const resolvedType = type === 'All' ? fields.type : type;
    setEditingId(null);
    setDraft({
      ...fields,
      type: resolvedType,
      date: toInputDate(fields.date) || todayInputDate(),
      dueDate: toInputDate(fields.dueDate),
      department: suggestDepartment(fields.category, fields.description),
      taxTreatment:
        Number(fields.tax || 0) > 0 ? 'Standard VAT 10%' : 'Review required',
      exchangeRate: fields.currency === 'KHR' ? '1' : '',
      journalType: classifyJournal(resolvedType, 'Pending'),
      accountCode: suggestAccount(
        resolvedType,
        fields.category,
        fields.description,
      ).code,
    });
    setScannerMode(null);
    setScannerFile(undefined);
    showNotice(t('tx.noticeScanApplied'), false);
    setDialogOpen(true);
  };

  const resetFilters = () => {
    setQuery('');
    setStatus('All statuses');
    setDepartmentFilter('All departments');
    setDateFrom('');
    setDateTo('');
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
      <input
        ref={uploadInput}
        type="file"
        multiple
        hidden
        aria-label={t('tx.uploadFiles')}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = '';
          void uploadFiles(files);
        }}
      />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {t('tx.breadcrumbFinance')} /{' '}
            {translateEnum(txTypeLabels, lang, type)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="bg-card"
            disabled={uploading}
            onClick={() => chooseFiles(null)}
            title={t('tx.uploadHint')}
          >
            <Upload /> {uploading ? t('docs.uploading') : t('tx.uploadFiles')}
          </Button>
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
            onClick={() => {
              setScannerFile(undefined);
              setScannerMode('upload');
            }}
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
          <Button disabled={uploading} onClick={openNewTransaction}>
            <Plus />{' '}
            {type === 'All'
              ? t('tx.newTransaction')
              : type === 'Income'
                ? t('tx.newIncome')
                : t('tx.newExpense')}
          </Button>
        </div>
      </div>
      <section
        aria-label="Automatic transaction creation"
        className="space-y-3 rounded-xl border bg-card p-4"
      >
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={automaticEnabled}
            disabled={uploading}
            onChange={(event) => setAutomaticEnabled(event.target.checked)}
          />
          {t('tx.autoTitle')}
        </label>
        <p className="text-xs text-muted-foreground">{t('tx.autoHint')}</p>
        {automaticEnabled ? (
          <div className="flex flex-wrap items-end gap-3">
            {type === 'All' ? (
              <label className="text-xs">
                {t('field.transactionType')}
                <select
                  disabled={uploading}
                  className="ml-2 rounded-lg border p-2"
                  value={automaticType}
                  onChange={(event) =>
                    setAutomaticType(event.target.value as 'Income' | 'Expense')
                  }
                >
                  <option value="Expense">
                    {translateEnum(txTypeLabels, lang, 'Expense')}
                  </option>
                  <option value="Income">
                    {translateEnum(txTypeLabels, lang, 'Income')}
                  </option>
                </select>
              </label>
            ) : null}
            <label className="max-w-56 text-xs">
              {t('tx.workbookCurrency')}
              <select
                disabled={uploading}
                className="mt-1 h-10 w-full rounded-lg border bg-card px-3"
                value={workbookCurrency}
                onChange={(event) =>
                  setWorkbookCurrency(event.target.value as 'USD' | 'KHR')
                }
              >
                <option value="USD">USD</option>
                <option value="KHR">KHR</option>
              </select>
            </label>
            <p className="max-w-md text-xs text-muted-foreground">
              {t('tx.gdtAutomaticHint')}{' '}
              <a
                href="https://www.tax.gov.kh/en/exchange-rate"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                GDT
              </a>
            </p>
          </div>
        ) : null}
        {automaticProgress ? (
          <p aria-live="polite" className="text-sm text-primary">
            {t('tx.autoProcessing')} {automaticProgress}
          </p>
        ) : null}
        {uploadOutcomes.length ? (
          <div className="divide-y">
            {uploadOutcomes.map((outcome) => (
              <div
                key={outcome.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {outcome.fileName}
                  </p>
                  {outcome.issues.length ? (
                    <p className="text-xs text-amber-700">
                      {outcome.issues.join(' · ')}
                    </p>
                  ) : null}
                </div>
                <Badge variant="outline">
                  {t('tx.autoStatus.' + outcome.status)}
                </Badge>
                {outcome.status === 'needs_review' && !outcome.batch ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openUploadedReview(outcome, outcome.draft, outcome.issues)
                    }
                  >
                    {t('scan.reviewAndRecord')}
                  </Button>
                ) : (
                  <span className="text-xs font-mono">
                    {outcome.transaction?.id}
                  </span>
                )}
                {outcome.batch ? (
                  <details className="w-full rounded-lg border p-3 text-xs">
                    <summary className="cursor-pointer font-medium">
                      {t('tx.importRows')} · {outcome.createdCount || 0}{' '}
                      {t('tx.autoStatus.created')} · {outcome.reviewCount || 0}{' '}
                      {t('tx.autoStatus.needs_review')}
                    </summary>
                    <p className="my-2 text-muted-foreground">
                      {t('tx.cashbookWorkflow')}
                    </p>
                    <div className="max-h-80 overflow-auto divide-y">
                      {outcome.rows?.map((row) => (
                        <div
                          key={row.sheet + ':' + row.row}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <div>
                            <strong>
                              {row.sheet} · {row.row}
                            </strong>{' '}
                            ·{' '}
                            {row.transaction?.reference || row.draft?.reference}{' '}
                            · {row.transaction?.amount || row.draft?.amount}
                            <p className="text-amber-700">
                              {[...row.issues, ...row.warnings].join(' ')}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              row.transaction
                                ? openEditTransaction(row.transaction)
                                : openUploadedReview(
                                    outcome,
                                    row.draft,
                                    row.issues,
                                  )
                            }
                          >
                            {t('scan.reviewAndRecord')}
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4">
                      <Link className="underline" href="/transactions">
                        {t('nav.transactions')}
                      </Link>
                      <Link className="underline" href="/accounting">
                        {t('nav.accounting')}
                      </Link>
                      <Link className="underline" href="/approvals">
                        {t('nav.approvals')}
                      </Link>
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
      {notice ? (
        <div
          aria-live="polite"

          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${noticeIsError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          <CheckCircle2 className="size-4" />
          {notice}
        </div>
      ) : null}
      {scannerMode ? (
        <DocumentScanner
          mode={scannerMode}
          initialFile={scannerFile}
          onClose={() => {
            setScannerMode(null);
            setScannerFile(undefined);
            if (pendingDocuments.length) setDialogOpen(true);
          }}
          onApply={useScannedData}
        />
      ) : null}
      {pendingDocuments.length && !dialogOpen && !scannerMode ? (
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          {t('tx.continueUploadedRecord')}
        </Button>
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
                <option key={value} value={value}>
                  {paymentLabel({ type, status: value })}
                </option>
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
              <Filter />{' '}
              {showAdvanced ? t('tx.hideFilters') : t('tx.moreFilters')}
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
                  <option key={value} value={value}>
                    {translateEnum(departmentLabels, lang, value)}
                  </option>
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

      {!loadingRecords && typeRows.length > filtered.length ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm"
          aria-live="polite"
        >
          <p>
            {t('tx.filteredCount', {
              shown: filtered.length,
              total: typeRows.length,
            })}
          </p>
          <Button variant="outline" onClick={resetFilters}>
            {t('tx.clearFilters')}
          </Button>
        </div>
      ) : null}
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
                  <TableHead>{t('table.transactionType')}</TableHead>
                  <TableHead>{t('table.paymentStatus')}</TableHead>
                  <TableHead className="min-w-28 text-right">
                    {t('table.amountKhr')}
                  </TableHead>
                  <TableHead className="min-w-28 text-right">
                    {t('table.amountUsd')}
                  </TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const currency =
                    row.currency || (row.amount.includes('$') ? 'USD' : 'KHR');
                  return (
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
                          {row.date} ·{' '}
                          {translateEnum(txTypeLabels, lang, row.type)}
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
                          className={
                            row.type === 'Income'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-50 text-slate-700'
                          }
                        >
                          {translateEnum(txTypeLabels, lang, row.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={badgeStyles[row.status]}
                        >
                          {paymentLabel(row)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-xs font-semibold">
                        {currency === 'KHR' ? row.amount : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-xs font-semibold">
                        {currency === 'USD' ? row.amount : '—'}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
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

        {selected && filtered.some((row) => row.id === selected.id) ? (
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
                  <p className="text-xs text-muted-foreground">
                    {t('tx.totalAmount')}
                  </p>
                  <p className="metric-value mt-1 text-2xl font-semibold">
                    {selected.amount}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    selected.type === 'Income'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }
                >
                  {translateEnum(txTypeLabels, lang, selected.type)}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
                <Detail
                  label={t('table.transactionType')}
                  value={translateEnum(txTypeLabels, lang, selected.type)}
                />
                <Detail
                  label={t('table.paymentStatus')}
                  value={paymentLabel(selected)}
                />
                <Detail
                  label={t('table.counterparty')}
                  value={selected.party}
                />
                <Detail
                  label={t('field.reference')}
                  value={selected.reference}
                />
                <Detail label={t('field.issueDate')} value={selected.date} />
                <Detail
                  label={t('tx.department')}
                  value={translateEnum(
                    departmentLabels,
                    lang,
                    selected.department,
                  )}
                />
                <Detail label={t('table.category')} value={selected.category} />
                {selected.sourceDocument ? (
                  <a
                    className="text-sm underline"
                    href={
                      '/api/documents/' +
                      encodeURIComponent(selected.sourceDocument.id)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selected.sourceDocument.sheet} ·{' '}
                    {selected.sourceDocument.row} · {t('tx.importRows')}
                  </a>
                ) : null}
                {selected.journalType ? (
                  <Detail
                    label={t('field.journal')}
                    value={translateEnum(
                      journalLabels,
                      lang,
                      selected.journalType,
                    )}
                  />
                ) : null}
                {selected.accountCode ? (
                  <Detail
                    label={t('field.account')}
                    value={`${selected.accountCode} — ${translateEnum(accountLabels, lang, selected.accountCode)}`}
                  />
                ) : null}
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
                  <Detail
                    label={t('field.taxTreatment')}
                    value={translateEnum(
                      taxTreatmentLabels,
                      lang,
                      selected.taxTreatment,
                    )}
                  />
                ) : null}
                {selected.exchangeRate ? (
                  <Detail
                    label={t('field.exchangeRate')}
                    value={selected.exchangeRate}
                  />
                ) : null}
                {selected.exchangeRateSource ? (
                  <a
                    className="text-xs underline"
                    target="_blank"
                    rel="noreferrer"
                    href={selected.exchangeRateSource.sourceUrl}
                  >
                    GDT · {selected.exchangeRateSource.date}
                  </a>
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
                  <p className="text-muted-foreground">
                    {t('field.description')}
                  </p>
                  <p className="mt-1">{selected.description}</p>
                </div>
              ) : null}
              <PaymentForm
                key={selected.id + ':' + selected.version}
                record={selected}
                onSaved={(saved) => {
                  setSelected(saved);
                  setRecords((rows) =>
                    rows.map((row) => (row.id === saved.id ? saved : row)),
                  );
                }}
              />
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
                  className="col-span-2"
                  disabled={uploading}
                  onClick={() => chooseFiles(selected)}
                  title={t('tx.uploadHint')}
                >
                  <Upload />{' '}
                  {uploading ? t('docs.uploading') : t('tx.attachFiles')}
                </Button>
                <p className="col-span-2 text-xs text-muted-foreground">
                  {t('tx.uploadHint')}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    window.location.href =
                      '/documents?reference=' +
                      encodeURIComponent(selected.reference);
                  }}
                >
                  {t('tx.viewDocuments')}
                </Button>
                <Button
                  disabled={(selected.paidAmount || 0) > 0}
                  onClick={() => openEditTransaction(selected)}
                >
                  <Pencil /> {t('tx.editTransaction')}
                </Button>
                <Button
                  variant="outline"
                  className="col-span-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={(selected.paidAmount || 0) > 0}
                  onClick={() => setDeleteTarget(selected)}
                >
                  <Trash2 /> {t('tx.deleteTransaction')}
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
                  {editingId
                    ? t('tx.editTitle', { id: editingId })
                    : t('tx.reviewTransaction')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {editingId ? t('tx.editSubtitle') : t('tx.newSubtitle')}
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
            {notice ? (
              <p
                role={noticeIsError ? 'alert' : undefined}
                aria-live="polite"
                className={`mx-5 mt-4 rounded-lg border p-3 text-sm ${noticeIsError ? 'text-red-700' : 'text-emerald-700'}`}
              >
                {notice}
              </p>
            ) : null}
            {pendingDocuments.length ? (
              <div className="mx-5 mt-4 space-y-2 rounded-xl border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{t('tx.uploadReviewRequired')}</p>
                <ul className="list-inside list-disc text-xs">
                  {pendingDocuments.map((doc) => (
                    <li key={doc.id}>{doc.fileName}</li>
                  ))}
                </ul>
                {pendingDocuments.length === 1 ? (
                  <Button
                    disabled={uploading}
                    type="button"
                    onClick={async () => {
                      if (uploadBusy.current) return;
                      uploadBusy.current = true;
                      setUploading(true);
                      setNotice('');
                      try {
                        let source = pendingDocuments[0];
                        if (!source.file) {
                          const response = await fetch(
                            '/api/documents/' + encodeURIComponent(source.id),
                          );
                          if (!response.ok)
                            throw new Error(
                              t('tx.uploadedDocumentUnavailable'),
                            );
                          source = {
                            ...source,
                            file: new File(
                              [await response.blob()],
                              source.fileName,
                              {
                                type:
                                  response.headers.get('Content-Type') ||
                                  'application/octet-stream',
                              },
                            ),
                          };
                        }
                        const result = await processAutomatic(source, {
                          type: draft.type,
                          exchangeRate:
                            draft.currency === 'USD'
                              ? draft.exchangeRate
                              : conversionRate,
                          department: draft.department,
                        });
                        setUploadOutcomes((rows) => [
                          { ...source, ...result },
                          ...rows.filter((row) => row.id !== source.id),
                        ]);
                        if (result.status === 'needs_review' && !result.batch)
                          openUploadedReview(
                            source,
                            result.draft,
                            result.issues,
                          );
                        else {
                          setDialogOpen(false);
                          setPendingDocuments([]);
                          setNotice(
                            result.batch
                              ? t('tx.autoSummary', {
                                  created: result.createdCount || 0,
                                  review: result.reviewCount || 0,
                                  duplicates: result.duplicateCount || 0,
                                })
                              : t('tx.autoStatus.' + result.status),
                          );
                        }
                      } catch (error) {
                        setNotice(
                          error instanceof Error
                            ? error.message
                            : t('tx.autoFailed'),
                        );
                        setNoticeIsError(true);
                      } finally {
                        setUploading(false);
                        uploadBusy.current = false;
                        setAutomaticProgress('');
                      }
                    }}
                  >
                    {t('tx.autoCreateNow')}
                  </Button>
                ) : null}
                {pendingDocuments.some(
                  (doc) =>
                    doc.file &&
                    (doc.file.type.startsWith('image/') ||
                      /\.pdf$/i.test(doc.fileName)),
                ) ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setScannerFile(
                        pendingDocuments.find(
                          (doc) =>
                            doc.file &&
                            (doc.file.type.startsWith('image/') ||
                              /\.pdf$/i.test(doc.fileName)),
                        )?.file,
                      );
                      setDialogOpen(false);
                      setScannerMode('upload');
                    }}
                  >
                    <ScanLine />
                    {t('tx.scanUploadedFile')}
                  </Button>
                ) : null}
              </div>
            ) : null}
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
                  <option value="Income">
                    {translateEnum(txTypeLabels, lang, 'Income')}
                  </option>
                  <option value="Expense">
                    {translateEnum(txTypeLabels, lang, 'Expense')}
                  </option>
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
                  list={
                    draft.type === 'Expense' ? 'transaction-vendors' : undefined
                  }
                  value={draft.party}
                  onChange={(event) =>
                    setDraft({ ...draft, party: event.target.value })
                  }
                  className="mt-2"
                />
                <datalist id="transaction-vendors">
                  {vendorNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </datalist>
              </Field>
              <Field label={t('tx.department')}>
                <select
                  value={draft.department}
                  onChange={(event) =>
                    setDraft({ ...draft, department: event.target.value })
                  }
                  className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                >
                  {Object.keys(departmentLabels.en)
                    .filter((value) => value !== 'All departments')
                    .map((value) => (
                      <option key={value} value={value}>
                        {translateEnum(departmentLabels, lang, value)}
                      </option>
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
              <Field label={t('field.journal')}>
                <select
                  value={draft.journalType}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      journalType: event.target.value as JournalType,
                    })
                  }
                  className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                >
                  {journalTypes.map((value) => (
                    <option key={value} value={value}>
                      {translateEnum(journalLabels, lang, value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('field.account')}>
                <select
                  value={draft.accountCode}
                  onChange={(event) =>
                    setDraft({ ...draft, accountCode: event.target.value })
                  }
                  className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                >
                  {chartOfAccounts.map((account) => (
                    <option key={account.code} value={account.code}>
                      {account.code} —{' '}
                      {translateEnum(accountLabels, lang, account.code)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('field.vatTreatment')}>
                <select
                  value={draft.taxTreatment}
                  onChange={(event) => updateTaxTreatment(event.target.value)}
                  className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                >
                  {Object.keys(taxTreatmentLabels.en).map((value) => (
                    <option key={value} value={value}>
                      {translateEnum(taxTreatmentLabels, lang, value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('field.exchangeRate')}>
                <GdtRateField date={draft.date} currency={draft.currency} />
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
                    Number(draft.amount) > 0 && Number(statutoryRate) > 0
                      ? new Intl.NumberFormat('en-US', {
                          maximumFractionDigits: 0,
                        }).format(Number(draft.amount) * Number(statutoryRate))
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget
                ? t('tx.deleteConfirmTitle', { id: deleteTarget.id })
                : t('tx.deleteTransaction')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('tx.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('tx.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleting}
              onClick={() => void deleteTransaction()}
            >
              {deleting ? t('tx.deleting') : t('tx.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
function isJournalType(value: string | undefined): value is JournalType {
  return journalTypes.includes(value as JournalType);
}
