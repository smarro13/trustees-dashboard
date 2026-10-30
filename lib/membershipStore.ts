import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportedMember, ImportedPlayer } from './importers/membershipImportParser';
// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
import type { ImportedLoveAdminPayment } from './importers/loveAdminImportParser';

// Saving a ClubControl members export or a GMS player list, from the
// automatic fetches (lib/clubcontrolSync.ts, lib/gmsSync.ts). Server-side only:
// takes a service-role client. Tables are in supabase/policies/membership.sql.

const INSERT_BATCH = 500;

export type SaveResult = { ok: true; total: number; inactive: number } | { ok: false; error: string };

// Replaces the previous export: the new rows are written first, and the old
// export is only removed once they're all in, so a failure leaves the
// previous data in place.
export async function saveMembersExport(
  admin: SupabaseClient,
  members: ImportedMember[],
  fileName: string,
  uploadedBy: string,
): Promise<SaveResult> {
  const { data: imported, error: importError } = await admin
    .from('membership_imports')
    .insert({ kind: 'members', file_name: fileName, row_count: members.length, uploaded_by: uploadedBy })
    .select('id')
    .single();
  if (importError || !imported) return { ok: false, error: importError?.message ?? 'Save failed.' };

  for (let i = 0; i < members.length; i += INSERT_BATCH) {
    const batch = members.slice(i, i + INSERT_BATCH).map((m) => ({ ...m, import_id: imported.id }));
    let { error } = await admin.from('membership_members').insert(batch);
    // Before supabase/policies/membership_billing_method.sql has been run
    // there are no billing_method / covered_by_id / mandate_status columns: save without them
    // rather than fail.
    if (error && /billing_method|covered_by_id|mandate_status/.test(error.message)) {
      ({ error } = await admin.from('membership_members').insert(batch.map(({ billing_method, covered_by_id, mandate_status, ...rest }) => rest)));
    }
    if (error) {
      // Leave the previous export in place rather than half of this one.
      await admin.from('membership_imports').delete().eq('id', imported.id);
      return { ok: false, error: `Save failed: ${error.message}` };
    }
  }
  // Older exports (and their member rows, by cascade) are no longer needed.
  await admin.from('membership_imports').delete().eq('kind', 'members').neq('id', imported.id);
  return { ok: true, total: members.length, inactive: members.filter((m) => !m.active).length };
}

// Row count of the current members export, or null if there isn't one.
export async function currentMembersCount(admin: SupabaseClient): Promise<number | null> {
  const { data } = await admin
    .from('membership_imports')
    .select('row_count')
    .eq('kind', 'members')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.row_count ?? null;
}

// Saving a GMS player list, from the automatic
// fetch from GMS (lib/gmsSync.ts). Adds new players and updates existing ones
// (matched on name and date of birth); never removes anyone.
export async function savePlayers(
  admin: SupabaseClient,
  players: ImportedPlayer[],
  fileName: string,
  uploadedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  for (let i = 0; i < players.length; i += INSERT_BATCH) {
    const { error } = await admin
      .from('membership_players')
      .upsert(
        players.slice(i, i + INSERT_BATCH).map((p) => ({ ...p, updated_at: now, updated_by: uploadedBy })),
        { onConflict: 'name_key,date_of_birth' },
      );
    if (error) return { ok: false, error: `Save failed: ${error.message}` };
  }
  await admin
    .from('membership_imports')
    .insert({ kind: 'players', file_name: fileName, row_count: players.length, uploaded_by: uploadedBy });
  return { ok: true };
}

// Row count of the latest GMS player list, or null if there isn't one.
export async function currentPlayersCount(admin: SupabaseClient): Promise<number | null> {
  const { data } = await admin
    .from('membership_imports')
    .select('row_count')
    .eq('kind', 'players')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.row_count ?? null;
}

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// Replaces the previous LoveAdmin invoices, from the upload
// (pages/api/private/membership-import.ts). The old rows go only once the new
// ones are all in.
export async function saveLoveAdminPayments(
  admin: SupabaseClient,
  payments: ImportedLoveAdminPayment[],
  fileName: string,
  uploadedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: imported, error: importError } = await admin
    .from('membership_imports')
    .insert({ kind: 'loveadmin', file_name: fileName, row_count: payments.length, uploaded_by: uploadedBy })
    .select('id')
    .single();
  if (importError || !imported) return { ok: false, error: importError?.message ?? 'Save failed.' };

  const { error } = await admin
    .from('membership_loveadmin')
    .insert(payments.map((p) => ({ ...p, import_id: imported.id })));
  if (error) {
    await admin.from('membership_imports').delete().eq('id', imported.id);
    return { ok: false, error: `Save failed: ${error.message}` };
  }
  await admin.from('membership_imports').delete().eq('kind', 'loveadmin').neq('id', imported.id);
  return { ok: true };
}
