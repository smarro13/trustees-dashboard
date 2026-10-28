import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import {
  PLAYING_CATEGORIES,
  TEAMS,
  TEAM_BY_NAME,
  TEAM_GROUPS,
  monthsIntoSeason,
  nameKey,
  teamFromBirthDate,
  type PlayerStatus,
  type TeamGroup,
} from './membership';

// The membership figures for the agenda (pages/agenda/membership.tsx) and the
// printable detailed report (pages/operations/membership/report.tsx), worked
// out from the same fetched data and rules as /operations/membership: hidden people
// are left out, a player is paid when their name matches an active
// ClubControl member, and someone listed twice in GMS counts once in totals.
//
// The summary holds counts and money only (no names), so it can be saved on
// the agenda's membership_reports row and shown to anyone who can see the
// meeting. The detail (names) is only ever built live, for the roles that can
// read the membership tables.

export type MembershipMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  categories: string[];
  renewal_date: string | null;
  active: boolean;
  amount: number | null; // the export's Amount column: what the member has paid
};

export type MembershipPlayer = {
  id: string;
  name_key: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
};

export type MembershipData = {
  members: MembershipMember[];
  players: MembershipPlayer[];
  hiddenKeys: Set<string>;
  membersUploadedAt: string | null;
  playersUploadedAt: string | null;
};

type Counts = { total: number; paid: number; lapsed: number; missing: number; unpaidMonthly: number };

export type MembershipSummary = {
  generatedAt: string;
  membersUploadedAt: string | null;
  playersUploadedAt: string | null;
  monthsIntoSeason: number;
  players: Counts; // everyone with a team, each person once
  byGroup: Record<TeamGroup, Counts>;
  byTeam: Array<Counts & { team: string }>;
  activeMembers: number;
  inactiveMembers: number;
  notOnGms: number;
  // Money paid by members: the total of the ClubControl export's Amount column (the same as the export's
  // totals row), and the part of it from active members. Missing on snapshots
  // saved before 23 Oct 2026, when the money was typed in by hand.
  amountTotal?: number;
  amountActive?: number;
};

export type PlayerDetail = { name: string; team: string; status: PlayerStatus };
export type MemberDetail = { name: string; email: string | null };

export type MembershipDetail = {
  unpaidPlayers: PlayerDetail[]; // lapsed or not on ClubControl, by team then name
  notOnGms: MemberDetail[];
  inactiveMembers: MemberDetail[];
};

const PAGE_SIZE = 1000;

async function loadAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Throws if the user's role can't read the membership tables. The meeting-day
// job (pages/api/cron/membership-report.ts) passes a service-role client.
export async function loadMembershipData(client: SupabaseClient = supabase): Promise<MembershipData> {
  const imports = await client
    .from('membership_imports')
    .select('id, kind, uploaded_at')
    .order('uploaded_at', { ascending: false })
    .limit(500);
  if (imports.error) throw new Error(imports.error.message);
  const importRows = (imports.data ?? []) as { id: string; kind: string; uploaded_at: string }[];
  const latestMembers = importRows.find((i) => i.kind === 'members');
  const latestPlayers = importRows.find((i) => i.kind === 'players');

  const [members, players, notes] = await Promise.all([
    latestMembers
      ? loadAll<MembershipMember>((from, to) =>
          client.from('membership_members').select('id, first_name, last_name, email, categories, renewal_date, active, amount')
            .eq('import_id', latestMembers.id).order('id').range(from, to))
      : Promise.resolve([] as MembershipMember[]),
    loadAll<MembershipPlayer>((from, to) =>
      client.from('membership_players').select('id, name_key, first_name, last_name, date_of_birth, gender')
        .order('last_name').order('first_name').order('id').range(from, to)),
    loadAll<{ person_key: string; hidden: boolean }>((from, to) =>
      client.from('membership_notes').select('person_key, hidden').order('person_key').range(from, to)),
  ]);

  return {
    members,
    players,
    hiddenKeys: new Set(notes.filter((n) => n.hidden).map((n) => n.person_key)),
    membersUploadedAt: latestMembers?.uploaded_at ?? null,
    playersUploadedAt: latestPlayers?.uploaded_at ?? null,
  };
}

const emptyCounts = (): Counts => ({ total: 0, paid: 0, lapsed: 0, missing: 0, unpaidMonthly: 0 });

const fullName = (first: string, last: string) => `${first} ${last}`.replace(/\s+/g, ' ').trim();

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' });

// Players with their team and status, hidden people left out.
function reportPlayers(data: MembershipData, today: Date) {
  // Someone in the ClubControl export twice counts as active if either record is.
  const membersByName = new Map<string, MembershipMember>();
  for (const m of data.members) {
    const key = nameKey(m.first_name, m.last_name);
    const existing = membersByName.get(key);
    if (!existing || (!existing.active && m.active)) membersByName.set(key, m);
  }

  return data.players
    .filter((p) => !data.hiddenKeys.has(p.name_key))
    .map((p) => {
      const member = membersByName.get(p.name_key) ?? null;
      const status: PlayerStatus = !member ? 'missing' : member.active ? 'paid' : 'lapsed';
      return { ...p, team: teamFromBirthDate(p.date_of_birth, p.gender, today), status };
    });
}

