import type { NextApiRequest, NextApiResponse } from 'next';
import { parseTradingUpdateFile } from '../../lib/importers/tradingUpdateImportParser';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

type ReqBody = {
  filename?: string;
  contentBase64?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = req.body as ReqBody;
  const filename = body?.filename || '';
  const contentBase64 = body?.contentBase64;

  if (!filename || !contentBase64) {
    return res.status(400).json({ error: 'Missing filename or contentBase64' });
  }

  try {
    const bytes = Buffer.from(contentBase64, 'base64');
    if (!bytes.length) {
      return res.status(400).json({ error: 'Uploaded file was empty.' });
    }

    const parsed = await parseTradingUpdateFile(filename, bytes);

    if (!parsed.notes && parsed.monthlyEntries.length === 0) {
      return res.status(200).json({
        error: 'Could not find any recognised data in that file.',
        hint: 'Expected a bank balances spreadsheet (Month | Opening Bal | Closing Bal) or a Word document with narrative updates.',
      });
    }

    return res.status(200).json({ parsed });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to import trading company update.',
      details: error?.message || 'Unknown error',
    });
  }
}
