'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, FileImage, FileText, Loader2, ScanLine, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

export type ScannedTransaction = {
  type: 'Income' | 'Expense'; documentType: string; date: string; dueDate: string;
  reference: string; party: string; description: string; category: string; currency: string;
  subtotal: string; tax: string; amount: string; paymentMethod: string; purchaseOrder: string;
  confidence: number; warnings: string[];
};

export function DocumentScanner({ mode, onClose, onApply }: { mode: 'upload' | 'camera'; onClose: () => void; onApply: (result: ScannedTransaction) => void }) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [showCameraFallback, setShowCameraFallback] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(mode === 'upload' ? 'Choose or drop a receipt, invoice, or payment document.' : 'Take a clear photo of a receipt, invoice, or payment document.');
  const [error, setError] = useState('');
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState<ScannedTransaction | null>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraActive]);

  const chooseFile = (selected?: File) => {
    if (!selected) return;
    setError(''); setResult(null); setRawText(''); setProgress(0);
    const lowerName = selected.name.toLowerCase();
    const isImage = selected.type.startsWith('image/') || /\.(?:png|jpe?g)$/.test(lowerName);
    const isPdf = selected.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const supported = isImage || (mode === 'upload' && isPdf);
    if (!supported) { setError(mode === 'upload' ? 'Unsupported file. Upload a PNG, JPG, or PDF.' : 'Unsupported camera image. Please take another photo.'); return; }
    if (selected.size > 20 * 1024 * 1024) { setError(mode === 'upload' ? 'File is larger than 20 MB. Choose a smaller document.' : 'Photo is larger than 20 MB. Please reduce the camera resolution and try again.'); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected); setPreviewUrl(isImage ? URL.createObjectURL(selected) : '');
    setStatus(`${mode === 'camera' ? 'Camera photo' : selected.name} is ready to scan.`);
  };

  const openPhoneCamera = () => {
    if (cameraRef.current) cameraRef.current.value = '';
    cameraRef.current?.click();
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null; setCameraActive(false);
  };

  const startCamera = async () => {
    setError(''); setShowCameraFallback(false); setCameraStarting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStarting(false); setShowCameraFallback(true);
      setError('Live camera is not available in this browser. Tap “Open phone camera” below.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream; setCameraActive(true); setStatus('Camera ready. Keep the full document inside the frame.');
    } catch {
      setShowCameraFallback(true);
      setError('Camera access was blocked or unavailable. Allow camera permission, or tap “Open phone camera” below.');
    } finally { setCameraStarting(false); }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) { setError('The camera is still starting. Wait a moment and try again.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { setError('The camera image could not be captured.'); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94));
    if (!blob) { setError('The camera image could not be captured.'); return; }
    stopCamera(); chooseFile(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  };

  const closeScanner = () => { stopCamera(); onClose(); };

  const resetScanner = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(''); setResult(null); setRawText(''); setProgress(0); setError('');
    setStatus(mode === 'upload' ? 'Choose or drop a receipt, invoice, or payment document.' : 'Take a clear photo of a receipt, invoice, or payment document.');
    if (mode === 'camera') void startCamera();
    else if (uploadRef.current) uploadRef.current.value = '';
  };

  const scan = async () => {
    if (!file) { setError('Take a photo before scanning.'); return; }
    setError(''); setResult(null); setProgress(4); setStatus('Preparing and enhancing document…');
    try {
      let text = '';
      const imageSources: HTMLCanvasElement[] = [];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setStatus('Reading PDF pages…'); setProgress(10);
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const pageCount = Math.min(pdf.numPages, 3);
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const pageText = content.items.map((item) => {
            if (!('str' in item)) return '';
            return `${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}`;
          }).join('').trim();
          text += `${pageText}\n`;
          if (pageText.length < 40 && pageNumber <= 2) {
            const viewport = page.getViewport({ scale: 2.25 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Unable to prepare the PDF page.');
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            imageSources.push(enhanceCanvas(canvas));
          }
        }
      } else {
        imageSources.push(await prepareImage(file));
      }

      if (imageSources.length) {
        setStatus('Recognizing labels and values…'); setProgress(18);
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, { logger: (message) => {
          if (message.status === 'recognizing text') {
            setProgress(20 + Math.round((message.progress || 0) * 70));
            setStatus(`Reading document… ${Math.round((message.progress || 0) * 100)}%`);
          }
        } });
        try {
          for (const source of imageSources) {
            const output = await worker.recognize(source);
            text += `\n${output.data.text}`;
          }
        } finally { await worker.terminate(); }
      }

      if (!text.trim()) throw new Error('No readable text was detected. Try a clearer, straight image with good lighting.');
      const parsed = parseDocument(text);
      setRawText(text.trim()); setResult(parsed); setProgress(100);
      setStatus('Scan complete. Review highlighted values before recording.');
    } catch (scanError) {
      setProgress(0); setStatus('Scan could not be completed.');
      setError(scanError instanceof Error ? scanError.message : 'The document could not be scanned.');
    }
  };

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-0 backdrop-blur-sm sm:p-4">
    <button type="button" aria-label="Close document scanner" className="absolute inset-0" onClick={closeScanner} />
    <section aria-label="OCR import transaction document" className="relative z-10 h-[100dvh] w-full max-w-4xl overflow-y-auto border bg-card shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b bg-card p-4 sm:p-5"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ScanLine className="size-5" /></span><div><h2 className="text-lg font-semibold sm:text-xl">{mode === 'upload' ? 'Scan document' : 'Intelligent OCR camera scan'}</h2><p className="mt-1 text-xs text-muted-foreground">{mode === 'upload' ? 'Drop or upload a PNG, JPG, or PDF · maximum 20 MB' : 'Use the live rear camera to capture your document'}</p></div></div><Button type="button" variant="ghost" size="icon" aria-label="Close scanner" onClick={closeScanner}><X /></Button></header>
      <div className="space-y-4 p-4 sm:space-y-5 sm:p-5">
        {mode === 'upload' ? <>
          <input ref={uploadRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg,.pdf,application/pdf" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} />
          <Button type="button" className="h-12 w-full text-base" onClick={() => uploadRef.current?.click()}><Upload /> Upload file</Button>
          <button type="button" onClick={() => uploadRef.current?.click()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }} onDragOver={(event) => event.preventDefault()} className="grid min-h-44 w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/25 p-5 text-center transition hover:border-primary/50 hover:bg-primary/[0.03]">
            {previewUrl ? <img src={previewUrl} alt="Uploaded document preview" className="max-h-64 rounded-lg object-contain" /> : file ? <div><FileText className="mx-auto size-10 text-primary" /><p className="mt-3 text-sm font-medium">{file.name}</p><p className="mt-1 text-xs text-muted-foreground">PDF ready to scan</p></div> : <div><Upload className="mx-auto size-10 text-primary" /><p className="mt-3 text-sm font-medium">Drop a document here or tap to upload</p><p className="mt-1 text-xs text-muted-foreground">PNG, JPG, or PDF · maximum 20 MB</p></div>}
          </button>
        </> : <>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} />
          <Button type="button" className="h-12 w-full text-base" onClick={cameraActive ? capturePhoto : startCamera} disabled={cameraStarting}><Camera /> {cameraStarting ? 'Starting camera…' : cameraActive ? 'Capture document' : file ? 'Take another photo' : 'Start camera'}</Button>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800"><strong>Camera tip:</strong> Place the full document inside the frame, keep the phone steady, and avoid shadows or glare.</div>
          {cameraActive ? <div className="overflow-hidden rounded-2xl border-2 border-primary/40 bg-slate-950"><video ref={videoRef} autoPlay muted playsInline aria-label="Live document camera preview" className="max-h-[52vh] w-full object-contain" /><div className="flex items-center justify-center border-t border-white/15 p-3"><Button type="button" size="lg" onClick={capturePhoto}><Camera /> Capture document</Button></div></div> : previewUrl ? <div className="grid min-h-40 w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/25 p-5 text-center"><img src={previewUrl} alt="Camera document preview" className="max-h-64 rounded-lg object-contain" /></div> : <button type="button" onClick={startCamera} disabled={cameraStarting} className="grid min-h-40 w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/25 p-5 text-center transition hover:border-primary/50 hover:bg-primary/[0.03]"><div><Camera className="mx-auto size-10 text-primary" /><p className="mt-3 text-sm font-medium">Tap here to start the camera</p><p className="mt-1 text-xs text-muted-foreground">Then capture the full invoice, receipt, or payment document</p></div></button>}
          {showCameraFallback ? <Button type="button" variant="outline" className="h-11 w-full" onClick={openPhoneCamera}><Camera /> Open phone camera</Button> : null}
        </>}
        {file ? <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"><span className="grid size-9 place-items-center rounded-lg bg-muted text-primary">{file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? <FileText className="size-4" /> : <FileImage className="size-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{mode === 'camera' ? 'Camera photo ready' : file.name}</p><p className="text-xs text-muted-foreground">{file.type || 'Document'} · {(file.size / 1024).toFixed(0)} KB</p></div><Button type="button" onClick={scan} disabled={progress > 0 && progress < 100}>{progress > 0 && progress < 100 ? <Loader2 className="animate-spin" /> : <ScanLine />} {progress > 0 && progress < 100 ? 'Scanning…' : 'Scan document'}</Button></div> : null}
        {progress > 0 ? <div><div className="mb-2 flex justify-between text-xs"><span>{status}</span><span>{progress}%</span></div><Progress value={progress} /></div> : <p className="text-xs text-muted-foreground">Image cleanup and OCR happen in your browser. No accounting record is created until you review and save it.</p>}
        {error ? <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
        {result ? <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/45 p-4">
          <div className="flex flex-wrap items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" /><div><p className="text-sm font-semibold">Detected transaction details</p><p className="text-xs text-muted-foreground">All values remain editable and require finance review.</p></div><Badge variant="outline" className="ml-auto bg-card">{result.documentType}</Badge><Badge className={result.confidence >= 80 ? 'bg-emerald-600' : result.confidence >= 55 ? 'bg-amber-600' : 'bg-red-600'}>{result.confidence}% confidence</Badge></div>
          {result.warnings.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">Review needed</p><ul className="mt-1 list-disc pl-4 text-xs text-amber-800">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ScanField label="Customer / Vendor" value={result.party} onChange={(value) => setResult({ ...result, party: value })} />
            <ScanField label="Invoice / Receipt no." value={result.reference} onChange={(value) => setResult({ ...result, reference: value })} />
            <ScanField label="Purchase order" value={result.purchaseOrder} onChange={(value) => setResult({ ...result, purchaseOrder: value })} />
            <ScanField label="Issue date" value={result.date} onChange={(value) => setResult({ ...result, date: value })} />
            <ScanField label="Due date" value={result.dueDate} onChange={(value) => setResult({ ...result, dueDate: value })} />
            <ScanField label="Currency" value={result.currency} onChange={(value) => setResult({ ...result, currency: value.toUpperCase() })} />
            <ScanField label="Subtotal" value={result.subtotal} onChange={(value) => setResult({ ...result, subtotal: value })} />
            <ScanField label="Tax / VAT" value={result.tax} onChange={(value) => setResult({ ...result, tax: value })} />
            <ScanField label="Total amount" value={result.amount} onChange={(value) => setResult({ ...result, amount: value })} />
            <ScanField label="Category" value={result.category} onChange={(value) => setResult({ ...result, category: value })} />
            <ScanField label="Payment method" value={result.paymentMethod} onChange={(value) => setResult({ ...result, paymentMethod: value })} />
            <label className="text-xs font-medium">Transaction type<select value={result.type} onChange={(event) => setResult({ ...result, type: event.target.value as 'Income' | 'Expense' })} className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"><option>Expense</option><option>Income</option></select></label>
            <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">Description<textarea value={result.description} onChange={(event) => setResult({ ...result, description: event.target.value })} rows={2} className="mt-2 w-full rounded-lg border bg-card px-3 py-2 text-sm" /></label>
          </div>
          <details className="rounded-xl border bg-card p-3"><summary className="cursor-pointer text-xs font-medium">View recognized text</summary><pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{rawText}</pre></details>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={resetScanner}>{mode === 'upload' ? 'Scan another file' : 'Take another photo'}</Button><Button type="button" onClick={() => onApply(result)}>Review and record</Button></div>
        </div> : null}
      </div>
    </section>
  </div>;
}

function ScanField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-medium">{label}<Input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 bg-card" /></label>; }

