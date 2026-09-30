import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { VEO_ACCESSORIES, VEO_CAMERAS, VEO_PURPOSES, cleanVeoUrl, formatVeoTime } from '../../../lib/veoBookings';
import { sendVeoBookerConfirmation, sendVeoClubEmail } from '../../../lib/veoEmail';

// Signs a VEO camera out from the public page. The database refuses a second
// sign-out of a camera that's already out (veo_bookings_one_out_per_camera).
// Signing back in is pages/api/public/veo-return.ts.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DAY_MS = 86_400_000;

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
  const liveUrl = cleanVeoUrl(body.liveUrl);
  if (text(body.liveUrl, 500) && !liveUrl) {
    return res.status(400).json({ ok: false, error: 'The live link must be a Veo link (veo.co or veo.com).' });
  }

  if (!bookedBy) return res.status(400).json({ ok: false, error: 'Your name is required.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'That email address doesn’t look right.' });
  if (!team) return res.status(400).json({ ok: false, error: 'Choose a team.' });
  if (!(VEO_CAMERAS as readonly string[]).includes(camera)) return res.status(400).json({ ok: false, error: 'Choose VEO 1 or VEO 2.' });
  if (!VEO_PURPOSES.some((p) => p.value === purpose)) return res.status(400).json({ ok: false, error: 'Choose what it’s for.' });
  if (Number.isNaN(timeOut.getTime())) return res.status(400).json({ ok: false, error: 'Enter the time out.' });

  // Allow logging a sign-out a little after the fact, or collecting shortly ahead.
  const now = Date.now();
  if (timeOut.getTime() < now - 7 * DAY_MS || timeOut.getTime() > now + DAY_MS) {
    return res.status(400).json({ ok: false, error: 'Time out must be within the last week or the next 24 hours.' });
  }

  const row = {
    camera,
    booked_by: bookedBy,
    contact_email: email || null,
    team_name: team,
    purpose,
    fixture: fixture || null,
    time_out: timeOut.toISOString(),
    accessories,
    notes: notes || null,
    live_url: liveUrl,
    status: 'out',
  };

  const { data, error } = await supabaseAdmin.from('veo_bookings').insert(row).select('id').single();

  if (error) {
    // 23505 = unique_violation: this camera is already signed out.
    if (error.code === '23505') {
      const { data: current } = await supabaseAdmin
        .from('veo_bookings')
        .select('team_name, time_out')
        .eq('camera', camera)
        .eq('status', 'out')
        .maybeSingle();
      const detail = current ? ` ${current.team_name} signed it out ${formatVeoTime(current.time_out)}.` : '';
      return res.status(409).json({
        ok: false,
        error: `${camera} is already out.${detail} If it's back at the club, sign it in first using "Return a camera".`,
      });
    }
    return res.status(500).json({ ok: false, error: error.message });
  }

  const saved = { ...row, time_in: null };
  // Emails never block the sign-out — it's already saved.
  await Promise.all([sendVeoClubEmail('out', saved), sendVeoBookerConfirmation(saved)]);

  return res.status(200).json({ ok: true, id: data.id });
}
