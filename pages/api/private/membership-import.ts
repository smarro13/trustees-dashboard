import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { parseLoveAdminInvoices } from '../../../lib/importers/loveAdminImportParser';
import { saveLoveAdminPayments } from '../../../lib/membershipStore';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// Upload of LoveAdmin's Invoices All Report (.xlsx or .csv) for
// /operations/membership. Replaces the previous one; paid invoices'
// beneficiaries count as paid. Admins only.
//
// Called twice per upload: first without `apply` to get a preview of what
// would change (nothing is written), then with `apply: true` to save it.

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAdmin = (user: any) =>
  [user?.app_metadata?.role, user?.user_metadata?.role].some((r) => typeof r === 'string' && r.trim().toLowerCase() === 'admin');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!isAdmin(user)) {
    return res.status(403).json({ ok: false, error: 'Only admins can upload membership data.' });
  }

  const filename = typeof req.body?.filename === 'string' ? req.body.filename.slice(0, 200) : '';
  const contentBase64 = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : '';
  const apply = req.body?.apply === true;
  if (!filename || !contentBase64) {
    return res.status(400).json({ ok: false, error: 'filename and file contents are required.' });
  }
  const bytes = Buffer.from(contentBase64, 'base64');
  if (!bytes.length) return res.status(400).json({ ok: false, error: 'That file is empty.' });

  let parsed;
  try {
    parsed = await parseLoveAdminInvoices(filename, bytes);
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error?.message ?? 'Could not read that file.' });
  }
  const { payments, paidInvoices, skippedInvoices } = parsed;
  if (payments.length === 0) return res.status(400).json({ ok: false, error: 'No paid invoices found in that file.' });
  const summary = { paidInvoices, skippedInvoices, people: payments.length };
  if (!apply) return res.status(200).json({ ok: true, preview: summary });

  const saved = await saveLoveAdminPayments(supabaseAdmin, payments, filename, user.email || user.id);
  if ('error' in saved) return res.status(500).json({ ok: false, error: saved.error });
  return res.status(200).json({ ok: true, saved: summary });
}
