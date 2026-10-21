import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { parseGmsPlayers, parseMembersCsv } from '../../../lib/importers/membershipImportParser';
import { teamFromBirthDate } from '../../../lib/membership';

// Uploads for /operations/membership (tables in supabase/policies/membership.sql).
//
//   kind "members": a ClubControl members export (.csv). Replaces the
//                   previous export.
//   kind "players": the RFU GMS player list (.xlsx / .csv). Adds new players
//                   and updates existing ones; never removes anyone. Teams
//                   aren't stored — the page works them out from date of
//                   birth and gender (lib/membership.ts).
//
// Called twice per upload: first without `apply` to get a preview of what
// would change (nothing is written), then with `apply: true` to save it.

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

// Kept local (not imported from lib/roles.ts) because this is a server-side
// API route — see pages/api/private/prematch-meals-orders.ts.
type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  if (value === 'director' || value === 'directors' || value === 'management' || value === 'mangement') return 'director';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  return null;
};

const resolveRole = (user: any): DashboardRole =>
  normalizeRole(user?.app_metadata?.role) || normalizeRole(user?.user_metadata?.role);

const INSERT_BATCH = 500;

const playerKey = (p: { name_key: string; date_of_birth: string | null }) => `${p.name_key}|${p.date_of_birth ?? ''}`;

// Every stored player's identity, a page at a time (Supabase returns at most
// 1000 rows per request).
async function loadAllPlayerKeys() {
  const rows: { name_key: string; date_of_birth: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('membership_players')
      .select('name_key, date_of_birth')
      .order('id')
      .range(from, from + 999);
    if (error) return { data: rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: rows, error: null };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (resolveRole(user) !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Only admins can upload membership data.' });
  }

  const kind = req.body?.kind;
  const filename = typeof req.body?.filename === 'string' ? req.body.filename.slice(0, 200) : '';
  const contentBase64 = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : '';
  const apply = req.body?.apply === true;
  if ((kind !== 'members' && kind !== 'players') || !filename || !contentBase64) {
    return res.status(400).json({ ok: false, error: 'kind, filename and file contents are required.' });
  }
  const bytes = Buffer.from(contentBase64, 'base64');
  if (!bytes.length) return res.status(400).json({ ok: false, error: 'That file is empty.' });

  const uploadedBy = user.email || user.id;

  if (kind === 'members') {
    let members;
    try {
      members = parseMembersCsv(bytes.toString('utf8'));
    } catch (error: any) {
      return res.status(400).json({ ok: false, error: error?.message ?? 'Could not read that file.' });
    }
    if (members.length === 0) return res.status(400).json({ ok: false, error: 'No members found in that file.' });
    const summary = { total: members.length, inactive: members.filter((m) => !m.active).length };
    if (!apply) return res.status(200).json({ ok: true, preview: summary });

    const { data: imported, error: importError } = await supabaseAdmin
      .from('membership_imports')
      .insert({ kind, file_name: filename, row_count: members.length, uploaded_by: uploadedBy })
      .select('id')
      .single();
    if (importError || !imported) return res.status(500).json({ ok: false, error: importError?.message ?? 'Save failed.' });

    for (let i = 0; i < members.length; i += INSERT_BATCH) {
      const batch = members.slice(i, i + INSERT_BATCH).map((m) => ({ ...m, import_id: imported.id }));
      const { error } = await supabaseAdmin.from('membership_members').insert(batch);
      if (error) {
        // Leave the previous export in place rather than half of this one.
        await supabaseAdmin.from('membership_imports').delete().eq('id', imported.id);
        return res.status(500).json({ ok: false, error: `Save failed: ${error.message}` });
      }
    }
    // Older exports (and their member rows, by cascade) are no longer needed.
    await supabaseAdmin.from('membership_imports').delete().eq('kind', 'members').neq('id', imported.id);
    return res.status(200).json({ ok: true, saved: summary });
  }

  let players;
  try {
    players = await parseGmsPlayers(filename, bytes);
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error?.message ?? 'Could not read that file.' });
  }
  if (players.length === 0) return res.status(400).json({ ok: false, error: 'No players found in that file.' });

  const { data: existing, error: loadError } = await loadAllPlayerKeys();
  if (loadError) return res.status(500).json({ ok: false, error: loadError });

  const current = new Set(existing.map(playerKey));
  const perTeam: Record<string, number> = {};
  for (const p of players) {
    const team = teamFromBirthDate(p.date_of_birth, p.gender) ?? 'No date of birth';
    perTeam[team] = (perTeam[team] ?? 0) + 1;
  }
  const summary = {
    total: players.length,
    added: players.filter((p) => !current.has(playerKey(p))).length,
    updated: players.filter((p) => current.has(playerKey(p))).length,
    perTeam,
  };
  if (!apply) return res.status(200).json({ ok: true, preview: summary });

  const now = new Date().toISOString();
  for (let i = 0; i < players.length; i += INSERT_BATCH) {
    const { error } = await supabaseAdmin
      .from('membership_players')
      .upsert(
        players.slice(i, i + INSERT_BATCH).map((p) => ({ ...p, updated_at: now, updated_by: uploadedBy })),
        { onConflict: 'name_key,date_of_birth' },
      );
    if (error) return res.status(500).json({ ok: false, error: `Save failed: ${error.message}` });
  }

  await supabaseAdmin
    .from('membership_imports')
    .insert({ kind, file_name: filename, row_count: players.length, uploaded_by: uploadedBy });

  return res.status(200).json({ ok: true, saved: summary });
}
