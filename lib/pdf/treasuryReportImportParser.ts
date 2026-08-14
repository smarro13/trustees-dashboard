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

// Handles money tokens as they actually appear in scanned/typed treasury reports,
// e.g. "-£8,614.66" (sign before the currency symbol) or "£6,681,30" (comma typo'd
// in place of a decimal point).
function normalizeMoneyToken(raw: string): string {
  if (!raw) return '';
  let token = raw.trim();
  let negative = false;

  if (token.startsWith('-')) {
    negative = true;
    token = token.slice(1);
  }

  token = token.replace(/[£$]/g, '').trim();

  if (token.startsWith('(') && token.endsWith(')')) {
    negative = true;
    token = token.slice(1, -1);
  }

  if (!token.includes('.') && /,\d{2}$/.test(token)) {
    token = token.replace(/,(\d{2})$/, '.$1');
  }

  token = token.replace(/,/g, '');

  const n = Number(token);
  if (!Number.isFinite(n)) return '';

  return (negative ? -n : n).toFixed(2);
}

function extractMoneyTokens(line: string): string[] {
  const matches = line.match(/-?£[\d,]+(?:\.\d+)?/g) || [];
  return matches.map(normalizeMoneyToken).filter((value) => value.length > 0);
}

// Loose "about 2k" / "approx. 8K" / "£2,700" style amounts used in prose bullets.
function extractApproxAmount(text: string): string {
  const poundMatch = text.match(/£\s?[\d,]+(?:\.\d+)?/);
  if (poundMatch) return normalizeMoneyToken(poundMatch[0]);

  const kMatch = text.match(/(\d+(?:\.\d+)?)\s*[kK]\b/);
  if (kMatch) {
    const n = Number(kMatch[1]) * 1000;
    if (Number.isFinite(n)) return n.toFixed(2);
  }

  return '';
}

function stripAmountPhrase(text: string): string {
  return text
    .replace(/£\s?[\d,]+(?:\.\d+)?/g, '')
    .replace(/\b(?:about|approx\.?|approximately)?\s*\d+(?:\.\d+)?\s*[kK]\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.,-]+$/, '')
    .trim();
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

// Table rows like "Gas Monthly £360 Now doing monthly readings" or
// "Total Energies Quarterly (Shared) £3,250.00 Electric - increased", used for both
// the "Regular Payments" and "Regular Incomes" tables in the real-world report.
const FREQUENCY_ALTERNATION =
  'Monthly TC|Monthly|Fortnightly|Weekly|Annually\\s*/\\s*Biannually|Annually|Biannually|Quarterly\\s*\\(Shared\\)|Quarterly|Annual|Yearly|One[- ]off';

const REGULAR_TABLE_ROW_REGEX = new RegExp(
  `^(.+?)\\s+(${FREQUENCY_ALTERNATION})\\s+(£[\\d,]+(?:\\.\\d+)?)\\s*(.*)$`,
  'i'
);

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

