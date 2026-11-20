'use client';

/* eslint-disable nextjs/no-img-element -- Previews use local blob/data URLs from uploads and camera captures; they cannot use server image optimization. */

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileImage,
  FileText,
  Loader2,
  ScanLine,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/lib/i18n';

import { parseDocument, type ScannedTransaction } from '@/lib/document-parser';
import { enhanceCanvas, prepareImage } from '@/lib/document-image';
export type { ScannedTransaction } from '@/lib/document-parser';

export function DocumentScanner({
  mode,
  onClose,
  onApply,
  initialFile,
}: {
  mode: 'upload' | 'camera';
  onClose: () => void;
  onApply: (result: ScannedTransaction) => void;
  initialFile?: File;
}) {
  const { t } = useLanguage();
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [previewUrl, setPreviewUrl] = useState(() =>
    initialFile?.type.startsWith('image/')
      ? URL.createObjectURL(initialFile)
      : '',
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [showCameraFallback, setShowCameraFallback] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(
    mode === 'upload' ? t('scan.chooseOrDrop') : t('scan.takeClearPhoto'),
  );
  const [error, setError] = useState('');
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState<ScannedTransaction | null>(null);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current)
      videoRef.current.srcObject = streamRef.current;
  }, [cameraActive]);

  const chooseFile = (selected?: File) => {
    if (!selected) return;
    setError('');
    setResult(null);
    setRawText('');
    setProgress(0);
    const lowerName = selected.name.toLowerCase();
    const isImage =
      selected.type.startsWith('image/') || /\.(?:png|jpe?g)$/.test(lowerName);
    const isPdf =
      selected.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const supported = isImage || (mode === 'upload' && isPdf);
    if (!supported) {
      setError(
        mode === 'upload'
          ? t('scan.unsupportedFile')
          : t('scan.unsupportedCameraImage'),
      );
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError(
        mode === 'upload' ? t('scan.fileTooLarge') : t('scan.photoTooLarge'),
      );
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(isImage ? URL.createObjectURL(selected) : '');
    setStatus(
      t('scan.readyToScan', {
        name: mode === 'camera' ? t('scan.cameraPhoto') : selected.name,
      }),
    );
  };

  const openPhoneCamera = () => {
    if (cameraRef.current) cameraRef.current.value = '';
    cameraRef.current?.click();
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    setError('');
    setShowCameraFallback(false);
    setCameraStarting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStarting(false);
      setShowCameraFallback(true);
      setError(t('scan.noLiveCamera'));
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setStatus(t('scan.cameraReady'));
    } catch {
      setShowCameraFallback(true);
      setError(t('scan.cameraBlocked'));
    } finally {
      setCameraStarting(false);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError(t('scan.cameraStillStarting'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError(t('scan.imageCaptureFailed'));
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.94),
    );
    if (!blob) {
      setError(t('scan.imageCaptureFailed'));
      return;
    }
    stopCamera();
    chooseFile(
      new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }),
    );
  };

  const closeScanner = () => {
    stopCamera();
    onClose();
  };

  const resetScanner = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl('');
    setResult(null);
    setRawText('');
    setProgress(0);
    setError('');
    setStatus(
      mode === 'upload' ? t('scan.chooseOrDrop') : t('scan.takeClearPhoto'),
    );
    if (mode === 'camera') void startCamera();
    else if (uploadRef.current) uploadRef.current.value = '';
  };

  const scan = async () => {
    if (!file) {
      setError(t('scan.takePhotoBeforeScan'));
      return;
    }
    setError('');
    setResult(null);
    setProgress(4);
    setStatus(t('scan.preparingDocument'));
    try {
      let text = '';
      const imageSources: HTMLCanvasElement[] = [];
      if (
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf')
      ) {
        setStatus(t('scan.readingPdf'));
        setProgress(10);
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
        }).promise;
        const pageCount = Math.min(pdf.numPages, 3);
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item) => {
              if (!('str' in item)) return '';
              return `${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}`;
            })
            .join('')
            .trim();
          text += `${pageText}\n`;
          if (pageText.length < 40 && pageNumber <= 2) {
            const viewport = page.getViewport({ scale: 2.25 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext('2d');
            if (!context) throw new Error(t('scan.unableToPrepPdfPage'));
            await page.render({ canvas, canvasContext: context, viewport })
              .promise;
            imageSources.push(enhanceCanvas(canvas));
          }
        }
      } else {
        imageSources.push(await prepareImage(file));
      }

      if (imageSources.length) {
        setStatus(t('scan.recognizingLabels'));
        setProgress(18);
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, {
          logger: (message) => {
            if (message.status === 'recognizing text') {
              setProgress(20 + Math.round((message.progress || 0) * 70));
              setStatus(
                t('scan.readingDocumentPercent', {
                  percent: Math.round((message.progress || 0) * 100),
                }),
              );
            }
          },
        });
        try {
          for (const source of imageSources) {
            const output = await worker.recognize(source);
            text += `\n${output.data.text}`;
          }
        } finally {
          await worker.terminate();
        }
      }

      if (!text.trim()) throw new Error(t('scan.noTextDetected'));
      const parsed = parseDocument(text, t);
      setRawText(text.trim());
      setResult(parsed);
      setProgress(100);
      setStatus(t('scan.complete'));
    } catch (scanError) {
      setProgress(0);
      setStatus(t('scan.couldNotComplete'));
      setError(
        scanError instanceof Error ? scanError.message : t('scan.couldNotScan'),
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-0 backdrop-blur-sm sm:p-4">
      <button
        type="button"
        aria-label="Close document scanner"
        className="absolute inset-0"
        onClick={closeScanner}
      />
      <section
        aria-label="OCR import transaction document"
        className="relative z-10 h-[100dvh] w-full max-w-4xl overflow-y-auto border bg-card shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b bg-card p-4 sm:p-5">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ScanLine className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold sm:text-xl">
                {mode === 'upload'
                  ? t('scan.titleUpload')
                  : t('scan.titleCamera')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {mode === 'upload'
                  ? t('scan.subtitleUpload')
                  : t('scan.subtitleCamera')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close scanner"
            onClick={closeScanner}
          >
            <X />
          </Button>
        </header>
        <div className="space-y-4 p-4 sm:space-y-5 sm:p-5">
          {mode === 'upload' ? (
            <>
              <input
                ref={uploadRef}
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg,.pdf,application/pdf"
                className="sr-only"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
              <Button
                type="button"
                className="h-12 w-full text-base"
                onClick={() => uploadRef.current?.click()}
              >
                <Upload /> {t('scan.uploadFile')}
              </Button>
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseFile(event.dataTransfer.files?.[0]);
                }}
                onDragOver={(event) => event.preventDefault()}
                className="grid min-h-44 w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/25 p-5 text-center transition hover:border-primary/50 hover:bg-primary/[0.03]"
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded document preview"
                    className="max-h-64 rounded-lg object-contain"
                  />
                ) : file ? (
                  <div>
                    <FileText className="mx-auto size-10 text-primary" />
                    <p className="mt-3 text-sm font-medium">{file.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('scan.pdfReadyToScan')}
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload className="mx-auto size-10 text-primary" />
                    <p className="mt-3 text-sm font-medium">
                      {t('scan.dropHere')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('scan.pngJpgPdfMax')}
                    </p>
                  </div>
                )}
              </button>
            </>
          ) : (
            <>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
              <Button
                type="button"
                className="h-12 w-full text-base"
                onClick={cameraActive ? capturePhoto : startCamera}
                disabled={cameraStarting}
              >
                <Camera />{' '}
                {cameraStarting
                  ? t('scan.startingCamera')
                  : cameraActive
                    ? t('scan.captureDocument')
                    : file
                      ? t('scan.takeAnotherPhoto')
                      : t('scan.startCamera')}
              </Button>
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                <strong>{t('scan.cameraTipLabel')}</strong>{' '}
                {t('scan.cameraTipText')}
              </div>
              {cameraActive ? (
                <div className="overflow-hidden rounded-2xl border-2 border-primary/40 bg-slate-950">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    aria-label="Live document camera preview"
                    className="max-h-[52vh] w-full object-contain"
                  />
                  <div className="flex items-center justify-center border-t border-white/15 p-3">
                    <Button type="button" size="lg" onClick={capturePhoto}>
                      <Camera /> {t('scan.captureDocument')}
                    </Button>
                  </div>
                </div>
              ) : previewUrl ? (
                <div className="grid min-h-40 w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/25 p-5 text-center">
                  <img
                    src={previewUrl}
                    alt="Camera document preview"
                    className="max-h-64 rounded-lg object-contain"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={cameraStarting}
                  className="grid min-h-40 w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/25 p-5 text-center transition hover:border-primary/50 hover:bg-primary/[0.03]"
                >
                  <div>
                    <Camera className="mx-auto size-10 text-primary" />
                    <p className="mt-3 text-sm font-medium">
                      {t('scan.tapToStartCamera')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('scan.thenCapture')}
                    </p>
                  </div>
                </button>
              )}
              {showCameraFallback ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  onClick={openPhoneCamera}
                >
                  <Camera /> {t('scan.openPhoneCamera')}
                </Button>
              ) : null}
            </>
          )}
          {file ? (
            <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
              <span className="grid size-9 place-items-center rounded-lg bg-muted text-primary">
                {file.type === 'application/pdf' ||
                file.name.toLowerCase().endsWith('.pdf') ? (
                  <FileText className="size-4" />
                ) : (
                  <FileImage className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {mode === 'camera' ? t('scan.cameraPhotoReady') : file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {file.type || t('scan.documentWord')} ·{' '}
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <Button
                type="button"
                onClick={scan}
                disabled={progress > 0 && progress < 100}
              >
                {progress > 0 && progress < 100 ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ScanLine />
                )}{' '}
                {progress > 0 && progress < 100
                  ? t('scan.scanning')
                  : t('tx.scanDocument')}
              </Button>
            </div>
          ) : null}
          {progress > 0 ? (
            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span>{status}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('scan.browserOcrNotice')}
            </p>
          )}
          {error ? (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          ) : null}
          {result ? (
            <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/45 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold">
                    {t('scan.detectedDetails')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('scan.editableNotice')}
                  </p>
                </div>
                <Badge variant="outline" className="ml-auto bg-card">
                  {result.documentType}
                </Badge>
                <Badge
                  className={
                    result.confidence >= 80
                      ? 'bg-emerald-600'
                      : result.confidence >= 55
                        ? 'bg-amber-600'
                        : 'bg-red-600'
                  }
                >
                  {t('scan.confidencePercent', { percent: result.confidence })}
                </Badge>
              </div>
              {result.warnings.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800">
                    {t('scan.reviewNeeded')}
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-amber-800">
                    {result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ScanField
                  label={t('field.customerVendor')}
                  value={result.party}
                  onChange={(value) => setResult({ ...result, party: value })}
                />
                <ScanField
                  label={t('field.invoiceReceiptNo')}
                  value={result.reference}
                  onChange={(value) =>
                    setResult({ ...result, reference: value })
                  }
                />
                <ScanField
                  label={t('field.purchaseOrder')}
                  value={result.purchaseOrder}
                  onChange={(value) =>
                    setResult({ ...result, purchaseOrder: value })
                  }
                />
                <ScanField
                  label={t('field.issueDate')}
                  value={result.date}
                  onChange={(value) => setResult({ ...result, date: value })}
                />
                <ScanField
                  label={t('field.dueDate')}
                  value={result.dueDate}
                  onChange={(value) => setResult({ ...result, dueDate: value })}
                />
                <ScanField
                  label={t('field.currency')}
                  value={result.currency}
                  onChange={(value) =>
                    setResult({ ...result, currency: value.toUpperCase() })
                  }
                />
                <ScanField
                  label={t('field.subtotal')}
                  value={result.subtotal}
                  onChange={(value) =>
                    setResult({ ...result, subtotal: value })
                  }
                />
                <ScanField
                  label={t('field.taxVat')}
                  value={result.tax}
                  onChange={(value) => setResult({ ...result, tax: value })}
                />
                <ScanField
                  label={t('tx.totalAmount')}
                  value={result.amount}
                  onChange={(value) => setResult({ ...result, amount: value })}
                />
                <ScanField
                  label={t('table.category')}
                  value={result.category}
                  onChange={(value) =>
                    setResult({ ...result, category: value })
                  }
                />
                <ScanField
                  label={t('field.paymentMethod')}
                  value={result.paymentMethod}
                  onChange={(value) =>
                    setResult({ ...result, paymentMethod: value })
                  }
                />
                <label className="text-xs font-medium">
                  {t('field.transactionType')}
                  <select
                    value={result.type}
                    onChange={(event) =>
                      setResult({
                        ...result,
                        type: event.target.value as 'Income' | 'Expense',
                      })
                    }
                    className="mt-2 h-9 w-full rounded-lg border bg-card px-3 text-sm"
                  >
                    <option>Expense</option>
                    <option>Income</option>
                  </select>
                </label>
                <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">
                  {t('field.description')}
                  <textarea
                    value={result.description}
                    onChange={(event) =>
                      setResult({ ...result, description: event.target.value })
                    }
                    rows={2}
                    className="mt-2 w-full rounded-lg border bg-card px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <details className="rounded-xl border bg-card p-3">
                <summary className="cursor-pointer text-xs font-medium">
                  {t('scan.viewRecognizedText')}
                </summary>
                <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {rawText}
                </pre>
              </details>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetScanner}>
                  {mode === 'upload'
                    ? t('scan.scanAnotherFile')
                    : t('scan.takeAnotherPhoto')}
                </Button>
                <Button type="button" onClick={() => onApply(result)}>
                  {t('scan.reviewAndRecord')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ScanField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium">
      {label}
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 bg-card"
      />
    </label>
  );
}
