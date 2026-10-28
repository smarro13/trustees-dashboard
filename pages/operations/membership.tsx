import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { hasMembershipFlag, resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  PLAYING_CATEGORIES,
  STATUS_LABELS,
  TEAMS,
  TEAM_BY_NAME,
  TEAM_GROUPS,
  ageOn,
  DIRECT_DEBIT_ACTIVE,
  billingByName,
  type ClubControlBilling,
  isPaidUp,
  isSideCategory,
  monthsIntoSeason,
  nameKey,
  seasonStart,
  teamFromBirthDate,
  type PlayerStatus,
  type TeamGroup,
} from '../../lib/membership';

// Who's paid their membership, team by team. All of it is fetched live and
// automatically (every Monday, on meeting days, or by an admin's "Fetch …
// now" button): players from the RFU GMS player list, payments from the
// ClubControl members export, and LoveAdmin payments from Thrive4. Nothing
// is uploaded by hand. Tables and access rules are in
// supabase/policies/membership.sql: admins, trustees and directors can view
// and comment; only admins can fetch, and hide people from the report (they
// then appear on the admins' Hidden tab). Comments are saved by
// pages/api/private/membership-note.ts.

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  categories: string[];
  renewal_date: string | null;
  active: boolean;
  // ClubControl's billing method, e.g. "Direct Debit: Active" (automatic fetch only).
  billing_method?: string | null;
  // ClubControl's member id (the export's "Id").
  external_id?: string | null;
};

type Player = {
  id: string;
  name_key: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
};

type Import = { id: string; kind: 'members' | 'players' | 'loveadmin'; file_name: string; uploaded_at: string; uploaded_by: string | null };

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// A person a paid LoveAdmin invoice was for.
type LoveAdminPayment = {
  id: string;
  name_key: string;
  beneficiary: string;
  payer: string | null;
  invoice_amount: number | null;
  invoice_date: string | null;
};

// One comment per person, keyed by nameKey() so it shows wherever they're listed.
type Note = {
  person_key: string;
  display_name: string;
  note: string;
  hidden: boolean;
  updated_at: string;
  updated_by: string | null;
};

// team is worked out from date of birth and gender; null without a date of birth.
type PlayerRow = Player & { team: string | null; status: PlayerStatus; member: Member | null; loveAdmin: LoveAdminPayment | null };

// 'all', 'group:Juniors' or 'team:Under 7s'.
type Filter = string;
type StatusFilter = 'all' | 'unpaid' | PlayerStatus;
type View = 'report' | 'hidden';
// Where the automatic fetches come from (pages/api/private/<source>-sync.ts).
// 'thrive4' is LoveAdmin — LoveAdmin migration (temporary), see LOVEADMIN_MIGRATION.md.
type FetchSource = 'clubcontrol' | 'gms' | 'thrive4';
const FETCH_NAMES: Record<FetchSource, string> = { clubcontrol: 'ClubControl', gms: 'GMS', thrive4: 'Thrive4' };

type Card = 'byTeam' | 'players' | 'notOnGms' | 'loveAdmin' | 'thrive4' | 'inactive';

// Which report cards start open. Each viewer's own choice is remembered in
// their browser after that.
const DEFAULT_OPEN: Record<Card, boolean> = { byTeam: true, players: true, notOnGms: false, loveAdmin: false, thrive4: false, inactive: false };
const OPEN_CARDS_KEY = 'membership-open-cards';


// 'dor' = Director of Rugby (sees the players; can comment, can't fetch or hide).
// Anyone else given the membership switch on /admin/roles gets the same access.
const VIEW_ROLES = new Set(['admin', 'trustee', 'director', 'dor']);
const PAGE_SIZE = 1000;

const STATUS_STYLES: Record<PlayerStatus, { badge: string; bar: string }> = {
  paid: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500' },
  lapsed: { badge: 'bg-amber-50 text-amber-700 ring-amber-200', bar: 'bg-amber-400' },
  missing: { badge: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-500' },
};

const money = (value: number) =>
  value.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: value % 1 ? 2 : 0 });

const shortDate = (value: string | null) =>
  value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const membershipType = (member: Member | null) =>
  member ? member.categories.filter((c) => !isSideCategory(c)).join(', ') || '—' : '—';

// ClubControl leaves the renewal date blank ("-") for some lapsed members.
const renewalText = (date: string | null) => (date ? `Renewal was due ${shortDate(date)}` : 'No renewal date');

const byName = (a: string, b: string) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' });

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none';

// Supabase returns at most 1000 rows per request.
async function loadAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// The members export's rows, with ClubControl's billing method when the
// column exists (supabase/policies/membership_billing_method.sql); without it
// until that has been run.
const MEMBER_COLUMNS = 'id, first_name, last_name, email, categories, renewal_date, active, external_id';
async function loadMembers(importId: string): Promise<Member[]> {
  const load = (columns: string) =>
    loadAll<Member>((from, to) =>
      supabase.from('membership_members').select(columns).eq('import_id', importId).order('id').range(from, to) as any);
  try {
    return await load(`${MEMBER_COLUMNS}, billing_method`);
  } catch (error: any) {
    if (!/billing_method/.test(error?.message ?? '')) throw error;
    return load(MEMBER_COLUMNS);
  }
}


