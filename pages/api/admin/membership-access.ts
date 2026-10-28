// Turns the per-user membership switch on or off (app_metadata.membership_access).
// It gives read access to /operations/membership whatever the user's role
// (proxy.ts, membership.tsx, supabase/policies/membership_access.sql). Admin only.
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | 'dor' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  // "management" is the legacy name for this role — keep accepting it so users
  // already assigned it before the "director" rename still resolve correctly.
  if (value === 'director' || value === 'directors' || value === 'management' || value === 'mangement') return 'director';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  if (value === 'dor' || value === 'director of rugby' || value === 'director-of-rugby' || value === 'director_of_rugby') return 'dor';
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
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !requestingUser) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (resolveRole(requestingUser) !== 'admin') return res.status(403).json({ ok: false, error: 'Forbidden' });

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const enabled = req.body?.enabled;
  if (!userId || typeof enabled !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'userId and enabled are required' });
  }

  const { data: targetData, error: targetError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (targetError || !targetData?.user) return res.status(404).json({ ok: false, error: 'User not found' });

  const nextAppMetadata = { ...(targetData.user.app_metadata || {}) } as Record<string, unknown>;
  if (enabled) nextAppMetadata.membership_access = true;
  else delete nextAppMetadata.membership_access;

  const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: nextAppMetadata,
  });
  if (updateError || !updated.user) {
    return res.status(500).json({ ok: false, error: updateError?.message || 'Failed to update membership access' });
  }

  return res.status(200).json({ ok: true, membership_access: (updated.user.app_metadata as any)?.membership_access === true });
}
