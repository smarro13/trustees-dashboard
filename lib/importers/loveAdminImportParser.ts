// LoveAdmin migration (temporary) — remove once everyone has moved to
// ClubControl. See LOVEADMIN_MIGRATION.md.
//
// Reads LoveAdmin's "Invoices All Report" (.xlsx or .csv) into rows for
// membership_loveadmin (supabase/policies/membership_loveadmin.sql): one row
// per person a paid invoice was for. Server-side only — used by
// pages/api/private/membership-import.ts.

import { nameKey } from '../membership';
import { cellDate, parseCsv, readXlsxSheets } from './membershipImportParser';

export type ImportedLoveAdminPayment = {
  name_key: string;
  beneficiary: string;
  payer: string | null;
  invoice: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  received: number | null;
};

export type LoveAdminSummary = {
  payments: ImportedLoveAdminPayment[];
  paidInvoices: number;
  // Invoices that weren't paid (e.g. "cancelled by organisation").
  skippedInvoices: number;
};

const REQUIRED_COLUMNS = ['account owner', 'beneficiaries', 'status'];
const PAID_STATUS = 'reconciled';

const money = (value: string | undefined) => {
  const n = Number((value ?? '').replace(/[£,]/g, ''));
  return (value ?? '').trim() && Number.isFinite(n) ? n : null;
};

export async function parseLoveAdminInvoices(filename: string, bytes: Buffer): Promise<LoveAdminSummary> {
  const sheets = filename.toLowerCase().endsWith('.csv')
    ? [parseCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''))]
    : await readXlsxSheets(bytes);
  for (const [header, ...rows] of sheets) {
    const names = (header ?? []).map((h) => h.trim().toLowerCase());
    if (!REQUIRED_COLUMNS.every((c) => names.includes(c))) continue;
    const get = (row: string[], name: string) => (row[names.indexOf(name)] ?? '').trim();

    const payments = new Map<string, ImportedLoveAdminPayment>();
    let paidInvoices = 0;
    let skippedInvoices = 0;
    for (const row of rows) {
      if (!get(row, 'beneficiaries') && !get(row, 'account owner')) continue;
      if (get(row, 'status').toLowerCase() !== PAID_STATUS || !(money(get(row, 'received')) ?? 0)) {
        skippedInvoices += 1;
        continue;
      }
      paidInvoices += 1;
      // A parent paying for several children lists them comma-separated.
      for (const beneficiary of get(row, 'beneficiaries').split(',').map((b) => b.trim()).filter(Boolean)) {
        const key = nameKey(beneficiary, '');
        if (payments.has(key)) continue;
        payments.set(key, {
          name_key: key,
          beneficiary,
          payer: get(row, 'account owner') || null,
          invoice: get(row, 'invoice') || null,
          invoice_date: cellDate(get(row, 'date')),
          invoice_amount: money(get(row, 'invoice amount')),
          received: money(get(row, 'received')),
        });
      }
    }
    return { payments: [...payments.values()], paidInvoices, skippedInvoices };
  }
  throw new Error('This doesn’t look like a LoveAdmin invoices report — it needs Account Owner, Beneficiaries and Status columns.');
}
