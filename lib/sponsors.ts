// Sponsors tracker: types, lists and helpers for /operations/sponsors.
// Table: public.sponsor_tracker (supabase/policies/sponsor_tracker.sql).

export { daysUntil, describeDaysAway, formatMoney, formatAssetDate as formatSponsorDate } from './assets';
import { daysUntil } from './assets';

export const SPONSOR_CATEGORIES = [
  'Club sponsor',
  'Ladies XV sponsor',
  'Minis & Juniors sponsor',
  'Player sponsor',
  'Partner',
  'Community partner',
] as const;
export const SPONSOR_STATUSES = ['Prospect', 'Active', 'Renewal due', 'Lapsed', 'Ended'] as const;
export const VALUE_TYPES = ['Cash', 'In kind', 'Mixed'] as const;
export const PAYMENT_STATUSES = ['Not invoiced', 'Invoiced', 'Paid', 'Overdue', 'Not applicable'] as const;
export const PACKAGES = [
  'Club sponsor',
  'Kit sponsor',
  'Matchday sponsor',
  'Player sponsorship',
  'Player of the Match',
  'Minis & Juniors kit',
  'Programme advert',
  'Pitchside board',
  'Partnership (no fee)',
];

export type Sponsor = {
  id: string;
  name: string;
  category: (typeof SPONSOR_CATEGORIES)[number];
  sponsors_what: string | null;
  status: (typeof SPONSOR_STATUSES)[number];
  package: string | null;
  value: number | null;
  value_type: (typeof VALUE_TYPES)[number];
  payment_status: (typeof PAYMENT_STATUSES)[number] | null;
  invoice_ref: string | null;
  start_date: string | null;
  renewal_date: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  club_contact: string | null;
  last_contacted: string | null;
  website: string | null;
  page_url: string | null;
  member_offer: string | null;
  benefits: string | null;
  on_website: boolean;
  in_footer: boolean;
  in_programme: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

/** One row of public.sponsor_tracker_changes, written by a trigger on every add / edit / removal. */
export type SponsorChange = {
  id: number;
  sponsor_id: string | null;
  sponsor_name: string;
  category: string | null;
  sponsors_what: string | null;
  action: 'added' | 'updated' | 'removed';
  // For 'updated': { field: { from, to } }. For 'added' / 'removed': the whole row.
  changes: Record<string, unknown>;
  changed_by: string | null;
  changed_at: string;
  website_done: boolean;
  done_by: string | null;
  done_at: string | null;
};

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name', category: 'Category', sponsors_what: 'Sponsors', status: 'Status', package: 'Package',
  value: 'Value', value_type: 'Cash / in kind', payment_status: 'Payment', invoice_ref: 'Invoice ref',
  start_date: 'Start date', renewal_date: 'Renewal date', contact_name: 'Contact', contact_email: 'Email',
  contact_phone: 'Phone', address: 'Address', club_contact: 'Club contact', last_contacted: 'Last contacted',
  website: 'Website', page_url: 'Club page', member_offer: 'Member offer', benefits: 'Benefits',
  on_website: 'On website', in_footer: 'In footer', in_programme: 'In programme', notes: 'Notes',
};

/** Fields that show up on aldwinians.co.uk, so a change to them means the website needs updating. */
export const WEBSITE_FIELDS = new Set([
  'name', 'category', 'sponsors_what', 'status', 'contact_email', 'contact_phone', 'address',
  'website', 'page_url', 'member_offer', 'on_website', 'in_footer',
]);

export const formatChangeValue = (v: unknown) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(`${v}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return String(v);
};

/** Current sponsors: everything that isn't a prospect or finished. */
export const isCurrent = (s: Sponsor) => s.status === 'Active' || s.status === 'Renewal due';

/** Current sponsors with a renewal date, soonest first, with days to go (negative = passed). */
export const getRenewals = (sponsors: Sponsor[]) =>
  sponsors
    .filter((s) => isCurrent(s) && s.renewal_date)
    .map((s) => ({ sponsor: s, daysAway: daysUntil(s.renewal_date!) }))
    .sort((a, b) => a.daysAway - b.daysAway);

const CSV_COLUMNS: [keyof Sponsor, string][] = [
  ['name', 'Sponsor'], ['category', 'Category'], ['sponsors_what', 'Sponsors'], ['status', 'Status'],
  ['package', 'Package'], ['value', 'Value (£)'], ['value_type', 'Cash / in kind'], ['payment_status', 'Payment'],
  ['invoice_ref', 'Invoice ref'], ['start_date', 'Start'], ['renewal_date', 'Renewal'],
  ['contact_name', 'Contact'], ['contact_email', 'Email'], ['contact_phone', 'Phone'], ['address', 'Address'],
  ['club_contact', 'Club contact'], ['last_contacted', 'Last contacted'], ['website', 'Website'],
  ['page_url', 'Club page'], ['member_offer', 'Member offer'], ['benefits', 'What they get'],
  ['on_website', 'On website'], ['in_footer', 'In footer'], ['in_programme', 'In programme'], ['notes', 'Notes'],
];

// Excel-friendly CSV (BOM + quoted fields).
export const sponsorsToCsv = (sponsors: Sponsor[]) => {
  const cell = (v: unknown) => {
    const text = v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [CSV_COLUMNS.map(([, label]) => cell(label)).join(',')];
  for (const s of sponsors) lines.push(CSV_COLUMNS.map(([key]) => cell(s[key])).join(','));
  return '﻿' + lines.join('\r\n');
};
