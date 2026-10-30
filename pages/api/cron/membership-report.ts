import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { syncMembersFromClubControl } from '../../../lib/clubcontrolSync';
import { syncPlayersFromGms } from '../../../lib/gmsSync';
import { buildMembershipSummary, loadMembershipData } from '../../../lib/membershipSummary';

// Meeting-day membership report. Runs once a day (vercel.json "crons"); on the
// day of a management meeting it saves the membership summary to that meeting,
// exactly as "Save to meeting" on /agenda/membership does, unless the meeting
// already has one. On any other day it does nothing. On meeting day it first
// fetches the members export from ClubControl and the player list from GMS
// (lib/clubcontrolSync.ts, lib/gmsSync.ts).
//
// Protected by CRON_SECRET: Vercel Cron sends it as "Authorization: Bearer
// <CRON_SECRET>". Any other scheduler can call it the same way. Uses the
// service role, so it can read the membership tables without a user.
//
//   ?date=YYYY-MM-DD  run for another day (for testing); defaults to today in the UK.

// Room for the ClubControl fetch as well as the report.
export const config = { maxDuration: 60 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Today's date in the UK, as YYYY-MM-DD.
const ukToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const requested = typeof req.query.date === 'string' ? req.query.date : '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : ukToday();

  // meeting_date may be a date or a timestamp: take a day either side, then
  // match on the date part (how the rest of the dashboard reads it).
  const shift = (d: string, days: number) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  };
  const { data: meetings, error: meetingsError } = await supabaseAdmin
    .from('meetings')
    .select('id, meeting_date')
    .gte('meeting_date', shift(day, -1))
    .lt('meeting_date', shift(day, 2));
  if (meetingsError) return res.status(500).json({ ok: false, error: meetingsError.message });

  const todays = (meetings ?? []).filter((m) => String(m.meeting_date).slice(0, 10) === day);
  if (todays.length === 0) {
    return res.status(200).json({ ok: true, day, saved: [], message: 'No meeting today.' });
  }

  // Fetch the latest members export from ClubControl first, so the meeting
  // gets that day's figures (the routine fetch is only weekly). If it fails,
  // the report still saves, from the last export.
  // The two fetches run side by side to stay inside the time limit.
  const [clubControl, gms] = await Promise.all([
    process.env.CLUBCONTROL_EMAIL && process.env.CLUBCONTROL_PASSWORD
      ? syncMembersFromClubControl(supabaseAdmin, 'ClubControl (meeting-day fetch)')
          .then((sync) => ('error' in sync ? `fetch failed: ${sync.error}` : `fetched ${sync.total} members`))
      : 'not connected',
    process.env.GMS_EMAIL && process.env.GMS_PASSWORD
      ? syncPlayersFromGms(supabaseAdmin, 'GMS (meeting-day fetch)')
          .then((sync) => ('error' in sync ? `fetch failed: ${sync.error}` : `fetched ${sync.players} players`))
      : 'not connected',
  ]);

  const summary = buildMembershipSummary(await loadMembershipData(supabaseAdmin));

  const saved: string[] = [];
  const skipped: string[] = [];
  for (const meeting of todays) {
    // Leave it alone if someone has already saved a report for this meeting.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('membership_reports')
      .select('id')
      .eq('meeting_id', meeting.id)
      .not('summary', 'is', null)
      .limit(1);
    if (existingError) return res.status(500).json({ ok: false, error: existingError.message });
    if (existing && existing.length > 0) {
      skipped.push(meeting.id);
      continue;
    }

    const { error } = await supabaseAdmin.from('membership_reports').insert({
      meeting_id: meeting.id,
      summary,
      money_total: summary.amountTotal ?? null,
      notes: null,
    });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    saved.push(meeting.id);
  }

  return res.status(200).json({ ok: true, day, clubControl, gms, saved, skipped });
}