async function prepareImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return enhanceCanvas(canvas);
  } finally { URL.revokeObjectURL(url); }
}

function enhanceCanvas(source: HTMLCanvasElement) {
  const context = source.getContext('2d'); if (!context) return source;
  const pixels = context.getImageData(0, 0, source.width, source.height); const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    const value = contrasted > 205 ? 255 : contrasted < 65 ? 0 : contrasted;
    data[index] = value; data[index + 1] = value; data[index + 2] = value;
  }
  context.putImageData(pixels, 0, 0); return source;
}

function parseDocument(text: string): ScannedTransaction {
  const cleaned = text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean); const lower = cleaned.toLowerCase();
  const documentType = /purchase\s*order|\bpo\b/i.test(cleaned) ? 'Purchase order' : /receipt|amount received|paid/i.test(cleaned) ? 'Receipt' : /invoice|tax invoice|bill/i.test(cleaned) ? 'Invoice' : /payment|transfer|remittance/i.test(cleaned) ? 'Payment evidence' : 'Financial document';
  const reference = labeledText(lines, ['invoice number', 'invoice no', 'invoice #', 'receipt number', 'receipt no', 'receipt #', 'bill number', 'bill no', 'reference number', 'reference no', 'ref no', 'document no']) || cleaned.match(/\b(?:INV|RCT|REC|BILL)[-/# ]?[A-Z0-9-]{3,}\b/i)?.[0] || '';
  const purchaseOrder = labeledText(lines, ['purchase order', 'po number', 'po no', 'p.o. no']) || cleaned.match(/\bPO[-/# ]?[A-Z0-9-]{3,}\b/i)?.[0] || '';
  const dueDate = inlineLabeledDate(cleaned, ['payment due', 'due date', 'due']) || labeledDate(lines, ['payment due', 'due date', 'due']) || '';
  const date = inlineLabeledDate(cleaned, ['issue date', 'invoice date', 'receipt date', 'document date', 'issued', 'date']) || labeledDate(lines, ['issue date', 'invoice date', 'receipt date', 'document date', 'issued', 'date']) || findDates(cleaned).find((value) => value !== dueDate) || '';
  const total = labeledAmount(lines, ['grand total', 'total due', 'amount due', 'balance due', 'invoice total', 'net total', 'total amount', 'total']);
  const subtotal = labeledAmount(lines, ['sub total', 'subtotal', 'net amount', 'amount before tax']);
  const tax = labeledAmount(lines, ['tax amount', 'vat amount', 'gst amount', 'sales tax', 'vat', 'gst', 'tax']);
  const allAmounts = extractAmounts(cleaned); const amount = total || (allAmounts.length ? Math.max(...allAmounts).toFixed(2) : '');
  const party = cleanValue(labeledText(lines, ['vendor', 'supplier', 'merchant', 'bill from', 'sold by', 'from', 'customer', 'client'])) || lines.find((line, index) => index < 10 && isLikelyParty(line)) || '';
  const description = findDescription(lines, cleaned);
  const paymentMethodMatch = cleaned.match(/\b(?:payment method|paid by|method)\s*[:#-]?\s*(cash|credit card|debit card|card|bank transfer|wire transfer|ach|cheque|check)\b/i)?.[1] || cleaned.match(/\b(cash|credit card|debit card|bank transfer|wire transfer|ach|cheque)\b/i)?.[1] || '';
  const paymentMethod = paymentMethodMatch.replace(/\b\w/g, (character) => character.toUpperCase());
  const currency = detectCurrency(cleaned);
  const type: 'Income' | 'Expense' = /amount received|payment received|bill to|invoice to|customer/i.test(cleaned) && !/bill from|vendor|supplier/i.test(cleaned) ? 'Income' : 'Expense';
  const category = categorize(`${description} ${party} ${cleaned.slice(0, 800)}`, type);
  const warnings: string[] = [];
  if (!party) warnings.push('Customer or vendor was not confidently detected.');
  if (!reference) warnings.push('Invoice or receipt number is missing.');
  if (!date) warnings.push('Issue date is missing.');
  if (!description) warnings.push('Description is missing.');
  if (!amount) warnings.push('Total amount is missing.');
  if (subtotal && tax && amount && Math.abs(Number(subtotal) + Number(tax) - Number(amount)) > 0.02) warnings.push('Subtotal plus tax does not match the detected total.');
  if (type === 'Expense' && !/vendor|supplier|bill from|receipt|purchase/i.test(lower)) warnings.push('Transaction type defaulted to Expense; confirm before saving.');
  const score = [party, reference, date, amount, currency, description].filter(Boolean).length;
  const confidence = Math.min(96, 34 + score * 10 + (total ? 8 : 0) + (documentType !== 'Financial document' ? 6 : 0));
  return { type, documentType, date, dueDate, reference: cleanValue(reference), party: cleanValue(party), description: cleanValue(description), category, currency, subtotal, tax, amount, paymentMethod, purchaseOrder: cleanValue(purchaseOrder), confidence, warnings };
}

function labeledText(lines: string[], labels: string[]) {
  const pattern = new RegExp(`^(?:${labels.map(escapeRegExp).join('|')})\\s*(?:no\\.?|number|#)?\\s*[:#-]?\\s*(.+)$`, 'i');
  for (const line of lines) { const match = line.match(pattern); if (match?.[1] && match[1].trim().length > 1) return match[1].trim(); }
  return '';
}
function labeledDate(lines: string[], labels: string[]) { const value = labeledText(lines, labels); return findDates(value)[0] || ''; }
function inlineLabeledDate(value: string, labels: string[]) {
  for (const label of labels) {
    const match = value.match(new RegExp(`\\b${escapeRegExp(label)}\\b\\s*[:#-]?\\s*([^\\n]{0,60})`, 'i'));
    const detected = findDates(match?.[1] || '')[0];
    if (detected) return detected;
  }
  return '';
}
function findDates(value: string) { return value.match(/\b(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})\b/gi) || []; }
function findDescription(lines: string[], value: string) {
  const label = /\b(?:description|item description|service description|particulars|details|memo|purpose)\b/i;
  for (let index = 0; index < lines.length; index += 1) {
    if (!label.test(lines[index])) continue;
    const sameLine = cleanDescription(lines[index].replace(label, '').replace(/^\s*[:#-]\s*/, ''));
    if (sameLine) return sameLine;
    for (let next = index + 1; next < Math.min(lines.length, index + 7); next += 1) {
      const candidate = cleanDescription(lines[next]);
      if (candidate) return candidate;
    }
  }
  const inline = value.match(/\b(?:description|item description|service description|particulars|details|memo|purpose)\b\s*[:#-]?\s*(.+?)(?=\b(?:qty|quantity|unit price|rate|amount|subtotal|tax|vat|total|issue date|due date)\b|\n|$)/i)?.[1] || '';
  const cleanedInline = cleanDescription(inline);
  if (cleanedInline) return cleanedInline;
  const itemLine = lines.find((line) => /[A-Za-z]{3}/.test(line) && /(?:\d+[.,]\d{2})/.test(line) && !/(subtotal|tax|vat|total|amount due)/i.test(line));
  if (itemLine) return cleanValue(itemLine.replace(/\s+\d+(?:[.,]\d{2})?(?:\s+\d+(?:[.,]\d{2})?)*\s*$/, ''));
  return cleanValue(lines.find((line) => /\b(service|subscription|consulting|software|equipment|supplies|freight|rent|fee|product|goods)\b/i.test(line) && !/(subtotal|tax|total)/i.test(line)) || '');
}
function cleanDescription(value: string) {
  const cleaned = cleanValue(value.replace(/\b(?:qty|quantity|unit price|rate|amount)\b.*$/i, ''));
  if (cleaned.length < 3 || /^(?:description|item|service|particulars|details)$/i.test(cleaned) || /^(?:qty|quantity|unit price|rate|amount)$/i.test(cleaned)) return '';
  return cleaned.slice(0, 240);
}
function labeledAmount(lines: string[], labels: string[]) {
  const labelPattern = new RegExp(`\\b(?:${labels.map(escapeRegExp).join('|')})\\b`, 'i');
  for (const line of lines) { if (!labelPattern.test(line)) continue; const values = extractAmounts(line.replace(labelPattern, '')); if (values.length) return values[values.length - 1].toFixed(2); }
  return '';
}
function extractAmounts(value: string) {
  return Array.from(value.matchAll(/(?:USD|US\$|KHR|EUR|GBP|THB|[$€£฿៛])?\s*(-?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{2}))(?!\d)/gi)).map((match) => Number(match[1].replace(/[ ,](?=\d{3}(?:\D|$))/g, '').replace(',', '.'))).filter((number) => Number.isFinite(number) && Math.abs(number) < 1_000_000_000).map(Math.abs);
}
function detectCurrency(value: string) { if (/\bKHR\b|៛/i.test(value)) return 'KHR'; if (/\bEUR\b|€/i.test(value)) return 'EUR'; if (/\bGBP\b|£/i.test(value)) return 'GBP'; if (/\bTHB\b|฿/i.test(value)) return 'THB'; if (/\bUSD\b|US\$|\$/i.test(value)) return 'USD'; return ''; }
function categorize(value: string, type: 'Income' | 'Expense') { if (type === 'Income') return /service|consult/i.test(value) ? 'Service revenue' : 'Product revenue'; if (/software|subscription|cloud|hosting/i.test(value)) return 'Software & subscriptions'; if (/freight|delivery|shipping|logistics/i.test(value)) return 'Freight & delivery'; if (/rent|facility|utilities|electric|water/i.test(value)) return 'Facilities'; if (/marketing|advertis/i.test(value)) return 'Marketing services'; if (/travel|hotel|flight|taxi/i.test(value)) return 'Travel'; if (/office|supplies|stationery/i.test(value)) return 'Office supplies'; return 'Scanned document'; }
function isLikelyParty(line: string) { return /[A-Za-z]{3}/.test(line) && line.length >= 3 && line.length <= 80 && !/(invoice|receipt|tax|total|amount|date|bill|statement|address|phone|email|www\.|page|description|quantity|price)/i.test(line) && !/^\d/.test(line); }
function cleanValue(value: string) { return value.replace(/^[:#\-\s]+|\s{2,}/g, ' ').trim(); }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
