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

  // Validate base64 content
  if (!contentBase64 || contentBase64.length === 0) {
    return res.status(400).json({
      error: 'Empty PDF file received'
    });
  }

  // Decode base64 PDF content
  let pdfBytes: Buffer;
  try {
    pdfBytes = Buffer.from(contentBase64, "base64");
  } catch (decodeError) {
    return res.status(400).json({
      error: 'Invalid PDF file format - could not decode',
      details: decodeError instanceof Error ? decodeError.message : 'Unknown decode error'
    });
  }

  console.log('PDF size: - till-sales-summary.ts:41', pdfBytes.length, 'bytes');
  
  // Parse the PDF
  let parsed;
  try {
    parsed = await parseTradingCompanyPDF(pdfBytes);
  } catch (parseError) {
    console.error('PDF parsing error: - till-sales-summary.ts:48', parseError);
    return res.status(500).json({
      error: 'Could not read PDF file - file may be corrupted or encrypted',
      details: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
    });
  }

  console.log('Parsed items count: - till-sales-summary.ts:55', parsed.items.length);

  // Check if we got any items
  if (parsed.items.length === 0) {
    console.warn('No items found in PDF - till-sales-summary.ts:59');
    return res.status(200).json({
      error: 'No sales data found in PDF. Expected table with: Item Name, Avg Cost, Line Cost, Quantity, Value, Profit, GP%, Sales Ratio%',
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

  console.log('Success  highest profit: - till-sales-summary.ts:77', highestProfitItem, '- popular items:', mostPopularItems.length);

  return res.status(200).json({ highestProfitItem, mostPopularItems });
  } catch (e: any) {
    console.error('Unexpected error parsing PDF: - till-sales-summary.ts:81', e);
    return res.status(500).json({ 
      error: 'Unexpected error processing PDF',
      details: e?.message ?? "Unknown error"
    });
  }
}
