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

export type ClubControlBilling = {
  billing_method: string | null;
  external_id: string | null;
  // GoCardless mandate status on their own record (e.g. "Active"), read by
  // the automatic fetch for everyone with a direct debit.
  mandate_status: string | null;
  // The ClubControl member id of the account whose active mandate pays for
  // this person (e.g. a parent paying for the family), when it isn't their
  // own. Read by the automatic fetch from that account's member list.
  covered_by_id: string | null;
};

const isActiveMandate = (status: string | null | undefined) => /^active$/i.test(status ?? '');

// Has their own active mandate. Before mandate statuses were stored, an
// active direct debit billing method stands in for it.
const ownActiveMandate = (b: ClubControlBilling) =>
  b.mandate_status ? isActiveMandate(b.mandate_status) : b.billing_method === DIRECT_DEBIT_ACTIVE;

// Pays through ClubControl by an active direct debit mandate: their own, or
// the account that pays for them.
export const paysByDirectDebit = (b: ClubControlBilling | null | undefined) =>
  !!b && (ownActiveMandate(b) || !!b.covered_by_id);

// Whose ClubControl record holds the direct debit mandate for this person.
export const mandateMemberId = (b: ClubControlBilling | null | undefined) =>
  !b ? null : ownActiveMandate(b) ? b.external_id : b.covered_by_id ?? b.external_id;

const billingRank = (b: Partial<ClubControlBilling> | null | undefined) =>
  isActiveMandate(b?.mandate_status) || b?.billing_method === DIRECT_DEBIT_ACTIVE ? 4
    : b?.covered_by_id ? 3
      : b?.billing_method?.startsWith('Direct Debit') ? 2
        : b?.billing_method === 'Card' ? 1
          : 0;

// Each name's billing method, mandate, ClubControl member id and the account
// paying for them. Someone listed twice gets their best record (an active
// mandate wins), as with paid-up status.
export const billingByName = (members: {
  first_name: string;
  last_name: string;
  billing_method?: string | null;
  external_id?: string | null;
  mandate_status?: string | null;
  covered_by_id?: string | null;
}[]) => {
  const map = new Map<string, ClubControlBilling>();
  for (const m of members) {
    const key = nameKey(m.first_name, m.last_name);
    if (!map.has(key) || billingRank(m) > billingRank(map.get(key))) {
      map.set(key, {
        billing_method: m.billing_method ?? null,
        external_id: m.external_id ?? null,
        mandate_status: m.mandate_status ?? null,
        covered_by_id: m.covered_by_id ?? null,
      });
    }
  }
  return map;
};

// ── Finding someone in ClubControl when the names differ ──
//
// LoveAdmin and ClubControl often spell first names differently:
// "Ste Warner" / "Steven Warner", "Katy Davies" / "Katherine Davies". If the
// exact name isn't in ClubControl, look for the same surname with a
// compatible first name: one is the start of the other (at least 3 letters),
// or both are forms of the same name.

const NAME_GROUPS = [
  'katherine kathryn catherine cathryn kate katy katie kat kath cath cathy kathy',
  'stephen steven steve ste stevie',
  'michael mike mick mikey micky mickey',
  'william will bill billy liam',
  'robert rob robbie bob bobby bert',
  'thomas tom tommy',
  'james jim jimmy jamie',
  'joseph joe joey',
  'daniel dan danny',
  'matthew matt matty',
  'christopher chris kit',
  'anthony tony ant',
  'jonathan jon jonny',
  'nicholas nick nicky',
  'alexander alex',
  'alexandra alex lexi',
  'benjamin ben benny',
  'samuel sam sammy',
  'samantha sam sammie',
  'edward ed eddie ted teddy',
  'richard rich richie rick ricky dick',
  'andrew andy drew',
  'david dave davey',
  'peter pete',
  'philip phillip phil',
  'gregory greg',
  'timothy tim timmy',
  'lawrence laurence larry laurie',
  'frederick fred freddie',
  'henry harry hal',
  'elizabeth liz lizzie beth betty libby eliza',
  'margaret maggie meg peggy',
  'rebecca becky becca',
  'jennifer jen jenny',
  'victoria vicky vicki tori',
  'deborah debbie deb',
  'susan sue susie suzanne',
  'patricia pat trish tricia',
  'jessica jess jessie',
  'charlotte charlie lottie',
  'abigail abbie abby',
  'olivia liv livvy',
  'eleanor ellie nell',
  'josephine jo josie',
  'joanne jo joanna',
].map((g) => g.split(' '));

const NAME_GROUP_OF = new Map<string, number[]>();
NAME_GROUPS.forEach((group, i) => {
  for (const n of group) NAME_GROUP_OF.set(n, [...(NAME_GROUP_OF.get(n) ?? []), i]);
});

const firstNamesMatch = (a: string, b: string) => {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.startsWith(short)) return true;
  const groups = NAME_GROUP_OF.get(a) ?? [];
  return groups.some((g) => (NAME_GROUP_OF.get(b) ?? []).includes(g));
};

