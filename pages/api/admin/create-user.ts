import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { requireAdmin, supabaseAdmin } from '../../../lib/serverAuth';
import { normalizeRole, resolveRole } from '../../../lib/roles';

const createTemporaryPassword = (length = 16) => {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
  const bytes = randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i += 1) {
    password += charset[bytes[i] % charset.length];
  }

  return password;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requestingUser = await requireAdmin(req, res);
  if (!requestingUser) return;

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const roleInput = typeof req.body?.role === 'string' ? req.body.role.trim().toLowerCase() : 'none';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'A valid email address is required.' });
  }

  const role = normalizeRole(roleInput);
  const temporaryPassword = createTemporaryPassword();

  // Create user with a random temporary password so they can log in immediately.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    app_metadata: role ? { role, roles: [role] } : {},
  });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({
    ok: true,
    temporaryPassword,
    user: {
      id: data.user.id,
      email: data.user.email || '',
      role: resolveRole(data.user),
      created_at: data.user.created_at,
      last_sign_in_at: data.user.last_sign_in_at ?? null,
    },
  });
}
