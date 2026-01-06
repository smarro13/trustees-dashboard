import pdfParse from "pdf-parse";

export type TradingItem = {
  name: string;
  avgCost: number;
  lineCost: number;
  quantity: number;
  value: number;
  profit: number;
  gpPercent: number;
  salesRatioPercent: number;
};

export type TradingParseResult = {
  items: TradingItem[];
  highestProfitItem: TradingItem | null;
  mostPopularItems: TradingItem[];
};

export async function parseTradingCompanyPDF(buffer: Buffer): Promise<TradingParseResult> {
  const data = await pdfParse(buffer);
  const text = data.text || "";

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00A0/g, " ").trim())
    .filter(Boolean);

  const headerIdx = lines.findIndex((l) => {
    const s = l.toLowerCase();
    return (
      s.includes("avg") &&
      s.includes("cost") &&
      s.includes("line") &&
      s.includes("quantity") &&
      s.includes("value") &&
      s.includes("profit") &&
      (s.includes("gp") || s.includes("gp%")) &&
      (s.includes("sales") || s.includes("ratio"))
    );
  });

  const candidateLines = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

  const items: TradingItem[] = [];
  for (const line of candidateLines) {
    const parsed = parseRowLine(line);
    if (parsed) items.push(parsed);
  }

  const highestProfitItem =
    items.length > 0 ? items.reduce((best, cur) => (cur.profit > best.profit ? cur : best)) : null;

  const mostPopularItems = [...items]
    .sort((a, b) => b.salesRatioPercent - a.salesRatioPercent)
    .slice(0, 5);

  return { items, highestProfitItem, mostPopularItems };
}

function parseRowLine(line: string): TradingItem | null {
  if (!/\d/.test(line)) return null;

  const rawTokens = line.split(/\s+/).filter(Boolean);
  if (rawTokens.length < 8) return null;

  const tail = rawTokens.slice(-7);
  const name = rawTokens.slice(0, -7).join(" ").trim();
  if (!name) return null;

  const [avgCostStr, lineCostStr, quantityStr, valueStr, profitStr, gpStr, salesRatioStr] = tail;

  const avgCost = toNumber(avgCostStr);
  const lineCost = toNumber(lineCostStr);
  const quantity = toInt(quantityStr);
  const value = toNumber(valueStr);
  const profit = toNumber(profitStr);
  const gpPercent = toPercent(gpStr);
  const salesRatioPercent = toPercent(salesRatioStr);

  if (
    !Number.isFinite(avgCost) ||
    !Number.isFinite(lineCost) ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(value) ||
    !Number.isFinite(profit) ||
    !Number.isFinite(gpPercent) ||
    !Number.isFinite(salesRatioPercent)
  ) {
    return null;
  }

  return { name, avgCost, lineCost, quantity, value, profit, gpPercent, salesRatioPercent };
}

function toNumber(s: string): number {
  const cleaned = s.replace(/[,£$]/g, "").replace(/\((.*)\)/, "-$1");
  return parseFloat(cleaned);
}

function toInt(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10);
}

function toPercent(s: string): number {
  return parseFloat(s.replace("%", "").replace(/,/g, ""));
}
