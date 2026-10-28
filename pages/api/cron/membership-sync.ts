import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { syncMembersFromClubControl } from '../../../lib/clubcontrolSync';
import { syncPlayersFromGms } from '../../../lib/gmsSync';
// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
import { syncPaymentsFromThrive4 } from '../../../lib/thrive4Sync';

// Weekly membership data fetch (vercel.json "crons", Mondays): the members
// export from ClubControl, the player list from GMS and the paid LoveAdmin
// invoices from Thrive4, each skipped if its login isn't set. Protected by CRON_SECRET ("Authorization: Bearer …").
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

  const results: Record<string, string> = {};

  if (process.env.CLUBCONTROL_EMAIL && process.env.CLUBCONTROL_PASSWORD) {
    const r = await syncMembersFromClubControl(supabaseAdmin, 'ClubControl (weekly fetch)');
    results.clubControl = 'error' in r ? `failed: ${r.error}` : `fetched ${r.total} members`;
  } else {
    results.clubControl = 'not connected';
  }

  if (process.env.GMS_EMAIL && process.env.GMS_PASSWORD) {
    const r = await syncPlayersFromGms(supabaseAdmin, 'GMS (weekly fetch)');
    results.gms = 'error' in r ? `failed: ${r.error}` : `fetched ${r.players} players`;
  } else {
    results.gms = 'not connected';
  }

  // LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
  if (process.env.THRIVE4_EMAIL && process.env.THRIVE4_PASSWORD) {
    const r = await syncPaymentsFromThrive4(supabaseAdmin, 'Thrive4 (weekly fetch)');
    results.thrive4 = 'error' in r ? `failed: ${r.error}` : `fetched ${r.people} people on paid invoices for ${r.monthLabel}`;
  } else {
    results.thrive4 = 'not connected';
  }

  const failed = Object.values(results).some((v) => v.startsWith('failed'));
  return res.status(failed ? 502 : 200).json({ ok: !failed, ...results });
}
