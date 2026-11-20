import {
  readSpreadsheetSheets,
  unreadableSpreadsheetCell,
} from './spreadsheet-document';
import { documentDate } from './document-date';
import { classifyJournal, suggestAccount } from './chart-of-accounts';
import type { TransactionRecord } from '@/db/transaction-register';
import type { AutomaticOptions } from './automatic-transaction';

export type CashbookOptions = AutomaticOptions & {
  defaultCurrency?: 'USD' | 'KHR';
  cashbook?: boolean;
  salesbook?: boolean;
};
export type CashbookRow = {
  sheet: string;
  row: number;
  draft: TransactionRecord;
  issues: string[];
  warnings: string[];
  cashMovement: boolean;
};
const normalize = (value: string) =>
  value.toLowerCase().replace(/[\s\u200b-\u200f\ufeff_().:/#$-]+/g, '');
const sourceText = (value: string) =>
  value
    .replace(/[\u200b-\u200f\ufeff]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const aliases = {
  date: [
    'date',
    'transactiondate',
    'postingdate',
    'កាលបរិច្ឆេទ',
    'ថ្ងៃខែ',
    'ថ្ងៃខែឆ្នាំ',
  ],
  description: [
    'description',
    'descriptions',
    'details',
    'particulars',
    'narration',
    'memo',
    'បរិយាយ',
  ],
  receipt: [
    'receipt',
    'receipts',
    'cashin',
    'received',
    'income',
    'debit',
    'dr',
    'ប្រាក់ចូល',
    'ចំណូល',
  ],
  payment: [
    'payment',
    'payments',
    'cashout',
    'paid',
    'expense',
    'expenses',
    'credit',
    'cr',
    'ប្រាក់ចេញ',
    'ចំណាយ',
  ],
  amount: ['amount', 'total', 'totalamount', 'ចំនួនទឹកប្រាក់', 'តម្លៃសរុបថ្លៃលក់'],
  type: ['type', 'transactiontype'],
  reference: [
    'reference',
    'ref',
    'referenceno',
    'receiptno',
    'invoiceno',
    'invoicenumber',
    'voucherno',
    'voucher',
    'លេខយោង',
    'លេខវិក្កយបត្រ',
    'លេខវិក័យប័ត្រ',
  ],
  party: [
    'party',
    'counterparty',
    'vendor',
    'supplier',
    'customer',
    'buyer',
    'payee',
    'payer',
    'អតិថិជន',
    'អ្នកផ្គត់ផ្គង់',
    'ឈ្មោះអ្នកផ្គត់ផ្គង់',
    'អ្នកទិញ',
  ],
  currency: ['currency', 'ccy', 'រូបិយប័ណ្ណ'],
  rate: ['exchangerate', 'rate', 'khrperusd', 'អត្រាប្ដូរប្រាក់'],
  tax: ['tax', 'vat', 'taxamount', 'vatamount', 'ពន្ធ', 'អាករ'],
  subtotal: ['subtotal', 'amountbeforetax', 'សរុបមុនពន្ធ'],
  remark: ['remark', 'remarks', 'កំណត់ចំណាំ'],
  vatInvoice: ['vatinvoice', 'វិក្កយបត្រអាករ'],
  normalInvoice: ['normalinvoice', 'វិក្កយបត្រ'],
} as const;
type Field = keyof typeof aliases;
function columns(cells: string[]) {
  const result: Partial<Record<Field, number>> = {};
  for (const key of Object.keys(aliases) as Field[]) {
    const index = cells.findIndex((cell) => {
      const name = normalize(cell).replace(/usd|khr/g, '');
      return (
        (aliases[key] as readonly string[]).includes(name) ||
        cell
          .split(/[/|\n]/)
          .some((part) =>
            (aliases[key] as readonly string[]).includes(
              normalize(part).replace(/usd|khr/g, ''),
            ),
          )
      );
    });
    if (index >= 0) result[key] = index;
  }
  return result;
}
function valueNumber(value: string) {
  if (!value.trim() || /^[-–—]$/.test(value.trim())) return 0;
  const clean = value.replace(/USD|KHR|US\$|[$៛,\s\u200b-\u200f\ufeff]/gi, '');
  if (!clean || /^[-–—]$/.test(clean)) return 0;
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN;
}

const currencyOf = (value: string) =>
  /\bUSD\b|\$/i.test(value) ? 'USD' : /\bKHR\b|៛/i.test(value) ? 'KHR' : '';
const isCurrency = (value: string) =>
  /^(USD|KHR|US\$|\$|៛)$/i.test(value.trim());
function tableHeader(parent: string[], child?: string[]) {
  const subheader =
    !!child?.some(isCurrency) &&
    child.every((value) => !value.trim() || isCurrency(value));
  let group = '';
  const header = Array.from(
    { length: Math.max(parent.length, subheader ? child!.length : 0) },
    (_, index) => {
      const label = parent[index]?.trim() || '';
      if (label) group = label;
      return subheader && isCurrency(child![index] || '')
        ? (label || group) + ' ' + child![index].trim()
        : label;
    },
  );
  return { header, subheader };
}

/** One positive cash movement per source row; never turn balances or totals into transactions. */
export function planCashbookImport(
  data: ArrayBuffer,
  documentId: string,
  options: CashbookOptions,
) {
  const sheets = readSpreadsheetSheets(data, true);
  const entries: CashbookRow[] = [];
  const sheetIssues: string[] = [];
  const unrecognizedSheets: string[] = [];
  let foundTable = false;
  // Prefer the complete sales register over its VAT/normal/AR copies.
  const ordered = [...sheets].sort(
    (a, b) =>
      Number(/sale.*\ball\b/i.test(b.name)) -
      Number(/sale.*\ball\b/i.test(a.name)),
  );
  const salesEntries = new Map<string, CashbookRow>();
  const masterSalesReferences = new Set<string>();
  const masterAnonymousRows = new Set<string>();
  for (const sheet of ordered) {
    const headerIndex = sheet.rows.slice(0, 50).findIndex(({ cells }) => {
      const map = columns(cells);
      return (
        map.date !== undefined &&
        map.description !== undefined &&
        (map.receipt !== undefined ||
          map.payment !== undefined ||
          map.amount !== undefined)
      );
    });
    if (headerIndex < 0) {
      unrecognizedSheets.push(sheet.name + ': no transaction table found.');
      continue;
    }
    foundTable = true;
    const { header, subheader } = tableHeader(
      sheet.rows[headerIndex].cells,
      sheet.rows[headerIndex + 1]?.cells,
    );
    const map = columns(header);
    const salesContext =
      options.salesbook ||
      /sale.*(?:inv|record|book)/i.test(sheet.name) ||
      sheet.rows
        .slice(0, headerIndex)
        .some((row) => /\bsale(?:s)?\s+record\b/i.test(row.cells.join(' ')));
    const masterSales = salesContext && /sale.*\ball\b/i.test(sheet.name);
    let copiedSalesSheet = false;
    if (
      salesContext &&
      !masterSales &&
      masterSalesReferences.size &&
      /sale|\bar\b/i.test(sheet.name) &&
      map.reference !== undefined
    ) {
      const references = sheet.rows
        .slice(headerIndex + 1)
        .map((row) => row.cells[map.reference!] || '')
        .map(sourceText)
        .filter(
          (value) =>
            value &&
            !(aliases.reference as readonly string[])
              .map(normalize)
              .includes(normalize(value)),
        );
      copiedSalesSheet =
        !!references.length &&
        references.every((reference) => masterSalesReferences.has(reference));
    }
    const cashbookContext =
      options.cashbook ||
      sheet.rows
        .slice(0, headerIndex)
        .some((row) =>
          /cash[\s_-]*book|សៀវភៅ.*ចំណូល.*ចំណាយ/i.test(
            row.cells.join(' ').replace(/[\u200b-\u200f\ufeff]/g, ''),
          ),
        );
    const salesInvoiceColumns = salesContext
      ? [map.vatInvoice, map.normalInvoice].filter(
          (index): index is number => index !== undefined,
        )
      : [];
    const movementColumns = header.flatMap((label, index) => {
      // Sales books may label a running balance "Amount". Invoice value comes
      // from the VAT / normal invoice columns, never from that cumulative balance.
      if (salesInvoiceColumns.length)
        return salesInvoiceColumns.includes(index)
          ? [{ index, kind: 'amount', currency: currencyOf(label) }]
          : [];
      const field = columns([label]);
      const kind =
        field.receipt !== undefined
          ? 'receipt'
          : field.payment !== undefined
            ? 'payment'
            : field.amount !== undefined
              ? 'amount'
              : null;
      return kind ? [{ index, kind, currency: currencyOf(label) }] : [];
    });
    for (const source of sheet.rows.slice(headerIndex + (subheader ? 2 : 1))) {
      const get = (key: Field) => source.cells[map[key] ?? -1]?.trim() || '';
      const description = get('description');
      if (
        /^(opening|closing|beginning|ending)\s*balance|^balance\s*(b\/?f|c\/?f|brought|carried)|^(grand\s*)?total\b|^sub\s*total\b/i.test(
          [description, get('date'), get('reference')].join(' ').trim(),
        )
      )
        continue;
      if (
        [description, get('date'), get('reference')].some((value) =>
          /^(សរុប|សាច់ប្រាក់ដើមគ្រា|សមតុល្យដើមគ្រា|សមតុល្យចុងគ្រា)/.test(value.trim()),
        )
      )
        continue;
      // Ignore repeated headers and balance-only lines, but report malformed movement rows.
      if (normalize(get('date')) === normalize(header[map.date!])) continue;
      const repeated = columns(source.cells);
      if (
        repeated.date !== undefined &&
        repeated.description !== undefined &&
        repeated.amount !== undefined
      )
        continue;
      const movements = movementColumns.map((column) => ({
        ...column,
        raw: source.cells[column.index] || '',
        value: valueNumber(source.cells[column.index] || ''),
      }));
      if (
        salesContext &&
        !get('date') &&
        !get('reference') &&
        !description &&
        !get('party') &&
        movements.some((m) => m.value > 0) &&
        movements.every(
          (m) => m.value === 0 || source.aggregateColumns?.includes(m.index),
        )
      )
        continue;
      const anonymous =
        !get('date') && !get('reference') && !description && !get('party');
      const anonymousKey = JSON.stringify([
        source.row,
        movements
          .filter((m) => m.value !== 0)
          .map((m) => [
            columns([header[m.index]]).vatInvoice !== undefined
              ? 'vat'
              : 'normal',
            m.value,
            currencyOf(m.raw) || m.currency || options.defaultCurrency,
          ]),
      ]);
      if (
        anonymous &&
        copiedSalesSheet &&
        masterAnonymousRows.has(anonymousKey)
      )
        continue;
      if (anonymous && masterSales) masterAnonymousRows.add(anonymousKey);
      if (movements.every((movement) => movement.value === 0)) continue;
      // Signatures and job titles below the table are not movement rows.
      if (
        !get('date') &&
        !movements.some(
          (movement) =>
            movement.value > 0 || movement.raw === unreadableSpreadsheetCell,
        )
      )
        continue;
      const positive = movements.filter((movement) => movement.value > 0);
      const movement = positive[0] || movements[0];
      const issues: string[] = [];
      if (
        (Object.keys(map) as Field[]).some(
          (key) =>
            !(key === 'amount' && salesInvoiceColumns.length) &&
            get(key) === unreadableSpreadsheetCell,
        ) ||
        movements.some((movement) => movement.raw === unreadableSpreadsheetCell)
      )
        issues.push(
          'A transaction cell has an error or a formula without a saved result. Recalculate and save this row.',
        );
      const warnings: string[] = [];
      const cash = movement.kind !== 'amount';
      const cashMovement =
        cash &&
        !!(
          cashbookContext ||
          /receipt|payment|cashin|cashout|^paid$|^received$|ប្រាក់ចូល|ប្រាក់ចេញ/i.test(
            normalize(header[movement.index] || ''),
          )
        );
      if (
        positive.length > 1 ||
        movements.some((movement) => Number.isNaN(movement.value))
      )
        issues.push(
          'Enter one positive Receipt or Payment on this row, not both or multiple currencies.',
        );
      const printedType = get('type').toLowerCase();
      const type = cash
        ? movement.kind === 'receipt'
          ? 'Income'
          : 'Expense'
        : /^(income|receipt|received|ចំណូល)$/.test(printedType)
          ? 'Income'
          : /^(expense|payment|paid|ចំណាយ)$/.test(printedType)
            ? 'Expense'
            : salesContext
              ? 'Income'
              : options.type;
      const amount = movement.value;
      if (!(amount > 0))
        issues.push('A positive transaction amount is required.');
      const tax = valueNumber(get('tax'));
      const subtotal = get('subtotal')
        ? valueNumber(get('subtotal'))
        : amount - tax;
      if (
        !Number.isFinite(tax) ||
        !Number.isFinite(subtotal) ||
        tax < 0 ||
        subtotal < 0 ||
        Math.round(subtotal * 100) + Math.round(tax * 100) !==
          Math.round(amount * 100)
      )
        issues.push('Subtotal plus tax must equal the total.');
      let date = '';
      const rawDate = get('date');
      try {
        date = documentDate(rawDate);
      } catch {
        issues.push('A valid, unambiguous Date is required.');
      }
      if (!description) issues.push('Description is required.');
      const printedCurrency = get('currency').toUpperCase();
      const sourceCurrency = movement.currency || currencyOf(movement.raw);
      const currency =
        printedCurrency || sourceCurrency || options.defaultCurrency || '';
      if (
        printedCurrency &&
        sourceCurrency &&
        printedCurrency !== sourceCurrency
      )
        issues.push(
          'The currency column conflicts with the movement column currency.',
        );
      if (!['USD', 'KHR'].includes(currency))
        issues.push('Select the currency for this workbook.');
      const rate =
        currency === 'KHR' ? '1' : get('rate') || options.exchangeRate || '';
      const missingRate =
        currency === 'USD' &&
        !(Number(rate) > 0 && Number.isFinite(Number(rate)));
      if (missingRate)
        warnings.push(
          'Draft: enter the KHR per USD exchange rate before submission.',
        );
      if (!get('party'))
        warnings.push(
          'Counterparty is not specified; the original cash book description is retained.',
        );
      const account = suggestAccount(type, '', description);
      const draft: TransactionRecord = {
        id: `IMPORT-${documentId}-${source.row}`,
        date,
        type,
        reference:
          !get('reference') ||
          /^(គ្មាន|none|n\/?a|[-–—])$/i.test(get('reference'))
            ? `CB-${sheet.name}-${source.row}`
            : get('reference'),
        party: get('party') || 'Cash book entry',
        description:
          description +
          (get('remark') ? '\nSource remark: ' + get('remark') : ''),
        department: options.department || 'Operations',
        category: account.name,
        amount: Number.isFinite(amount) ? String(amount) : '',
        subtotal: Number.isFinite(subtotal) ? String(subtotal) : '',
        tax: Number.isFinite(tax) ? String(tax) : '',
        currency,
        exchangeRate: missingRate ? '' : rate,
        status: 'Pending',
        approval: missingRate ? 'draft' : 'Finance review',
        owner: '',
        accountCode: account.code,
        accountName: account.name,
        journalType: cashMovement
          ? classifyJournal(type, 'Paid')
          : classifyJournal(type, 'Pending'),
        documentType: cashMovement ? 'Cash book import' : 'Spreadsheet import',
        taxTreatment: 'Review required',
        sourceDocument: { id: documentId, sheet: sheet.name, row: source.row },
      };
      const entry: CashbookRow = {
        sheet: sheet.name,
        row: source.row,
        draft,
        issues,
        warnings,
        cashMovement,
      };
      // A reference copied to another sales worksheet remains one invoice.
      // Conflicting copies require review rather than selecting a financial value silently.
      const saleKey =
        salesContext && get('reference')
          ? JSON.stringify([
              sourceText(get('reference')),
              date,
              sourceText(get('party')),
              currency,
              type,
            ])
          : '';
      const previous = saleKey ? salesEntries.get(saleKey) : undefined;
      if (previous && previous.sheet !== sheet.name) {
        if (
          previous.draft.amount !== draft.amount ||
          previous.draft.subtotal !== draft.subtotal ||
          previous.draft.tax !== draft.tax ||
          previous.draft.description?.split('\nSource remark:')[0] !==
            description
        )
          previous.issues.push(
            'Conflicting copies of this sales invoice appear in multiple worksheets. Review the source values.',
          );
        else if (entry.issues.length) previous.issues.push(...entry.issues);
        continue;
      }
      if (saleKey) salesEntries.set(saleKey, entry);
      if (masterSales && get('reference'))
        masterSalesReferences.add(sourceText(get('reference')));
      entries.push(entry);
    }
  }
  if (entries.length > 1000)
    throw new Error('Import at most 1,000 transaction rows per workbook.');
  if (!foundTable) sheetIssues.push(...unrecognizedSheets);
  return { foundTable, entries, sheetIssues };
}
