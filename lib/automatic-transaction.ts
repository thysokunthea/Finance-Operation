import { minor } from './finance';
import { documentDate } from './document-date';
import { parseCsv } from './csv';
import { classifyJournal, suggestAccount } from './chart-of-accounts';
import type { TransactionRecord } from '@/db/transaction-register';

export type AutomaticOptions = {
  type: 'Income' | 'Expense';
  exchangeRate?: string;
  department?: string;
};
/** Auto-create only from explicit labels. Uncertain/missing values are sent to review. */
export function planAutomaticTransaction(
  text: string,
  documentId: string,
  options: AutomaticOptions,
) {
  const issues: string[] = [];
  let source = text;
  const fieldName = (key: string) =>
    key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s*[:：]$/, '')
      .trim();
  const isField = (key: string) =>
    /^(invoice (no\.?|number)|receipt (no\.?|number)|reference|reference number|date|invoice date|issue date|description|details|vendor|supplier|customer|currency|amount|total|grand total|subtotal|tax|exchange rate|type|transaction type|department|លេខវិក្កយបត្រ|អ្នកផ្គត់ផ្គង់|អតិថិជន|កាលបរិច្ឆេទ|បរិយាយ|រូបិយប័ណ្ណ|សរុប)$/i.test(
      fieldName(key),
    );
  try {
    const rows = parseCsv(text);
    if (rows.length === 2 && rows[0].length > 1 && rows[0].every(isField))
      source = rows[0]
        .map((key, index) => fieldName(key) + ': ' + (rows[1][index] || ''))
        .join('\n');
    else if (
      rows.length &&
      rows.every((row) => row.length === 2 && isField(row[0]))
    )
      source = rows
        .map(([key, value]) => fieldName(key) + ': ' + value)
        .join('\n');
    else if (rows.length > 2 && rows[0].length > 1 && rows[0].every(isField))
      issues.push(
        'The table contains multiple transactions. Use the CSV Import workflow or upload one invoice at a time.',
      );
  } catch {
    /* Normal invoice text may contain commas without being a CSV. */
  }
  const lines = source
    .replace(/[\u200b-\u200f\ufeff]/g, '')
    .replace(/[០-៩]/g, (digit) =>
      String(digit.charCodeAt(0) - '០'.charCodeAt(0)),
    )
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const labeled = (labels: string[]) => {
    for (const label of labels) {
      const expression = new RegExp(
        '^' +
          label +
          '(?:\\s*/\\s*[^:#៖]+(?=[:#៖]))?(?:\\s*[:#៖]+\\s*|\\s+)(.+)$',
        'i',
      );
      const found = lines.map((line) => line.match(expression)).find(Boolean);
      if (found) return found[1].trim();
    }
    return '';
  };
  const numeric = (value: string) => {
    const match = value.match(
      /^(?:USD|KHR|US\$|ដុល្លារ|រៀល|[$៛])?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:USD|KHR|ដុល្លារ|រៀល)?$/i,
    );
    return match ? match[1].replaceAll(',', '') : '';
  };
  const reference = labeled([
    'invoice (?:number|no\\.?|#)',
    'receipt (?:number|no\\.?|#)',
    'reference(?: number| no\\.?)?',
    'bill (?:number|no\\.?)',
    'លេខវិក្កយបត្រ',
    'លេខបង្កាន់ដៃ',
    'លេខយោង',
  ]);
  const references = lines.filter((line) =>
    /^(?:(?:invoice|receipt|bill)\s+(?:number|no\.?|#)|លេខវិក្កយបត្រ|លេខបង្កាន់ដៃ|លេខយោង)\s*[:#៖]?\s+/i.test(
      line,
    ),
  );
  if (new Set(references).size > 1)
    issues.push(
      'Multiple invoice references detected; split or review the document.',
    );
  const party = labeled(
    options.type === 'Income'
      ? [
          'customer',
          'client',
          'bill to',
          'received from',
          'payer',
          'អតិថិជន',
          'អ្នកបង់ប្រាក់',
        ]
      : [
          'vendor',
          'supplier',
          'merchant',
          'bill from',
          'sold by',
          'payee',
          'អ្នកផ្គត់ផ្គង់',
          'ឈ្មោះអ្នកផ្គត់ផ្គង់',
          'អាជីវករ',
          'អ្នកទទួល',
        ],
  );
  const description = labeled([
    'description',
    'details',
    'purpose',
    'memo',
    'បរិយាយ',
    'មុខទំនិញ',
    'ព័ត៌មានលម្អិត',
  ]);
  const totalLabel = labeled([
    'grand total',
    'invoice total',
    'total amount',
    'amount due',
    'total due',
    'total',
    'amount',
    'សរុបរួម',
    'ចំនួនសរុប',
    'ប្រាក់សរុប',
    'សរុប',
  ]);
  const amount = numeric(totalLabel);
  const rawCurrency = labeled(['currency', 'រូបិយប័ណ្ណ']).toUpperCase();
  const currencyLabel =
    rawCurrency === 'ដុល្លារ'
      ? 'USD'
      : rawCurrency === 'រៀល'
        ? 'KHR'
        : rawCurrency;
  const totalCurrency = /\bUSD\b|US\$|\$|ដុល្លារ/i.test(totalLabel)
    ? 'USD'
    : /\bKHR\b|៛|រៀល/i.test(totalLabel)
      ? 'KHR'
      : '';
  const currency = currencyLabel || totalCurrency;
  if (currencyLabel && totalCurrency && currencyLabel !== totalCurrency)
    issues.push('The total currency conflicts with the currency label.');
  const rawDate = labeled([
    'issue date',
    'invoice date',
    'receipt date',
    'date',
    'កាលបរិច្ឆេទ',
    'ថ្ងៃខែ',
    'ថ្ងៃចេញវិក្កយបត្រ',
    'ថ្ងៃចេញ',
  ]);
  let date = '';
  try {
    date = documentDate(rawDate);
  } catch {
    issues.push('A clearly labeled, unambiguous document date is required.');
  }
  const taxLabel = labeled([
    'tax amount',
    'vat amount',
    'tax',
    'vat',
    'ពន្ធ',
    'អាករ',
    'អាករលើតម្លៃបន្ថែម',
  ]);
  const subtotalLabel = labeled([
    'subtotal',
    'sub total',
    'amount before tax',
    'សរុបមុនពន្ធ',
    'តម្លៃមុនពន្ធ',
  ]);
  const tax = taxLabel ? numeric(taxLabel) : '0';
  const subtotal = subtotalLabel
    ? numeric(subtotalLabel)
    : amount && tax
      ? String((minor(amount) - minor(tax)) / 100)
      : '';
  if (taxLabel && !tax) issues.push('Tax could not be read reliably.');
  if (subtotalLabel && !subtotal)
    issues.push('Subtotal could not be read reliably.');
  if (
    amount &&
    subtotal &&
    tax &&
    minor(subtotal) + minor(tax) !== minor(amount)
  )
    issues.push('Subtotal plus tax does not equal total.');
  if (!reference) issues.push('Invoice or receipt reference is missing.');
  if (!party) issues.push('A labeled customer or vendor is required.');
  if (!description) issues.push('A labeled description is required.');
  if (!amount || Number(amount) <= 0)
    issues.push('A clearly labeled positive total is required.');
  if (!['USD', 'KHR'].includes(currency))
    issues.push('Currency must be explicitly USD or KHR.');
  if (!['Income', 'Expense'].includes(options.type))
    issues.push('Select Income or Expense.');
  const printedType = labeled(['transaction type', 'type']).toLowerCase();
  if (printedType && printedType !== options.type?.toLowerCase())
    issues.push(
      'The document transaction type conflicts with the selected Income / Expense type.',
    );
  const rate =
    currency === 'KHR'
      ? '1'
      : labeled([
          'exchange rate',
          'khr per usd',
          'អត្រាប្តូរប្រាក់',
          'ប្រាក់រៀលក្នុងមួយដុល្លារ',
        ]) ||
        options.exchangeRate ||
        '';
  if (
    currency === 'USD' &&
    !(Number.isFinite(Number(rate)) && Number(rate) > 0)
  )
    issues.push('Enter the KHR per USD exchange rate.');
  const account = suggestAccount(options.type, '', description);
  const draft: TransactionRecord = {
    id: 'AUTO-' + documentId,
    date,
    type: options.type,
    reference,
    party,
    department: options.department?.trim() || 'Operations',
    category: account.name,
    description,
    amount,
    subtotal,
    tax,
    currency,
    exchangeRate: rate,
    status: 'Pending',
    approval: 'Finance review',
    owner: '',
    documentType: 'Uploaded document',
    journalType: classifyJournal(options.type, 'Pending'),
    accountCode: account.code,
    accountName: account.name,
    taxTreatment: 'Review required',
    documentIds: [documentId],
  };
  return {
    issues: issues[0]?.includes('multiple transactions') ? [issues[0]] : issues,
    draft,
  };
}
