import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, supabaseAdmin } from '../../../lib/serverAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requestingUser = await requireAdmin(req, res);
  if (!requestingUser) return;

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  if (!userId) return res.status(400).json({ ok: false, error: 'userId is required' });

  if (userId === requestingUser.id) {
    return res.status(400).json({ ok: false, error: 'You cannot delete your own account.' });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true });
}
