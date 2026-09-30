import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { PublicVeoBooking } from '../../../lib/veoBookings';

// Upcoming VEO bookings for the public booking page, so people can see when
// each camera is free. Contact details are never returned, and only the
// booker's first name is shown.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { data, error } = await supabaseAdmin
    .from('veo_bookings')
    .select('id, camera, booked_by, team_name, purpose, fixture, time_out, time_in, status')
    .neq('status', 'cancelled')
    .neq('status', 'returned')
    .gte('time_in', new Date().toISOString())
    .order('time_out', { ascending: true })
    .limit(100);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const bookings: PublicVeoBooking[] = (data || []).map((b) => ({
    ...b,
    booked_by: String(b.booked_by).trim().split(/\s+/)[0] || '',
  }));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, bookings });
}
