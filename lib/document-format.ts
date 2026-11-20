export function automaticDocumentFormat(name: string, mimeType = '') {
  if (/\.(xlsx|xls)$/i.test(name)) return 'excel';
  if (/\.(txt|csv)$/i.test(name)) return 'text';
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return 'image';
  if (
    /^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/.test(
      mimeType,
    )
  )
    return 'excel';
  if (mimeType === 'text/plain' || mimeType === 'text/csv') return 'text';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return null;
}

export const unsupportedDocumentMessage =
  'Automatic reading supports Excel (.xlsx, .xls), PDF, images, TXT and CSV. Convert this file to a supported format or enter its details manually.';
