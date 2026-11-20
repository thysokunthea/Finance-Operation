export type ScannedTransaction = {
  type: 'Income' | 'Expense';
  documentType: string;
  date: string;
  dueDate: string;
  reference: string;
  party: string;
  description: string;
  category: string;
  currency: string;
  subtotal: string;
  tax: string;
  amount: string;
  paymentMethod: string;
  purchaseOrder: string;
  confidence: number;
  warnings: string[];
};

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export function parseDocument(
  text: string,
  t: TranslateFn,
): ScannedTransaction {
  const cleaned = text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');
  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const lower = cleaned.toLowerCase();
  const documentType = /purchase\s*order|\bpo\b/i.test(cleaned)
    ? 'Purchase order'
    : /receipt|amount received|paid/i.test(cleaned)
      ? 'Receipt'
      : /invoice|tax invoice|bill/i.test(cleaned)
        ? 'Invoice'
        : /payment|transfer|remittance/i.test(cleaned)
          ? 'Payment evidence'
          : 'Financial document';
  const reference =
    labeledText(lines, [
      'invoice number',
      'invoice no',
      'invoice #',
      'receipt number',
      'receipt no',
      'receipt #',
      'bill number',
      'bill no',
      'reference number',
      'reference no',
      'ref no',
      'document no',
    ]) ||
    cleaned.match(/\b(?:INV|RCT|REC|BILL)[-/# ]?[A-Z0-9-]{3,}\b/i)?.[0] ||
    '';
  const purchaseOrder =
    labeledText(lines, ['purchase order', 'po number', 'po no', 'p.o. no']) ||
    cleaned.match(/\bPO[-/# ]?[A-Z0-9-]{3,}\b/i)?.[0] ||
    '';
  const dueDate =
    inlineLabeledDate(cleaned, ['payment due', 'due date', 'due']) ||
    labeledDate(lines, ['payment due', 'due date', 'due']) ||
    '';
  const date =
    inlineLabeledDate(cleaned, [
      'issue date',
      'invoice date',
      'receipt date',
      'document date',
      'issued',
      'date',
    ]) ||
    labeledDate(lines, [
      'issue date',
      'invoice date',
      'receipt date',
      'document date',
      'issued',
      'date',
    ]) ||
    findDates(cleaned).find((value) => value !== dueDate) ||
    '';
  const total = labeledAmount(lines, [
    'grand total',
    'total due',
    'amount due',
    'balance due',
    'invoice total',
    'net total',
    'total amount',
    'total',
  ]);
  const subtotal = labeledAmount(lines, [
    'sub total',
    'subtotal',
    'net amount',
    'amount before tax',
  ]);
  const tax = labeledAmount(lines, [
    'tax amount',
    'vat amount',
    'gst amount',
    'sales tax',
    'vat',
    'gst',
    'tax',
  ]);
  const allAmounts = extractAmounts(cleaned);
  const amount =
    total || (allAmounts.length ? Math.max(...allAmounts).toFixed(2) : '');
  const party =
    cleanValue(
      labeledText(lines, [
        'vendor',
        'supplier',
        'merchant',
        'merchant name',
        'bill from',
        'sold by',
        'beneficiary',
        'beneficiary name',
        'payee',
        'payer',
        'sender',
        'paid to',
        'received from',
        'from',
        'customer',
        'client',
      ]),
    ) ||
    lines.find((line, index) => index < 10 && isLikelyParty(line)) ||
    '';
  const description = findDescription(lines, cleaned);
  const paymentMethodMatch =
    cleaned.match(
      /\b(?:payment method|paid by|method)\s*[:#-]?\s*(cash|credit card|debit card|card|bank transfer|wire transfer|ach|cheque|check)\b/i,
    )?.[1] ||
    cleaned.match(
      /\b(cash|credit card|debit card|bank transfer|wire transfer|ach|cheque)\b/i,
    )?.[1] ||
    '';
  const paymentMethod = paymentMethodMatch.replace(/\b\w/g, (character) =>
    character.toUpperCase(),
  );
  const currency = detectCurrency(cleaned);
  const type: 'Income' | 'Expense' =
    /amount received|payment received|bill to|invoice to|customer/i.test(
      cleaned,
    ) && !/bill from|vendor|supplier/i.test(cleaned)
      ? 'Income'
      : 'Expense';
  const category = categorize(
    `${description} ${party} ${cleaned.slice(0, 800)}`,
    type,
  );
  const warnings: string[] = [];
  if (!party) warnings.push(t('scan.warnPartyNotDetected'));
  if (!reference) warnings.push(t('scan.warnReferenceMissing'));
  if (!date) warnings.push(t('scan.warnDateMissing'));
  if (!description) warnings.push(t('scan.warnDescriptionMissing'));
  if (!amount) warnings.push(t('scan.warnAmountMissing'));
  if (
    subtotal &&
    tax &&
    amount &&
    Math.abs(Number(subtotal) + Number(tax) - Number(amount)) > 0.02
  )
    warnings.push(t('scan.warnSubtotalTaxMismatch'));
  if (
    type === 'Expense' &&
    !/vendor|supplier|bill from|receipt|purchase/i.test(lower)
  )
    warnings.push(t('scan.warnDefaultedExpense'));
  const score = [party, reference, date, amount, currency, description].filter(
    Boolean,
  ).length;
  const confidence = Math.min(
    96,
    34 +
      score * 10 +
      (total ? 8 : 0) +
      (documentType !== 'Financial document' ? 6 : 0),
  );
  return {
    type,
    documentType,
    date,
    dueDate,
    reference: cleanValue(reference),
    party: cleanValue(party),
    description: cleanValue(description),
    category,
    currency,
    subtotal,
    tax,
    amount,
    paymentMethod,
    purchaseOrder: cleanValue(purchaseOrder),
    confidence,
    warnings,
  };
}

function labeledText(lines: string[], labels: string[]) {
  const pattern = new RegExp(
    `^(?:${labels.map(escapeRegExp).join('|')})\\s*(?:no\\.?|number|#)?\\s*[:#-]?\\s*(.+)$`,
    'i',
  );
  for (const line of lines) {
    const match = line.match(pattern);
    if (match?.[1] && match[1].trim().length > 1) return match[1].trim();
  }
  return '';
}
function labeledDate(lines: string[], labels: string[]) {
  const value = labeledText(lines, labels);
  return findDates(value)[0] || '';
}
function inlineLabeledDate(value: string, labels: string[]) {
  for (const label of labels) {
    const match = value.match(
      new RegExp(
        `\\b${escapeRegExp(label)}\\b\\s*[:#-]?\\s*([^\\n]{0,60})`,
        'i',
      ),
    );
    const detected = findDates(match?.[1] || '')[0];
    if (detected) return detected;
  }
  return '';
}
function findDates(value: string) {
  return (
    value.match(
      /\b(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})\b/gi,
    ) || []
  );
}
function findDescription(lines: string[], value: string) {
  const label =
    /\b(?:description|item description|service description|particulars|details|memo|purpose)\b/i;
  for (let index = 0; index < lines.length; index += 1) {
    if (!label.test(lines[index])) continue;
    const sameLine = cleanDescription(
      lines[index].replace(label, '').replace(/^\s*[:#-]\s*/, ''),
    );
    if (sameLine) return sameLine;
    for (
      let next = index + 1;
      next < Math.min(lines.length, index + 7);
      next += 1
    ) {
      const candidate = cleanDescription(lines[next]);
      if (candidate) return candidate;
    }
  }
  const inline =
    value.match(
      /\b(?:description|item description|service description|particulars|details|memo|purpose)\b\s*[:#-]?\s*(.+?)(?=\b(?:qty|quantity|unit price|rate|amount|subtotal|tax|vat|total|issue date|due date)\b|\n|$)/i,
    )?.[1] || '';
  const cleanedInline = cleanDescription(inline);
  if (cleanedInline) return cleanedInline;
  const itemLine = lines.find(
    (line) =>
      /[A-Za-z]{3}/.test(line) &&
      /(?:\d+[.,]\d{2})/.test(line) &&
      !/(subtotal|tax|vat|total|amount due)/i.test(line),
  );
  if (itemLine)
    return cleanValue(
      itemLine.replace(/\s+\d+(?:[.,]\d{2})?(?:\s+\d+(?:[.,]\d{2})?)*\s*$/, ''),
    );
  return cleanValue(
    lines.find(
      (line) =>
        /\b(service|subscription|consulting|software|equipment|supplies|freight|rent|fee|product|goods)\b/i.test(
          line,
        ) && !/(subtotal|tax|total)/i.test(line),
    ) || '',
  );
}
function cleanDescription(value: string) {
  const cleaned = cleanValue(
    value.replace(/\b(?:qty|quantity|unit price|rate|amount)\b.*$/i, ''),
  );
  if (
    cleaned.length < 3 ||
    /^(?:description|item|service|particulars|details)$/i.test(cleaned) ||
    /^(?:qty|quantity|unit price|rate|amount)$/i.test(cleaned)
  )
    return '';
  return cleaned.slice(0, 240);
}
function labeledAmount(lines: string[], labels: string[]) {
  const labelPattern = new RegExp(
    `\\b(?:${labels.map(escapeRegExp).join('|')})\\b`,
    'i',
  );
  for (const line of lines) {
    if (!labelPattern.test(line)) continue;
    const values = extractAmounts(line.replace(labelPattern, ''));
    if (values.length) return values[values.length - 1].toFixed(2);
  }
  return '';
}
function extractAmounts(value: string) {
  return Array.from(
    value.matchAll(
      /(?:USD|US\$|KHR|EUR|GBP|THB|[$€£฿៛])?\s*(-?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{2}))(?!\d)/gi,
    ),
  )
    .map((match) =>
      Number(match[1].replace(/[ ,](?=\d{3}(?:\D|$))/g, '').replace(',', '.')),
    )
    .filter(
      (number) => Number.isFinite(number) && Math.abs(number) < 1_000_000_000,
    )
    .map(Math.abs);
}
function detectCurrency(value: string) {
  if (/\bKHR\b|៛/i.test(value)) return 'KHR';
  if (/\bEUR\b|€/i.test(value)) return 'EUR';
  if (/\bGBP\b|£/i.test(value)) return 'GBP';
  if (/\bTHB\b|฿/i.test(value)) return 'THB';
  if (/\bUSD\b|US\$|\$/i.test(value)) return 'USD';
  return '';
}
function categorize(value: string, type: 'Income' | 'Expense') {
  if (type === 'Income')
    return /service|consult/i.test(value)
      ? 'Service revenue'
      : 'Product revenue';
  if (/software|subscription|cloud|hosting/i.test(value))
    return 'Software & subscriptions';
  if (/freight|delivery|shipping|logistics/i.test(value))
    return 'Freight & delivery';
  if (/rent|facility|utilities|electric|water/i.test(value))
    return 'Facilities';
  if (/marketing|advertis/i.test(value)) return 'Marketing services';
  if (/travel|hotel|flight|taxi/i.test(value)) return 'Travel';
  if (/office|supplies|stationery/i.test(value)) return 'Office supplies';
  return 'Scanned document';
}
function isLikelyParty(line: string) {
  return (
    /[A-Za-z]{3}/.test(line) &&
    line.length >= 3 &&
    line.length <= 80 &&
    !/(invoice|receipt|tax|total|amount|date|bill|statement|address|phone|email|www\.|page|description|quantity|price|swift|iban|bank|account\s*(?:no|number)?|routing|sort\s*code|currency|exchange\s*rate|reference|transaction\s*id|qr\s*code|branch)/i.test(
      line,
    ) &&
    !/^\d/.test(line)
  );
}
function cleanValue(value: string) {
  return value.replace(/^[:#\-\s]+|\s{2,}/g, ' ').trim();
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
