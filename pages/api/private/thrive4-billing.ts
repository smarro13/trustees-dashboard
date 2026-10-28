import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Thrive4Error, fetchThrive4Billing } from '../../../lib/thrive4';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// What Thrive4 has invoiced this month and will invoice next, per person, for
// the Thrive4 billing card on /operations/membership. Fetched live each time
// and not stored. Read only: nothing in Thrive4 is changed.
//
// Open to whoever can see the membership page: admins, trustees, directors,
// the Director of Rugby, and anyone given the membership switch on /admin/roles.

export const config = { maxDuration: 60 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VIEW_ROLES = ['admin', 'trustee', 'director', 'directors', 'management', 'mangement', 'dor'];

const canView = (user: any) =>
  user?.app_metadata?.membership_access === true ||
  [user?.app_metadata?.role, user?.user_metadata?.role].some((r) => typeof r === 'string' && VIEW_ROLES.includes(r.trim().toLowerCase()));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!canView(user)) return res.status(403).json({ ok: false, error: 'Your role can’t see membership data.' });

  if (!process.env.THRIVE4_EMAIL || !process.env.THRIVE4_PASSWORD) {
    return res.status(503).json({ ok: false, error: 'Thrive4 isn’t connected yet (THRIVE4_EMAIL / THRIVE4_PASSWORD).' });
  }

  try {
    const people = await fetchThrive4Billing();
    return res.status(200).json({ ok: true, people, checkedAt: new Date().toISOString() });
  } catch (e) {
    const message = e instanceof Thrive4Error ? e.message : 'Checking Thrive4 failed.';
    console.error('Thrive4 billing failed:', message);
    return res.status(502).json({ ok: false, error: message });
  }
}