export type ClubControlMatch = {
  // The ClubControl name it matched (nameKey form).
  key: string;
  record: ClubControlBilling;
  // True when the names aren't identical (e.g. "Ste" for "Steven").
  nearMatch: boolean;
};

// By surname (last word of the name key), for near matches.
const surnameIndexCache = new WeakMap<Map<string, ClubControlBilling>, Map<string, string[]>>();
const surnameIndex = (billing: Map<string, ClubControlBilling>) => {
  let index = surnameIndexCache.get(billing);
  if (!index) {
    index = new Map();
    for (const key of billing.keys()) {
      const words = key.split(' ');
      const surname = words[words.length - 1];
      index.set(surname, [...(index.get(surname) ?? []), key]);
    }
    surnameIndexCache.set(billing, index);
  }
  return index;
};

// Someone's ClubControl record from their name as another system writes it.
// An exact match first; otherwise the same surname with a compatible first
// name, but only when exactly one ClubControl name fits: two candidates
// (e.g. a Daniel and a Danielle with the same surname) could be different
// people, so neither is assumed.
export const findClubControl = (fullName: string, billing: Map<string, ClubControlBilling>): ClubControlMatch | null => {
  const key = nameKey(fullName, '');
  const exact = billing.get(key);
  if (exact) return { key, record: exact, nearMatch: false };

  const words = key.split(' ');
  if (words.length < 2) return null;
  const first = words[0];
  const surname = words[words.length - 1];
  const candidates = (surnameIndex(billing).get(surname) ?? [])
    .filter((k) => firstNamesMatch(first, k.split(' ')[0]))
    .map((k) => ({ key: k, record: billing.get(k)!, nearMatch: true }));
  return candidates.length === 1 ? candidates[0] : null;
};

// ── Parents ──
//
// ClubControl's export doesn't link parents to children, and the 21 Oct 2026
// export has nobody with Parents Access plus another membership. So a parent is
// anyone with Parents Access, or anyone who pays for a child: through their
// ClubControl direct debit (covered_by_id), or as the payer on a paid LoveAdmin
// invoice (LoveAdmin migration (temporary), see LOVEADMIN_MIGRATION.md).

export const PARENT_ACCESS_CATEGORY = 'Parents Access - No Gym, Bar Discount Only';
export const CHILD_CATEGORIES = ['Child Player', 'Mini Winnies', 'Girls'];
const ADULT_TEAMS = ['Men', 'Ladies'];
const MEMBERSHIP_TAGS: Record<string, string> = { 'Non-Player (Gym)': 'Gym', 'Non Player (Social)': 'Social' };

type ParentMember = {
  first_name: string;
  last_name: string;
  categories: string[];
  active: boolean;
  external_id?: string | null;
  covered_by_id?: string | null;
};

export type ParentRow<M> = {
  key: string;
  // Their paid-up record, if they're listed twice.
  member: M;
  // Memberships beyond Parents Access. Empty means no further membership.
  tags: string[];
  hasParentAccess: boolean;
  // The children they pay for, by name.
  paysFor: string[];
};

export function findParents<M extends ParentMember>(
  members: M[],
  payments: { name_key: string; beneficiary: string; payer: string | null }[],
  teamsByName: Map<string, string[]>,
  billing: Map<string, ClubControlBilling>,
): ParentRow<M>[] {
  const recordsByName = new Map<string, M[]>();
  const keyById = new Map<string, string>();
  for (const m of members) {
    const key = nameKey(m.first_name, m.last_name);
    recordsByName.set(key, [...(recordsByName.get(key) ?? []), m]);
    if (m.external_id) keyById.set(m.external_id, key);
  }

  const isChild = (key: string) =>
    (teamsByName.get(key) ?? []).some((team) => !ADULT_TEAMS.includes(team)) ||
    (recordsByName.get(key) ?? []).some((m) => m.categories.some((c) => CHILD_CATEGORIES.includes(c)));

  const childrenByParent = new Map<string, Set<string>>();
  const addChild = (parentKey: string, childKey: string, childName: string) => {
    if (parentKey === childKey || !isChild(childKey)) return;
    childrenByParent.set(parentKey, (childrenByParent.get(parentKey) ?? new Set<string>()).add(childName));
  };
  for (const m of members) {
    const parentKey = m.covered_by_id ? keyById.get(m.covered_by_id) : undefined;
    if (parentKey) addChild(parentKey, nameKey(m.first_name, m.last_name), `${m.first_name} ${m.last_name}`.trim());
  }
  for (const p of payments) {
    const parentKey = p.payer ? findClubControl(p.payer, billing)?.key : undefined;
    if (parentKey) addChild(parentKey, findClubControl(p.beneficiary, billing)?.key ?? p.name_key, p.beneficiary);
  }

  const parents: ParentRow<M>[] = [];
  for (const [key, records] of recordsByName) {
    const categories = [...new Set(records.flatMap((m) => m.categories))].filter((c) => !isSideCategory(c));
    const hasParentAccess = categories.includes(PARENT_ACCESS_CATEGORY);
    const children = childrenByParent.get(key);
    if (!hasParentAccess && !children) continue;
    // A child paying for a brother or sister isn't a parent.
    if (!hasParentAccess && categories.length > 0 && categories.every((c) => CHILD_CATEGORIES.includes(c))) continue;
    parents.push({
      key,
      member: records.find(isPaidUp) ?? records[0],
      tags: categories.filter((c) => c !== PARENT_ACCESS_CATEGORY).map((c) => MEMBERSHIP_TAGS[c] ?? c),
      hasParentAccess,
      paysFor: [...(children ?? [])].sort(),
    });
  }
  return parents;
}

