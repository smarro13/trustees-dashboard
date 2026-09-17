import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { issueTeamToken, verifyPassword } from '../../../lib/registerAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const teamSlug = typeof req.body?.teamSlug === 'string' ? req.body.teamSlug.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!teamSlug || !password) {
    return res.status(400).json({ ok: false, error: 'Team and password are required.' });
  }

  const { data: team, error } = await supabaseAdmin
    .from('register_teams')
    .select('slug, is_protected, password_hash')
    .eq('slug', teamSlug)
    .maybeSingle();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!team) return res.status(404).json({ ok: false, error: 'Unknown team.' });

  if (!team.is_protected) {
    return res.status(200).json({ ok: true, token: issueTeamToken(teamSlug) });
  }

  if (!verifyPassword(password, team.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Incorrect password.' });
  }

  return res.status(200).json({ ok: true, token: issueTeamToken(teamSlug) });
}
