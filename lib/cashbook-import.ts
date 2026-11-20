import {
  readSpreadsheetSheets,
  unreadableSpreadsheetCell,
} from './spreadsheet-document';
import { isoDate } from './finance';
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
  value.toLowerCase().replace(/[\s_().:/#$-]+/g, '');
const aliases = {
  date: ['date', 'transactiondate', 'postingdate', 'កាលបរិច្ឆេទ'],
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
  ],
  currency: ['currency', 'ccy', 'រូបិយប័ណ្ណ'],
  rate: ['exchangerate', 'rate', 'khrperusd', 'អត្រាប្ដូរប្រាក់'],
} as const;
type Field = keyof typeof aliases;
function columns(cells: string[]) {
  const result: Partial<Record<Field, number>> = {};
  for (const key of Object.keys(aliases) as Field[]) {
    const index = cells.findIndex((cell) => {
      const name = normalize(cell).replace(/usd|khr/g, '');
      return (aliases[key] as readonly string[]).includes(name);
    });
    if (index >= 0) result[key] = index;
  }
  return result;
}
function valueNumber(value: string) {
  if (!value.trim() || /^[-–—]$/.test(value.trim())) return 0;
  const clean = value.replace(/USD|KHR|US\$|[$៛,\s]/gi, '');
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN;
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
    const header = sheet.rows[headerIndex].cells;
    const map = columns(header);
    for (const source of sheet.rows.slice(headerIndex + 1)) {
      const get = (key: Field) => source.cells[map[key] ?? -1]?.trim() || '';
      const description = get('description');
      if (
        /^(opening|closing|beginning|ending)\s*balance|^balance\s*(b\/?f|c\/?f|brought|carried)|^(grand\s*)?total\b|^sub\s*total\b/i.test(
          description,
        )
      )
        continue;
      // Ignore repeated headers and balance-only lines, but report malformed movement rows.
      if (normalize(get('date')) === normalize(header[map.date!])) continue;
      const receipt = valueNumber(get('receipt'));
      const payment = valueNumber(get('payment'));
      const direct = valueNumber(get('amount'));
      if (receipt === 0 && payment === 0 && direct === 0) continue;
      const issues: string[] = [];
      if (
        (Object.keys(map) as Field[]).some(
          (key) => get(key) === unreadableSpreadsheetCell,
        )
      )
        issues.push(
          'A transaction cell has an error or a formula without a saved result. Recalculate and save this row.',
        );
      const warnings: string[] = [];
      const cash = map.receipt !== undefined || map.payment !== undefined;
      if (
        cash &&
        (!(receipt >= 0) || !(payment >= 0) || (receipt > 0 && payment > 0))
      )
        issues.push(
          'Enter one positive Receipt or Payment on this row, not both.',
        );
      const printedType = get('type').toLowerCase();
      const type = cash
        ? receipt > 0
          ? 'Income'
          : 'Expense'
        : /^(income|receipt|received)$/.test(printedType)
          ? 'Income'
          : /^(expense|payment|paid)$/.test(printedType)
            ? 'Expense'
            : options.type;
      const amount = cash ? (receipt > 0 ? receipt : payment) : direct;
      if (!(amount > 0))
        issues.push('A positive transaction amount is required.');
      let date = '';
      const rawDate = get('date');
      try {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(rawDate) &&
          !/[A-Za-z]{3}/.test(rawDate)
        )
          throw new Error();
        date = isoDate(rawDate);
      } catch {
        issues.push('A valid, unambiguous Date is required.');
      }
      if (!description) issues.push('Description is required.');
      const amountHeader =
        header[
          cash ? (receipt > 0 ? map.receipt! : map.payment!) : map.amount!
        ] || '';
      const printedCurrency = get('currency').toUpperCase();
      const sourceCurrency = /\bUSD\b|\$/i.test(amountHeader)
        ? 'USD'
        : /\bKHR\b|៛/i.test(amountHeader)
          ? 'KHR'
          : '';
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
        reference: get('reference') || `CB-${sheet.name}-${source.row}`,
        party: get('party') || 'Cash book entry',
        description,
        department: options.department || 'Operations',
        category: account.name,
        amount: Number.isFinite(amount) ? String(amount) : '',
        subtotal: Number.isFinite(amount) ? String(amount) : '',
        tax: '0',
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
