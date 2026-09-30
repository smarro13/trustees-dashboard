import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { type PublicVeoCheckout, type PublicVeoRecording, VEO_RECENT_DAYS } from '../../../lib/veoBookings';

// For the public VEO page: cameras currently signed out (with any Veo Live
// link) and recently returned sessions (with any recording link). Only the
// first name of whoever signed a camera out is shown, and no contact details.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const since = new Date(Date.now() - VEO_RECENT_DAYS * 86_400_000).toISOString();

  const [outRes, recentRes] = await Promise.all([
    supabaseAdmin
      .from('veo_bookings')
      .select('id, camera, booked_by, team_name, fixture, time_out, live_url')
      .eq('status', 'out')
      .order('camera', { ascending: true }),
    supabaseAdmin
      .from('veo_bookings')
      .select('id, camera, team_name, purpose, fixture, time_out, recording_url')
      .eq('status', 'returned')
      .gte('time_out', since)
      .order('time_out', { ascending: false })
      .limit(40),
  ]);

  const error = outRes.error || recentRes.error;
  if (error) return res.status(500).json({ ok: false, error: error.message });

  const out: PublicVeoCheckout[] = (outRes.data || []).map((b) => ({
    ...b,
    booked_by: String(b.booked_by).trim().split(/\s+/)[0] || '',
  }));
  const recent: PublicVeoRecording[] = recentRes.data || [];

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, out, recent });
}
