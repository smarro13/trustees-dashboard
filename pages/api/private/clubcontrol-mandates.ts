import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ClubControlError, fetchMandates } from '../../../lib/clubcontrol';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// Each listed ClubControl member's direct debit mandate, payment and renewal
// (lib/clubcontrol.ts fetchMandates), read live. Not stored. Admins only (it
// shows mandate ids). Nothing on the dashboard calls this at the moment.

export const config = { maxDuration: 60 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAdmin = (user: any) =>
  [user?.app_metadata?.role, user?.user_metadata?.role].some((r) => typeof r === 'string' && r.trim().toLowerCase() === 'admin');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!isAdmin(user)) return res.status(403).json({ ok: false, error: 'Only admins can see mandate details.' });

  const memberIds: string[] = Array.isArray(req.body?.memberIds)
    ? req.body.memberIds.filter((id: unknown): id is string => typeof id === 'string' && /^\d+$/.test(id))
    : [];
  if (memberIds.length === 0) return res.status(200).json({ ok: true, mandates: [] });

  try {
    const mandates = await fetchMandates(memberIds);
    return res.status(200).json({ ok: true, mandates: [...mandates.values()] });
  } catch (e) {
    const message = e instanceof ClubControlError ? e.message : 'Checking ClubControl failed.';
    console.error('ClubControl mandates failed:', message);
    return res.status(502).json({ ok: false, error: message });
  }
}
