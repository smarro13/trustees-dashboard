import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, supabaseAdmin } from '../../../lib/serverAuth';
import { resolveRole } from '../../../lib/roles';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requestingUser = await requireAdmin(req, res);
  if (!requestingUser) return;

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const users = (data?.users || []).map((user) => ({
    id: user.id,
    email: user.email || '',
    role: resolveRole(user),
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
  }));

  return res.status(200).json({ ok: true, users });
}
