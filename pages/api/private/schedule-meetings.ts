import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireSignedInUser } from '../../../lib/apiAuth';
import { resolveRoleFromUser, ROLE_RANK } from '../../../lib/roles';
import { nextSecondWednesdays } from '../../../lib/meetingSchedule';

// Adds a meeting on the second Wednesday of each of the next 12 months.
// Safe to run again: dates that already have a meeting are skipped.
// Trustees and admins only.

type Data = { inserted: string[]; skipped: string[] } | { error: string };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MONTHS_AHEAD = 12;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const user = await requireSignedInUser(req, res);
  if (!user) return;

  const role = resolveRoleFromUser(user);
  if (!role || ROLE_RANK[role] < ROLE_RANK.trustee) {
    return res.status(403).json({ error: 'Only trustees and admins can schedule meetings.' });
  }

  const desired = nextSecondWednesdays(new Date(), MONTHS_AHEAD);

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('meetings')
    .select('meeting_date')
    .gte('meeting_date', desired[0])
    .lte('meeting_date', desired[desired.length - 1]);

  if (fetchErr) {
    return res.status(500).json({ error: `Could not read meetings: ${fetchErr.message}` });
  }

  const existingDates = new Set((existing || []).map((m) => String(m.meeting_date).slice(0, 10)));
  const toInsert = desired.filter((d) => !existingDates.has(d));

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabaseAdmin
      .from('meetings')
      .insert(toInsert.map((d) => ({ meeting_date: d, is_locked: false })));

    if (insertErr) {
      return res.status(500).json({ error: `Could not add meetings: ${insertErr.message}` });
    }
  }

  return res.status(200).json({
    inserted: toInsert,
    skipped: desired.filter((d) => existingDates.has(d)),
  });
}
