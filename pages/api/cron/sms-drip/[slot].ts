import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { dripRun } from '../../../../lib/smsCampaign';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// Sends the next few queued "move to ClubControl" texts (lib/smsCampaign.ts),
// if the campaign has been started. Called by four daily crons in vercel.json
// (/api/cron/sms-drip/1 … /4, spread through the day), so texts go out a few
// at a time rather than all at once. Protected by CRON_SECRET.

export const config = { maxDuration: 60 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    const result = await dripRun(supabaseAdmin);
    return res.status(200).json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The text run failed.';
    console.error('SMS drip failed:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
