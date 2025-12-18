import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';

type Data = {
  inserted: string[];
  skipped: string[];
  totalDesired: number;
};

// Compute the second Wednesday of a given month (0-11) in a given year, in UTC
function getSecondWednesdayUTC(year: number, month: number): Date {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = firstOfMonth.getUTCDay(); // 0 Sun .. 6 Sat
  const wednesday = 3; // Wednesday index
  const delta = (wednesday - dayOfWeek + 7) % 7; // days to first Wednesday
  const firstWednesday = 1 + delta;
  const secondWednesday = firstWednesday + 7;
  return new Date(Date.UTC(year, month, secondWednesday));
}

function formatYYYYMMDDUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const year = 2026;

  // Optional lightweight guard via query token (set ?token=your_value when calling)
  const requiredToken = process.env.SEED_API_TOKEN;
  if (requiredToken) {
    const provided = (req.query.token as string) || req.headers['x-seed-token'];
    if (provided !== requiredToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const desiredDates: string[] = Array.from({ length: 12 }, (_, m) =>
    formatYYYYMMDDUTC(getSecondWednesdayUTC(year, m))
  );

  // Fetch existing meetings for the year to keep operation idempotent
  const { data: existing, error: fetchErr } = await supabase
    .from('meetings')
    .select('id, meeting_date')
    .gte('meeting_date', `${year}-01-01`)
    .lte('meeting_date', `${year}-12-31`);

  if (fetchErr) {
    return res.status(500).json({ error: `Fetch error: ${fetchErr.message}` });
  }

  const existingSet = new Set(
    (existing || [])
      .map((m: any) => (m.meeting_date ? String(m.meeting_date).slice(0, 10) : ''))
      .filter(Boolean)
  );

  const toInsert = desiredDates.filter((d) => !existingSet.has(d));

  let inserted: string[] = [];
  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('meetings')
      .insert(toInsert.map((d) => ({ meeting_date: d, is_locked: false })));

    if (insertErr) {
      return res.status(500).json({ error: `Insert error: ${insertErr.message}` });
    }
    inserted = toInsert;
  }

  const skipped = desiredDates.filter((d) => !inserted.includes(d));

  return res.status(200).json({ inserted, skipped, totalDesired: desiredDates.length });
}
