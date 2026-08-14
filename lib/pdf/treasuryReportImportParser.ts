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

function extractNumbersFromLine(line: string): string[] {
  const matches = line.match(/[£$]?\(?-?\d[\d,]*(?:\.\d+)?\)?/g) || [];
  return matches
    .map((value) => cleanNumber(value))
    .filter((value) => value.length > 0);
}

function splitFrequencyAndNotes(value: string) {
  const split = value.split(/\s+[–-]\s+/);
  return {
    frequency: (split[0] || '').trim(),
    notes: (split.slice(1).join(' - ') || '').trim(),
  };
}

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseRegularLine(rawLine: string) {
  const line = rawLine.trim();
  const regularPrefixMatch = line.match(/^Regular(?:\s*payment|\s*payments)?\s*:\s*(.+?)\s*\((.+?)\)\s*:\s*[£$]?([\d,().-]+)/i);
  if (regularPrefixMatch) {
    const descriptor = regularPrefixMatch[1].trim();
    const frequencyAndNotes = splitFrequencyAndNotes(regularPrefixMatch[2].trim());
    const amount = cleanNumber(regularPrefixMatch[3]);

    if (!descriptor || !amount) return null;

    return {
      description: descriptor,
      frequency: frequencyAndNotes.frequency,
      notes: frequencyAndNotes.notes,
      amount,
    };
  }

  const regularDashMatch = line.match(/^Regular(?:\s*payment|\s*payments)?\s*[:|-]\s*(.+?)\s*[|-]\s*(.+?)\s*[|-]\s*[£$]?([\d,().-]+)(?:\s*[|-]\s*(.+))?$/i);
  if (regularDashMatch) {
    const amount = cleanNumber(regularDashMatch[3]);
    if (!amount) return null;

    return {
      description: regularDashMatch[1].trim(),
      frequency: regularDashMatch[2].trim(),
      amount,
      notes: (regularDashMatch[4] || '').trim(),
    };
  }

  return null;
}

function parseRegularIncomeLine(rawLine: string) {
  const line = rawLine.trim();
  const regularIncomeMatch = line.match(/^Regular\s*incomes?\s*:\s*(.+?)\s*\((.+?)\)\s*:\s*[£$]?([\d,().-]+)/i);

  if (regularIncomeMatch) {
    const descriptor = regularIncomeMatch[1].trim();
    const frequencyAndNotes = splitFrequencyAndNotes(regularIncomeMatch[2].trim());
    const amount = cleanNumber(regularIncomeMatch[3]);

    if (!descriptor || !amount) return null;

    return {
      description: descriptor,
      frequency: frequencyAndNotes.frequency,
      notes: frequencyAndNotes.notes,
      amount,
    };
  }

  const incomeDashMatch = line.match(/^(?:Regular\s*income|Income)\s*[:|-]\s*(.+?)\s*[|-]\s*(.+?)\s*[|-]\s*[£$]?([\d,().-]+)(?:\s*[|-]\s*(.+))?$/i);
  if (incomeDashMatch) {
    const amount = cleanNumber(incomeDashMatch[3]);
    if (!amount) return null;

    return {
      description: incomeDashMatch[1].trim(),
      frequency: incomeDashMatch[2].trim(),
      amount,
      notes: (incomeDashMatch[4] || '').trim(),
    };
  }

  return null;
}

function parseMoneyOwedLine(rawLine: string) {
  const line = rawLine.trim();
  const owedMatch = line.match(/^(?:Monies\s*owed|Money\s*owed|Debtors?)\s*[:|-]\s*(.+?)\s*[:|-]\s*[£$]?([\d,().-]+)/i);
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

function parseMonthlyLineFlexible(rawLine: string) {
  const line = rawLine.trim();

  const inOutLabelMatch = line.match(/^([A-Za-z]+\s+\d{4}).*?(?:Money\s*In|Opening|In)\s*[£$]?([\d,().-]+).*?(?:Money\s*Out|Closing|Out|Expenditure)\s*[£$]?([\d,().-]+)/i);
  if (inOutLabelMatch) {
    return {
      dateRange: inOutLabelMatch[1].trim(),
      moneyIn: cleanNumber(inOutLabelMatch[2]),
      moneyOut: cleanNumber(inOutLabelMatch[3]),
    };
  }

  const monthStartMatch = line.match(/^([A-Za-z]+\s+\d{4})\b(.*)$/i);
  if (!monthStartMatch) return null;

  const dateRange = monthStartMatch[1].trim();
  const numbers = extractNumbersFromLine(monthStartMatch[2] || '');
  if (numbers.length < 2) return null;

  return {
    dateRange,
    moneyIn: numbers[0],
    moneyOut: numbers[1],
  };
}

function uniqueByKey<T>(rows: T[], getKey: (row: T) => string): T[] {
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

  const periodMatch = text.match(/(?:Reporting|Finance|Financial)\s*period\s*:\s*([^\n\r]+)/i)
    || text.match(/^Period\s*:\s*([^\n\r]+)/im);
  if (periodMatch) {
    result.reportingPeriod = periodMatch[1].trim();
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const monthlyEntry = parseMonthlyLine(line) || parseMonthlyLineFlexible(line);
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

  result.monthlyEntries = uniqueByKey(result.monthlyEntries, (row) => `${normalizeLabel(row.dateRange)}|${row.moneyIn}|${row.moneyOut}`);
  result.regularPayments = uniqueByKey(result.regularPayments, (row) => `${normalizeLabel(row.description)}|${normalizeLabel(row.frequency)}|${row.amount}|${normalizeLabel(row.notes)}`);
  result.regularIncomes = uniqueByKey(result.regularIncomes, (row) => `${normalizeLabel(row.description)}|${normalizeLabel(row.frequency)}|${row.amount}|${normalizeLabel(row.notes)}`);
  result.moniesOwed = uniqueByKey(result.moniesOwed, (row) => `${normalizeLabel(row.name)}|${row.amount}`);

  const notesMatch = text.match(/(?:Additional\s*Comments|Comments|Notes|Commentary)\s*:\s*([\s\S]*)$/i);
  if (notesMatch) {
    result.notes = notesMatch[1].trim();
  }

  return result;
}
