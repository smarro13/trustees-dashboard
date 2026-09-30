import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { VEO_RECENT_DAYS, cleanVeoUrl } from '../../../lib/veoBookings';

// Lets anyone on the public VEO page add a missing link after the fact:
//   kind 'live'      — a Veo Live link, while the camera is still out
//   kind 'recording' — the recording link, once Veo has processed it
// Only fills an empty link on a recent session; changing an existing link is
// done by an admin on /operations/veo-bookings.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body ?? {};
  if (body.website) return res.status(200).json({ ok: true });

  const id = typeof body.id === 'string' ? body.id : '';
  const kind = body.kind === 'live' || body.kind === 'recording' ? body.kind : null;
  const url = cleanVeoUrl(body.url);
  if (!id || !kind) return res.status(400).json({ ok: false, error: 'Missing session or link type.' });
  if (!url) return res.status(400).json({ ok: false, error: 'Paste a Veo link (veo.co or veo.com).' });

  const column = kind === 'live' ? 'live_url' : 'recording_url';

  const { data: booking, error: loadError } = await supabaseAdmin
    .from('veo_bookings')
    .select(`id, status, time_out, ${column}`)
    .eq('id', id)
    .maybeSingle();
  if (loadError) return res.status(500).json({ ok: false, error: loadError.message });
  if (!booking) return res.status(404).json({ ok: false, error: 'Session not found.' });

  const row = booking as Record<string, unknown>;
  if (row[column]) {
    return res.status(409).json({ ok: false, error: 'A link has already been added. Ask a club admin to change it.' });
  }
  if (kind === 'live' && row.status !== 'out') {
    return res.status(409).json({ ok: false, error: 'That camera has already been signed back in.' });
  }
  if (kind === 'recording') {
    const tooOld = new Date(String(row.time_out)).getTime() < Date.now() - VEO_RECENT_DAYS * 86_400_000;
    if (row.status === 'cancelled' || tooOld) {
      return res.status(409).json({ ok: false, error: 'That session can no longer be updated here. Ask a club admin.' });
    }
  }

  // Only fill the link if it is still empty (guards against two people at once).
  const { data: updated, error } = await supabaseAdmin
    .from('veo_bookings')
    .update({ [column]: url, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is(column, null)
    .select('id')
    .maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!updated) return res.status(409).json({ ok: false, error: 'A link has already been added.' });

  return res.status(200).json({ ok: true });
}
