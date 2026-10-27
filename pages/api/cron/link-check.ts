import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { runAndSaveLinkCheck } from '../../../lib/linkChecker';
import { emailAdminsAboutBrokenLinks } from '../../../lib/linkCheckEmail';

// Weekly broken link check of the club website (vercel.json "crons").
// Protected by CRON_SECRET ("Authorization: Bearer …"). Results show on
// /operations/link-checker, where admins can also run it any time. When it
// finds broken links, every admin is emailed (lib/linkCheckEmail.ts).

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

  // The check itself is saved either way; an email problem is only reported.
  let email: string;
  try {
    const e = await emailAdminsAboutBrokenLinks(supabaseAdmin, r);
    email = e.skipped ? `not sent: ${e.skipped}` : `sent to ${e.sent.length} admin(s)`;
  } catch (err) {
    email = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return res.status(200).json({
    ok: true,
    pages: r.pages_checked,
    links: r.links_checked,
    broken: r.broken_count,
    blocked: r.blocked_count,
    email,
  });
}
