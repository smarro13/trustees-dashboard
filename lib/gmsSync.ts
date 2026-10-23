import type { SupabaseClient } from '@supabase/supabase-js';
import { GmsError, fetchGmsPlayers } from './gms';
import { currentPlayersCount, savePlayers } from './membershipStore';

// Fetch the player list from RFU GMS (lib/gms.ts) and save it exactly as a
// manual upload on /operations/membership would: new players are added and
// existing ones updated; nobody is removed. Used by the weekly fetch and the
// "Fetch from GMS now" button (pages/api/private/gms-sync.ts), and by the
// meeting-day membership report (pages/api/cron/membership-report.ts).
//
// Safety check: if GMS returns far fewer players than the last list (under
// half), nothing is saved, in case GMS returned a filtered or partial list.

export type GmsSyncResult = { ok: true; players: number } | { ok: false; status: number; error: string };

export async function syncPlayersFromGms(admin: SupabaseClient, uploadedBy: string): Promise<GmsSyncResult> {
  let fetched;
  try {
    fetched = await fetchGmsPlayers();
  } catch (error) {
    const message = error instanceof GmsError ? error.message : 'Fetching from GMS failed.';
    console.error('GMS sync failed:', message);
    return { ok: false, status: 502, error: message };
  }

  const { players } = fetched;
  if (players.length === 0) return { ok: false, status: 502, error: 'GMS returned no players.' };

  const previous = await currentPlayersCount(admin);
  if (previous && players.length < previous / 2) {
    return {
      ok: false,
      status: 409,
      error: `GMS returned ${players.length} players, against ${previous} last time, so nothing was saved. Check GMS, or upload the player list by hand.`,
    };
  }

  const fileName = `GMS player list (fetched automatically ${new Date().toISOString().slice(0, 10)})`;
  const saved = await savePlayers(admin, players, fileName, uploadedBy);
  if ('error' in saved) return { ok: false, status: 500, error: saved.error };
  return { ok: true, players: players.length };
}
