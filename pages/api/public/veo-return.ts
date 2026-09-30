import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendVeoClubEmail } from '../../../lib/veoEmail';
import { cleanVeoUrl } from '../../../lib/veoBookings';

// Signs a VEO camera back in from the public page: records the time in and
// any condition notes against the open sign-out, then emails the club.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const HOUR_MS = 3_600_000;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body ?? {};
  if (body.website) return res.status(200).json({ ok: true });

  const id = text(body.id, 60);
  const returnedBy = text(body.name, 100);
  const returnNotes = text(body.returnNotes, 1000);
  const timeIn = new Date(text(body.timeIn, 40));
  const recordingUrl = cleanVeoUrl(body.recordingUrl);
  if (text(body.recordingUrl, 500) && !recordingUrl) {
    return res.status(400).json({ ok: false, error: 'The recording link must be a Veo link (veo.co or veo.com).' });
  }

  if (!id) return res.status(400).json({ ok: false, error: 'Choose the camera you’re returning.' });
  if (Number.isNaN(timeIn.getTime())) return res.status(400).json({ ok: false, error: 'Enter the time in.' });
  if (timeIn.getTime() > Date.now() + HOUR_MS) return res.status(400).json({ ok: false, error: 'Time in can’t be in the future.' });

  const { data: booking, error: loadError } = await supabaseAdmin
    .from('veo_bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadError) return res.status(500).json({ ok: false, error: loadError.message });
  if (!booking || booking.status !== 'out') {
    return res.status(409).json({ ok: false, error: 'That camera has already been signed back in.' });
  }
  if (timeIn.getTime() < new Date(booking.time_out).getTime()) {
    return res.status(400).json({ ok: false, error: 'Time in can’t be before the time it went out.' });
  }

  const notes = [returnNotes, returnedBy && returnedBy !== booking.booked_by ? `Returned by ${returnedBy}` : '']
    .filter(Boolean)
    .join(' — ');

  const { data: updated, error } = await supabaseAdmin
    .from('veo_bookings')
    .update({
      status: 'returned',
      time_in: timeIn.toISOString(),
      returned_at: new Date().toISOString(),
      return_notes: notes || null,
      ...(recordingUrl ? { recording_url: recordingUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'out')
    .select('*')
    .single();
  if (error || !updated) return res.status(500).json({ ok: false, error: error?.message ?? 'Could not sign the camera in.' });

  await sendVeoClubEmail('returned', updated);
  return res.status(200).json({ ok: true, camera: updated.camera });
}
