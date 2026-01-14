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
  const parsed = await parseTradingCompanyPDF(pdfBytes);

  // Match what your UI expects:
  const highestProfitItem = parsed.highestProfitItem
    ? { name: parsed.highestProfitItem.name, profit: parsed.highestProfitItem.profit }
    : null;

  const mostPopularItems = [...(parsed.items ?? [])]
    .sort((a, b) => b.salesRatioPercent - a.salesRatioPercent)
    .slice(0, 5)
    .map((i) => ({ name: i.name, quantity: i.quantity }));

  return res.status(200).json({ highestProfitItem, mostPopularItems });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Failed to parse PDF" });
  }
}
