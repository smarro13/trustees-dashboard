// Using pdfjs-dist for serverless compatibility (Vercel)
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

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
    // Load PDF document using pdfjs-dist
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdfDocument = await loadingTask.promise;
    console.log('PDF loaded successfully, pages: - tradingCompanyParser.ts:54', pdfDocument.numPages);
    
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const content = await page.getTextContent();
      
      // Combine text items into lines
      const pageText = content.items
        .map((item: any) => item.str)
        .join(' ');
      
      textContent += pageText + '\n';
    }
    
    console.log('PDF parsed successfully, text length: - tradingCompanyParser.ts:69', textContent.length);
  } catch (err) {
    console.error('PDF parse error: - tradingCompanyParser.ts:71', err);
    throw new Error(`Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  const lines = textContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  console.log('Extracted - tradingCompanyParser.ts:80', lines.length, 'lines from PDF');

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