// ── Incorrect memberships ──
//
// Child memberships that don't fit someone's age or gender. Ages go by the
// start of the season, as the teams do (teamFromBirthDate), so an Under 18 who
// turns 18 in the season isn't flagged. ClubControl rarely has a date of birth
// for children, so GMS's is used when it hasn't, matched by name: someone with
// two different dates on GMS can't be checked.

const OLDEST_CHILD_AGE = 17;
const OLDEST_MINI_WINNIES_GRADE = 6;
const YOUNGEST_GIRLS_GRADE = 12;

type MembershipCheckMember = {
  first_name: string;
  last_name: string;
  categories: string[];
  date_of_birth?: string | null;
  gender?: string | null;
};

export type MembershipIssue = { category: string; reason: string; shouldBe: string };

export type IncorrectMembership<M> = {
  key: string;
  member: M;
  age: number | null;
  dobFrom: 'ClubControl' | 'GMS';
  issues: MembershipIssue[];
};

export function findIncorrectMemberships<M extends MembershipCheckMember>(
  members: M[],
  players: { name_key: string; date_of_birth: string | null; gender: string | null }[],
  today = new Date(),
): { incorrect: IncorrectMembership<M>[]; unchecked: M[] } {
  const playersByName = new Map<string, typeof players>();
  for (const p of players) playersByName.set(p.name_key, [...(playersByName.get(p.name_key) ?? []), p]);

  const cutOff = new Date(seasonStart(today).getFullYear(), 7, 31, 12);
  const incorrect: IncorrectMembership<M>[] = [];
  const unchecked: M[] = [];

  for (const member of members) {
    const held = member.categories.filter((c) => CHILD_CATEGORIES.includes(c));
    if (held.length === 0) continue;

    const key = nameKey(member.first_name, member.last_name);
    const onGms = playersByName.get(key) ?? [];
    const gmsDates = [...new Set(onGms.map((p) => p.date_of_birth).filter(Boolean))] as string[];
    const dob = member.date_of_birth || (gmsDates.length === 1 ? gmsDates[0] : null);
    const parsed = parseIso(dob);
    if (!parsed) {
      unchecked.push(member);
      continue;
    }

    const seasonAge = ageOnDate(parsed, cutOff);
    const grade = seasonAge + 1;
    const gender = (member.gender || onGms.find((p) => p.gender)?.gender || '').trim().toLowerCase();
    const female = gender.startsWith('f');
    const male = gender.startsWith('m');
    const youngMembership = grade <= OLDEST_MINI_WINNIES_GRADE ? 'Mini Winnies' : 'Child Player';

    const issues: MembershipIssue[] = [];
    if (seasonAge > OLDEST_CHILD_AGE) {
      for (const category of held) {
        issues.push({ category, reason: `Over 17: was ${seasonAge} on 31 August`, shouldBe: 'an adult membership' });
      }
    } else {
      if (held.includes('Mini Winnies') && grade > OLDEST_MINI_WINNIES_GRADE) {
        issues.push({
          category: 'Mini Winnies',
          reason: `Under ${grade}s: Mini Winnies is Under 6s and under`,
          shouldBe: female && grade >= YOUNGEST_GIRLS_GRADE && grade <= 17 ? 'Girls' : 'Child Player',
        });
      }
      if (held.includes('Child Player') && !held.includes('Girls') && female && grade >= YOUNGEST_GIRLS_GRADE && grade <= 17) {
        issues.push({ category: 'Child Player', reason: `Under ${grade}s girl: girls’ team age`, shouldBe: 'Girls' });
      }
      // Left alone if their gender isn't known: only flag what's certain.
      if (held.includes('Girls') && (male || female)) {
        if (male) {
          issues.push({ category: 'Girls', reason: 'Male, so not in a girls’ team', shouldBe: youngMembership });
        } else if (grade < YOUNGEST_GIRLS_GRADE) {
          issues.push({ category: 'Girls', reason: `Under ${grade}s: girls’ teams start at Under 12s`, shouldBe: youngMembership });
        } else if (grade > 17) {
          issues.push({ category: 'Girls', reason: 'In Ladies, not a girls’ team', shouldBe: youngMembership });
        }
      }
    }
    if (issues.length > 0) {
      incorrect.push({ key, member, age: ageOnDate(parsed, today), dobFrom: member.date_of_birth ? 'ClubControl' : 'GMS', issues });
    }
  }
  return { incorrect, unchecked };
}
