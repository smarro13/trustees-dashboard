import type { SupabaseClient } from '@supabase/supabase-js';
import { Thrive4Error, fetchThrive4Payments } from './thrive4';
import { saveLoveAdminPayments } from './membershipStore';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
//
// Fetch last month's paid LoveAdmin invoices from Thrive4 (lib/thrive4.ts) and save
// them exactly as an uploaded Invoices All Report would. Used by the weekly
// fetch, the "Fetch from Thrive4 now" button (pages/api/private/thrive4-sync.ts)
// and the meeting-day membership report (pages/api/cron/membership-report.ts).
//
// Unlike ClubControl and GMS there's no "far fewer than last time" check: the
// list is meant to shrink as people move to ClubControl. An empty list isn't
// saved, though, in case Thrive4 returned nothing by mistake.

export type Thrive4SyncResult =
  | { ok: true; people: number; paidInvoices: number; skippedInvoices: number; monthLabel: string }
  | { ok: false; status: number; error: string };

export async function syncPaymentsFromThrive4(admin: SupabaseClient, uploadedBy: string): Promise<Thrive4SyncResult> {
  let fetched;
  try {
    fetched = await fetchThrive4Payments();
  } catch (error) {
    const message = error instanceof Thrive4Error ? error.message : 'Fetching from Thrive4 failed.';
    console.error('Thrive4 sync failed:', message);
    return { ok: false, status: 502, error: message };
  }

  const { payments, paidInvoices, skippedInvoices, month } = fetched;
  // e.g. "Sep 2026"
  const monthLabel = new Date(`${month.from}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (payments.length === 0) {
    return { ok: false, status: 502, error: `Thrive4 has no paid invoices for ${monthLabel}, so nothing was saved.` };
  }

  const fileName = `Thrive4 invoices for ${monthLabel} (fetched automatically ${new Date().toISOString().slice(0, 10)})`;
  const saved = await saveLoveAdminPayments(admin, payments, fileName, uploadedBy);
  if ('error' in saved) return { ok: false, status: 500, error: saved.error };
  return { ok: true, people: payments.length, paidInvoices, skippedInvoices, monthLabel };
}
