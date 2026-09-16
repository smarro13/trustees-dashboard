import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { hashPassword, verifyPassword } from '../../../lib/registerAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | null;

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  return null;
};

const resolveRole = (user: any): DashboardRole =>
  normalizeRole(user?.app_metadata?.role) || normalizeRole(user?.user_metadata?.role);

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

/**
 * Rotates a team's passcode. Two ways in:
 *  - the coach/manager who already knows the CURRENT passcode (self-service,
 *    no trustee account needed — matches how these teams are actually run), or
 *  - a logged-in trustee dashboard admin, for when a team forgets its passcode.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const teamSlug = typeof req.body?.teamSlug === 'string' ? req.body.teamSlug.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';

  if (!teamSlug || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'A team and a new password (6+ characters) are required.' });
  }

  const { data: team, error } = await supabaseAdmin
    .from('register_teams')
    .select('id, is_protected, password_hash')
    .eq('slug', teamSlug)
    .maybeSingle();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!team) return res.status(404).json({ ok: false, error: 'Unknown team.' });
  if (!team.is_protected) {
    return res.status(400).json({ ok: false, error: 'This team is open and has no passcode to change.' });
  }

  const knowsCurrentPassword = verifyPassword(currentPassword, team.password_hash);

  if (!knowsCurrentPassword) {
    const bearerToken = getBearerToken(req);
    if (!bearerToken) {
      return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !user || resolveRole(user) !== 'admin') {
      return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('register_teams')
    .update({ password_hash: hashPassword(newPassword) })
    .eq('id', team.id);

  if (updateError) return res.status(500).json({ ok: false, error: updateError.message });
  return res.status(200).json({ ok: true });
}
