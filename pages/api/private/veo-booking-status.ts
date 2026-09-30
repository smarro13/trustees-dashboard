import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendVeoClubEmail, type VeoEmailEvent } from '../../../lib/veoEmail';

// Records a VEO camera being collected (out), returned (in) or a booking
// cancelled, and emails the club. Called by /operations/veo-bookings.

// Kept local (not imported from lib/roles.ts) because this is a server-side
// API route — see pages/api/private/prematch-meals-orders.ts.
type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  if (value === 'director' || value === 'directors' || value === 'management' || value === 'mangement') return 'director';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  return null;
};

const resolveRole = (user: any): DashboardRole =>
  normalizeRole(user?.app_metadata?.role) || normalizeRole(user?.user_metadata?.role);

// Mirrors the "governance update veo_bookings" policy in veo_bookings.sql.
const EDIT_ROLES: DashboardRole[] = ['admin', 'trustee', 'director'];

// Which statuses each action is allowed from, and the status it moves to.
const ACTIONS: Record<Exclude<VeoEmailEvent, 'booked'>, { from: string[]; to: string }> = {
  collected: { from: ['booked'], to: 'out' },
  returned: { from: ['booked', 'out'], to: 'returned' },
  cancelled: { from: ['booked'], to: 'cancelled' },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!EDIT_ROLES.includes(resolveRole(user))) {
    return res.status(403).json({ ok: false, error: 'Your role cannot update VEO bookings.' });
  }

  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  const action = req.body?.action as keyof typeof ACTIONS;
  if (!id || !ACTIONS[action]) return res.status(400).json({ ok: false, error: 'id and a valid action are required.' });
  const returnNotes = typeof req.body?.returnNotes === 'string' ? req.body.returnNotes.trim().slice(0, 1000) : '';

  const { data: booking, error: loadError } = await supabaseAdmin
    .from('veo_bookings')
    .select('*')
    .eq('id', id)
    .single();
  if (loadError || !booking) return res.status(404).json({ ok: false, error: 'Booking not found.' });
  if (!ACTIONS[action].from.includes(booking.status)) {
    return res.status(409).json({ ok: false, error: `This booking is already ${booking.status}.` });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: ACTIONS[action].to,
    updated_at: now,
    updated_by: user.email || user.id,
  };
  if (action === 'collected') patch.collected_at = now;
  if (action === 'returned') {
    patch.returned_at = now;
    patch.collected_at = booking.collected_at ?? booking.time_out;
    patch.return_notes = returnNotes || null;
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('veo_bookings')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (updateError || !updated) {
    return res.status(500).json({ ok: false, error: updateError?.message ?? 'Update failed.' });
  }

  const emailed = await sendVeoClubEmail(action, updated, user.email || undefined);
  return res.status(200).json({ ok: true, emailed });
}
