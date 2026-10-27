import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { runAndSaveLinkCheck } from '../../../lib/linkChecker';

// Weekly broken link check of the club website (vercel.json "crons").
// Protected by CRON_SECRET ("Authorization: Bearer …"). Results show on
// /admin/link-checker, where admins can also run it any time.

export const config = { maxDuration: 60 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const r = await runAndSaveLinkCheck(supabaseAdmin, 'Weekly check', 50_000);
  if ('error' in r) return res.status(502).json({ ok: false, error: r.error });
  return res.status(200).json({
    ok: true,
    pages: r.pages_checked,
    links: r.links_checked,
    broken: r.broken_count,
    blocked: r.blocked_count,
  });
}
