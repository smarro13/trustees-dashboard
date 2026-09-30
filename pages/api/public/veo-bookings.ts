import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { PublicVeoCheckout } from '../../../lib/veoBookings';

// Cameras currently signed out, for the public page's status cards and the
// "Return a camera" list. Only the first name of whoever signed it out is
// shown, and no contact details.

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
    .select('id, camera, booked_by, team_name, fixture, time_out')
    .eq('status', 'out')
    .order('camera', { ascending: true });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const out: PublicVeoCheckout[] = (data || []).map((b) => ({
    ...b,
    booked_by: String(b.booked_by).trim().split(/\s+/)[0] || '',
  }));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, out });
}
