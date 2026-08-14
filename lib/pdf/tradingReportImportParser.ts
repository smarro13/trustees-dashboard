import PDFParser from 'pdf2json';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

export type ImportedTradingMonthlyEntry = {
  dateRange: string;
  moneyIn: string; // opening balance
  moneyOut: string; // closing balance
};

export type ImportedTradingReport = {
  reportingPeriod: string;
  turnoverNotes: string;
  notes: string;
  monthlyEntries: ImportedTradingMonthlyEntry[];
};

const DEFAULT_IMPORTED_REPORT: ImportedTradingReport = {
  reportingPeriod: '',
  turnoverNotes: '',
  notes: '',
  monthlyEntries: [],
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function decodeText(raw: string): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw.replace(/%/g, '');
  }
}

function cleanNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw
    .replace(/[£$,]/g, '')
    .replace(/\(([^)]+)\)/g, '-$1')
    .trim();
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = cleanNumber(value);
    return cleaned ? Number(cleaned) : null;
  }
  return null;
}

// Formats using UTC fields, since xlsx dates decode to UTC-midnight Date objects
// and the server's local timezone could otherwise shift a month boundary.
function formatMonthLabel(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function uniqueByKey<T>(rows: T[], getKey: (row: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const row of rows) {
    const key = getKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

export function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function dedupeMonthlyEntries(
  entries: ImportedTradingMonthlyEntry[]
): ImportedTradingMonthlyEntry[] {
  return uniqueByKey(entries, (row) => `${normalizeLabel(row.dateRange)}|${row.moneyIn}|${row.moneyOut}`);
}

/* ------------------------------ PDF text extraction ------------------------------ */

export async function extractTextFromPdfBuffer(pdfBytes: Buffer): Promise<string> {
  const pdfParser = new PDFParser();

  return new Promise<string>((resolve, reject) => {
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        let allText = '';
        if (pdfData.Pages) {
          for (const page of pdfData.Pages) {
            const rows = new Map<number, { x: number; text: string }[]>();
            if (page.Texts) {
              for (const text of page.Texts) {
                const rowKey = Math.round(text.y * 10) / 10;
                const row = rows.get(rowKey) ?? [];
                if (text.R) {
                  for (const run of text.R) {
                    const value = decodeText(run.T || '');
                    if (value) row.push({ x: text.x ?? 0, text: value });
                  }
                }
                if (row.length > 0) rows.set(rowKey, row);
              }
            }
            const orderedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);
            for (const [, rowItems] of orderedRows) {
              rowItems.sort((a, b) => a.x - b.x);
              const line = rowItems.map((i) => i.text).join(' ').trim();
              if (line) allText += line + '\n';
            }
          }
        }
        resolve(allText);
      } catch (err) {
        reject(err);
      }
    });

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(errData.parserError || 'PDF parsing failed'));
    });

    pdfParser.parseBuffer(pdfBytes);
  });
}

/* ------------------------------ DOCX text extraction ------------------------------ */

export async function extractTextFromDocxBuffer(docxBytes: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: docxBytes });
  return result.value || '';
}

