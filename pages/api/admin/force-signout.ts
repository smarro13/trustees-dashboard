import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, supabaseAdmin } from '../../../lib/serverAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requestingUser = await requireAdmin(req, res);
  if (!requestingUser) return;

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  if (!userId) return res.status(400).json({ ok: false, error: 'userId is required' });

  if (userId === requestingUser.id) {
    return res.status(400).json({ ok: false, error: 'You cannot force sign out yourself.' });
  }

  // Revoke all sessions for the target user globally
  const { error } = await (supabaseAdmin.auth.admin as any).signOut(userId, 'global');
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true });
}
