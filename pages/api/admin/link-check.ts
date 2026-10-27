import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireSignedInUser } from '../../../lib/apiAuth';
import { resolveRoleFromUser } from '../../../lib/roles';
import { baseUrlOf, findOrStartLinkCheck, startNextStep } from '../../../lib/linkCheckRun';

// Admin only. GET: the latest finished website link check, the one in
// progress (if any) and a short history. POST: start a check now and return
// straight away; it carries on by itself in steps (lib/linkCheckRun.ts) while
// the page shows progress.

export const config = { maxDuration: 60 };

const HISTORY_SHOWN = 12;
const SUMMARY_COLUMNS =
  'id, started_at, finished_at, updated_at, triggered_by, pages_checked, links_checked, broken_count, blocked_count, truncated';

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
    // The steps run as calls to the cron route, which needs CRON_SECRET.
    if (!process.env.CRON_SECRET) {
      return res.status(500).json({ ok: false, error: 'CRON_SECRET isn’t set in Vercel, so checks can’t run.' });
    }
    const r = await findOrStartLinkCheck(supabaseAdmin, user.email || user.id);
    if ('error' in r) return res.status(502).json({ ok: false, error: r.error });
    await startNextStep(baseUrlOf(req.headers.host), 1);
  }

  const [latestRes, runningRes, historyRes] = await Promise.all([
    supabaseAdmin
      .from('link_check_runs')
      .select(`${SUMMARY_COLUMNS}, site_url, problems`)
      .eq('status', 'done')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('link_check_runs')
      .select(SUMMARY_COLUMNS)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('link_check_runs')
      .select(SUMMARY_COLUMNS)
      .eq('status', 'done')
      .order('started_at', { ascending: false })
      .limit(HISTORY_SHOWN),
  ]);
  const error = latestRes.error || runningRes.error || historyRes.error;
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true, latest: latestRes.data, running: runningRes.data, history: historyRes.data ?? [] });
}
