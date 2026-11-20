import { enhanceCanvas, prepareImage } from './document-image';

/** Runs locally in the browser; source documents are never sent to an OCR vendor. */
export async function readDocumentText(
  file: File,
  progress: (percent: number) => void = () => {},
) {
  if (
    /\.(txt|csv)$/i.test(file.name) ||
    file.type === 'text/plain' ||
    file.type === 'text/csv'
  ) {
    const text = await file.text();
    if (text.length > 100000)
      throw new Error('Large text documents require manual review.');
    return text;
  }
  let text = '';
  const images: HTMLCanvasElement[] = [];
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
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
  } else if (
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp)$/i.test(file.name)
  )
    images.push(await prepareImage(file));
  else
    throw new Error(
      'This file type needs manual entry. Automatic reading supports PDF, images, TXT and CSV documents.',
    );
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
