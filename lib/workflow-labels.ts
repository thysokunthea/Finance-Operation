const khmer: Record<string, string> = {
  'Totals in USD · approved income / expenses · cash uses payment dates':
    'សរុបជា USD · ចំណូល/ចំណាយដែលបានអនុម័ត · សាច់ប្រាក់គិតតាមថ្ងៃទូទាត់',
  'Enter a KHR per USD rate to include KHR transactions and budgets in USD totals.':
    'បញ្ចូលអត្រា KHR ក្នុង 1 USD ដើម្បីរាប់ប្រតិបត្តិការ និងថវិកា KHR ក្នុងសរុប USD។',
  'Task name': 'ឈ្មោះការងារ',
  Category: 'ប្រភេទ',
  'Related reference': 'លេខយោង',
  Priority: 'អាទិភាព',
  Status: 'ស្ថានភាព',
  Edit: 'កែប្រែ',
  'Reason for rejection': 'មូលហេតុបដិសេធ',
  Reject: 'បដិសេធ',
  Period: 'ខែ',
  'Reason to close / reopen': 'មូលហេតុបិទ / បើកឡើងវិញ',
  'Reopen period': 'បើកខែឡើងវិញ',
  'Close & lock period': 'បិទខែ និងចាក់សោ',
  Locked: 'បានចាក់សោ',
  Open: 'បើក',
  'Totals in KHR; individual balances retain their original currency.':
    'សរុបជា KHR; ជួរនីមួយៗបង្ហាញរូបិយប័ណ្ណដើម។',
  'Records missing exchange rates are excluded from KHR totals.':
    'ប្រតិបត្តិការខ្វះអត្រាប្តូរប្រាក់មិនបានបញ្ចូលក្នុងសរុប KHR។',
  'Transaction reference': 'លេខយោងប្រតិបត្តិការ',
  'Link & verify': 'ភ្ជាប់ និងផ្ទៀងផ្ទាត់',
  'Totals in KHR · approved income / expenses · cash uses payment dates':
    'សរុបជា KHR · ចំណូល/ចំណាយដែលបានអនុម័ត · សាច់ប្រាក់គិតតាមថ្ងៃទូទាត់',
  'Records missing exchange rates are excluded from totals. Update them first.':
    'ប្រតិបត្តិការខ្វះអត្រាប្តូរប្រាក់មិនបានបញ្ចូលក្នុងសរុប។ សូមកែវាជាមុន។',
};
export function workflowLabel(lang: string, english: string) {
  return lang === 'km' ? khmer[english] || english : english;
}
