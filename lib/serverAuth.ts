import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { resolveRole, type DashboardRole } from './roles';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export function getBearerToken(req: NextApiRequest): string {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
}

export type AuthedUser = { id: string; email: string | null; role: DashboardRole };

// Verifies the request's bearer token against Supabase. On failure it writes
// the 401 response itself and returns null, so callers can just `if (!user) return;`.
export async function requireUser(req: NextApiRequest, res: NextApiResponse): Promise<AuthedUser | null> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  return { id: data.user.id, email: data.user.email ?? null, role: resolveRole(data.user) };
}

// Same as requireUser, but also requires the admin role (writes 403 otherwise).
export async function requireAdmin(req: NextApiRequest, res: NextApiResponse): Promise<AuthedUser | null> {
  const user = await requireUser(req, res);
  if (!user) return null;

  if (user.role !== 'admin') {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return null;
  }

  return user;
}
