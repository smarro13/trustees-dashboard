import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

type DashboardRole = 'admin' | 'management' | 'safeguarding' | 'commercial' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'management' || value === 'mangement') return 'management';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  return null;
};

const resolveRole = (user: any): DashboardRole => {
  const fromAppMeta = normalizeRole(user?.app_metadata?.role);
  if (fromAppMeta) return fromAppMeta;
  const fromUserMeta = normalizeRole(user?.user_metadata?.role);
  if (fromUserMeta) return fromUserMeta;
  return null;
};

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !requestingUser) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (resolveRole(requestingUser) !== 'admin') return res.status(403).json({ ok: false, error: 'Forbidden' });

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  if (!userId) return res.status(400).json({ ok: false, error: 'userId is required' });

  if (userId === requestingUser.id) {
    return res.status(400).json({ ok: false, error: 'You cannot delete your own account.' });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true });
}
