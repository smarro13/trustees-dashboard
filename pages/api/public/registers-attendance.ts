import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { authorizeTeamRequest } from '../../../lib/registerTeamAccess';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const teamSlug = typeof req.query.team === 'string' ? req.query.team.trim() : '';
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    const token = req.query.token;

    if (!DATE_RE.test(date)) return res.status(400).json({ ok: false, error: 'A valid date is required.' });

    const access = await authorizeTeamRequest(supabaseAdmin, teamSlug, token);
    if (access.ok === false) return res.status(access.status).json({ ok: false, error: access.error });

    const { data, error } = await supabaseAdmin
      .from('register_attendance')
      .select('player_id, status, notes')
      .eq('team_id', access.team.id)
      .eq('session_date', date);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, attendance: data || [] });
  }

  if (req.method === 'POST') {
    const teamSlug = typeof req.body?.teamSlug === 'string' ? req.body.teamSlug.trim() : '';
    const token = req.body?.token;
    const date = typeof req.body?.date === 'string' ? req.body.date : '';
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId : '';
    const status = req.body?.status;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;

    if (!DATE_RE.test(date)) return res.status(400).json({ ok: false, error: 'A valid date is required.' });
    if (!playerId) return res.status(400).json({ ok: false, error: 'playerId is required.' });
    if (status !== null && status !== 'present' && status !== 'absent') {
      return res.status(400).json({ ok: false, error: 'status must be "present", "absent" or null.' });
    }

    const access = await authorizeTeamRequest(supabaseAdmin, teamSlug, token);
    if (access.ok === false) return res.status(access.status).json({ ok: false, error: access.error });

    // Read-modify-write so a status-only or notes-only update never clobbers the other field.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('register_attendance')
      .select('status, notes')
      .eq('player_id', playerId)
      .eq('session_date', date)
      .maybeSingle();
    if (existingError) return res.status(500).json({ ok: false, error: existingError.message });

    const { error } = await supabaseAdmin
      .from('register_attendance')
      .upsert(
        {
          team_id: access.team.id,
          player_id: playerId,
          session_date: date,
          status: status !== undefined ? status : existing?.status ?? null,
          notes: notes !== undefined ? notes : existing?.notes ?? '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,session_date' }
      );

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
