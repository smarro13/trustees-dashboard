import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { authorizeTeamRequest } from '../../../lib/registerTeamAccess';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_BULK_ROWS = 500;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const teamSlug = typeof req.query.team === 'string' ? req.query.team.trim() : '';
    const token = req.query.token;

    const access = await authorizeTeamRequest(supabaseAdmin, teamSlug, token);
    if (access.ok === false) return res.status(access.status).json({ ok: false, error: access.error });

    const { data, error } = await supabaseAdmin
      .from('register_players')
      .select('id, name, default_note, sort_order')
      .eq('team_id', access.team.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, players: data || [] });
  }

  if (req.method === 'POST') {
    const teamSlug = typeof req.body?.teamSlug === 'string' ? req.body.teamSlug.trim() : '';
    const token = req.body?.token;

    const access = await authorizeTeamRequest(supabaseAdmin, teamSlug, token);
    if (access.ok === false) return res.status(access.status).json({ ok: false, error: access.error });

    // Bulk CSV import: { rows: [{ name, note? }, ...] }
    if (Array.isArray(req.body?.rows)) {
      const rows = req.body.rows.slice(0, MAX_BULK_ROWS);

      const { data: existing, error: existingError } = await supabaseAdmin
        .from('register_players')
        .select('name')
        .eq('team_id', access.team.id);
      if (existingError) return res.status(500).json({ ok: false, error: existingError.message });

      const existingNames = new Set((existing || []).map((p) => p.name.trim().toLowerCase()));
      const toInsert: { team_id: string; name: string; default_note: string }[] = [];

      for (const row of rows) {
        const name = typeof row?.name === 'string' ? row.name.trim() : '';
        if (!name || existingNames.has(name.toLowerCase())) continue;
        existingNames.add(name.toLowerCase());
        toInsert.push({
          team_id: access.team.id,
          name,
          default_note: typeof row?.note === 'string' ? row.note.trim() : '',
        });
      }

      if (toInsert.length === 0) {
        return res.status(200).json({ ok: true, added: 0 });
      }

      const { error: insertError } = await supabaseAdmin.from('register_players').insert(toInsert);
      if (insertError) return res.status(500).json({ ok: false, error: insertError.message });

      return res.status(200).json({ ok: true, added: toInsert.length });
    }

    // Single player add: { name, note? }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ ok: false, error: 'A player name is required.' });

    const { data, error } = await supabaseAdmin
      .from('register_players')
      .insert({
        team_id: access.team.id,
        name,
        default_note: typeof req.body?.note === 'string' ? req.body.note.trim() : '',
      })
      .select('id, name, default_note, sort_order')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, player: data });
  }

  if (req.method === 'PATCH') {
    const teamSlug = typeof req.body?.teamSlug === 'string' ? req.body.teamSlug.trim() : '';
    const token = req.body?.token;
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId : '';

    const access = await authorizeTeamRequest(supabaseAdmin, teamSlug, token);
    if (access.ok === false) return res.status(access.status).json({ ok: false, error: access.error });
    if (!playerId) return res.status(400).json({ ok: false, error: 'playerId is required.' });

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ ok: false, error: 'A player name is required.' });

    const { error } = await supabaseAdmin
      .from('register_players')
      .update({ name })
      .eq('id', playerId)
      .eq('team_id', access.team.id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const teamSlug = typeof req.query.team === 'string' ? req.query.team.trim() : '';
    const token = req.query.token;
    const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : '';

    const access = await authorizeTeamRequest(supabaseAdmin, teamSlug, token);
    if (access.ok === false) return res.status(access.status).json({ ok: false, error: access.error });
    if (!playerId) return res.status(400).json({ ok: false, error: 'playerId is required.' });

    const { error } = await supabaseAdmin
      .from('register_players')
      .delete()
      .eq('id', playerId)
      .eq('team_id', access.team.id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
