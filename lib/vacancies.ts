import { parseCsv } from './csv';

// Shared settings for /operations/vacancies.
// Schema: supabase/policies/vacancies.sql — the fixed lists below must match
// its check constraints.

export const VACANCY_STATUSES = ['Open', 'Closed', 'Filled'] as const;
export const APPLICANT_STAGES = ['New', 'Shortlisted', 'Interview', 'Offered', 'Hired', 'Rejected', 'Withdrawn'] as const;
export type ApplicantStage = (typeof APPLICANT_STAGES)[number];

export const STAGE_STYLES: Record<ApplicantStage, string> = {
  New: 'bg-blue-100 text-blue-800',
  Shortlisted: 'bg-indigo-100 text-indigo-800',
  Interview: 'bg-amber-100 text-amber-800',
  Offered: 'bg-teal-100 text-teal-800',
  Hired: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-zinc-100 text-zinc-600',
  Withdrawn: 'bg-zinc-100 text-zinc-600',
};

export type Vacancy = {
  id: string;
  title: string;
  location: string | null;
  indeed_url: string | null;
  posted_date: string | null;
  closing_date: string | null;
  status: (typeof VACANCY_STATUSES)[number];
  notes: string | null;
  created_at: string;
};

export type Applicant = {
  id: string;
  vacancy_id: string;
  dedupe_key: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  applied_date: string | null;
  indeed_status: string | null;
  experience: string | null;
  education: string | null;
  qualifications: string | null;
  cv_url: string | null;
  stage: ApplicantStage;
  interview_at: string | null;
  notes: string | null;
  source: string;
  created_at: string;
};

/** The Indeed-owned fields of an applicant — what an upload writes. */
export type ImportedApplicant = Pick<
  Applicant,
  'dedupe_key' | 'name' | 'email' | 'phone' | 'location' | 'applied_date' | 'indeed_status' | 'experience' | 'education' | 'qualifications' | 'cv_url'
>;

export const applicantKey = (a: { name: string; email: string | null; phone: string | null }) =>
  a.email?.trim().toLowerCase() || `${a.name.trim().toLowerCase().replace(/\s+/g, ' ')}|${(a.phone ?? '').replace(/\D/g, '')}`;

// ── Indeed candidate export (.csv) ─────────────────────────────────────────
// Indeed Employer → Candidates → select candidates → Export. Its column names
// have changed over time, so each field accepts a few spellings.

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['name', 'full name', 'candidate name', 'candidate'],
  first_name: ['first name', 'firstname', 'given name'],
  last_name: ['last name', 'lastname', 'surname', 'family name'],
  email: ['email', 'email address', 'e-mail', 'candidate email'],
  phone: ['phone', 'phone number', 'telephone', 'mobile', 'candidate phone'],
  location: ['candidate location', 'location', 'city', 'address'],
  applied_date: ['date', 'date applied', 'applied date', 'applied on', 'application date', 'applied'],
  indeed_status: ['status', 'candidate status', 'application status'],
  experience: ['relevant experience', 'most recent job title', 'recent job title', 'work experience', 'experience', 'most recent job'],
  education: ['education', 'highest education', 'education level'],
  qualifications: ['qualifications', 'screener questions', 'screening questions', 'skills', 'licenses & certifications', 'certifications'],
  cv_url: ['resume', 'resume link', 'resume url', 'cv', 'cv link'],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Indeed writes dates as YYYY-MM-DD, dd/mm/yyyy (UK account) or "Oct 20, 2026".
export const parseIndeedDate = (value: string): string | null => {
  const v = value.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = v.match(/^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/i) ?? null;
  if (m && MONTHS.includes(m[1].toLowerCase())) {
    return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  m = v.match(/^(\d{1,2}) ([a-z]{3})[a-z]*\.? (\d{4})/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) {
    return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
};

export function parseIndeedCsv(text: string): ImportedApplicant[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const headings = (header ?? []).map((h) => h.trim().toLowerCase());
  const col: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const i = aliases.map((a) => headings.indexOf(a)).find((i) => i >= 0);
    if (i !== undefined) col[field] = i;
  }
  if (col.name === undefined && col.first_name === undefined) {
    throw new Error('This doesn’t look like an Indeed candidate export — there’s no Name column.');
  }

  const get = (row: string[], field: string) => (col[field] === undefined ? '' : (row[col[field]] ?? '').trim());
  const orNull = (v: string) => (v && v !== '-' ? v : null);

  const byKey = new Map<string, ImportedApplicant>();
  for (const row of rows) {
    const name = get(row, 'name') || [get(row, 'first_name'), get(row, 'last_name')].filter(Boolean).join(' ');
    if (!name) continue;
    const applicant = {
      name,
      email: orNull(get(row, 'email')),
      phone: orNull(get(row, 'phone')),
      location: orNull(get(row, 'location')),
      applied_date: parseIndeedDate(get(row, 'applied_date')),
      indeed_status: orNull(get(row, 'indeed_status')),
      experience: orNull(get(row, 'experience')),
      education: orNull(get(row, 'education')),
      qualifications: orNull(get(row, 'qualifications')),
      cv_url: /^https?:\/\//i.test(get(row, 'cv_url')) ? get(row, 'cv_url') : null,
    };
    byKey.set(applicantKey(applicant), { ...applicant, dedupe_key: applicantKey(applicant) });
  }
  return [...byKey.values()];
}

export const formatUkDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
