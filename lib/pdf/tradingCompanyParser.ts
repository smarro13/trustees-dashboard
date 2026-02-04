// Using pdf2json for serverless compatibility (Vercel)
import PDFParser from 'pdf2json';

export type ParsedItem = {
  name: string;
  avgCost: number;
  lineCost: number;
  quantity: number;
  value: number;
  profitPercent: number;
  gpPercent: number;
  salesRatioPercent: number;
};

export type ParsedResult = {
  items: ParsedItem[];
  highestProfitItem: { name: string; profit: number } | null;
};

/* ----------------------------- helpers ----------------------------- */

function parseNumber(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function isSkippableLine(line: string): boolean {
  return (
    !line ||
    line.startsWith("Report Created") ||
    line.startsWith("Page ") ||
    line.startsWith("PLU Sales") ||
    line.startsWith("Date Range") ||
    line.startsWith("Site:") ||
    line.startsWith("PLU Name") ||
    line.startsWith("Grand Total")
  );
}

/* ----------------------------- parser ----------------------------- */

export async function parseTradingCompanyPDF(
  pdfBytes: Buffer
): Promise<ParsedResult> {
  console.log('Starting PDF parse, buffer size: - tradingCompanyParser.ts:47', pdfBytes.length);
  
  let textContent = '';
  try {
    // Extract text using pdf2json (serverless-compatible)
    const pdfParser = new PDFParser();
    
    // Parse PDF from buffer
    const parsePromise = new Promise<string>((resolve, reject) => {
      const decodeText = (raw: string): string => {
        if (!raw) return '';
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw.replace(/%/g, '');
        }
      };

      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          // Extract text from all pages, preserving row/column layout
          let allText = '';
          if (pdfData.Pages) {
            for (const page of pdfData.Pages) {
              const rows = new Map<number, { x: number; text: string }[]>();

              if (page.Texts) {
                for (const text of page.Texts) {
                  const rowKey = Math.round(text.y * 10) / 10; // normalize row positions
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

    textContent = await parsePromise;
    console.log('PDF parsed successfully, text length: - tradingCompanyParser.ts:113', textContent.length);
  } catch (err) {
    console.error('PDF parse error: - tradingCompanyParser.ts:115', err);
    throw new Error(`Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  const lines = textContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  console.log('Extracted - tradingCompanyParser.ts:124', lines.length, 'lines from PDF');

  const items: ParsedItem[] = [];

  for (const line of lines) {
    if (isSkippableLine(line)) continue;

    // split by whitespace (TC PDFs are space-aligned)
    const cols = line.split(/\s+/);

    // minimum viable row length
    if (cols.length < 8) continue;

    /**
     * Expected Trading Company row pattern:
     *
     * [0] PLU
     * [1...] Name (can be 1+ tokens)
     * [x] Random Code
     * [x+1] Avg Cost
     * [x+2] Line Cost
     * [x+3] Quantity
     * [x+4] Value
     * [x+5] Profit %
     * [x+6] GP %
     * [x+7] Sales Ratio
     */

    // Find first numeric column (Random Code)
    const firstNumberIdx = cols.findIndex((c) => /^[\d,.-]+$/.test(c));

    if (firstNumberIdx === -1 || firstNumberIdx < 2) continue;

    const name = cols
      .slice(1, firstNumberIdx)
      .join(" ")
      .trim();

    if (!name) continue;

    const numbers = cols.slice(firstNumberIdx).map(parseNumber);

    if (numbers.length < 7) continue;

    const [
      _randomCode,
      avgCost,
      lineCost,
      quantity,
      value,
      profitPercent,
      gpPercent,
      salesRatioPercent = 0,
    ] = numbers;

    items.push({
      name,
      avgCost,
      lineCost,
      quantity,
      value,
      profitPercent,
      gpPercent,
      salesRatioPercent,
    });
  }

  /* ------------------------- derived values ------------------------- */

  let highestProfitItem: ParsedResult["highestProfitItem"] = null;

  for (const item of items) {
    if (
      highestProfitItem === null ||
      item.value > highestProfitItem.profit
    ) {
      highestProfitItem = {
        name: item.name,
        profit: item.value,
      };
    }
  }

  return {
    items,
    highestProfitItem,
  };
}
