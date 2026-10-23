import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { syncPlayersFromGms } from '../../../lib/gmsSync';

// Fetches the player list from RFU GMS and saves it (lib/gmsSync.ts).
//
// Called two ways:
//   * with "Authorization: Bearer <CRON_SECRET>" (the weekly job itself is
//     pages/api/cron/membership-sync.ts, which fetches ClubControl too)
//   * by an admin's "Fetch from GMS now" button on /operations/membership,
//     with their dashboard login
// The meeting-day membership report also fetches first (pages/api/cron/membership-report.ts).

export const config = { maxDuration: 60 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAdmin = (user: any) =>
  [user?.app_metadata?.role, user?.user_metadata?.role].some((r) => typeof r === 'string' && r.trim().toLowerCase() === 'admin');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const secret = process.env.CRON_SECRET || '';
  let uploadedBy = 'GMS (weekly fetch)';
  if (!(secret && token === secret)) {
    if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    if (!isAdmin(user)) return res.status(403).json({ ok: false, error: 'Only admins can fetch membership data.' });
    uploadedBy = `${user.email || user.id} (fetched from GMS)`;
  }

  const result = await syncPlayersFromGms(supabaseAdmin, uploadedBy);
  if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });
  return res.status(200).json({ ok: true, saved: { players: result.players } });
}