function paragraphsFromText(rawText: string): string[] {
  return rawText
    .split(/\r?\n\s*\r?\n+/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
}

export function parseTradingNotesText(rawText: string): string {
  const paragraphs = paragraphsFromText(rawText);
  if (!paragraphs.length) return '';

  // Drop a lone leading title paragraph, e.g. "Trading Company Updates".
  if (paragraphs.length > 1 && /^trading\s*company/i.test(paragraphs[0]) && paragraphs[0].length < 60) {
    paragraphs.shift();
  }

  return paragraphs.join('\n\n');
}

/* ------------------------------ XLSX workbook parsing ------------------------------ */

// Reads a "Bank Information" style table: a header row containing "Opening Bal" / "Closing
// Bal" column labels, followed by one row per month (a date in one of the first few
// columns, plus numeric opening/closing balances in the labelled columns). A trailing
// "Bank Balance DD.MM.YYYY" snapshot row (no date cell) is captured as a note instead.
export async function parseTradingWorkbookBuffer(
  xlsxBytes: Buffer
): Promise<Pick<ImportedTradingReport, 'monthlyEntries' | 'reportingPeriod' | 'notes'>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsxBytes as any);

  const monthlyEntries: ImportedTradingMonthlyEntry[] = [];
  const notesLines: string[] = [];

  workbook.eachSheet((sheet) => {
    let openingCol = -1;
    let closingCol = -1;

    sheet.eachRow((row) => {
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(cell.value);
      });

      if (values.every((v) => v === null || v === undefined || v === '')) return;

      const headerOpeningIdx = values.findIndex((v) => typeof v === 'string' && /opening\s*bal/i.test(v));
      if (headerOpeningIdx !== -1) {
        openingCol = headerOpeningIdx;
        const headerClosingIdx = values.findIndex((v) => typeof v === 'string' && /closing\s*bal/i.test(v));
        if (headerClosingIdx !== -1) closingCol = headerClosingIdx;
        return;
      }

      if (openingCol === -1 || closingCol === -1) return;

      const dateCell = values.slice(0, 3).find((v) => v instanceof Date) as Date | undefined;
      if (dateCell) {
        const opening = toNumber(values[openingCol]);
        const closing = toNumber(values[closingCol]);
        if (opening !== null && closing !== null) {
          monthlyEntries.push({
            dateRange: formatMonthLabel(dateCell),
            moneyIn: opening.toFixed(2),
            moneyOut: closing.toFixed(2),
          });
        }
        return;
      }

      const labelCell = values.find((v) => typeof v === 'string' && /bank\s*balance/i.test(v)) as string | undefined;
      if (labelCell) {
        const closing = toNumber(values[closingCol]) ?? values.map(toNumber).find((n) => n !== null) ?? null;
        if (closing !== null) {
          notesLines.push(`${labelCell.trim()}: £${closing.toFixed(2)}`);
        }
      }
    });
  });

  const dedupedEntries = dedupeMonthlyEntries(monthlyEntries);

  return {
    monthlyEntries: dedupedEntries,
    reportingPeriod: dedupedEntries.length ? dedupedEntries[dedupedEntries.length - 1].dateRange : '',
    notes: notesLines.join('\n'),
  };
}

/* ------------------------------ generic text fallback (pdf / txt / csv / md) ------------------------------ */

function parseMonthlyTextLine(rawLine: string) {
  const line = rawLine.trim();

  const explicitMatch = line.match(/^([A-Za-z]+\s+\d{4})\s*:\s*Opening\s*[£$]?([\d,().-]+)\s*\|\s*Closing\s*[£$]?([\d,().-]+)/i);
  if (explicitMatch) {
    const moneyIn = cleanNumber(explicitMatch[2]);
    const moneyOut = cleanNumber(explicitMatch[3]);
    if (!moneyIn || !moneyOut) return null;
    return { dateRange: explicitMatch[1].trim(), moneyIn, moneyOut };
  }

  const flexibleMatch = line.match(/^([A-Za-z]+\s+\d{4}).*?Opening\s*[£$]?([\d,().-]+).*?Closing\s*[£$]?([\d,().-]+)/i);
  if (flexibleMatch) {
    const moneyIn = cleanNumber(flexibleMatch[2]);
    const moneyOut = cleanNumber(flexibleMatch[3]);
    if (!moneyIn || !moneyOut) return null;
    return { dateRange: flexibleMatch[1].trim(), moneyIn, moneyOut };
  }

  return null;
}

export function parseTradingReportText(rawText: string): ImportedTradingReport {
  const result: ImportedTradingReport = { ...DEFAULT_IMPORTED_REPORT, monthlyEntries: [] };
  const text = rawText || '';

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const leftoverLines: string[] = [];

  for (const line of lines) {
    const entry = parseMonthlyTextLine(line);
    if (entry) {
      result.monthlyEntries.push(entry);
      continue;
    }
    leftoverLines.push(line);
  }

  result.monthlyEntries = dedupeMonthlyEntries(result.monthlyEntries);

  if (result.monthlyEntries.length) {
    result.reportingPeriod = result.monthlyEntries[result.monthlyEntries.length - 1].dateRange;
  }

  if (!result.monthlyEntries.length && leftoverLines.length) {
    result.turnoverNotes = parseTradingNotesText(leftoverLines.join('\n\n'));
  }

  return result;
}
