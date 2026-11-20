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
};
export type CashbookRow = {
  sheet: string;
  row: number;
  draft: TransactionRecord;
  issues: string[];
  warnings: string[];
};
const normalize = (value: string) =>
  value.toLowerCase().replace(/[\s\u200b-\u200f\ufeff_().:/#$-]+/g, '');
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
  amount: ['amount', 'total', 'totalamount', 'ចំនួនទឹកប្រាក់'],
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
  ],
  party: [
    'party',
    'counterparty',
    'vendor',
    'supplier',
    'customer',
    'payee',
    'payer',
    'អតិថិជន',
    'អ្នកផ្គត់ផ្គង់',
    'ឈ្មោះអ្នកផ្គត់ផ្គង់',
  ],
  currency: ['currency', 'ccy', 'រូបិយប័ណ្ណ'],
  rate: ['exchangerate', 'rate', 'khrperusd', 'អត្រាប្ដូរប្រាក់'],
  tax: ['tax', 'vat', 'taxamount', 'vatamount', 'ពន្ធ', 'អាករ'],
  subtotal: ['subtotal', 'amountbeforetax', 'សរុបមុនពន្ធ'],
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
  let foundTable = false;
  for (const sheet of sheets) {
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
      sheetIssues.push(sheet.name + ': no transaction table found.');
      continue;
    }
    foundTable = true;
    const { header, subheader } = tableHeader(
      sheet.rows[headerIndex].cells,
      sheet.rows[headerIndex + 1]?.cells,
    );
    const map = columns(header);
    const movementColumns = header.flatMap((label, index) => {
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
      const movements = movementColumns.map((column) => ({
        ...column,
        raw: source.cells[column.index] || '',
        value: valueNumber(source.cells[column.index] || ''),
      }));
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
          (key) => get(key) === unreadableSpreadsheetCell,
        ) ||
        movements.some((movement) => movement.raw === unreadableSpreadsheetCell)
      )
        issues.push(
          'A transaction cell has an error or a formula without a saved result. Recalculate and save this row.',
        );
      const warnings: string[] = [];
      const cash = movement.kind !== 'amount';
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
      const sourceCurrency = movement.currency;
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
        description,
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
        journalType: cash
          ? classifyJournal(type, 'Paid')
          : classifyJournal(type, 'Pending'),
        documentType: 'Cash book import',
        taxTreatment: 'Review required',
        sourceDocument: { id: documentId, sheet: sheet.name, row: source.row },
      };
      entries.push({
        sheet: sheet.name,
        row: source.row,
        draft,
        issues,
        warnings,
      });
    }
  }
  if (entries.length > 1000)
    throw new Error('Import at most 1,000 transaction rows per workbook.');
  return { foundTable, entries, sheetIssues };
}
