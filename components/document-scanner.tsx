'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileImage, FileText, Loader2, ScanLine, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

export type ScannedTransaction = {
  type: 'Income' | 'Expense';
  date: string;
  reference: string;
  party: string;
  category: string;
  amount: string;
};

const supportedTypes = ['image/png', 'image/jpeg', 'application/pdf'];

export function DocumentScanner({ onClose, onApply }: { onClose: () => void; onApply: (result: ScannedTransaction) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Choose a receipt, invoice, or payment document.');
  const [error, setError] = useState('');
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState<ScannedTransaction | null>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const chooseFile = (selected?: File) => {
    if (!selected) return;
    setError(''); setResult(null); setRawText(''); setProgress(0);
    if (!supportedTypes.includes(selected.type)) { setError('Unsupported file. Choose PNG, JPG/JPEG, or PDF.'); return; }
    if (selected.size > 10 * 1024 * 1024) { setError('File is larger than 10 MB. Choose a smaller document.'); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected); setPreviewUrl(selected.type.startsWith('image/') ? URL.createObjectURL(selected) : '');
    setStatus(`${selected.name} is ready to scan.`);
  };

  const scan = async () => {
    if (!file) { setError('Choose a file before scanning.'); return; }
    setError(''); setResult(null); setProgress(4); setStatus('Preparing document…');
    try {
      let text = '';
      let imageSource: File | HTMLCanvasElement = file;
      if (file.type === 'application/pdf') {
        setStatus('Reading PDF…'); setProgress(12);
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const page = await pdf.getPage(1);
        const content = await page.getTextContent();
        text = content.items.map((item) => 'str' in item ? item.str : '').join(' ').trim();
        if (text.length < 30) {
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Unable to prepare the PDF page.');
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          imageSource = canvas;
        }
      }
      if (text.length < 30) {
        setStatus('Recognizing document text…'); setProgress(18);
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, { logger: (message) => {
          if (message.status === 'recognizing text') { setProgress(20 + Math.round((message.progress || 0) * 72)); setStatus(`Scanning text… ${Math.round((message.progress || 0) * 100)}%`); }
        } });
        const output = await worker.recognize(imageSource);
        text = output.data.text;
        await worker.terminate();
      }
      if (!text.trim()) throw new Error('No readable text was detected. Try a clearer image or a text-based PDF.');
      const parsed = parseDocument(text);
      setRawText(text.trim()); setResult(parsed); setProgress(100); setStatus('Scan complete. Review the detected values before using them.');
    } catch (scanError) {
      setProgress(0); setStatus('Scan could not be completed.'); setError(scanError instanceof Error ? scanError.message : 'The document could not be scanned.');
    }
  };

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
    <button type="button" aria-label="Close document scanner" className="absolute inset-0" onClick={onClose} />
    <section aria-label="Scan transaction document" className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
      <header className="flex items-start justify-between border-b p-5"><div className="flex gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><ScanLine className="size-5" /></span><div><h2 className="text-xl font-semibold">Scan transaction document</h2><p className="mt-1 text-xs text-muted-foreground">PNG, JPG/JPEG, or PDF · maximum 10 MB · PDF first page</p></div></div><Button type="button" variant="ghost" size="icon" aria-label="Close scanner" onClick={onClose}><X /></Button></header>
      <div className="space-y-5 p-5">
        <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }} onDragOver={(event) => event.preventDefault()} className="grid min-h-44 w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/25 p-5 text-center transition hover:border-primary/45 hover:bg-primary/[0.03]">
          {previewUrl ? <img src={previewUrl} alt="Selected document preview" className="max-h-52 rounded-lg object-contain" /> : file ? <div><FileText className="mx-auto size-10 text-primary" /><p className="mt-3 text-sm font-medium">{file.name}</p><p className="mt-1 text-xs text-muted-foreground">PDF · {(file.size / 1024 / 1024).toFixed(2)} MB</p></div> : <div><Upload className="mx-auto size-10 text-primary" /><p className="mt-3 text-sm font-medium">Drop a document here or choose a file</p><p className="mt-1 text-xs text-muted-foreground">Receipts, invoices, and payment evidence</p></div>}
        </button>
        {file ? <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"><span className="grid size-9 place-items-center rounded-lg bg-muted text-primary">{file.type === 'application/pdf' ? <FileText className="size-4" /> : <FileImage className="size-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{file.type} · {(file.size / 1024).toFixed(0)} KB</p></div><Button type="button" onClick={scan} disabled={progress > 0 && progress < 100}><ScanLine /> {progress > 0 && progress < 100 ? 'Scanning…' : 'Scan document'}</Button></div> : null}
        {progress > 0 ? <div><div className="mb-2 flex justify-between text-xs"><span>{status}</span><span>{progress}%</span></div><Progress value={progress} /></div> : <p className="text-xs text-muted-foreground">The document stays in your browser during OCR. Review every detected value before saving.</p>}
        {error ? <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
        {result ? <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/45 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" /><div><p className="text-sm font-semibold">Detected transaction details</p><p className="text-xs text-muted-foreground">Edit any value that was not read correctly.</p></div><Badge className="ml-auto bg-emerald-600">Review required</Badge></div><div className="grid gap-3 sm:grid-cols-2"><ScanField label="Reference" value={result.reference} onChange={(value) => setResult({ ...result, reference: value })} /><ScanField label="Customer / Vendor" value={result.party} onChange={(value) => setResult({ ...result, party: value })} /><ScanField label="Date" value={result.date} onChange={(value) => setResult({ ...result, date: value })} /><ScanField label="Amount (USD)" value={result.amount} onChange={(value) => setResult({ ...result, amount: value })} /><ScanField label="Category" value={result.category} onChange={(value) => setResult({ ...result, category: value })} /><label className="text-xs font-medium">Transaction type<select value={result.type} onChange={(event) => setResult({ ...result, type: event.target.value as 'Income' | 'Expense' })} className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"><option>Expense</option><option>Income</option></select></label></div><details className="rounded-xl border bg-card p-3"><summary className="cursor-pointer text-xs font-medium">View recognized text</summary><pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{rawText}</pre></details><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setResult(null); setRawText(''); setProgress(0); }}>Scan again</Button><Button type="button" onClick={() => onApply(result)}>Use extracted data</Button></div></div> : null}
      </div>
    </section>
  </div>;
}

function ScanField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-medium">{label}<Input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 bg-card" /></label>; }

function parseDocument(text: string): ScannedTransaction {
  const cleaned = text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean);
  const reference = cleaned.match(/(?:invoice|inv|receipt|reference|ref|bill)\s*(?:no\.?|number|#|:|-)?\s*([A-Z0-9][A-Z0-9/-]{3,})/i)?.[1] ?? '';
  const date = cleaned.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/i)?.[0] ?? '';
  const amounts = Array.from(cleaned.matchAll(/(?:USD|US\$|\$)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/gi)).map((match) => Number(match[1].replaceAll(',', ''))).filter((value) => Number.isFinite(value));
  const amount = amounts.length ? Math.max(...amounts).toFixed(2) : '';
  const party = lines.find((line) => /[A-Za-z]{3}/.test(line) && line.length >= 3 && line.length <= 70 && !/(invoice|receipt|tax|total|amount|date|bill|statement)/i.test(line)) ?? '';
  return { type: 'Expense', date, reference, party, category: 'Scanned document', amount };
}
