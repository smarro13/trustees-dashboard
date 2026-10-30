import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { syncMembersFromClubControl } from '../../../lib/clubcontrolSync';
import { syncPlayersFromGms } from '../../../lib/gmsSync';

// Weekly membership data fetch (vercel.json "crons", Mondays): the members
// export from ClubControl and the player list from GMS, each skipped if its
// login isn't set. Protected by CRON_SECRET ("Authorization: Bearer …").
// Admins can fetch either one any time from /operations/membership.

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

  // The two fetches don't depend on each other, so they run side by side to
  // stay inside the time limit (ClubControl alone takes ~25s).
  const [clubControl, gms] = await Promise.all([
    process.env.CLUBCONTROL_EMAIL && process.env.CLUBCONTROL_PASSWORD
      ? syncMembersFromClubControl(supabaseAdmin, 'ClubControl (weekly fetch)')
          .then((r) => ('error' in r ? `failed: ${r.error}` : `fetched ${r.total} members`))
      : 'not connected',
    process.env.GMS_EMAIL && process.env.GMS_PASSWORD
      ? syncPlayersFromGms(supabaseAdmin, 'GMS (weekly fetch)')
          .then((r) => ('error' in r ? `failed: ${r.error}` : `fetched ${r.players} players`))
      : 'not connected',
  ]);
  const results: Record<string, string> = { clubControl, gms };

  const failed = Object.values(results).some((v) => v.startsWith('failed'));
  return res.status(failed ? 502 : 200).json({ ok: !failed, ...results });
}
