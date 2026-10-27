import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { WEEKLY_TRIGGER, baseUrlOf, runLinkCheckStep, startNextStep } from '../../../lib/linkCheckRun';

// Broken link check of the club website, a step at a time (lib/linkCheckRun.ts).
// Protected by CRON_SECRET ("Authorization: Bearer …").
//
//   * The daily cron (vercel.json "crons") starts a new check on Mondays, and
//     on other days carries on any check left unfinished.
//   * Each step calls this route again with ?step=N to do the next one, until
//     the check is finished.
//
// Results show on /operations/link-checker, where admins can also start a
// check any time. When a weekly check finds broken links, every admin is
// emailed (lib/linkCheckEmail.ts).

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

  const step = Number(req.query.step) || 0;
  const isMonday = new Date().getUTCDay() === 1;
  const r = await runLinkCheckStep(supabaseAdmin, step === 0 && isMonday ? WEEKLY_TRIGGER : undefined);
  if ('error' in r) return res.status(502).json({ ok: false, error: r.error });

  if ('done' in r && !r.done) await startNextStep(baseUrlOf(req.headers.host), step + 1);
  return res.status(200).json({ ok: true, ...r });
}
