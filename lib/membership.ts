// Teams, fees and the paid / not-paid rules for /operations/membership.
// Shared by the page, the importer (lib/importers/membershipImportParser.ts)
// and its API route.
//
// Players come from the RFU GMS player list export, members from the
// ClubControl export. A player's team comes from their date of birth and
// gender (teamFromBirthDate). They count as paid when their name matches an
// *active* ClubControl member (or a life member — see isPaidUp); a match on
// anyone else is "lapsed"; no match at all is "not on ClubControl".

export type TeamGroup = 'Seniors' | 'Juniors' | 'Girls';

export type Team = {
  name: string;
  group: TeamGroup;
  // Monthly membership fee, used to show what non-payers cost the club.
  monthlyFee: number;
};

export const TEAM_GROUPS: TeamGroup[] = ['Seniors', 'Juniors', 'Girls'];

export const TEAMS: Team[] = [
  { name: 'Men', group: 'Seniors', monthlyFee: 20 },
  { name: 'Ladies', group: 'Seniors', monthlyFee: 13.5 },
  // Grouped with the seniors, but still charged the junior fee.
  { name: 'Under 18s', group: 'Seniors', monthlyFee: 16 },
  ...[17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7].map((n) => ({
    name: `Under ${n}s`,
    group: 'Juniors' as const,
    monthlyFee: 16,
  })),
  { name: 'Girls Under 16s', group: 'Girls', monthlyFee: 10 },
  { name: 'Girls Under 14s', group: 'Girls', monthlyFee: 10 },
  { name: 'Girls Under 12s', group: 'Girls', monthlyFee: 10 },
];

export const TEAM_BY_NAME = new Map(TEAMS.map((t) => [t.name, t]));

export type PlayerStatus = 'paid' | 'lapsed' | 'missing';

export const STATUS_LABELS: Record<PlayerStatus, string> = {
  paid: 'Paid',
  lapsed: 'Lapsed',
  missing: 'Not on ClubControl',
};

// Case, accents and stray spaces don't stop a match between the two systems.
export const nameKey = (first: string, last: string) =>
  `${first} ${last}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// The season runs September to August.
export const seasonStart = (today = new Date()) =>
  new Date(today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1, 8, 1);

// Months charged so far this season, counting September itself (October = 2).
export const monthsIntoSeason = (today = new Date()) => {
  const start = seasonStart(today);
  return (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()) + 1;
};

const ageOnDate = (dob: Date, on: Date) => {
  let age = on.getFullYear() - dob.getFullYear();
  if (on.getMonth() < dob.getMonth() || (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate())) age -= 1;
  return age;
};

const parseIso = (isoDate: string | null) => {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const ageOn = (isoDate: string | null, today = new Date()): number | null => {
  const dob = parseIso(isoDate);
  return dob ? ageOnDate(dob, today) : null;
};

// Each player's team, from their date of birth and gender. Age grades go by
// age at the start of the season (the school year, as the RFU does): Under
// 7s are those who were 6 on 31 August. Everyone moves up automatically each
// September.
//   Boys:  Under 7s to Under 18s, then Men.
//   Girls: mixed junior teams up to Under 11s; Girls Under 12s, 14s and 16s
//          (two-year bands from Under 13s, with Under 17s in the Under 16s);
//          Ladies from 17 at the start of the season.
// Younger than Under 7s counts as Under 7s.
export const teamFromBirthDate = (isoDate: string | null, gender: string | null, today = new Date()): string | null => {
  const dob = parseIso(isoDate);
  if (!dob) return null;
  const cutOff = new Date(seasonStart(today).getFullYear(), 7, 31, 12);
  const grade = ageOnDate(dob, cutOff) + 1;
  const female = (gender ?? '').trim().toLowerCase().startsWith('f');
  if (female) {
    if (grade <= 7) return 'Under 7s';
    if (grade <= 11) return `Under ${grade}s`;
    if (grade <= 12) return 'Girls Under 12s';
    if (grade <= 14) return 'Girls Under 14s';
    // 16-year-olds (Under 17s) stay with the oldest girls' team.
    if (grade <= 17) return 'Girls Under 16s';
    return 'Ladies';
  }
  if (grade <= 7) return 'Under 7s';
  if (grade <= 18) return `Under ${grade}s`;
  return 'Men';
};

// Life members never pay again, so they count as paid up even when
// ClubControl marks them inactive.
export const LIFE_MEMBER_CATEGORY = 'Life Member';

export const isPaidUp = (member: { active: boolean; categories: string[] }) =>
  member.active || member.categories.includes(LIFE_MEMBER_CATEGORY);

// ClubControl memberships for people who play, so should be registered on
// GMS. Anyone with one of these who isn't in the GMS player list goes on the
// page's "Not on GMS" list.
export const PLAYING_CATEGORIES = ['Male Player', 'Female Player', 'Child Player', 'Student - Unemployed'];

// Categories that only describe a discount or a lotto entry, not what kind of
// member someone is — hidden when showing a member's membership type.
export const isSideCategory = (category: string) =>
  category.startsWith('Membership Discount') || category.startsWith('Presidents Lotto');

// Some ClubControl category names contain a comma themselves, so the export's
// comma-separated Categories column can't just be split on commas.
const CATEGORIES_WITH_COMMAS = ['Parents Access - No Gym, Bar Discount Only'];

export const splitCategories = (value: string): string[] => {
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const joined = out.length ? `${out[out.length - 1]}, ${part}` : '';
    if (joined && CATEGORIES_WITH_COMMAS.some((c) => c === joined || c.startsWith(`${joined},`))) {
      out[out.length - 1] = joined;
    } else {
      out.push(part);
    }
  }
  return out;
};

// ClubControl billing methods (the Members list's "Billing Method" column,
// read by the automatic fetch: lib/clubcontrol.ts). An active direct debit
// means the person really pays through ClubControl; being "active" alone
// doesn't, as everyone was brought across from LoveAdmin as active.
export const DIRECT_DEBIT_ACTIVE = 'Direct Debit: Active';

const billingRank = (b: string | null | undefined) =>
  b === DIRECT_DEBIT_ACTIVE ? 3 : b?.startsWith('Direct Debit') ? 2 : b === 'Card' ? 1 : 0;

// Each name's billing method. Someone listed twice gets their best one (an
// active direct debit wins), as with paid-up status.
export const billingByName = (members: { first_name: string; last_name: string; billing_method?: string | null }[]) => {
  const map = new Map<string, string | null>();
  for (const m of members) {
    const key = nameKey(m.first_name, m.last_name);
    if (!map.has(key) || billingRank(m.billing_method) > billingRank(map.get(key))) map.set(key, m.billing_method ?? null);
  }
  return map;
};
