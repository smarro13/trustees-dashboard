import JSZip from 'jszip';
import { nameKey, splitCategories } from '../membership';

// Rows for membership_members and membership_players
// (supabase/policies/membership.sql), from the automatic fetches: the
// ClubControl members export (.csv, read here; lib/clubcontrolSync.ts) and
// the GMS player list (lib/gms.ts). Also the .csv and .xlsx readers behind the
// LoveAdmin upload (lib/importers/loveAdminImportParser.ts). Server-side only.

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
export function parseCsv(text: string): string[][] {
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

const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

// All the text runs inside an element, e.g. a shared string or inline string.
const textRuns = (xml: string) =>
  [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => unescapeXml(m[1])).join('');

const columnIndex = (ref: string) =>
  [...ref.replace(/\d+/g, '').toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// A minimal .xlsx reader: each worksheet as rows of cell text. It handles
// prefixed XML (<x:row>) without cell references, which ExcelJS can't read,
// and ordinary Excel-saved files alike. Dates typed as
// dates (t="d") come back as YYYY-MM-DD; dates stored as serial numbers come
// back as the number and are converted by cellDate().
export async function readXlsxSheets(bytes: Buffer): Promise<string[][][]> {
  const zip = await JSZip.loadAsync(bytes);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared = sharedXml
    ? [...sharedXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textRuns(m[1]))
    : [];

  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  const sheets: string[][][] = [];
  for (const name of sheetNames) {
    const xml = await zip.file(name)!.async('string');
    const rows: string[][] = [];
    for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
      const row: string[] = [];
      let next = 0;
      for (const cell of (rowMatch[1] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const attrs = cell[1];
        const body = cell[2] ?? '';
        const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1];
        const col = ref ? columnIndex(ref) : next;
        next = col + 1;
        const type = attrs.match(/\bt="(\w+)"/)?.[1];
        const raw = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
        let value = '';
        if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'inlineStr') value = textRuns(body);
        else if (raw !== undefined) value = unescapeXml(raw);
        if (type === 'd') value = value.slice(0, 10);
        row[col] = value.trim();
      }
      rows.push(Array.from(row, (v) => v ?? ''));
    }
    sheets.push(rows);
  }
  return sheets;
}

// Dates arrive as YYYY-MM-DD, UK dd/mm/yyyy text, or an Excel serial day
// number if the sheet was re-saved in Excel.
export function cellDate(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial > 0 && serial < 100000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  return ukDateToIso(text);
}

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
