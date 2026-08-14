import type { NextApiRequest, NextApiResponse } from 'next';
import { extractTextFromPdfBuffer, parseTreasuryReportText } from '../../lib/pdf/treasuryReportImportParser';

type ReqBody = {
  filename?: string;
  contentBase64?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = req.body as ReqBody;
  const filename = (body?.filename || '').toLowerCase();
  const contentBase64 = body?.contentBase64;

  if (!contentBase64) {
    return res.status(400).json({ error: 'Missing contentBase64' });
  }

  try {
    const bytes = Buffer.from(contentBase64, 'base64');
    if (!bytes.length) {
      return res.status(400).json({ error: 'Uploaded file was empty.' });
    }

    let extractedText = '';

    if (filename.endsWith('.pdf')) {
      extractedText = await extractTextFromPdfBuffer(bytes);
    } else {
      extractedText = bytes.toString('utf8');
    }

    const parsed = parseTreasuryReportText(extractedText);

    const populatedCount =
      parsed.monthlyEntries.length +
      parsed.regularPayments.length +
      parsed.regularIncomes.length +
      parsed.moniesOwed.length;

    if (!parsed.reportingPeriod && !parsed.notes && populatedCount === 0) {
      return res.status(200).json({
        error: 'Could not find recognizable treasury sections in that file.',
        parsed,
      });
    }

    return res.status(200).json({ parsed });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to import treasury report.',
      details: error?.message || 'Unknown error',
    });
  }
}
