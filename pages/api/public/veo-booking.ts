import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { VEO_ACCESSORIES, VEO_CAMERAS, VEO_PURPOSES, formatVeoTime } from '../../../lib/veoBookings';

// Creates a VEO camera booking from the public booking page. The database
// refuses overlapping bookings of the same camera (veo_bookings_no_overlap).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_BOOKING_DAYS = 7;
const MAX_AHEAD_DAYS = 180;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body ?? {};

  // Honeypot: hidden field only bots fill in.
  if (body.website) return res.status(200).json({ ok: true });

  const bookedBy = text(body.name, 100);
  const phone = text(body.phone, 30);
  const email = text(body.email, 200);
  const team = text(body.team, 100);
  const camera = text(body.camera, 10);
  const purpose = text(body.purpose, 20);
  const fixture = text(body.fixture, 200);
  const notes = text(body.notes, 1000);
  const accessories = Array.isArray(body.accessories)
    ? body.accessories.filter((a: unknown): a is string => typeof a === 'string' && (VEO_ACCESSORIES as readonly string[]).includes(a))
    : [];
  const timeOut = new Date(text(body.timeOut, 40));
  const timeIn = new Date(text(body.timeIn, 40));

  if (!bookedBy) return res.status(400).json({ ok: false, error: 'Your name is required.' });
  if (!/^[+\d][\d\s()-]{6,}$/.test(phone)) return res.status(400).json({ ok: false, error: 'A valid mobile number is required.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'That email address doesn’t look right.' });
  if (!team) return res.status(400).json({ ok: false, error: 'Choose a team.' });
  if (!(VEO_CAMERAS as readonly string[]).includes(camera)) return res.status(400).json({ ok: false, error: 'Choose VEO 1 or VEO 2.' });
  if (!VEO_PURPOSES.some((p) => p.value === purpose)) return res.status(400).json({ ok: false, error: 'Choose what the booking is for.' });
  if (Number.isNaN(timeOut.getTime()) || Number.isNaN(timeIn.getTime())) {
    return res.status(400).json({ ok: false, error: 'Enter both the time out and time back in.' });
  }
  if (timeIn <= timeOut) return res.status(400).json({ ok: false, error: 'Time back in must be after time out.' });

  const now = Date.now();
  if (timeIn.getTime() < now) return res.status(400).json({ ok: false, error: 'That booking is in the past.' });
  if (timeOut.getTime() > now + MAX_AHEAD_DAYS * 86_400_000) {
    return res.status(400).json({ ok: false, error: `Bookings can only be made up to ${MAX_AHEAD_DAYS} days ahead.` });
  }
  if (timeIn.getTime() - timeOut.getTime() > MAX_BOOKING_DAYS * 86_400_000) {
    return res.status(400).json({ ok: false, error: `A booking can be at most ${MAX_BOOKING_DAYS} days long. Contact the club for longer.` });
  }

  const { data, error } = await supabaseAdmin
    .from('veo_bookings')
    .insert({
      camera,
      booked_by: bookedBy,
      contact_phone: phone,
      contact_email: email || null,
      team_name: team,
      purpose,
      fixture: fixture || null,
      time_out: timeOut.toISOString(),
      time_in: timeIn.toISOString(),
      accessories,
      notes: notes || null,
    })
    .select('id')
    .single();

  if (error) {
    // 23P01 = exclusion_violation: this camera is already booked for part of that time.
    if (error.code === '23P01') {
      const { data: clash } = await supabaseAdmin
        .from('veo_bookings')
        .select('team_name, time_out, time_in')
        .eq('camera', camera)
        .neq('status', 'cancelled')
        .lt('time_out', timeIn.toISOString())
        .gt('time_in', timeOut.toISOString())
        .order('time_out')
        .limit(1)
        .maybeSingle();
      const detail = clash
        ? ` ${clash.team_name} has it from ${formatVeoTime(clash.time_out)} to ${formatVeoTime(clash.time_in)}.`
        : '';
      return res.status(409).json({ ok: false, error: `${camera} is already booked for part of that time.${detail} Try the other camera or a different time.` });
    }
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, id: data.id });
}
