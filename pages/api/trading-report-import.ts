import type { NextApiRequest, NextApiResponse } from 'next';
import {
  extractTextFromPdfBuffer,
  extractTextFromDocxBuffer,
  parseTradingWorkbookBuffer,
  parseTradingNotesText,
  parseTradingReportText,
  dedupeMonthlyEntries,
  type ImportedTradingReport,
} from '../../lib/pdf/tradingReportImportParser';
import { requireUser } from '../../lib/serverAuth';

type UploadedFile = {
  filename?: string;
  contentBase64?: string;
};

type ReqBody = {
  filename?: string;
  contentBase64?: string;
  files?: UploadedFile[];
};

const EMPTY_REPORT: ImportedTradingReport = {
  reportingPeriod: '',
  turnoverNotes: '',
  notes: '',
  monthlyEntries: [],
};

function mergeReports(base: ImportedTradingReport, next: ImportedTradingReport): ImportedTradingReport {
  return {
    reportingPeriod: base.reportingPeriod || next.reportingPeriod,
    turnoverNotes: [base.turnoverNotes, next.turnoverNotes].filter(Boolean).join('\n\n'),
    notes: [base.notes, next.notes].filter(Boolean).join('\n'),
    monthlyEntries: [...base.monthlyEntries, ...next.monthlyEntries],
  };
}

async function parseSingleFile(filename: string, bytes: Buffer): Promise<ImportedTradingReport> {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    const parsed = await parseTradingWorkbookBuffer(bytes);
    return {
      reportingPeriod: parsed.reportingPeriod,
      turnoverNotes: '',
      notes: parsed.notes,
      monthlyEntries: parsed.monthlyEntries,
    };
  }

  if (lower.endsWith('.docx')) {
    const text = await extractTextFromDocxBuffer(bytes);
    return { reportingPeriod: '', turnoverNotes: parseTradingNotesText(text), notes: '', monthlyEntries: [] };
  }

  if (lower.endsWith('.pdf')) {
    const text = await extractTextFromPdfBuffer(bytes);
    return parseTradingReportText(text);
  }

  const text = bytes.toString('utf8');
  return parseTradingReportText(text);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const body = req.body as ReqBody;
  const uploads: UploadedFile[] =
    Array.isArray(body?.files) && body.files.length
      ? body.files
      : body?.contentBase64
        ? [{ filename: body.filename, contentBase64: body.contentBase64 }]
        : [];

  if (!uploads.length) {
    return res.status(400).json({ error: 'Missing contentBase64 (or files[]).' });
  }

  try {
    let merged: ImportedTradingReport = { ...EMPTY_REPORT, monthlyEntries: [] };

    for (const upload of uploads) {
      const filename = upload.filename || '';
      if (!upload.contentBase64) continue;

      const bytes = Buffer.from(upload.contentBase64, 'base64');
      if (!bytes.length) continue;

      const parsed = await parseSingleFile(filename, bytes);
      merged = mergeReports(merged, parsed);
    }

    merged.monthlyEntries = dedupeMonthlyEntries(merged.monthlyEntries);

    const populatedCount =
      merged.monthlyEntries.length + (merged.turnoverNotes ? 1 : 0) + (merged.notes ? 1 : 0);

    if (!merged.reportingPeriod && populatedCount === 0) {
      return res.status(200).json({
        error: 'Could not find recognised fields in that file.',
        hint: 'Expected a "Bank Information" table (Opening Bal / Closing Bal columns) in an .xlsx workbook, or narrative updates in a .docx document.',
        parsed: merged,
      });
    }

    return res.status(200).json({ parsed: merged });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to import trading report.',
      details: error?.message || 'Unknown error',
    });
  }
}
