import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

type DashboardRole = 'admin' | 'management' | 'safeguarding' | 'commercial' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ROLE_RANK: Record<Exclude<DashboardRole, null>, number> = {
  admin: 4,
  management: 3,
  safeguarding: 2,
  commercial: 1,
};

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;

  const value = rawRole.trim().toLowerCase();
  if (!value) return null;

  if (value === 'admin') return 'admin';
  if (value === 'management' || value === 'mangement') return 'management';
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

const allowedRoles = new Set(['admin', 'management', 'safeguarding', 'commercial', 'none']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const roleInput = typeof req.body?.role === 'string' ? req.body.role.trim().toLowerCase() : '';

  if (!userId || !allowedRoles.has(roleInput)) {
    return res.status(400).json({ ok: false, error: 'Invalid input' });
  }

  const nextRole = roleInput === 'none' ? null : normalizeRole(roleInput);
  if (roleInput !== 'none' && !nextRole) {
    return res.status(400).json({ ok: false, error: 'Invalid role' });
  }

  const { data: targetData, error: targetError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (targetError || !targetData?.user) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }

  const currentAppMetadata = targetData.user.app_metadata || {};
  const nextAppMetadata = { ...currentAppMetadata } as Record<string, unknown>;

  if (nextRole) {
    nextAppMetadata.role = nextRole;
    nextAppMetadata.roles = [nextRole];
  } else {
    delete nextAppMetadata.role;
    delete nextAppMetadata.roles;
  }

  const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: nextAppMetadata,
  });

  if (updateError || !updated.user) {
    return res.status(500).json({ ok: false, error: updateError?.message || 'Failed to update user role' });
  }

  return res.status(200).json({
    ok: true,
    user: {
      id: updated.user.id,
      email: updated.user.email || '',
      role: resolveRole(updated.user),
    },
  });
}
