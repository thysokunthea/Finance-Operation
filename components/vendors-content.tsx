'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus, Search, Pencil, Building2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useLanguage } from '@/lib/i18n';
import type { Vendor } from '@/db/vendors';

const empty = (): Partial<Vendor> => ({
  name: '',
  kind: 'Vendor',
  email: '',
  phone: '',
  address: '',
  taxId: '',
  contact: '',
  status: 'Active',
});
export function VendorsContent() {
  const { lang } = useLanguage();
  const text = (en: string, km: string) => (lang === 'km' ? km : en);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Partial<Vendor> | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/vendors', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (active) {
          setVendors(payload.vendors);
          setCanWrite(payload.canWrite);
        }
      })
      .catch((error) => {
        if (active) {
          setNotice(error.message);
          setFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setVendors(payload.vendors);
      setDraft(null);
      setFailed(false);
      setNotice(text('Contact saved.', 'បានរក្សាទុកព័ត៌មាន។'));
    } catch (error) {
      setFailed(true);
      setNotice(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }
  const visible = vendors.filter((v) =>
    `${v.name} ${v.contact} ${v.email} ${v.phone} ${v.taxId}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {text('Vendors & Suppliers', 'អ្នកលក់ និងអ្នកផ្គត់ផ្គង់')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {text(
              'Manage contacts for expenses, purchases and payables.',
              'គ្រប់គ្រងព័ត៌មានសម្រាប់ចំណាយ ការទិញ និងគណនីត្រូវសង។',
            )}
          </p>
        </div>
        <Button
          disabled={!canWrite || loading}
          onClick={() => {
            setDraft(empty());
            setNotice('');
          }}
        >
          <Plus />
          {text('Add contact', 'បន្ថែមអ្នកផ្គត់ផ្គង់')}
        </Button>
      </div>
      {notice && (
        <p
          role={failed ? 'alert' : 'status'}
          className={`rounded-xl border p-3 text-sm ${failed ? 'border-red-200 text-red-700' : 'text-emerald-700'}`}
        >
          {notice}
        </p>
      )}
      {draft && (
        <form
          onSubmit={save}
          className="space-y-4 rounded-2xl border bg-card p-5"
        >
          <h2 className="font-semibold">
            {draft.id
              ? text('Edit contact', 'កែព័ត៌មាន')
              : text('New contact', 'ព័ត៌មានថ្មី')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ['name', text('Name', 'ឈ្មោះ')],
                ['contact', text('Contact person', 'អ្នកទំនាក់ទំនង')],
                ['phone', text('Phone', 'លេខទូរស័ព្ទ')],
                ['email', text('Email', 'អ៊ីមែល')],
                ['taxId', text('Tax ID / VAT number', 'លេខអត្តសញ្ញាណកម្មសារពើពន្ធ')],
                ['address', text('Address', 'អាសយដ្ឋាន')],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-2 text-sm">
                <span>
                  {label}
                  {key === 'name' ? ' *' : ''}
                </span>
                <Input
                  required={key === 'name'}
                  type={
                    key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'
                  }
                  maxLength={
                    key === 'address'
                      ? 1000
                      : key === 'email'
                        ? 254
                        : key === 'phone'
                          ? 80
                          : key === 'taxId'
                            ? 100
                            : 200
                  }
                  value={draft[key] || ''}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              </label>
            ))}
            <label className="space-y-2 text-sm">
              <span>{text('Type', 'ប្រភេទ')}</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3"
                value={draft.kind}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    kind: event.target.value as Vendor['kind'],
                  })
                }
              >
                <option value="Vendor">{text('Vendor', 'អ្នកលក់')}</option>
                <option value="Supplier">{text('Supplier', 'អ្នកផ្គត់ផ្គង់')}</option>
                <option value="Both">
                  {text('Vendor & Supplier', 'អ្នកលក់ និងអ្នកផ្គត់ផ្គង់')}
                </option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span>{text('Status', 'ស្ថានភាព')}</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3"
                value={draft.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    status: event.target.value as Vendor['status'],
                  })
                }
              >
                <option value="Active">{text('Active', 'កំពុងប្រើ')}</option>
                <option value="Inactive">{text('Inactive', 'ឈប់ប្រើ')}</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving
                ? text('Saving…', 'កំពុងរក្សាទុក…')
                : text('Save contact', 'រក្សាទុក')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              {text('Cancel', 'បោះបង់')}
            </Button>
          </div>
        </form>
      )}
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <p className="font-medium">
            {visible.length} {text('contacts', 'អ្នកផ្គត់ផ្គង់')}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label={text('Search contacts', 'ស្វែងរកអ្នកផ្គត់ផ្គង់')}
              placeholder={text('Search contacts…', 'ស្វែងរក…')}
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <output className="block p-8 text-center text-muted-foreground">
            {text('Loading contacts…', 'កំពុងទាញយកព័ត៌មាន…')}
          </output>
        ) : visible.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {[
                    text('Name / Type', 'ឈ្មោះ / ប្រភេទ'),
                    text('Contact', 'ទំនាក់ទំនង'),
                    text('Tax ID', 'លេខពន្ធ'),
                    text('Status', 'ស្ថានភាព'),
                    text('Actions', 'សកម្មភាព'),
                  ].map((label) => (
                    <th key={label} className="p-4 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="p-4">
                      <p className="font-medium">{v.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.kind === 'Both'
                          ? text('Vendor & Supplier', 'អ្នកលក់ និងអ្នកផ្គត់ផ្គង់')
                          : v.kind === 'Supplier'
                            ? text('Supplier', 'អ្នកផ្គត់ផ្គង់')
                            : text('Vendor', 'អ្នកលក់')}
                      </p>
                      {v.address && (
                        <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">
                          {v.address}
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      <p>{v.contact}</p>
                      <p>{v.email}</p>
                      <p>{v.phone}</p>
                      {!v.contact && !v.email && !v.phone ? '—' : null}
                    </td>
                    <td className="p-4">{v.taxId || '—'}</td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${v.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {v.status === 'Active'
                          ? text('Active', 'កំពុងប្រើ')
                          : text('Inactive', 'ឈប់ប្រើ')}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          aria-label={
                            text('Edit contact', 'កែព័ត៌មាន') + ': ' + v.name
                          }
                          size="sm"
                          variant="outline"
                          disabled={!canWrite}
                          onClick={() => {
                            setDraft({ ...v });
                            setNotice('');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          <Pencil className="size-3" />
                          {text('Edit', 'កែ')}
                        </Button>
                        <Link
                          className="self-center text-primary underline"
                          href={
                            '/transactions?search=' + encodeURIComponent(v.name)
                          }
                        >
                          {text('Transactions', 'ប្រតិបត្តិការ')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2 p-12 text-center text-muted-foreground">
            <Building2 className="mx-auto size-8" />
            <p>
              {text(
                query
                  ? 'No matching contacts.'
                  : 'No vendors or suppliers yet.',
                query ? 'រកមិនឃើញ។' : 'មិនទាន់មានអ្នកផ្គត់ផ្គង់។',
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
