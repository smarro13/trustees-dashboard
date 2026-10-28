// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
//
// A row of membership_loveadmin (supabase/policies/membership_loveadmin.sql):
// one person a paid LoveAdmin invoice was for. Filled automatically from
// Thrive4 (LoveAdmin's new name) by lib/thrive4.ts; the old manual upload of
// the "Invoices All Report" has gone.
export type ImportedLoveAdminPayment = {
  // Thrive4's id for the person.
  person_guid?: string | null;
  name_key: string;
  beneficiary: string;
  payer: string | null;
  invoice: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  received: number | null;
};
