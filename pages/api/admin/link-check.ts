import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireSignedInUser } from '../../../lib/apiAuth';
import { resolveRoleFromUser } from '../../../lib/roles';
import { runAndSaveLinkCheck } from '../../../lib/linkChecker';

// Admin only. GET: the latest website link check plus a short history.
// POST: run a check now (lib/linkChecker.ts) and return it.

export const config = { maxDuration: 60 };

const HISTORY_SHOWN = 12;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requireSignedInUser(req, res);
  if (!user) return;
  if (resolveRoleFromUser(user) !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Only admins can see the link checker.' });
  }

  if (req.method === 'POST') {
    const r = await runAndSaveLinkCheck(supabaseAdmin, user.email || user.id, 50_000);
    if ('error' in r) return res.status(502).json({ ok: false, error: r.error });
  }

  const [latestRes, historyRes] = await Promise.all([
    supabaseAdmin.from('link_check_runs').select('*').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin
      .from('link_check_runs')
      .select('id, started_at, finished_at, triggered_by, pages_checked, links_checked, broken_count, blocked_count, truncated')
      .order('started_at', { ascending: false })
      .limit(HISTORY_SHOWN),
  ]);
  const error = latestRes.error || historyRes.error;
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true, latest: latestRes.data, history: historyRes.data ?? [] });
}