// Each person once (by name and date of birth), at the highest fee of their teams.
function countPeople(rows: { name_key: string; date_of_birth: string | null; team: string | null; status: PlayerStatus }[]): Counts {
  const people = new Map<string, { status: PlayerStatus; fee: number }>();
  for (const p of rows) {
    const key = `${p.name_key}|${p.date_of_birth ?? ''}`;
    const fee = TEAM_BY_NAME.get(p.team ?? '')?.monthlyFee ?? 0;
    const existing = people.get(key);
    people.set(key, { status: p.status, fee: Math.max(fee, existing?.fee ?? 0) });
  }
  const list = [...people.values()];
  const count = (s: PlayerStatus) => list.filter((p) => p.status === s).length;
  return {
    total: list.length,
    paid: count('paid'),
    lapsed: count('lapsed'),
    missing: count('missing'),
    unpaidMonthly: list.filter((p) => p.status !== 'paid').reduce((sum, p) => sum + p.fee, 0),
  };
}

function notOnGmsMembers(data: MembershipData) {
  const onGms = new Set(data.players.map((p) => p.name_key));
  const seen = new Set<string>();
  return data.members.filter((m) => {
    const key = nameKey(m.first_name, m.last_name);
    if (onGms.has(key) || data.hiddenKeys.has(key) || seen.has(key)) return false;
    if (!m.categories.some((c) => PLAYING_CATEGORIES.includes(c))) return false;
    seen.add(key);
    return true;
  });
}

const inactiveList = (data: MembershipData) =>
  data.members.filter((m) => !m.active && !data.hiddenKeys.has(nameKey(m.first_name, m.last_name)));

export function buildMembershipSummary(data: MembershipData, today = new Date()): MembershipSummary {
  const rows = reportPlayers(data, today).filter((p) => p.team !== null);

  const byTeam = TEAMS.map((team) => {
    const teamRows = rows.filter((p) => p.team === team.name);
    const count = (s: PlayerStatus) => teamRows.filter((p) => p.status === s).length;
    const unpaid = teamRows.length - count('paid');
    return {
      team: team.name,
      total: teamRows.length,
      paid: count('paid'),
      lapsed: count('lapsed'),
      missing: count('missing'),
      unpaidMonthly: unpaid * team.monthlyFee,
    };
  });

  const byGroup = Object.fromEntries(
    TEAM_GROUPS.map((group) => {
      const names = new Set(TEAMS.filter((t) => t.group === group).map((t) => t.name));
      return [group, countPeople(rows.filter((p) => names.has(p.team as string)))];
    }),
  ) as Record<TeamGroup, Counts>;

  // Active members counted once per person.
  const activeKeys = new Set(data.members.filter((m) => m.active).map((m) => nameKey(m.first_name, m.last_name)));

  const sumAmount = (list: MembershipMember[]) =>
    Math.round(list.reduce((sum, m) => sum + (Number(m.amount) || 0), 0) * 100) / 100;

  return {
    generatedAt: today.toISOString(),
    membersUploadedAt: data.membersUploadedAt,
    playersUploadedAt: data.playersUploadedAt,
    monthsIntoSeason: monthsIntoSeason(today),
    players: rows.length ? countPeople(rows) : emptyCounts(),
    byGroup,
    byTeam,
    activeMembers: activeKeys.size,
    inactiveMembers: inactiveList(data).length,
    notOnGms: notOnGmsMembers(data).length,
    amountTotal: sumAmount(data.members),
    amountActive: sumAmount(data.members.filter((m) => m.active)),
  };
}

export function buildMembershipDetail(data: MembershipData, today = new Date()): MembershipDetail {
  const teamOrder = new Map(TEAMS.map((t, i) => [t.name, i]));
  // Each person once, even if GMS lists them twice.
  const seen = new Set<string>();
  const unpaidPlayers = reportPlayers(data, today)
    .filter((p) => p.team !== null && p.status !== 'paid')
    .filter((p) => {
      const key = `${p.name_key}|${p.date_of_birth ?? ''}|${p.team}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((p) => ({ name: fullName(p.first_name, p.last_name), team: p.team as string, status: p.status }))
    .sort((a, b) => (teamOrder.get(a.team) ?? 99) - (teamOrder.get(b.team) ?? 99) || byName(a, b));

  const toDetail = (m: MembershipMember) => ({ name: fullName(m.first_name, m.last_name), email: m.email });
  return {
    unpaidPlayers,
    notOnGms: notOnGmsMembers(data).map(toDetail).sort(byName),
    inactiveMembers: inactiveList(data).map(toDetail).sort(byName),
  };
}

export const formatMoney = (value: number) =>
  value.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: value % 1 ? 2 : 0 });

export const formatUploadDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'not fetched yet';
