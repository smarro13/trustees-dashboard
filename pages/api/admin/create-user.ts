import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

type DashboardRole = 'admin' | 'management' | 'president' | 'safeguarding' | 'commercial' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'management' || value === 'mangement') return 'management';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  return null;
};

const resolveRole = (user: any): DashboardRole => {
  return normalizeRole(user?.app_metadata?.role) || normalizeRole(user?.user_metadata?.role);
};

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

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

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !requestingUser) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (resolveRole(requestingUser) !== 'admin') return res.status(403).json({ ok: false, error: 'Forbidden' });

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
