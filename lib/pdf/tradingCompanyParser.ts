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
  console.log('Starting PDF parse, buffer size:', pdfBytes.length);
  
  let textContent = '';
  try {
    // Extract text using pdf2json (serverless-compatible)
    const pdfParser = new PDFParser();
    
    // Parse PDF from buffer
    const parsePromise = new Promise<string>((resolve, reject) => {
      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          // Extract text from all pages
          let allText = '';
          if (pdfData.Pages) {
            for (const page of pdfData.Pages) {
              if (page.Texts) {
                for (const text of page.Texts) {
                  if (text.R) {
                    for (const run of text.R) {
                      if (run.T) {
                        // Decode URI-encoded text, with fallback for malformed URIs
                        try {
                          allText += decodeURIComponent(run.T) + ' ';
                        } catch (decodeError) {
                          // If decode fails, use the text as-is
                          allText += run.T.replace(/%/g, '') + ' ';
                        }
                      }
                    }
                  }
                }
                allText += '\n';
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
    console.log('PDF parsed successfully, text length:', textContent.length);
  } catch (err) {
    console.error('PDF parse error:', err);
    throw new Error(`Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  const lines = textContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  console.log('Extracted', lines.length, 'lines from PDF');

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