// Date-range table rows like "02/07/26 – 31/07/26 £30,833.76 £22,049.95 £8,783.81 £24,018.75"
// (Date Range | Money in | Money out | Difference | New Balance). Only the first two
// money tokens (money in / money out) are needed by the app.
function parseDateRangeRow(rawLine: string) {
  const line = rawLine.trim();
  const rowMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.*)$/);
  if (!rowMatch) return null;

  const tokens = extractMoneyTokens(rowMatch[3]);
  if (tokens.length < 2) return null;

  return {
    dateRange: `${rowMatch[1]} – ${rowMatch[2]}`,
    moneyIn: tokens[0],
    moneyOut: tokens[1],
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
    monthlyEntries: [],
    regularPayments: [],
    regularIncomes: [],
    moniesOwed: [],
  };

  const text = rawText || '';

  const periodMatch = text.match(/(?:Reporting|Finance|Financial)\s*period\s*:\s*([^\n\r]+)/i)
    || text.match(/^Period\s*:\s*([^\n\r]+)/im);
  if (periodMatch) {
    result.reportingPeriod = periodMatch[1].trim();
  } else {
    const rangeMatch = text.match(/Money\s*In\s*between\s*([\d/]+)\s*[–—-]\s*([\d/]+)/i);
    if (rangeMatch) {
      result.reportingPeriod = `${rangeMatch[1]} – ${rangeMatch[2]}`;
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // "Regular Payments Frequency Amount Notes" is the literal header for both the
  // outgoings and incomes tables in the real report; a "Regular Incomes" heading
  // right before the second occurrence is what tells them apart.
  let section: 'none' | 'notes' | 'payments' | 'incomes' | 'owing' = 'none';
  let sawIncomesHeading = false;
  const notesLines: string[] = [];

  for (const line of lines) {
    if (/^Things to note\b/i.test(line)) { section = 'notes'; continue; }
    if (/^Monies\s*currently\s*due\s*in\b/i.test(line)) { section = 'notes'; continue; }
    if (/^Monies\s*Owing\b/i.test(line)) { section = 'owing'; continue; }
    if (/^Regular\s*Incomes$/i.test(line)) { sawIncomesHeading = true; continue; }
    if (/^Regular\s*Payments\s+Frequency\s+Amount\s+Notes$/i.test(line)) {
      section = sawIncomesHeading ? 'incomes' : 'payments';
      continue;
    }
    if (/^Date\s*Range\s+Money\s*in\s+Money\s*out/i.test(line)) { section = 'none'; continue; }

    const bulletMatch = line.match(/^[•▪●]\s*(.+)$/);
    if (bulletMatch) {
      const content = bulletMatch[1].trim();
      if (section === 'notes') {
        notesLines.push(content);
      } else if (section === 'owing') {
        const amount = extractApproxAmount(content);
        const name = stripAmountPhrase(content) || content;
        if (name && amount) {
          result.moniesOwed.push({ name, amount });
        }
      }
      continue;
    }

    const dateRangeEntry = parseDateRangeRow(line);
    if (dateRangeEntry) {
      result.monthlyEntries.push(dateRangeEntry);
      continue;
    }

    const regularTableMatch = section === 'payments' || section === 'incomes'
      ? line.match(REGULAR_TABLE_ROW_REGEX)
      : null;
    if (regularTableMatch) {
      const description = regularTableMatch[1].trim();
      const frequency = regularTableMatch[2].trim();
      const amount = normalizeMoneyToken(regularTableMatch[3]);
      const notes = (regularTableMatch[4] || '').trim();

      if (description && amount && !/^total$/i.test(description)) {
        if (section === 'payments') {
          result.regularPayments.push({ description, frequency, amount, notes });
        } else {
          result.regularIncomes.push({ description, frequency, amount, notes });
        }
      }
      continue;
    }

    const legacyMonthly = parseMonthlyLine(line) || parseMonthlyLineFlexible(line);
    if (legacyMonthly) {
      result.monthlyEntries.push(legacyMonthly);
      continue;
    }

    const legacyPayment = parseRegularLine(line);
    if (legacyPayment) {
      result.regularPayments.push(legacyPayment);
      continue;
    }

    const legacyIncome = parseRegularIncomeLine(line);
    if (legacyIncome) {
      result.regularIncomes.push(legacyIncome);
      continue;
    }

    const legacyOwed = parseMoneyOwedLine(line);
    if (legacyOwed) {
      result.moniesOwed.push(legacyOwed);
      continue;
    }

    if (
      (section === 'payments' || section === 'incomes') &&
      /[a-zA-Z]{3,}/.test(line) &&
      !/^total\b/i.test(line)
    ) {
      notesLines.push(line.replace(/\*\*/g, '').trim());
    }
  }

  result.monthlyEntries = uniqueByKey(result.monthlyEntries, (row) => `${normalizeLabel(row.dateRange)}|${row.moneyIn}|${row.moneyOut}`);
  result.regularPayments = uniqueByKey(result.regularPayments, (row) => `${normalizeLabel(row.description)}|${normalizeLabel(row.frequency)}|${row.amount}|${normalizeLabel(row.notes)}`);
  result.regularIncomes = uniqueByKey(result.regularIncomes, (row) => `${normalizeLabel(row.description)}|${normalizeLabel(row.frequency)}|${row.amount}|${normalizeLabel(row.notes)}`);
  result.moniesOwed = uniqueByKey(result.moniesOwed, (row) => `${normalizeLabel(row.name)}|${row.amount}`);

  if (notesLines.length) {
    result.notes = notesLines.join('\n');
  }

  const notesMatch = text.match(/(?:Additional\s*Comments|Comments|Notes|Commentary)\s*:\s*([\s\S]*)$/i);
  if (notesMatch) {
    const legacyNotes = notesMatch[1].trim();
    result.notes = result.notes ? `${result.notes}\n${legacyNotes}` : legacyNotes;
  }

  return result;
}
