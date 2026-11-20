import { read, utils } from 'xlsx';

/** Read cell values locally, preserving dates and displayed currency, without evaluating formulas. */
export const unreadableSpreadsheetCell = '[Unreadable formula]';
export function readSpreadsheetSheets(
  data: ArrayBuffer,
  allowCellErrors = false,
) {
  let workbook;
  try {
    workbook = read(data, {
      type: 'array',
      cellDates: true,
      UTC: true,
      sheetRows: 1001,
    });
  } catch {
    throw new Error(
      'This Excel file could not be read. Save an unprotected copy as .xlsx or .xls and try again.',
    );
  }
  const sheets: { name: string; rows: { row: number; cells: string[] }[] }[] =
    [];
  let characters = 0;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet['!ref']) continue;
    const range = utils.decode_range(sheet['!fullref'] || sheet['!ref']);
    if (range.e.r - range.s.r >= 1000 || range.e.c >= 64)
      throw new Error(
        'This Excel sheet is too large for automatic reading. Use at most 1,000 rows and 64 columns per sheet.',
      );
    const rows: { row: number; cells: string[] }[] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[utils.encode_cell({ r, c })];
        const cellError = cell?.t === 'e' || (cell?.f && cell.v == null);
        if (cellError && !allowCellErrors)
          throw new Error(
            'Excel contains an error or a formula without a saved result. Recalculate and save the workbook, then upload it again.',
          );
        const value = cellError
          ? unreadableSpreadsheetCell
          : cell?.t === 'd' && cell.v instanceof Date
            ? cell.v.toISOString().slice(0, 10)
            : cell
              ? utils.format_cell(cell)
              : '';
        characters += value.length;
        if (characters > 100000)
          throw new Error('Large Excel documents require manual review.');
        row.push(value.trim().replace(/\r?\n/g, ' '));
      }
      while (row.length && !row[row.length - 1]) row.pop();
      if (row.some(Boolean)) rows.push({ row: r + 1, cells: row });
    }
    if (rows.length) sheets.push({ name, rows });
  }
  if (!sheets.length)
    throw new Error('No readable cells found in this Excel file.');
  return sheets;
}

export function readSpreadsheetText(data: ArrayBuffer) {
  const sheets = readSpreadsheetSheets(data);
  if (sheets.length > 1)
    throw new Error(
      'This workbook contains multiple populated worksheets. Upload one invoice worksheet at a time.',
    );
  const rows = sheets[0].rows.map((row) => row.cells);
  // A wide header and its values use the same safe field mapping as CSV imports.
  const text =
    rows[0].filter(Boolean).length > 2
      ? rows
          .map((row) =>
            row
              .map((value) => '"' + value.replaceAll('"', '""') + '"')
              .join(','),
          )
          .join('\n')
      : rows
          .map((row) => {
            const cells = row.filter(Boolean);
            return cells.length === 2
              ? cells[0].replace(/\s*[:：]$/, '') + ': ' + cells[1]
              : cells.join(' ');
          })
          .join('\n');
  if (text.length > 100000)
    throw new Error('Large Excel documents require manual review.');
  return text;
}
