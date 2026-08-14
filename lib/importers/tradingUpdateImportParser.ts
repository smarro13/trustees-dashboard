import ExcelJS from 'exceljs';
import mammoth from 'mammoth';

export type ImportedMonthlyEntry = {
  dateRange: string;
  moneyIn: string;
  moneyOut: string;
};

export type ImportedTradingUpdate = {
  reportingPeriod: string;
  notes: string;
  monthlyEntries: ImportedMonthlyEntry[];
};

const MONTH_YEAR_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
};

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-GB', MONTH_YEAR_FORMAT);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === 'object' && 'result' in (value as any)) {
    // ExcelJS formula cell: use the computed result
    return toDate((value as any).result);
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (value && typeof value === 'object' && 'result' in (value as any)) {
    return toNumber((value as any).result);
  }
  return null;
}

/**
 * Parses a "Trading Company Updates" style workbook: a bank-information table
 * with one row per month (Month | Opening Bal | Closing Bal | Difference).
 * Column positions vary slightly between exports, so each row is matched by
 * finding a date cell and the nearest two numeric cells that follow it.
 */
export async function parseTradingBalancesXlsx(buffer: Buffer): Promise<ImportedMonthlyEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const entries: ImportedMonthlyEntry[] = [];

  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => {
      const cells = (row.values as unknown[]).slice(1); // row.values is 1-indexed with a leading empty slot
      const dateCellIndex = cells.findIndex((c) => toDate(c) !== null);
      if (dateCellIndex === -1) return;

      const date = toDate(cells[dateCellIndex])!;
      const numbers: number[] = [];
      for (let i = dateCellIndex + 1; i < cells.length && numbers.length < 2; i++) {
        const n = toNumber(cells[i]);
        if (n !== null) numbers.push(n);
      }

      if (numbers.length < 2) return;

      entries.push({
        dateRange: formatMonthYear(date),
        moneyIn: String(numbers[0]),
        moneyOut: String(numbers[1]),
      });
    });
  }

  return entries;
}

/**
 * Parses a "Trading Company Updates" style Word document: free-form narrative
 * paragraphs describing the month's trading performance. The document title,
 * if repeated as the first paragraph, is stripped since the page already
 * shows it.
 */
export async function parseTradingUpdateDocx(buffer: Buffer): Promise<string> {
  const { value: rawText } = await mammoth.extractRawText({ buffer });

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length && /^trading company updates$/i.test(lines[0])) {
    lines.shift();
  }

  return lines.join('\n\n');
}

export async function parseTradingUpdateFile(filename: string, buffer: Buffer): Promise<ImportedTradingUpdate> {
  const lower = filename.toLowerCase();
  const result: ImportedTradingUpdate = { reportingPeriod: '', notes: '', monthlyEntries: [] };

  if (lower.endsWith('.xlsx')) {
    result.monthlyEntries = await parseTradingBalancesXlsx(buffer);
    if (result.monthlyEntries.length > 0) {
      result.reportingPeriod = result.monthlyEntries[result.monthlyEntries.length - 1].dateRange;
    }
  } else if (lower.endsWith('.docx')) {
    result.notes = await parseTradingUpdateDocx(buffer);
  } else if (lower.endsWith('.xls') || lower.endsWith('.doc')) {
    throw new Error('Legacy .xls/.doc files are not supported. Please save as .xlsx or .docx and try again.');
  } else {
    throw new Error('Unsupported file type. Please upload an .xlsx bank balances file or a .docx update.');
  }

  return result;
}
