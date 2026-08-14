import PDFParser from 'pdf2json';

export type ImportedMonthlyEntry = {
  dateRange: string;
  moneyIn: string;
  moneyOut: string;
};

export type ImportedRegularPayment = {
  description: string;
  frequency: string;
  amount: string;
  notes: string;
};

export type ImportedRegularIncome = {
  description: string;
  frequency: string;
  amount: string;
  notes: string;
};

export type ImportedMoneyOwed = {
  name: string;
  amount: string;
};

export type ImportedTreasuryReport = {
  reportingPeriod: string;
  notes: string;
  monthlyEntries: ImportedMonthlyEntry[];
  regularPayments: ImportedRegularPayment[];
  regularIncomes: ImportedRegularIncome[];
  moniesOwed: ImportedMoneyOwed[];
};

const DEFAULT_IMPORTED_REPORT: ImportedTreasuryReport = {
  reportingPeriod: '',
  notes: '',
  monthlyEntries: [],
  regularPayments: [],
  regularIncomes: [],
  moniesOwed: [],
};

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

function parseRegularLine(rawLine: string) {
  const line = rawLine.trim();
  const regularPrefixMatch = line.match(/^Regular\s*:\s*(.+?)\s*\((.+?)\)\s*:\s*[£$]?([\d,().-]+)/i);
  if (regularPrefixMatch) {
    const descriptor = regularPrefixMatch[1].trim();
    const frequencyAndNotes = regularPrefixMatch[2].trim();
    const amount = cleanNumber(regularPrefixMatch[3]);

    const split = frequencyAndNotes.split(/\s+[–-]\s+/);
    const frequency = (split[0] || '').trim();
    const notes = (split.slice(1).join(' - ') || '').trim();

    return {
      description: descriptor,
      frequency,
      notes,
      amount,
    };
  }

  return null;
}

function parseRegularIncomeLine(rawLine: string) {
  const line = rawLine.trim();
  const regularIncomeMatch = line.match(/^Regular\s*income\s*:\s*(.+?)\s*\((.+?)\)\s*:\s*[£$]?([\d,().-]+)/i);

  if (!regularIncomeMatch) return null;

  const descriptor = regularIncomeMatch[1].trim();
  const frequencyAndNotes = regularIncomeMatch[2].trim();
  const amount = cleanNumber(regularIncomeMatch[3]);

  const split = frequencyAndNotes.split(/\s+[–-]\s+/);
  const frequency = (split[0] || '').trim();
  const notes = (split.slice(1).join(' - ') || '').trim();

  return {
    description: descriptor,
    frequency,
    notes,
    amount,
  };
}

function parseMoneyOwedLine(rawLine: string) {
  const line = rawLine.trim();
  const owedMatch = line.match(/^Monies\s*owed\s*:\s*(.+?)\s*:\s*[£$]?([\d,().-]+)/i);
  if (!owedMatch) return null;

  const name = owedMatch[1].trim();
  const amount = cleanNumber(owedMatch[2]);

  if (!name || !amount) return null;

  return { name, amount };
}

function parseMonthlyLine(rawLine: string) {
  const line = rawLine.trim();

  const monthlyMatch = line.match(/^([A-Za-z]+\s+\d{4})\s*:\s*In\s*[£$]?([\d,().-]+)\s*\|\s*Out\s*[£$]?([\d,().-]+)/i);
  if (!monthlyMatch) return null;

  const dateRange = monthlyMatch[1].trim();
  const moneyIn = cleanNumber(monthlyMatch[2]);
  const moneyOut = cleanNumber(monthlyMatch[3]);

  if (!dateRange || !moneyIn || !moneyOut) return null;

  return { dateRange, moneyIn, moneyOut };
}

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
                    if (value) {
                      row.push({ x: text.x ?? 0, text: value });
                    }
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

export function parseTreasuryReportText(rawText: string): ImportedTreasuryReport {
  const result: ImportedTreasuryReport = {
    ...DEFAULT_IMPORTED_REPORT,
  };

  const text = rawText || '';

  const periodMatch = text.match(/Reporting\s*period\s*:\s*([^\n\r]+)/i);
  if (periodMatch) {
    result.reportingPeriod = periodMatch[1].trim();
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const monthlyEntry = parseMonthlyLine(line);
    if (monthlyEntry) {
      result.monthlyEntries.push(monthlyEntry);
      continue;
    }

    const regularPayment = parseRegularLine(line);
    if (regularPayment) {
      result.regularPayments.push(regularPayment);
      continue;
    }

    const regularIncome = parseRegularIncomeLine(line);
    if (regularIncome) {
      result.regularIncomes.push(regularIncome);
      continue;
    }

    const moneyOwed = parseMoneyOwedLine(line);
    if (moneyOwed) {
      result.moniesOwed.push(moneyOwed);
      continue;
    }
  }

  const notesMatch = text.match(/Additional\s*Comments\s*:\s*([\s\S]*)$/i);
  if (notesMatch) {
    result.notes = notesMatch[1].trim();
  }

  return result;
}
