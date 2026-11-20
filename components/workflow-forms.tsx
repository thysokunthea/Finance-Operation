'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n';
import { money } from '@/lib/finance';
import type { RequestInput, PaymentRequestItem } from '@/db/payment-requests';
import type { TransactionRecord } from '@/db/transaction-register';

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
export function PaymentForm({
  record,
  onSaved,
}: {
  record: TransactionRecord;
  onSaved: (record: TransactionRecord) => void;
}) {
  const { lang } = useLanguage();
  const l = (en: string, km: string) => (lang === 'km' ? km : en);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('Bank transfer');
  const [reference, setReference] = useState('');
  const [rate, setRate] = useState(record.exchangeRate || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(crypto.randomUUID());
  const balance = record.balance ?? 0;
  return (
    <form
      className="space-y-3 rounded-xl border p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          const result = await send('/api/payments', 'POST', {
            transactionId: record.id,
            amount: Number(amount),
            date,
            method,
            reference,
            exchangeRate: record.currency === 'KHR' ? 1 : Number(rate),
            idempotencyKey: key.current,
          });
          onSaved(result.transaction);
          key.current = crypto.randomUUID();
          setAmount('');
          setReference('');
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Payment failed.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-semibold">
        {l('Record payment / receipt', 'កត់ត្រាប្រាក់បង់ / ប្រាក់ទទួល')}
      </p>
      <p className="text-xs">
        {l('Outstanding', 'សមតុល្យនៅសល់')}: {money(balance, record.currency)}
      </p>
      <label className="block text-xs">
        {l('Amount', 'ចំនួនប្រាក់')}
        <Input
          required
          type="number"
          min="0.01"
          step="0.01"
          max={balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        {l('Payment date', 'ថ្ងៃទូទាត់')}
        <Input
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        {l('Method', 'វិធីទូទាត់')}
        <Input
          required
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        {l('Bank / receipt reference', 'លេខយោងធនាគារ / បង្កាន់ដៃ')}
        <Input
          required
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      {record.currency === 'USD' ? (
        <label className="block text-xs">
          {l('KHR per USD on payment date', 'អត្រា KHR ក្នុង 1 USD នៅថ្ងៃទូទាត់')}
          <Input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={
          busy || balance <= 0 || record.approval.toLowerCase() !== 'approved'
        }
      >
        {busy ? l('Saving…', 'កំពុងរក្សាទុក…') : l('Save payment', 'រក្សាទុកការទូទាត់')}
      </Button>
    </form>
  );
}
const blankRequest = (): RequestInput => ({
  title: '',
  category: 'Operations',
  amount: 0,
  currency: 'KHR',
  exchangeRate: '1',
  party: '',
  department: 'Operations',
  date: new Date().toISOString().slice(0, 10),
  dueDate: '',
  reference: '',
});
export function RequestWorkspace() {
  const { lang } = useLanguage();
  const l = (en: string, km: string) => (lang === 'km' ? km : en);
  const [items, setItems] = useState<PaymentRequestItem[]>([]);
  const [draft, setDraft] = useState(blankRequest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/payment-requests')
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        if (active) setItems(p.requests);
      })
      .catch((e) => {
        if (active) setError(String(e.message));
      });
    return () => {
      active = false;
    };
  }, []);
  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const p = await send('/api/payment-requests', 'POST', draft);
      setItems(p.requests);
      setDraft(blankRequest());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">
        {l('Payment requests', 'សំណើទូទាត់')}
      </h1>
      <p className="text-sm text-muted-foreground">
        {l(
          'Save a draft, submit for approval, then record payment from the approved transaction.',
          'រក្សាទុកព្រាង បញ្ជូនស្នើអនុម័ត រួចកត់ត្រាទូទាត់លើប្រតិបត្តិការដែលបានអនុម័ត។',
        )}
      </p>
      {error ? (
        <p role="alert" className="rounded-xl border p-3 text-red-600">
          {error}
        </p>
      ) : null}
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2"
      >
        {(
          [
            ['title', 'Description', 'បរិយាយ'],
            ['party', 'Vendor / payee', 'អ្នកផ្គត់ផ្គង់ / អ្នកទទួល'],
            ['reference', 'Invoice reference', 'លេខយោងវិក្កយបត្រ'],
            ['category', 'Category', 'ប្រភេទ'],
            ['department', 'Department', 'ផ្នែក'],
          ] as const
        ).map(([key, en, km]) => (
          <label key={key} className="text-sm">
            {l(en, km)}
            <Input
              required
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        <label className="text-sm">
          {l('Currency', 'រូបិយប័ណ្ណ')}
          <select
            className="block h-9 w-full rounded-lg border px-3"
            value={draft.currency}
            onChange={(e) =>
              setDraft({
                ...draft,
                currency: e.target.value,
                exchangeRate: e.target.value === 'KHR' ? '1' : '',
              })
            }
          >
            <option>KHR</option>
            <option>USD</option>
          </select>
        </label>
        <label className="text-sm">
          {l('Amount', 'ចំនួនប្រាក់')}
          <Input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={draft.amount || ''}
            onChange={(e) =>
              setDraft({ ...draft, amount: Number(e.target.value) })
            }
          />
        </label>
        {draft.currency === 'USD' ? (
          <label className="text-sm">
            {l('KHR per USD', 'អត្រា KHR ក្នុង 1 USD')}
            <Input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={draft.exchangeRate}
              onChange={(e) =>
                setDraft({ ...draft, exchangeRate: e.target.value })
              }
            />
          </label>
        ) : null}
        <label className="text-sm">
          {l('Date', 'កាលបរិច្ឆេទ')}
          <Input
            required
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </label>
        <label className="text-sm">
          {l('Due date', 'ថ្ងៃកំណត់')}
          <Input
            type="date"
            value={draft.dueDate}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
          />
        </label>
        <Button disabled={busy} type="submit">
          {l('Save draft', 'រក្សាទុកព្រាង')}
        </Button>
      </form>
      <div className="divide-y rounded-xl border bg-card">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {item.party} · {item.reference} · {item.status}
              </p>
            </div>
            <span>{money(item.amount, item.currency)}</span>
            {item.status === 'Draft' ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    ...item,
                    requestId: item.id,
                    date: item.date || new Date().toISOString().slice(0, 10),
                    exchangeRate:
                      item.currency === 'KHR' ? '1' : item.exchangeRate,
                  })
                }
              >
                {l('Edit / complete draft', 'កែប្រែ / បំពេញព្រាង')}
              </Button>
            ) : null}
            {item.canSubmit ? (
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const p = await send('/api/payment-requests', 'PATCH', {
                      id: item.id,
                    });
                    setItems(p.requests);
                    window.dispatchEvent(
                      new Event('ledgerflow-approvals-changed'),
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Submission failed.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {l('Submit for approval', 'បញ្ជូនស្នើអនុម័ត')}
              </Button>
            ) : item.party ? (
              <a
                className="text-sm text-primary underline"
                href={'/transactions?search=' + encodeURIComponent(item.id)}
              >
                {l('View transaction', 'មើលប្រតិបត្តិការ')}
              </a>
            ) : (
              <span className="text-xs text-amber-700">
                {l(
                  'Complete the draft details before submitting.',
                  'បំពេញព័ត៌មានព្រាងមុនបញ្ជូនស្នើអនុម័ត។',
                )}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