function StatTile({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl ${tone ?? 'text-zinc-900'}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

// A card's title, as the button that opens and closes it. The description
// only shows while it's open.
function CardHeading({ open, onToggle, title, children }: {
  open: boolean;
  onToggle: () => void;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-zinc-900">
        <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-2 text-left hover:text-zinc-600">
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}>
            <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
          {title}
        </button>
      </h2>
      {open && children && <div className="mt-0.5 pl-6 text-xs text-zinc-500">{children}</div>}
    </div>
  );
}

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// What Thrive4 (LoveAdmin) has invoiced this month and will invoice next, per
// person, checked live (pages/api/private/thrive4-billing.ts). Anyone with an
// active direct debit in ClubControl is flagged: they've moved but are still
// open on Thrive4, so need making inactive there.
type Thrive4BillingPerson = {
  person_guid: string;
  name: string;
  payer: string | null;
  upcoming: { id: number; description: string | null; amount: number | null; payable_date: string | null }[];
  invoiced: { id: number; date: string | null; amount: number | null; status: string | null }[];
};

// A member's direct debit mandate on ClubControl, read live by
// pages/api/private/clubcontrol-mandates.ts (lib/clubcontrol.ts).
type ClubControlMandate = {
  member_id: string;
  url: string;
  mandate_id: string | null;
  mandate_status: string | null;
  payment_amount: string | null;
  payment_date: string | null;
  payment_type: string | null;
  renewal_due: string | null;
};
// Same rule as lib/clubcontrol.ts hasActiveMandate (which the server applies again).
const hasActiveMandate = (m: ClubControlMandate | undefined) => !!m?.mandate_id && /^active$/i.test(m.mandate_status ?? '');

const sumAmounts = (items: { amount: number | null }[]) => items.reduce((t, i) => t + (i.amount ?? 0), 0);

function Thrive4BillingCard({ open, onToggle, membersByName, billing, canClose, setNotice }: {
  open: boolean;
  onToggle: () => void;
  membersByName: Map<string, Member>;
  // Each name's ClubControl billing method (billingByName in lib/membership.ts).
  billing: Map<string, ClubControlBilling>;
  // Admins: "Make inactive" buttons (pages/api/private/thrive4-deactivate.ts).
  canClose: boolean;
  setNotice: (n: InlineNotice) => void;
}) {
  const [people, setPeople] = useState<Thrive4BillingPerson[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyMoved, setOnlyMoved] = useState(true);
  // Who the "Make inactive" confirmation is for: one person, or everyone who's moved.
  const [confirming, setConfirming] = useState<{ guids: string[]; label: string } | null>(null);
  const [closing, setClosing] = useState(false);
  // Admins: each moved person's ClubControl mandate, by ClubControl member id.
  const [mandates, setMandates] = useState<Map<string, ClubControlMandate>>(new Map());
  const [mandatesLoading, setMandatesLoading] = useState(false);
  const [mandatesError, setMandatesError] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/private/thrive4-billing', {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Checking Thrive4 failed.');
      setPeople(payload.people);
    } catch (e: any) {
      setError(e.message);
    }
    setChecking(false);
  };

  const rows = useMemo(
    () =>
      (people ?? [])
        .map((p) => {
          // Moved = an active direct debit in ClubControl. Being active there
          // isn't enough: everyone was brought across from LoveAdmin as active.
          const key = nameKey(p.name, '');
          const member = membersByName.get(key) ?? null;
          const method = billing.get(key)?.billing_method ?? null;
          const clubControl = !member ? 'Not on ClubControl' : method ?? (isPaidUp(member) ? 'Active, billing not known' : 'Inactive');
          return { ...p, clubControl, memberId: billing.get(key)?.external_id ?? null, moved: method === DIRECT_DEBIT_ACTIVE };
        })
        .sort((a, b) => Number(b.moved) - Number(a.moved) || a.name.localeCompare(b.name)),
    [people, membersByName, billing],
  );
  const moved = rows.filter((r) => r.moved);
  // Only someone with an active mandate on ClubControl can be made inactive.
  const closable = moved.filter((r) => r.memberId && hasActiveMandate(mandates.get(r.memberId)));
  const movedIds = moved.map((r) => r.memberId).filter((id): id is string => !!id).join(',');

  // After each check, read the mandates of everyone who's moved.
  useEffect(() => {
    if (!canClose || !movedIds) return;
    let cancelled = false;
    (async () => {
      setMandatesLoading(true);
      setMandatesError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch('/api/private/clubcontrol-mandates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
          body: JSON.stringify({ memberIds: movedIds.split(',') }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Reading the ClubControl mandates failed.');
        if (!cancelled) setMandates(new Map((payload.mandates as ClubControlMandate[]).map((m) => [m.member_id, m])));
      } catch (e: any) {
        if (!cancelled) setMandatesError(e.message);
      }
      if (!cancelled) setMandatesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canClose, movedIds, people]);
  const billingKnown = [...billing.values()].some((b) => b.billing_method !== null);
  const movedDue = moved.reduce((t, r) => t + sumAmounts(r.upcoming), 0);
  const shown = onlyMoved ? moved : rows;

  const close = async () => {
    if (!confirming) return;
    setClosing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/private/thrive4-deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
        body: JSON.stringify({ personGuids: confirming.guids }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && !payload.done?.length) throw new Error(payload.error || 'Making them inactive failed.');
      const done: string[] = payload.done ?? [];
      const failed: { name: string; error?: string }[] = payload.failed ?? [];
      const parts = [`Made ${done.length} ${done.length === 1 ? 'person' : 'people'} inactive on Thrive4.`];
      if (failed.length) parts.push(`${failed.length} failed: ${failed.map((f) => f.name).join(', ')}.`);
      if (payload.refused) parts.push(`${payload.refused} skipped: no longer billed on Thrive4 with an active ClubControl mandate.`);
      setNotice({ type: failed.length ? 'error' : 'success', message: parts.join(' ') });
      setConfirming(null);
      await check();
    } catch (e: any) {
      setNotice({ type: 'error', message: e.message });
      setConfirming(null);
    }
    setClosing(false);
  };

  return (
    <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-violet-200">
      <div className={`flex flex-wrap items-center justify-between gap-3 bg-violet-50 px-5 py-4 ${open ? 'border-b border-violet-200' : ''}`}>
        <CardHeading open={open} onToggle={onToggle} title={people ? `Thrive4 billing (${moved.length} moved, still billed)` : 'Thrive4 billing'}>
          What Thrive4 (LoveAdmin) invoiced this month and will invoice next, checked live. Anyone with an active direct debit
          in ClubControl has moved but is still open on Thrive4, so needs making inactive there.
        </CardHeading>
        {open && (
          <div className="flex flex-wrap items-center gap-3">
            {people && (
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={onlyMoved} onChange={(e) => setOnlyMoved(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                Only people who’ve moved
              </label>
            )}
            {canClose && people && closable.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirming({
                  guids: closable.map((r) => r.person_guid),
                  label: `all ${closable.length} people with an active ClubControl mandate`,
                })}
                disabled={closing || checking || mandatesLoading}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                Make all {closable.length} inactive
              </button>
            )}
            <button
              type="button"
              onClick={check}
              disabled={checking}
              className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-60"
            >
              {checking ? 'Checking…' : people ? '🔄 Check again' : '🔍 Check Thrive4'}
            </button>
          </div>
        )}
      </div>
      {!open ? null : error ? (
        <p role="alert" className="px-5 py-6 text-sm text-rose-600">{error}</p>
      ) : !people ? (
        <p className="px-5 py-6 text-sm text-zinc-500">Press Check Thrive4 to see who it’s still billing.</p>
      ) : (
        <>
          {!billingKnown && (
            <p className="px-5 pt-4 text-sm text-amber-700">
              Direct debit status from ClubControl isn’t loaded yet, so nobody is flagged. An admin needs to press “Fetch from ClubControl now”.
            </p>
          )}
          <p className="px-5 pt-4 text-sm text-zinc-700">
            {moved.length === 0
              ? 'Nobody with an active ClubControl direct debit has a Thrive4 subscription or invoice this month.'
              : `${moved.length} ${moved.length === 1 ? 'person has' : 'people have'} moved to ClubControl but ${moved.length === 1 ? 'is' : 'are'} still on Thrive4${movedDue ? `: ${money(movedDue)} due to be invoiced next` : ''}.`}
            {' '}<span className="text-zinc-500">Thrive4 is billing {rows.length} people in all.</span>
          </p>
          {canClose && moved.length > 0 && (
            <p className={`px-5 pt-2 text-xs ${mandatesError ? 'text-rose-600' : 'text-zinc-500'}`}>
              {mandatesError
                ? mandatesError
                : mandatesLoading
                  ? 'Reading each person’s direct debit mandate from ClubControl…'
                  : `Each person’s ClubControl record is shown below: check the mandate before making them inactive. ${closable.length} of ${moved.length} have an active mandate.`}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-400">Nobody to show.</p>
          ) : (
            <div className="overflow-x-auto pb-2 pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-5 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Paid by</th>
                    <th className="px-3 py-2 font-semibold">Next invoice</th>
                    <th className="px-3 py-2 font-semibold">This month</th>
                    <th className="px-3 py-2 font-semibold">ClubControl</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {shown.map((r) => (
                    <tr key={r.person_guid} className={`align-top ${r.moved ? 'bg-rose-50/60' : ''}`}>
                      <td className="px-5 py-2 font-medium text-zinc-900">{r.name}</td>
                      <td className="px-3 py-2 text-zinc-600">{r.payer && nameKey(r.payer, '') !== nameKey(r.name, '') ? r.payer : 'Themselves'}</td>
                      <td className="px-3 py-2 text-zinc-600">
                        {r.upcoming.length === 0
                          ? <span className="text-zinc-400">None due</span>
                          : r.upcoming.map((u) => (
                              <div key={u.id}>
                                {u.amount !== null ? money(u.amount) : '—'} on {shortDate(u.payable_date)}
                                {u.description && <span className="text-zinc-400"> · {u.description}</span>}
                              </div>
                            ))}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {r.invoiced.length === 0
                          ? <span className="text-zinc-400">—</span>
                          : r.invoiced.map((i) => (
                              <div key={i.id} className="whitespace-nowrap">
                                {i.amount !== null ? money(i.amount) : '—'} on {shortDate(i.date)}
                                <span className="text-zinc-400"> · {i.status ?? 'unknown'}</span>
                              </div>
                            ))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.moved
                          ? (
                            <div className="flex flex-col items-start gap-1">
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">Direct debit active: close on Thrive4</span>
                              {canClose && (() => {
                                const m = r.memberId ? mandates.get(r.memberId) : undefined;
                                if (!m) return mandatesLoading ? <span className="text-xs text-zinc-400">Reading mandate…</span> : <span className="text-xs text-zinc-500">ClubControl record not read</span>;
                                return (
                                  <>
                                    <span className="text-xs text-zinc-700">
                                      Mandate {m.mandate_id ?? 'none'} · <span className={hasActiveMandate(m) ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>{m.mandate_status ?? 'no status'}</span>
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                      {m.payment_date
                                        ? `Last paid ${m.payment_amount ?? ''} on ${m.payment_date}`
                                        : `First payment${m.payment_amount ? ` of ${m.payment_amount}` : ''} not collected yet`}
                                      {m.renewal_due && ` · renews ${shortDate(m.renewal_due)}`}
                                    </span>
                                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-violet-700 underline-offset-2 hover:underline">
                                      Open in ClubControl ↗
                                    </a>
                                    {hasActiveMandate(m) ? (
                                      <button
                                        type="button"
                                        onClick={() => setConfirming({ guids: [r.person_guid], label: r.name })}
                                        disabled={closing || checking}
                                        className="text-xs font-semibold text-rose-700 underline-offset-2 hover:underline disabled:opacity-60"
                                      >
                                        Make inactive on Thrive4
                                      </button>
                                    ) : (
                                      <span className="text-xs text-zinc-500">No active mandate, so it can’t be closed from here</span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )
                          : <span className="text-zinc-600">{r.clubControl}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title="Make inactive on Thrive4?"
        description={confirming ? `This makes ${confirming.label} inactive on Thrive4, which stops their Thrive4 subscriptions so no more invoices are raised. Each one is checked again first: only people still billed on Thrive4 with an active direct debit mandate on ClubControl are changed. Undo it in Thrive4 if needed.` : ''}
        confirmLabel={closing ? 'Making inactive…' : 'Make inactive'}
        tone="danger"
        loading={closing}
        onConfirm={close}
        onCancel={() => !closing && setConfirming(null)}
      />
    </section>
  );
}


function StatusBadge({ status }: { status: PlayerStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[status].badge}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
function LoveAdminTag() {
  return (
    <span
      title="Paid through LoveAdmin — still needs moving to ClubControl"
      className="inline-flex whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200"
    >
      LoveAdmin
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${
        active ? 'bg-zinc-900 text-white ring-zinc-900' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50'
      }`}
    >
      {children}
    </button>
  );
}

// Paid / lapsed / missing as one stacked bar.
function StatusBar({ paid, lapsed, missing }: { paid: number; lapsed: number; missing: number }) {
  const total = paid + lapsed + missing;
  if (!total) return <div className="h-2 rounded-full bg-zinc-100" />;
  return (
    <div className="flex h-2 gap-px overflow-hidden rounded-full bg-zinc-100">
      {(['paid', 'lapsed', 'missing'] as PlayerStatus[]).map((s) => {
        const n = { paid, lapsed, missing }[s];
        return n ? <div key={s} className={STATUS_STYLES[s].bar} style={{ width: `${(n / total) * 100}%` }} /> : null;
      })}
    </div>
  );
}

async function saveNote(body: { personKey: string; displayName: string; note: string; hidden?: boolean }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const response = await fetch('/api/private/membership-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error ?? 'Save failed.');
  return result.note as Note | null;
}

// The comment column: a 💬 button (with a dot when there's a comment, and
// the comment as its hover tooltip) that opens the comment in a popup, so the
// tables keep their widths. Admins also get the "Hide from report" toggle.
// showText puts the comment beside the button too (the admins' Hidden tab).
function NoteCell({
  personKey, displayName, note, canHide, onSaved, setNotice, showText = false,
}: {
  personKey: string;
  displayName: string;
  note: Note | undefined;
  canHide: boolean;
  onSaved: (personKey: string, note: Note | null) => void;
  setNotice: (n: InlineNotice) => void;
  showText?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasNote = !!note?.note;

  const show = () => {
    setText(note?.note ?? '');
    setHidden(note?.hidden ?? false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving]);

  // Whether they'll be hidden once saved — non-admins can't change it.
  const willBeHidden = canHide ? hidden : note?.hidden ?? false;
  const needsReason = willBeHidden && !text.trim();

  const save = async () => {
    if (needsReason) return;
    setSaving(true);
    try {
      const saved = await saveNote({ personKey, displayName, note: text, ...(canHide ? { hidden } : {}) });
      onSaved(personKey, saved);
      setOpen(false);
      if (canHide && hidden !== (note?.hidden ?? false)) {
        setNotice({
          type: 'success',
          message: hidden ? `${displayName} hidden from the report.` : `${displayName} is back on the report.`,
        });
      }
    } catch (error: any) {
      setNotice({ type: 'error', message: `Failed to save comment: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={showText ? 'flex items-start gap-2' : ''}>
        <button
          type="button"
          onClick={show}
          title={hasNote ? note!.note : 'Add a comment'}
          aria-label={hasNote ? `Comment on ${displayName}: ${note!.note}` : `Add a comment on ${displayName}`}
          className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base hover:bg-zinc-100 ${
            hasNote ? '' : 'opacity-40 grayscale hover:opacity-80'
          }`}
        >
          <span aria-hidden>💬</span>
          {hasNote && <span aria-hidden className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />}
        </button>
        {showText && hasNote && (
          <div className="min-w-0 pt-1">
            <p className="whitespace-pre-line text-zinc-700">{note!.note}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{note!.updated_by ?? 'Unknown'} · {shortDate(note!.updated_at)}</p>
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center sm:pb-0"
          onClick={(e) => { if (e.target === e.currentTarget && !saving) setOpen(false); }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label={`Comment on ${displayName}`}
            className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 text-left shadow-xl ring-1 ring-zinc-200"
            onSubmit={(e) => { e.preventDefault(); void save(); }}
          >
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">{displayName}</h2>
              <p className="text-xs text-zinc-500">
                {hasNote ? `Last updated by ${note!.updated_by ?? 'unknown'} on ${shortDate(note!.updated_at)}` : 'No comment yet.'}
              </p>
            </div>
            <textarea
              aria-label="Comment"
              rows={4}
              maxLength={2000}
              autoFocus
              placeholder="e.g. Paying by standing order from next month"
              className={inputClass}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {canHide && (
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
                Hide from report
              </label>
            )}
            {needsReason && (
              <p className="text-xs text-rose-600">
                {canHide ? 'Add a comment saying why they’re hidden.' : 'This person is hidden from the report, so the comment can’t be cleared.'}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || needsReason}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export default function MembershipPage() {
  const [role, setRole] = useState<string | null>(null);
  const [checkedRole, setCheckedRole] = useState(false);
  const [membershipFlag, setMembershipFlag] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
  // LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
  const [loveAdmin, setLoveAdmin] = useState<LoveAdminPayment[]>([]);
  const [view, setView] = useState<View>('report');
  const [openCards, setOpenCards] = useState<Record<Card, boolean>>(DEFAULT_OPEN);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_CARDS_KEY) ?? 'null');
      if (saved && typeof saved === 'object') setOpenCards({ ...DEFAULT_OPEN, ...saved });
    } catch {
      // Storage unavailable (private window etc.) — keep the defaults.
    }
  }, []);

  const toggleCard = (card: Card) =>
    setOpenCards((current) => {
      const next = { ...current, [card]: !current[card] };
      try {
        localStorage.setItem(OPEN_CARDS_KEY, JSON.stringify(next));
      } catch {
        // Not remembered, but still works for this visit.
      }
      return next;
    });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [fetching, setFetching] = useState<FetchSource | null>(null);

  // Fetches the latest data straight from ClubControl, GMS or Thrive4 (all
  // also happen automatically every Monday morning and on meeting days; see
  // pages/api/private/clubcontrol-sync.ts, gms-sync.ts and thrive4-sync.ts).
  const fetchFrom = async (source: FetchSource) => {
    const name = FETCH_NAMES[source];
    setFetching(source);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`/api/private/${source}-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || `Fetching from ${name} failed.`);
      setNotice({
        type: 'success',
        message: source === 'gms'
          ? `Fetched ${payload.saved.players} players from GMS.`
          : source === 'thrive4'
            ? `Fetched ${payload.saved.paidInvoices} paid LoveAdmin invoices for ${payload.saved.month} from Thrive4, covering ${payload.saved.people} people.`
            : `Fetched ${payload.saved.total} members from ClubControl (${payload.saved.inactive} inactive).`,
      });
      await loadData();
    } catch (error: any) {
      setNotice({ type: 'error', message: error.message });
    }
    setFetching(null);
  };

  const [filter, setFilter] = useState<Filter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [playerSearch, setPlayerSearch] = useState('');
  const [inactiveSearch, setInactiveSearch] = useState('');
  const [notOnGmsSearch, setNotOnGmsSearch] = useState('');

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const loadData = async () => {
    try {
      const recentImports = await supabase
        .from('membership_imports')
        .select('*')
        .order('uploaded_at', { ascending: false })
        .limit(500);
      if (recentImports.error) throw new Error(recentImports.error.message);
      const importRows = (recentImports.data ?? []) as Import[];
      const latestMembers = importRows.find((i) => i.kind === 'members');
      const latestLoveAdmin = importRows.find((i) => i.kind === 'loveadmin');
      const [memberRows, playerRows, noteRows, loveAdminRows] = await Promise.all([
        latestMembers
          ? loadMembers(latestMembers.id)
          : Promise.resolve([] as Member[]),
        loadAll<Player>((from, to) =>
          supabase.from('membership_players').select('id, name_key, first_name, last_name, date_of_birth, gender')
            .order('last_name').order('first_name').order('id').range(from, to)),
        loadAll<Note>((from, to) =>
          supabase.from('membership_notes').select('*').order('person_key').range(from, to)),
        // LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
        latestLoveAdmin
          ? loadAll<LoveAdminPayment>((from, to) =>
              supabase.from('membership_loveadmin').select('id, name_key, beneficiary, payer, invoice_amount, invoice_date')
                .eq('import_id', latestLoveAdmin.id).order('beneficiary').range(from, to))
          : Promise.resolve([] as LoveAdminPayment[]),
      ]);
      setImports(importRows);
      setMembers(memberRows);
      setPlayers(playerRows);
      setNotes(new Map(noteRows.map((n) => [n.person_key, n])));
      setLoveAdmin(loveAdminRows);
    } catch (error: any) {
      setNotice({ type: 'error', message: `Failed to load membership data: ${error.message}` });
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const userRole = resolveRoleFromUser(data.user);
      const flagged = hasMembershipFlag(data.user);
      setRole(userRole);
      setMembershipFlag(flagged);
      setCheckedRole(true);
      if ((userRole && VIEW_ROLES.has(userRole)) || flagged) await loadData();
      else setLoading(false);
    };
    void init();
  }, []);

  const canView = (!!role && VIEW_ROLES.has(role)) || membershipFlag;
  const canUpload = role === 'admin';
  const months = monthsIntoSeason();
  // e.g. "since Sep ’26"
  const seasonLabel = `since ${seasonStart().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace(' ', ' ’')}`;

  const membersImport = imports.find((i) => i.kind === 'members');
  const playersImport = imports.find((i) => i.kind === 'players');
  // LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
  const loveAdminImport = imports.find((i) => i.kind === 'loveadmin');
  const loveAdminByName = useMemo(() => new Map(loveAdmin.map((l) => [l.name_key, l])), [loveAdmin]);
  // Paid up in ClubControl, or paid through LoveAdmin.
  const paidAnywhere = (m: Member) => isPaidUp(m) || loveAdminByName.has(nameKey(m.first_name, m.last_name));

  // Everyone in the ClubControl export, by name. Someone listed twice counts
  // as paid up if either record is.
  // LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
  const billingNames = useMemo(() => billingByName(members), [members]);

  const membersByName = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of members) {
      const key = nameKey(m.first_name, m.last_name);
      const existing = map.get(key);
      if (!existing || (!isPaidUp(existing) && isPaidUp(m))) map.set(key, m);
    }
    return map;
  }, [members]);

  const playerRows: PlayerRow[] = useMemo(
    () =>
      players.map((p) => {
        const member = membersByName.get(p.name_key) ?? null;
        // LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md. A paid LoveAdmin invoice counts as paid.
        const loveAdminPayment = loveAdminByName.get(p.name_key) ?? null;
        return {
          ...p,
          team: teamFromBirthDate(p.date_of_birth, p.gender),
          member,
          loveAdmin: loveAdminPayment,
          status: loveAdminPayment || (member && isPaidUp(member)) ? 'paid' : member ? 'lapsed' : 'missing',
        };
      }),
    [players, membersByName, loveAdminByName],
  );

  const updateNote = (personKey: string, note: Note | null) =>
    setNotes((current) => {
      const next = new Map(current);
      if (note) next.set(personKey, note);
      else next.delete(personKey);
      return next;
    });

  const hiddenKeys = useMemo(
    () => new Set([...notes.values()].filter((n) => n.hidden).map((n) => n.person_key)),
    [notes],
  );
  const reportPlayers = useMemo(() => playerRows.filter((p) => !hiddenKeys.has(p.name_key)), [playerRows, hiddenKeys]);

  const teamsInFilter = useMemo(() => {
    if (filter === 'all') return TEAMS;
    if (filter.startsWith('group:')) return TEAMS.filter((t) => t.group === filter.slice(6));
    return TEAMS.filter((t) => t.name === filter.slice(5));
  }, [filter]);
  const teamNamesInFilter = useMemo(() => new Set(teamsInFilter.map((t) => t.name)), [teamsInFilter]);
  const singleTeam = filter.startsWith('team:');

  const filteredPlayers = useMemo(() => reportPlayers.filter((p) => p.team !== null && teamNamesInFilter.has(p.team)), [reportPlayers, teamNamesInFilter]);

  // Someone listed twice in GMS is one person paying one membership, so
  // totals count them once.
  const totals = useMemo(() => {
    const people = new Map<string, { status: PlayerStatus; fee: number }>();
    for (const p of filteredPlayers) {
      const key = `${p.name_key}|${p.date_of_birth ?? ''}`;
      const fee = TEAM_BY_NAME.get(p.team ?? '')?.monthlyFee ?? 0;
      const existing = people.get(key);
      people.set(key, { status: p.status, fee: Math.max(fee, existing?.fee ?? 0) });
    }
    const list = [...people.values()];
    const count = (s: PlayerStatus) => list.filter((p) => p.status === s).length;
    const unpaidMonthly = list.filter((p) => p.status !== 'paid').reduce((sum, p) => sum + p.fee, 0);
    return { people: list.length, paid: count('paid'), lapsed: count('lapsed'), missing: count('missing'), unpaidMonthly };
  }, [filteredPlayers]);

  const teamSummaries = useMemo(
    () =>
      teamsInFilter.map((team) => {
        const rows = reportPlayers.filter((p) => p.team === team.name);
        const count = (s: PlayerStatus) => rows.filter((p) => p.status === s).length;
        const unpaid = rows.length - count('paid');
        return { team, total: rows.length, paid: count('paid'), lapsed: count('lapsed'), missing: count('missing'), unpaidMonthly: unpaid * team.monthlyFee };
      }),
    [teamsInFilter, reportPlayers],
  );

  const visiblePlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return filteredPlayers
      .filter((p) => {
        if (statusFilter === 'unpaid' ? p.status === 'paid' : statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (q && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) return false;
        return true;
      })
      // By first name, then surname, ignoring case and accents.
      .sort((a, b) => byName(a.first_name, b.first_name) || byName(a.last_name, b.last_name));
  }, [filteredPlayers, statusFilter, playerSearch]);

  // Inactive ClubControl members, with their team if they're on GMS. With a
  // team filter on, only members on those teams are shown.
  const teamsByName = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of playerRows) if (p.team) map.set(p.name_key, [...(map.get(p.name_key) ?? []), p.team]);
    return map;
  }, [playerRows]);

  const inactiveMembers = useMemo(() => {
    const q = inactiveSearch.trim().toLowerCase();
    return members
      .filter((m) => !paidAnywhere(m) && !hiddenKeys.has(nameKey(m.first_name, m.last_name)))
      .map((m) => ({ ...m, teams: teamsByName.get(nameKey(m.first_name, m.last_name)) ?? [] }))
      .filter((m) => filter === 'all' || m.teams.some((t) => teamNamesInFilter.has(t)))
      .filter((m) => !q || `${m.first_name} ${m.last_name} ${m.email ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  }, [members, teamsByName, filter, teamNamesInFilter, inactiveSearch, hiddenKeys, loveAdminByName]);

  // ClubControl members with a playing membership who aren't in the GMS
  // player list — they should be registered. GMS gives no team for them, so
  // this list ignores the team filter.
  const notOnGms = useMemo(() => {
    const onGms = new Set(players.map((p) => p.name_key));
    const q = notOnGmsSearch.trim().toLowerCase();
    const seen = new Set<string>();
    return members
      .filter((m) => {
        const key = nameKey(m.first_name, m.last_name);
        if (onGms.has(key) || hiddenKeys.has(key) || seen.has(key)) return false;
        if (!m.categories.some((c) => PLAYING_CATEGORIES.includes(c))) return false;
        if (q && !`${m.first_name} ${m.last_name} ${m.email ?? ''}`.toLowerCase().includes(q)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  }, [members, players, hiddenKeys, notOnGmsSearch]);

  // LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
  // Everyone who paid through LoveAdmin last month (fetched automatically from
  // Thrive4), with their team and ClubControl billing method. Anyone with an
  // active ClubControl direct debit has moved, so isn't listed (they show on
  // the Thrive4 billing card until closed there). The list shrinks to nothing
  // as people move over.
  const loveAdminRows = useMemo(() => {
    const playersByKey = new Map(playerRows.map((p) => [p.name_key, p]));
    return loveAdmin
      .filter((l) => !hiddenKeys.has(l.name_key))
      .map((l) => {
        const member = membersByName.get(l.name_key) ?? null;
        const method = billingNames.get(l.name_key)?.billing_method ?? null;
        return {
          ...l,
          team: playersByKey.get(l.name_key)?.team ?? null,
          moved: method === DIRECT_DEBIT_ACTIVE,
          clubControl: !member ? 'Not on ClubControl' : method ?? (isPaidUp(member) ? 'Active' : 'Inactive'),
        };
      })
      .filter((l) => filter === 'all' || (l.team !== null && teamNamesInFilter.has(l.team)))
      .sort((a, b) => byName(a.beneficiary, b.beneficiary));
  }, [loveAdmin, playerRows, membersByName, billingNames, hiddenKeys, filter, teamNamesInFilter]);
  const stillOnLoveAdmin = useMemo(() => loveAdminRows.filter((l) => !l.moved), [loveAdminRows]);
  const movedFromLoveAdmin = loveAdminRows.length - stillOnLoveAdmin.length;

  // Admins' Hidden tab: everyone hidden, with what the report would show.
  const hiddenPeople = useMemo(() => {
    const playersByKey = new Map(playerRows.map((p) => [p.name_key, p]));
    return [...notes.values()]
      .filter((n) => n.hidden)
      .map((n) => {
        const player = playersByKey.get(n.person_key);
        const member = membersByName.get(n.person_key) ?? null;
        return {
          note: n,
          team: player?.team ?? null,
          status: player ? STATUS_LABELS[player.status] : member ? (paidAnywhere(member) ? 'Active member' : 'Inactive member') : 'Not in the latest data',
        };
      })
      .sort((a, b) => a.note.display_name.localeCompare(b.note.display_name));
  }, [notes, playerRows, membersByName, loveAdminByName]);

  const unhide = async (n: Note) => {
    try {
      updateNote(n.person_key, await saveNote({ personKey: n.person_key, displayName: n.display_name, note: n.note, hidden: false }));
      setNotice({ type: 'success', message: `${n.display_name} is back on the report.` });
    } catch (error: any) {
      setNotice({ type: 'error', message: `Failed to unhide: ${error.message}` });
    }
  };

  const copyEmails = async (list: { email: string | null }[]) => {
    const emails = [...new Set(list.map((m) => m.email).filter(Boolean))];
    try {
      await navigator.clipboard.writeText(emails.join('; '));
      setNotice({ type: 'success', message: `${emails.length} email addresses copied.` });
    } catch {
      setNotice({ type: 'error', message: 'Could not copy to the clipboard.' });
    }
  };

  const filterLabel = filter === 'all' ? 'All teams' : filter.slice(filter.indexOf(':') + 1);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-extrabold text-zinc-900">👥 Membership</h1>
            <p className="mt-1 text-zinc-600">Who’s paid their membership, team by team.</p>
            {canView && !loading && (
              <p className="mt-1 text-xs text-zinc-500">
                ClubControl: {membersImport ? shortDate(membersImport.uploaded_at) : 'not fetched yet'}
                {' · '}GMS: {playersImport ? shortDate(playersImport.uploaded_at) : 'not fetched yet'}
                {/* LoveAdmin migration (temporary) */}
                {' · '}Thrive4 (LoveAdmin): {loveAdminImport ? shortDate(loveAdminImport.uploaded_at) : 'not fetched yet'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canView && !loading && (players.length > 0 || members.length > 0) && (
              <a
                href="/operations/membership/report"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                📄 Detailed report
              </a>
            )}
            {canUpload && (
              <>
                {(['clubcontrol', 'gms', 'thrive4'] as const).map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => fetchFrom(source)}
                    disabled={fetching !== null}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                    title="Also happens automatically every Monday and on meeting days"
                  >
                    {fetching === source ? 'Fetching…' : `🔄 Fetch from ${FETCH_NAMES[source]} now`}
                  </button>
                ))}
              </>
            )}
          </div>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />


        {!checkedRole || loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : !canView ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            Membership data is only available to admins, trustees and directors.
          </p>
        ) : players.length === 0 && members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            No membership data yet.{canUpload ? ' Upload the ClubControl export and the GMS player list to get started.' : ''}
          </p>
        ) : (
          <>
            {canUpload && (
              <div className="mb-4 flex flex-wrap gap-2" role="tablist">
                <Chip active={view === 'report'} onClick={() => setView('report')}>Report</Chip>
                <Chip active={view === 'hidden'} onClick={() => setView('hidden')}>Hidden from report ({hiddenPeople.length})</Chip>
              </div>
            )}

            {canUpload && view === 'hidden' ? (
              <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
                <div className="border-b border-zinc-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-zinc-900">Hidden from report</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">Only admins see this tab. Hidden people are left out of every count and list on the report.</p>
                </div>
                {hiddenPeople.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-zinc-400">Nobody is hidden.</p>
                ) : (
                  <div className="relative overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                          <th className="px-5 py-2 font-semibold">Name</th>
                          <th className="px-3 py-2 font-semibold">Team</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Comment</th>
                          <th className="px-5 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {hiddenPeople.map(({ note: n, team, status }) => (
                          <tr key={n.person_key} className="align-top">
                            <td className="px-5 py-2 font-medium text-zinc-900">{n.display_name}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{team ?? '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{status}</td>
                            <td className="px-3 py-2">
                              <NoteCell personKey={n.person_key} displayName={n.display_name} note={n} canHide onSaved={updateNote} setNotice={setNotice} showText />
                            </td>
                            <td className="px-5 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => void unhide(n)}
                                className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                              >
                                Unhide
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : (
          <>
            {/* Phones: three quick buttons, then a dropdown for everything else. */}
            <section className="mb-6 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:hidden">
              <div className="flex flex-wrap gap-2">
                <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All teams</Chip>
                <Chip active={filter === 'group:Seniors'} onClick={() => setFilter('group:Seniors')}>Seniors</Chip>
                <Chip active={filter === 'group:Juniors'} onClick={() => setFilter('group:Juniors')}>Juniors</Chip>
              </div>
              <label className="block text-xs font-medium text-zinc-600">
                <span className="sr-only">Choose a team</span>
                <select
                  className={`${inputClass} bg-white`}
                  value={filter.startsWith('team:') || filter === 'group:Girls' ? filter : ''}
                  onChange={(e) => setFilter(e.target.value || 'all')}
                >
                  <option value="">Choose a team…</option>
                  <option value="group:Girls">All girls</option>
                  {TEAM_GROUPS.map((g) => (
                    <optgroup key={g} label={g}>
                      {TEAMS.filter((t) => t.group === g).map((t) => (
                        <option key={t.name} value={`team:${t.name}`}>{t.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </section>

            <section className="mb-6 hidden space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:block">
              <div className="flex flex-wrap gap-2">
                <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All teams</Chip>
                {TEAM_GROUPS.map((g) => (
                  <Chip key={g} active={filter === `group:${g}`} onClick={() => setFilter(`group:${g}`)}>All {g.toLowerCase()}</Chip>
                ))}
              </div>
              {TEAM_GROUPS.map((g: TeamGroup) => (
                <div key={g} className="flex flex-wrap items-center gap-2">
                  <span className="w-16 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{g}</span>
                  {TEAMS.filter((t) => t.group === g).map((t) => (
                    <Chip key={t.name} active={filter === `team:${t.name}`} onClick={() => setFilter(`team:${t.name}`)}>
                      {t.name.replace('Girls ', '').replace('Under ', 'U')}
                    </Chip>
                  ))}
                </div>
              ))}
            </section>

            <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatTile label="Players" value={String(totals.people)} detail={filterLabel} />
              <StatTile
                label="Paid"
                value={String(totals.paid)}
                tone="text-emerald-700"
                detail={totals.people ? `${Math.round((totals.paid / totals.people) * 100)}% of players` : undefined}
              />
              <StatTile
                label="Not paying"
                value={String(totals.lapsed + totals.missing)}
                tone="text-rose-700"
                detail={`${totals.lapsed} lapsed · ${totals.missing} not on ClubControl`}
              />
              <StatTile
                label="Unpaid per month"
                value={money(totals.unpaidMonthly)}
                detail={`${money(totals.unpaidMonthly * months)} ${seasonLabel}`}
              />
            </section>

            {!singleTeam && (
              <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
                <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${openCards.byTeam ? 'border-b border-zinc-200' : ''}`}>
                  <CardHeading open={openCards.byTeam} onToggle={() => toggleCard('byTeam')} title="By team">
                    Select a team to see its players.
                  </CardHeading>
                  {openCards.byTeam && (
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
                    {(['paid', 'lapsed', 'missing'] as PlayerStatus[]).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-sm ${STATUS_STYLES[s].bar}`} />{STATUS_LABELS[s]}
                      </span>
                    ))}
                  </div>
                  )}
                </div>
                {openCards.byTeam && (
                <ul className="divide-y divide-zinc-100">
                  {teamSummaries.map((s) => (
                    <li key={s.team.name}>
                      <button
                        type="button"
                        onClick={() => setFilter(`team:${s.team.name}`)}
                        className="grid w-full gap-2 px-5 py-3 text-left hover:bg-zinc-50 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{s.team.name}</p>
                        </div>
                        <StatusBar paid={s.paid} lapsed={s.lapsed} missing={s.missing} />
                        <p className="text-sm tabular-nums text-zinc-600 sm:text-right">
                          {s.total === 0 ? '—' : (
                            <>
                              <span className="font-semibold text-zinc-900">{s.paid}</span>/{s.total} paid
                              {s.unpaidMonthly > 0 && <span className="ml-2 text-rose-700">{money(s.unpaidMonthly)}/mo</span>}
                            </>
                          )}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
                )}
              </section>
            )}

            <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${openCards.players ? 'border-b border-zinc-200' : ''}`}>
                <CardHeading open={openCards.players} onToggle={() => toggleCard('players')} title={`Players — ${filterLabel} (${filteredPlayers.length})`}>
                  From GMS, put in teams by age at the start of the season and gender, and matched to ClubControl by name. Lapsed means their ClubControl membership is inactive.
                </CardHeading>
                {openCards.players && (
                <input
                  type="search"
                  placeholder="Search name…"
                  className={`${inputClass} sm:w-64`}
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                />
                )}
              </div>
              {openCards.players && (
              <>
              <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3">
                {([['all', 'All'], ['unpaid', 'Not paying'], ['paid', 'Paid'], ['lapsed', 'Lapsed'], ['missing', 'Not on ClubControl']] as [StatusFilter, string][]).map(([value, label]) => (
                  <Chip key={value} active={statusFilter === value} onClick={() => setStatusFilter(value)}>{label}</Chip>
                ))}
              </div>
              {visiblePlayers.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-400">
                  {filteredPlayers.length === 0 ? 'No players for this selection yet.' : 'No players match.'}
                </p>
              ) : (
                <>
                <ul className="divide-y divide-zinc-100 sm:hidden">
                  {visiblePlayers.map((p) => {
                    const age = ageOn(p.date_of_birth);
                    return (
                      <li key={p.id} className="flex items-start gap-2 px-4 py-3">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="text-sm font-medium text-zinc-900">{p.first_name} {p.last_name}</p>
                            <StatusBadge status={p.status} />
                            {p.loveAdmin && <LoveAdminTag />}
                          </div>
                          <p className="text-xs text-zinc-500">
                            {[singleTeam ? null : p.team, age !== null ? `Age ${age}` : null].filter(Boolean).join(' · ')}
                          </p>
                          <p className="text-xs text-zinc-600">
                            {p.status === 'lapsed' ? renewalText(p.member?.renewal_date ?? null) : membershipType(p.member)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-start">
                          <NoteCell
                            personKey={p.name_key}
                            displayName={`${p.first_name} ${p.last_name}`}
                            note={notes.get(p.name_key)}
                            canHide={canUpload}
                            onSaved={updateNote}
                            setNotice={setNotice}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="relative hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-5 py-2 font-semibold">Name</th>
                        {!singleTeam && <th className="px-3 py-2 font-semibold">Team</th>}
                        <th className="px-3 py-2 text-right font-semibold">Age</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">ClubControl</th>
                        <th className="w-12 px-3 py-2"><span className="sr-only">Comment</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {visiblePlayers.map((p) => (
                        <tr key={p.id} className="align-top">
                          <td className="px-5 py-2 font-medium text-zinc-900">{p.first_name} {p.last_name}</td>
                          {!singleTeam && <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{p.team}</td>}
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{ageOn(p.date_of_birth) ?? '—'}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <StatusBadge status={p.status} />
                              {p.loveAdmin && <LoveAdminTag />}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-zinc-600">
                            {p.status === 'lapsed' ? renewalText(p.member?.renewal_date ?? null) : membershipType(p.member)}
                          </td>
                          <td className="w-12 px-3 py-1.5 text-center">
                            <NoteCell
                              personKey={p.name_key}
                              displayName={`${p.first_name} ${p.last_name}`}
                              note={notes.get(p.name_key)}
                              canHide={canUpload}
                              onSaved={updateNote}
                              setNotice={setNotice}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
              </>
              )}
            </section>

            <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-sky-200">
              <div className={`flex flex-wrap items-center justify-between gap-3 bg-sky-50 px-5 py-4 ${openCards.notOnGms ? 'border-b border-sky-200' : ''}`}>
                <CardHeading open={openCards.notOnGms} onToggle={() => toggleCard('notOnGms')} title={`Not on GMS (${notOnGms.length})`}>
                  Have a playing membership in ClubControl ({PLAYING_CATEGORIES.join(', ')}) but aren’t in the GMS player list. Shown for all teams.
                </CardHeading>
                {openCards.notOnGms && (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="search"
                    placeholder="Search name or email…"
                    className={`${inputClass} bg-white sm:w-56`}
                    value={notOnGmsSearch}
                    onChange={(e) => setNotOnGmsSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void copyEmails(notOnGms)}
                    disabled={notOnGms.length === 0}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Copy emails
                  </button>
                </div>
                )}
              </div>
              {!openCards.notOnGms ? null : notOnGms.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-400">
                  {members.length === 0 || players.length === 0 ? 'This needs both ClubControl and GMS data: fetch them to see it.' : 'Everyone with a playing membership is on GMS.'}
                </p>
              ) : (
                <>
                <ul className="divide-y divide-zinc-100 sm:hidden">
                  {notOnGms.map((m) => (
                    <li key={m.id} className="flex items-start gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium text-zinc-900">{m.first_name} {m.last_name}</p>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${paidAnywhere(m) ? STATUS_STYLES.paid.badge : STATUS_STYLES.lapsed.badge}`}>
                            {paidAnywhere(m) ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600">{membershipType(m)}</p>
                        {m.email && (
                          <a href={`mailto:${m.email}`} className="block break-all text-xs text-blue-600 hover:underline">{m.email}</a>
                        )}
                      </div>
                      <NoteCell
                        personKey={nameKey(m.first_name, m.last_name)}
                        displayName={`${m.first_name} ${m.last_name}`}
                        note={notes.get(nameKey(m.first_name, m.last_name))}
                        canHide={canUpload}
                        onSaved={updateNote}
                        setNotice={setNotice}
                      />
                    </li>
                  ))}
                </ul>
                <div className="relative hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-5 py-2 font-semibold">Name</th>
                        <th className="px-3 py-2 font-semibold">Membership</th>
                        <th className="px-3 py-2 font-semibold">ClubControl</th>
                        <th className="px-3 py-2 font-semibold">Email</th>
                        <th className="w-12 px-3 py-2"><span className="sr-only">Comment</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {notOnGms.map((m) => (
                        <tr key={m.id} className="align-top">
                          <td className="px-5 py-2 font-medium text-zinc-900">{m.first_name} {m.last_name}</td>
                          <td className="px-3 py-2 text-zinc-600">{membershipType(m)}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${paidAnywhere(m) ? STATUS_STYLES.paid.badge : STATUS_STYLES.lapsed.badge}`}>
                              {paidAnywhere(m) ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-zinc-600">
                            {m.email ? <a href={`mailto:${m.email}`} className="text-blue-600 hover:underline">{m.email}</a> : '—'}
                          </td>
                          <td className="w-12 px-3 py-1.5 text-center">
                            <NoteCell
                              personKey={nameKey(m.first_name, m.last_name)}
                              displayName={`${m.first_name} ${m.last_name}`}
                              note={notes.get(nameKey(m.first_name, m.last_name))}
                              canHide={canUpload}
                              onSaved={updateNote}
                              setNotice={setNotice}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>

            {/* LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md. */}
            {(
              <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-violet-200">
                <div className={`flex flex-wrap items-center justify-between gap-3 bg-violet-50 px-5 py-4 ${openCards.loveAdmin ? 'border-b border-violet-200' : ''}`}>
                  <CardHeading open={openCards.loveAdmin} onToggle={() => toggleCard('loveAdmin')} title={`Still on LoveAdmin (${stillOnLoveAdmin.length})`}>
                    Paid through LoveAdmin (Thrive4), the old system, last month, so counted as paid, but with no active direct
                    debit in ClubControl yet.{' '}
                    {loveAdminImport
                      ? `Fetched from Thrive4 automatically, ${shortDate(loveAdminImport.uploaded_at)} (every Monday and on meeting days).`
                      : 'Not fetched from Thrive4 yet: it runs every Monday and on meeting days, or an admin can press “Fetch from Thrive4 now”.'}
                    {movedFromLoveAdmin > 0 && ` ${movedFromLoveAdmin} more have moved (active direct debit in ClubControl): see Thrive4 billing.`}
                    {filter !== 'all' && ` Showing only those on ${filterLabel}.`}
                  </CardHeading>
                </div>
                {!openCards.loveAdmin ? null : stillOnLoveAdmin.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-zinc-400">{loveAdminImport ? 'Nobody still on LoveAdmin for this selection.' : 'No Thrive4 data yet.'}</p>
                ) : (
                  <>
                    <ul className="divide-y divide-zinc-100 sm:hidden">
                      {stillOnLoveAdmin.map((l) => (
                        <li key={l.id} className="flex items-start gap-2 px-4 py-3">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-medium text-zinc-900">{l.beneficiary}</p>
                            <p className="text-xs text-zinc-500">
                              {[l.team, `ClubControl: ${l.clubControl}`].filter(Boolean).join(' · ')}
                            </p>
                            <p className="text-xs text-zinc-600">
                              {l.payer && nameKey(l.payer, '') !== l.name_key ? `Paid by ${l.payer}` : 'Pays for themselves'}
                              {l.invoice_amount !== null && ` · ${money(l.invoice_amount)} invoice`}
                            </p>
                          </div>
                          <NoteCell
                            personKey={l.name_key}
                            displayName={l.beneficiary}
                            note={notes.get(l.name_key)}
                            canHide={canUpload}
                            onSaved={updateNote}
                            setNotice={setNotice}
                          />
                        </li>
                      ))}
                    </ul>
                    <div className="relative hidden overflow-x-auto sm:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                            <th className="px-5 py-2 font-semibold">Name</th>
                            <th className="px-3 py-2 font-semibold">Team</th>
                            <th className="px-3 py-2 font-semibold">Paid by</th>
                            <th className="px-3 py-2 text-right font-semibold">Invoice</th>
                            <th className="px-3 py-2 font-semibold">ClubControl</th>
                            <th className="w-12 px-3 py-2"><span className="sr-only">Comment</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {stillOnLoveAdmin.map((l) => (
                            <tr key={l.id} className="align-top">
                              <td className="px-5 py-2 font-medium text-zinc-900">{l.beneficiary}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{l.team ?? '—'}</td>
                              <td className="px-3 py-2 text-zinc-600">{l.payer && nameKey(l.payer, '') !== l.name_key ? l.payer : 'Themselves'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{l.invoice_amount !== null ? money(l.invoice_amount) : '—'}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{l.clubControl}</td>
                              <td className="w-12 px-3 py-1.5 text-center">
                                <NoteCell
                                  personKey={l.name_key}
                                  displayName={l.beneficiary}
                                  note={notes.get(l.name_key)}
                                  canHide={canUpload}
                                  onSaved={updateNote}
                                  setNotice={setNotice}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md. */}
            <Thrive4BillingCard open={openCards.thrive4} onToggle={() => toggleCard('thrive4')} membersByName={membersByName} billing={billingNames} canClose={canUpload} setNotice={setNotice} />

            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-amber-200">
              <div className={`flex flex-wrap items-center justify-between gap-3 bg-amber-50 px-5 py-4 ${openCards.inactive ? 'border-b border-amber-200' : ''}`}>
                <CardHeading open={openCards.inactive} onToggle={() => toggleCard('inactive')} title={`Inactive members (${inactiveMembers.length})`}>
                  Marked inactive in ClubControl — they haven’t paid. Life members always count as paid, so aren’t listed.
                  {filter !== 'all' && ` Showing only those on ${filterLabel}.`}
                </CardHeading>
                {openCards.inactive && (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="search"
                    placeholder="Search name or email…"
                    className={`${inputClass} bg-white sm:w-56`}
                    value={inactiveSearch}
                    onChange={(e) => setInactiveSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void copyEmails(inactiveMembers)}
                    disabled={inactiveMembers.length === 0}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Copy emails
                  </button>
                </div>
                )}
              </div>
              {!openCards.inactive ? null : inactiveMembers.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-400">
                  {members.length === 0 ? 'No ClubControl data yet.' : 'No inactive members for this selection.'}
                </p>
              ) : (
                <>
                <ul className="divide-y divide-zinc-100 sm:hidden">
                  {inactiveMembers.map((m) => (
                    <li key={m.id} className="flex items-start gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-sm font-medium text-zinc-900">{m.first_name} {m.last_name}</p>
                        <p className="text-xs text-zinc-500">
                          {[m.teams.length ? m.teams.join(', ') : null, renewalText(m.renewal_date)].filter(Boolean).join(' · ')}
                        </p>
                        <p className="text-xs text-zinc-600">{membershipType(m)}</p>
                        {m.email && (
                          <a href={`mailto:${m.email}`} className="block break-all text-xs text-blue-600 hover:underline">{m.email}</a>
                        )}
                      </div>
                      <NoteCell
                        personKey={nameKey(m.first_name, m.last_name)}
                        displayName={`${m.first_name} ${m.last_name}`}
                        note={notes.get(nameKey(m.first_name, m.last_name))}
                        canHide={canUpload}
                        onSaved={updateNote}
                        setNotice={setNotice}
                      />
                    </li>
                  ))}
                </ul>
                <div className="relative hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-5 py-2 font-semibold">Name</th>
                        <th className="px-3 py-2 font-semibold">Team</th>
                        <th className="px-3 py-2 font-semibold">Membership</th>
                        <th className="px-3 py-2 font-semibold">Renewal was due</th>
                        <th className="px-3 py-2 font-semibold">Email</th>
                        <th className="w-12 px-3 py-2"><span className="sr-only">Comment</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {inactiveMembers.map((m) => (
                        <tr key={m.id} className="align-top">
                          <td className="px-5 py-2 font-medium text-zinc-900">{m.first_name} {m.last_name}</td>
                          <td className="px-3 py-2 text-zinc-600">{m.teams.length ? m.teams.join(', ') : '—'}</td>
                          <td className="px-3 py-2 text-zinc-600">{membershipType(m)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{shortDate(m.renewal_date)}</td>
                          <td className="px-3 py-2 text-zinc-600">
                            {m.email ? <a href={`mailto:${m.email}`} className="text-blue-600 hover:underline">{m.email}</a> : '—'}
                          </td>
                          <td className="w-12 px-3 py-1.5 text-center">
                            <NoteCell
                              personKey={nameKey(m.first_name, m.last_name)}
                              displayName={`${m.first_name} ${m.last_name}`}
                              note={notes.get(nameKey(m.first_name, m.last_name))}
                              canHide={canUpload}
                              onSaved={updateNote}
                              setNotice={setNotice}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>
          </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
