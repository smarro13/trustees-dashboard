import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser, supabaseAdmin } from '../../../lib/serverAuth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const { data, error } = await supabaseAdmin
    .from('public_padel_votes')
    .select('id, voter_name, vote_yes, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, votes: data || [] });
}
