import { nameKey, splitCategories } from '../membership';

// Rows for membership_members and membership_players
// (supabase/policies/membership.sql), from the automatic fetches: the
// ClubControl members export (.csv, read here; lib/clubcontrolSync.ts) and
// the GMS player list (lib/gms.ts). Server-side only.

export type ImportedMember = {
  external_id: string | null;
  // ClubControl's "Billing Method", e.g. "Direct Debit: Active". Only the
  // automatic fetch has it (lib/clubcontrol.ts).
  billing_method?: string | null;
  // Member id of the active direct debit account that pays for them, when it
  // isn't their own (lib/clubcontrol.ts readCoveredMembers).
  covered_by_id?: string | null;
  // GoCardless mandate status on their own record, e.g. "Active" (direct
  // debit accounts only; lib/clubcontrol.ts).
  mandate_status?: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  age: number | null;
  categories: string[];
  amount: number | null;
  date_joined: string | null;
  renewal_date: string | null;
  active: boolean;
};

export type ImportedPlayer = {
  name_key: string;
  rfu_id: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  gms_status: string | null;
};

// ── ClubControl members export (.csv) ──────────────────────────────────────

const REQUIRED_COLUMNS = ['Name', 'Surname', 'Active'];

// RFC 4180-style: quoted fields may contain commas, quotes ("") and newlines.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const blankToNull = (value: string | undefined) => {
  const v = (value ?? '').trim();
  return v && v !== '-' ? v : null;
};

// ClubControl writes UK dates as dd/mm/yyyy or dd-mm-yyyy.
const ukDateToIso = (value: string | undefined): string | null => {
  const match = (value ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

export function parseMembersCsv(text: string): ImportedMember[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const col = new Map((header ?? []).map((h, i) => [h.trim(), i]));
  const missing = REQUIRED_COLUMNS.filter((c) => !col.has(c));
  if (missing.length) {
    throw new Error(`This doesn't look like a ClubControl members export — missing column(s): ${missing.join(', ')}.`);
  }
  const get = (row: string[], name: string) => {
    const i = col.get(name);
    return i === undefined ? '' : (row[i] ?? '');
  };

  return rows
    // The export ends with a totals row that only has an Amount.
    .filter((row) => get(row, 'Name').trim() || get(row, 'Surname').trim())
    .map((row) => {
      const amount = Number(get(row, 'Amount').replace(/,/g, ''));
      const age = Number(get(row, 'Age'));
      return {
        external_id: blankToNull(get(row, 'Id')),
        first_name: get(row, 'Name').trim(),
        last_name: get(row, 'Surname').trim(),
        email: blankToNull(get(row, 'Email')),
        gender: blankToNull(get(row, 'Gender')),
        date_of_birth: ukDateToIso(get(row, 'Date of birth')),
        age: blankToNull(get(row, 'Age')) && Number.isFinite(age) ? age : null,
        categories: splitCategories(get(row, 'Categories')),
        amount: blankToNull(get(row, 'Amount')) && Number.isFinite(amount) ? amount : null,
        date_joined: ukDateToIso(get(row, 'Date joined')),
        renewal_date: ukDateToIso(get(row, 'Subscription renewal date')),
        active: get(row, 'Active').trim().toLowerCase() === 'yes',
      };
    });
}
