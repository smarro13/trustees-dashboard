import type { NextApiRequest, NextApiResponse } from "next";
import { parseTradingCompanyPDF } from "../../lib/pdf/tradingCompanyParser";

type ReqBody = {
  filename?: string;
  contentBase64?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Wrap everything in try-catch to prevent unexpected JSON errors
  try {
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

      console.log('PDF size: - till-sales-summary.ts:43', pdfBytes.length, 'bytes');
      
      // Parse the PDF
      let parsed;
      try {
        parsed = await parseTradingCompanyPDF(pdfBytes);
      } catch (parseError) {
        console.error('PDF parsing error: - till-sales-summary.ts:50', parseError);
        return res.status(500).json({
          error: 'Could not read PDF file - file may be corrupted or encrypted',
          details: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
        });
      }

      console.log('Parsed items count: - till-sales-summary.ts:57', parsed.items.length);

      // Check if we got any items
      if (parsed.items.length === 0) {
        console.warn('No items found in PDF - till-sales-summary.ts:61');
        return res.status(200).json({
          error: 'No sales data found in PDF. Expected table with: Item Name, Avg Cost, Line Cost, Quantity, Value, Profit, GP%, Sales Ratio%',
          highestProfitItem: null,
          mostPopularItems: []
        });
      }

      // Group FR items with their non-FR counterparts
      const groupedItems = [...(parsed.items ?? [])];
      const itemMap = new Map<string, any>();
      
      for (const item of groupedItems) {
        // Remove "FR " prefix OR " FR" suffix to get base name
        const baseName = item.name
          .replace(/^FR\s+/i, '') // Remove "FR " at start
          .replace(/\s+FR\s*$/i, '') // Remove " FR" at end
          .trim();
        
        if (itemMap.has(baseName)) {
          // Combine with existing item
          const existing = itemMap.get(baseName);
          existing.quantity += item.quantity;
          existing.value += item.value;
          existing.lineCost += item.lineCost;
          existing.avgCost = (existing.lineCost / existing.quantity); // recalculate avg cost
          // Update salesRatioPercent proportionally
          existing.salesRatioPercent = ((existing.value / item.value) * item.salesRatioPercent);
        } else {
          itemMap.set(baseName, { ...item, name: baseName });
        }
      }

      const mergedItems = Array.from(itemMap.values());
      console.log('Merged items count: - till-sales-summary.ts:95', mergedItems.length, 'from', parsed.items.length);

      // Get top 10 items by sales ratio
      const topTenItems = [...mergedItems]
        .sort((a, b) => b.salesRatioPercent - a.salesRatioPercent)
        .slice(0, 10);

      const mostPopularItems = topTenItems.map((i) => ({ name: i.name, quantity: i.quantity, salesValue: i.value }));

      // Calculate totals for top 10 items
      let highestProfitItem = null;
      if (topTenItems.length > 0) {
        let totalSales = 0;
        let totalProfit = 0;
        
        for (const item of topTenItems) {
          totalSales += item.value;
          totalProfit += (item.value - item.lineCost);
        }
        
        highestProfitItem = {
          name: `Top 10 Items Combined`,
          profit: totalProfit,
          salesValue: totalSales
        };
      }

      console.log('Success  highest profit: - till-sales-summary.ts:122', highestProfitItem, '- popular items:', mostPopularItems.length);

      // Build summary text for saving
      let summaryText = '';
      if (highestProfitItem) {
        summaryText = `🏆 Top 10 Items Summary:\n  Total Sales: £${highestProfitItem.salesValue.toFixed(2)}\n  Total Profit: £${highestProfitItem.profit.toFixed(2)}\n\n`;
        summaryText += `📊 Top 10 Items:\n`;
        mostPopularItems.forEach((item, idx) => {
          summaryText += `  ${idx + 1}. ${item.name} - ${item.quantity} sold (£${item.salesValue.toFixed(2)})\n`;
        });
      }

      return res.status(200).json({ highestProfitItem, mostPopularItems, summaryText });
    } catch (e: any) {
      console.error('Unexpected error parsing PDF: - till-sales-summary.ts:136', e);
      return res.status(500).json({ 
        error: 'Unexpected error processing PDF',
        details: e?.message ?? "Unknown error",
        stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
      });
    }
  } catch (outerError: any) {
    // Catch any errors that occur before we can send a proper JSON response
    console.error('Critical error in API handler: - till-sales-summary.ts:145', outerError);
    try {
      return res.status(500).json({
        error: 'Server error - API handler failed',
        details: outerError?.message ?? 'Unknown critical error'
      });
    } catch {
      // If even sending JSON fails, we're in trouble - but at least don't crash
      return;
    }
  }
}
