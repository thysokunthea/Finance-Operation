export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type Account = {
  code: string;
  name: string;
  type: AccountType;
};

/**
 * A simplified Cambodia SME / small-taxpayer chart of accounts. Intentionally
 * small and practical rather than exhaustive (GDT small-taxpayer bookkeeping
 * does not require the full chart a medium/large taxpayer under CIFRS would
 * use) — enough to tag every transaction with a sensible account without
 * forcing full double-entry posting.
 */
export const chartOfAccounts: Account[] = [
  { code: '1000', name: 'Cash on Hand', type: 'asset' },
  { code: '1010', name: 'Bank — KHR', type: 'asset' },
  { code: '1020', name: 'Bank — USD', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset' },
  { code: '1200', name: 'VAT Input (Receivable)', type: 'asset' },
  { code: '1300', name: 'Prepaid Expenses', type: 'asset' },
  { code: '1500', name: 'Fixed Assets', type: 'asset' },
  { code: '2100', name: 'Accounts Payable', type: 'liability' },
  { code: '2200', name: 'VAT Output (Payable)', type: 'liability' },
  { code: '2300', name: 'Salary Payable', type: 'liability' },
  { code: '2400', name: 'Tax on Profit Payable', type: 'liability' },
  { code: '2500', name: 'Other Payable', type: 'liability' },
  { code: '3000', name: "Owner's Capital", type: 'equity' },
  { code: '3100', name: 'Retained Earnings', type: 'equity' },
  { code: '4000', name: 'Service Revenue', type: 'revenue' },
  { code: '4010', name: 'Product Sales Revenue', type: 'revenue' },
  { code: '4100', name: 'Other Income', type: 'revenue' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
  { code: '6000', name: 'Salaries & Wages', type: 'expense' },
  { code: '6010', name: 'Rent Expense', type: 'expense' },
  { code: '6020', name: 'Utilities Expense', type: 'expense' },
  { code: '6030', name: 'Office Supplies', type: 'expense' },
  { code: '6040', name: 'Software & Subscriptions', type: 'expense' },
  { code: '6050', name: 'Marketing & Advertising', type: 'expense' },
  { code: '6060', name: 'Travel Expense', type: 'expense' },
  { code: '6070', name: 'Freight & Delivery', type: 'expense' },
  { code: '6080', name: 'Professional Fees', type: 'expense' },
  { code: '6090', name: 'Bank Charges', type: 'expense' },
  { code: '6100', name: 'Depreciation Expense', type: 'expense' },
  { code: '6900', name: 'Other Expense', type: 'expense' },
];

export function getAccount(code: string): Account | undefined {
  return chartOfAccounts.find((account) => account.code === code);
}

export const journalTypes = ['sales', 'purchases', 'cash_receipts', 'cash_disbursements', 'general'] as const;
export type JournalType = (typeof journalTypes)[number];

/**
 * One journal tag per transaction (not full double-entry): an unpaid
 * Income/Expense transaction is the sale/purchase being recorded (Sales /
 * Purchases Journal); once it is Paid, it represents the cash actually
 * moving (Cash Receipts / Cash Disbursements Journal). General Journal is
 * reserved for manual reclassification (adjustments, accruals, etc.).
 */
export function classifyJournal(type: string, status: string): JournalType {
  const paid = status.toLowerCase() === 'paid';
  if (type === 'Income') return paid ? 'cash_receipts' : 'sales';
  if (type === 'Expense') return paid ? 'cash_disbursements' : 'purchases';
  return 'general';
}

export function suggestAccount(type: string, category: string, description: string): Account {
  const text = `${category} ${description}`.toLowerCase();
  if (type === 'Income') {
    if (/service|consult/.test(text)) return getAccount('4000')!;
    if (/other|misc/.test(text)) return getAccount('4100')!;
    return getAccount('4010')!;
  }
  if (/cost of goods|cogs|inventory|merchandise/.test(text)) return getAccount('5000')!;
  if (/salary|wage|payroll/.test(text)) return getAccount('6000')!;
  if (/rent|facility/.test(text)) return getAccount('6010')!;
  if (/electric|water|utilit/.test(text)) return getAccount('6020')!;
  if (/office|supplies|stationery/.test(text)) return getAccount('6030')!;
  if (/software|subscription|cloud|hosting/.test(text)) return getAccount('6040')!;
  if (/marketing|advertis/.test(text)) return getAccount('6050')!;
  if (/travel|hotel|flight|taxi/.test(text)) return getAccount('6060')!;
  if (/freight|delivery|shipping|logistics/.test(text)) return getAccount('6070')!;
  if (/legal|audit|professional/.test(text)) return getAccount('6080')!;
  if (/bank charge|bank fee/.test(text)) return getAccount('6090')!;
  if (/depreciation/.test(text)) return getAccount('6100')!;
  return getAccount('6900')!;
}
