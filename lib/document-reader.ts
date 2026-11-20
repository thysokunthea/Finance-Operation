import { enhanceCanvas, prepareImage } from './document-image';
import {
  automaticDocumentFormat,
  unsupportedDocumentMessage,
} from './document-format';

/** Runs locally in the browser; source documents are never sent to an OCR vendor. */
export async function readDocumentText(
  file: File,
  progress: (percent: number) => void = () => {},
) {
  const format = automaticDocumentFormat(file.name, file.type);
  if (format === 'word') {
    const loaded = await import('mammoth/mammoth.browser');
    let text: string;
    try {
      text = (
        await (loaded.default || loaded).extractRawText({
          arrayBuffer: await file.arrayBuffer(),
        })
      ).value;
    } catch {
      throw new Error(
        'This Word file could not be read. Save an unprotected .docx copy and retry.',
      );
    }
    if (!text.trim())
      throw new Error('No readable text found in this Word document.');
    if (text.length > 100000)
      throw new Error('Large Word documents require manual review.');
    return text;
  }
  if (format === 'excel') {
    const { readSpreadsheetText } = await import('./spreadsheet-document');
    return readSpreadsheetText(await file.arrayBuffer());
  }
  if (format === 'text') {
    const text = await file.text();
    if (text.length > 100000)
      throw new Error('Large text documents require manual review.');
    return text;
  }
  let text = '';
  const images: HTMLCanvasElement[] = [];
  if (format === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    const pdf = await loadingTask.promise;
    try {
      if (pdf.numPages > 10)
        throw new Error('Documents over 10 pages require manual review.');
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) =>
            'str' in item
              ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ')
              : '',
          )
          .join('');
        text += pageText + '\n';
        if (pageText.trim().length < 40) {
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Could not read PDF image.');
          await page.render({ canvas, canvasContext: context, viewport })
            .promise;
          images.push(enhanceCanvas(canvas));
        }
      }
    } finally {
      await loadingTask.destroy();
    }
  } else if (format === 'image') images.push(await prepareImage(file));
  else throw new Error(unsupportedDocumentMessage);
  if (images.length) {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng+khm', 1, {
      logger: (message) => {
        if (message.status === 'recognizing text')
          progress(Math.round((message.progress || 0) * 100));
      },
    });
    try {
      for (const image of images) {
        text += '\n' + (await worker.recognize(image)).data.text;
        image.width = 0;
        image.height = 0;
      }
    } finally {
      await worker.terminate();
    }
  }
  if (!text.trim())
    throw new Error(
      'No readable text found. Complete the transaction manually.',
    );
  if (text.length > 100000)
    throw new Error('Large documents require manual review.');
  return text;
}
