import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

type DashboardRole = 'admin' | 'management' | 'president' | 'safeguarding' | 'commercial' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ROLE_RANK: Record<Exclude<DashboardRole, null>, number> = {
  admin: 4,
  management: 3,
  president: 2,
  safeguarding: 2,
  commercial: 1,
};

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;

  const value = rawRole.trim().toLowerCase();
  if (!value) return null;

  if (value === 'admin') return 'admin';
  if (value === 'management' || value === 'mangement') return 'management';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';

  return null;
};

const highestRoleFromList = (values: unknown[]): DashboardRole => {
  let highest: DashboardRole = null;

  for (const value of values) {
    const normalized = normalizeRole(value);
    if (!normalized) continue;
    if (!highest || ROLE_RANK[normalized] > ROLE_RANK[highest]) {
      highest = normalized;
    }
  }

  return highest;
};

const resolveRole = (user: any): DashboardRole => {
  const roleFromAppMeta = normalizeRole(user?.app_metadata?.role);
  const roleFromUserMeta = normalizeRole(user?.user_metadata?.role);
  const appMetaRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
  const userMetaRoles = Array.isArray(user?.user_metadata?.roles) ? user.user_metadata.roles : [];
  const roleFromAppArray = highestRoleFromList(appMetaRoles);
  const roleFromUserArray = highestRoleFromList(userMetaRoles);

  return roleFromAppMeta || roleFromUserMeta || roleFromAppArray || roleFromUserArray;
};

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const {
    data: { user: requestingUser },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !requestingUser) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const requesterRole = resolveRole(requestingUser);
  if (requesterRole !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

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
