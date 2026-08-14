import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, supabaseAdmin } from '../../../lib/serverAuth';
import { normalizeRole, resolveRole } from '../../../lib/roles';

const allowedRoles = new Set(['admin', 'management', 'president', 'safeguarding', 'commercial', 'none']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requestingUser = await requireAdmin(req, res);
  if (!requestingUser) return;

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
