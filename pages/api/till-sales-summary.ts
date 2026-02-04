import type { NextApiRequest, NextApiResponse } from "next";
import { parseTradingCompanyPDF } from "../../lib/pdf/tradingCompanyParser";

type ReqBody = {
  filename?: string;
  contentBase64?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const body = req.body as ReqBody;

  if (!body?.contentBase64) {
    return res.status(400).json({ error: "Missing contentBase64" });
  }

try {
  const { contentBase64 } = body;

  // Decode base64 PDF content and parse it
  const pdfBytes = Buffer.from(contentBase64, "base64");
  console.log('PDF size: - till-sales-summary.ts:25', pdfBytes.length, 'bytes');
  
  const parsed = await parseTradingCompanyPDF(pdfBytes);
  console.log('Parsed items count: - till-sales-summary.ts:28', parsed.items.length);

  // Check if we got any items
  if (parsed.items.length === 0) {
    console.warn('No items found in PDF - till-sales-summary.ts:32');
    return res.status(200).json({
      error: 'No data found in PDF. The PDF may not contain the expected table format with columns: Avg Cost, Line Cost, Quantity, Value, Profit, GP%, Sales Ratio%',
      highestProfitItem: null,
      mostPopularItems: []
    });
  }

  // Match what your UI expects:
  const highestProfitItem = parsed.highestProfitItem
    ? { name: parsed.highestProfitItem.name, profit: parsed.highestProfitItem.profit }
    : null;

  const mostPopularItems = [...(parsed.items ?? [])]
    .sort((a, b) => b.salesRatioPercent - a.salesRatioPercent)
    .slice(0, 5)
    .map((i) => ({ name: i.name, quantity: i.quantity }));

  console.log('Success  highest profit: - till-sales-summary.ts:50', highestProfitItem, '- popular items:', mostPopularItems.length);

  return res.status(200).json({ highestProfitItem, mostPopularItems });
  } catch (e: any) {
    console.error('Error parsing PDF: - till-sales-summary.ts:54', e);
    return res.status(500).json({ 
      error: e?.message ?? "Failed to parse PDF",
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
    });
  }
}
