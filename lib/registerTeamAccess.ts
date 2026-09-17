import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyTeamToken } from './registerAuth';

export type RegisterTeamRow = {
  id: string;
  slug: string;
  name: string;
  is_protected: boolean;
  password_hash: string | null;
};

export type TeamAccessResult =
  | { ok: true; team: RegisterTeamRow }
  | { ok: false; status: number; error: string };

/**
 * Loads a team by slug and, if it's protected, checks the caller's token.
 * Every registers-* API route that reads/writes team data should call this
 * first — it's the actual security boundary (see registers_schema.sql).
 */
export async function authorizeTeamRequest(
  supabaseAdmin: SupabaseClient,
  teamSlug: string,
  token: unknown
): Promise<TeamAccessResult> {
  if (!teamSlug) {
    return { ok: false, status: 400, error: 'Team is required.' };
  }

  const { data: team, error } = await supabaseAdmin
    .from('register_teams')
    .select('id, slug, name, is_protected, password_hash')
    .eq('slug', teamSlug)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!team) return { ok: false, status: 404, error: 'Unknown team.' };

  if (team.is_protected && !verifyTeamToken(token, teamSlug)) {
    return { ok: false, status: 401, error: 'This team is locked. Unlock it with the team password first.' };
  }

  return { ok: true, team };
}
