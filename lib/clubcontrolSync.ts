import type { SupabaseClient } from '@supabase/supabase-js';
import { ClubControlError, fetchMembersExport } from './clubcontrol';
import { parseMembersCsv } from './importers/membershipImportParser';
import { currentMembersCount, saveMembersExport } from './membershipStore';
import { nameKey } from './membership';

// Fetch the members export from ClubControl and save it exactly as a manual
// upload on /operations/membership used to. Used by the weekly fetch and the
// "Fetch from ClubControl now" button (pages/api/private/clubcontrol-sync.ts)
// and by the meeting-day membership report (pages/api/cron/membership-report.ts),
// which fetches first so the meeting gets that day's figures.
//
// Safety check: if the new export has far fewer members than the current one
// (under half), it isn't saved, in case ClubControl returned a filtered or
// partial list.

export type SyncResult =
  | { ok: true; total: number; inactive: number }
  | { ok: false; status: number; error: string };

export async function syncMembersFromClubControl(admin: SupabaseClient, uploadedBy: string): Promise<SyncResult> {
  let exported;
  try {
    exported = await fetchMembersExport();
  } catch (error) {
    const message = error instanceof ClubControlError ? error.message : 'Fetching from ClubControl failed.';
    console.error('ClubControl sync failed:', message);
    return { ok: false, status: 502, error: message };
  }

  let members;
  try {
    members = parseMembersCsv(exported.csv);
  } catch (error: any) {
    return { ok: false, status: 502, error: `ClubControl's export couldn't be read: ${error?.message ?? 'unknown format'}` };
  }
  if (members.length === 0) return { ok: false, status: 502, error: 'ClubControl’s export had no members in it.' };

  // Each member's billing method (e.g. "Direct Debit: Active"), matched on
  // ClubControl's own member id.
  if (exported.billingById) {
    for (const m of members) m.billing_method = (m.external_id && exported.billingById.get(m.external_id)) || null;
  }
  // Their own GoCardless mandate status, for everyone with a direct debit.
  if (exported.mandateById) {
    for (const m of members) m.mandate_status = (m.external_id && exported.mandateById.get(m.external_id)) || null;
  }
  // Paid for by someone else's active mandate (a parent for the family):
  // the account holder's member id. Not set on the account holder themselves.
  if (exported.coveredBy) {
    for (const m of members) {
      const account = exported.coveredBy.get(nameKey(m.first_name, m.last_name));
      m.covered_by_id = account && account !== m.external_id ? account : null;
    }
  }

  const previous = await currentMembersCount(admin);
  if (previous && members.length < previous / 2) {
    return {
      ok: false,
      status: 409,
      error: `ClubControl's export has ${members.length} members, against ${previous} last time, so it wasn't saved and the last export is still in use. Check ClubControl, then fetch again.`,
    };
  }

  const saved = await saveMembersExport(admin, members, exported.fileName, uploadedBy);
  if ('error' in saved) return { ok: false, status: 500, error: saved.error };
  return { ok: true, total: saved.total, inactive: saved.inactive };
}
