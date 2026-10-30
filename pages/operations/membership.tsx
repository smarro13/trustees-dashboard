import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { hasMembershipFlag, resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import {
  PLAYING_CATEGORIES,
  STATUS_LABELS,
  TEAMS,
  TEAM_BY_NAME,
  TEAM_GROUPS,
  ageOn,
  billingByName,
  findClubControl,
  mandateMemberId,
  paysByDirectDebit,
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

// Who's paid their membership, team by team. Players (the RFU GMS player list)
// and payments (the ClubControl members export) are fetched live and
// automatically (every Monday, on meeting days, or by an admin's "Fetch …
// now" button). LoveAdmin payments are uploaded by an admin. Tables and access
// rules are in supabase/policies/membership.sql: admins, trustees and directors
// can view and comment; only admins can fetch, upload, and hide people from the
// report (they then appear on the admins' Hidden tab). Comments are saved by
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
  // Member id of the active direct debit account that pays for them, if not their own.
  covered_by_id?: string | null;
  // GoCardless mandate status on their own record (direct debit accounts only).
  mandate_status?: string | null;
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
type FetchSource = 'clubcontrol' | 'gms';
const FETCH_NAMES: Record<FetchSource, string> = { clubcontrol: 'ClubControl', gms: 'GMS' };

type Card = 'byTeam' | 'players' | 'notOnGms' | 'loveAdmin' | 'inactive';

// Which report cards start open. Each viewer's own choice is remembered in
// their browser after that.
const DEFAULT_OPEN: Record<Card, boolean> = { byTeam: true, players: true, notOnGms: false, loveAdmin: false, inactive: false };
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

// The members export's rows, with ClubControl's billing method and paying
// account when those columns exist (supabase/policies/membership_billing_method.sql);
// without them until that has been run.
const MEMBER_COLUMNS = 'id, first_name, last_name, email, categories, renewal_date, active, external_id';
async function loadMembers(importId: string): Promise<Member[]> {
  const load = (columns: string) =>
    loadAll<Member>((from, to) =>
      supabase.from('membership_members').select(columns).eq('import_id', importId).order('id').range(from, to) as any);
  for (const extra of [', billing_method, covered_by_id, mandate_status', ', billing_method, covered_by_id', ', billing_method']) {
    try {
      return await load(MEMBER_COLUMNS + extra);
    } catch (error: any) {
      if (!/billing_method|covered_by_id|mandate_status/.test(error?.message ?? '')) throw error;
    }
  }
  return load(MEMBER_COLUMNS);
}

// What ClubControl says about how someone pays, for the LoveAdmin cards.
function clubControlLabel(member: Member | null, billing: ClubControlBilling | undefined, nameById: Map<string, string>) {
  if (!member || !billing) return 'Not on ClubControl';
  if (paysByDirectDebit(billing) && billing.covered_by_id && mandateMemberId(billing) === billing.covered_by_id) {
    return `Paid by ${nameById.get(billing.covered_by_id) ?? 'another member'}’s direct debit`;
  }
  if (paysByDirectDebit(billing)) return 'Active mandate';
  if (billing.mandate_status) return `Mandate ${billing.mandate_status.toLowerCase()}`;
  if (billing.billing_method?.startsWith('Direct Debit')) return billing.billing_method;
  return 'No mandate';
}

// A LoveAdmin name matched to ClubControl: exactly, or by a
// near-identical name (e.g. "Ste" for "Steven"; lib/membership.ts findClubControl).
function matchLoveAdminName(
  name: string,
  billing: Map<string, ClubControlBilling>,
  membersByName: Map<string, Member>,
  nameById: Map<string, string>,
) {
  const match = findClubControl(name, billing);
  const member = match ? membersByName.get(match.key) ?? null : null;
  const record = match?.record;
  return {
    clubControl: clubControlLabel(member, record, nameById),
    // How ClubControl writes the name, when it differs.
    clubControlName: match?.nearMatch && member ? `${member.first_name} ${member.last_name}`.trim() : null,
    notOnClubControl: !member,
    moved: paysByDirectDebit(record),
  };
}

// The ClubControl column on the LoveAdmin cards: how they pay, the matched
// name when it differs, and a flag for anyone not on ClubControl at all.
function ClubControlStatus({ row }: { row: { clubControl: string; clubControlName: string | null; notOnClubControl: boolean; payerNotLinked?: string | null } }) {
  if (row.notOnClubControl) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200" title="No one with this name (or a near match) is in ClubControl">
        ⚠ Not on ClubControl
      </span>
    );
  }
  return (
    <span className="text-zinc-600">
      {row.clubControl}
      {row.clubControlName && <span className="block text-xs text-zinc-400">as {row.clubControlName} in ClubControl</span>}
      {row.payerNotLinked && (
        <span className="block whitespace-normal text-xs font-medium text-amber-700">
          Their LoveAdmin payer, {row.payerNotLinked}, has an active ClubControl mandate, but they aren’t on that account: link them in ClubControl.
        </span>
      )}
    </span>
  );
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
type LoveAdminPreview = { paidInvoices: number; skippedInvoices: number; people: number };

const fileToBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

// Upload of LoveAdmin's Invoices All Report (pages/api/private/membership-import.ts).
function LoveAdminUploadPanel({ onSaved, setNotice }: { onSaved: () => Promise<void>; setNotice: (n: InlineNotice) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LoveAdminPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const reset = () => {
    setFile(null); setPreview(null); setError(''); setInputKey((k) => k + 1);
  };

  const send = async (selected: File, apply: boolean) => {
    setBusy(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/private/membership-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
        body: JSON.stringify({
          filename: selected.name,
          contentBase64: await fileToBase64(selected),
          apply,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) { setError(body.error ?? 'Upload failed.'); return; }
      if (!apply) {
        setPreview(body.preview);
        return;
      }
      setNotice({ type: 'success', message: `LoveAdmin invoices saved — ${body.saved.people} people counted as paid.` });
      reset();
      await onSaved();
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 rounded-2xl bg-white shadow-sm ring-1 ring-blue-200">
      <div className="border-b border-blue-200 bg-blue-50 px-5 py-3">
        <h2 className="text-lg font-semibold text-zinc-900">Upload LoveAdmin invoices</h2>
        <p className="text-xs text-zinc-600">Nothing is saved until you check the summary and press Apply.</p>
      </div>
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-zinc-600">
          LoveAdmin’s “Invoices All Report” (.xlsx or .csv). Everyone a paid invoice in the file was for counts as paid, so export only the period you want counted. It replaces the previous upload.
        </p>
        <input
          key={inputKey}
          type="file"
          accept=".xlsx,.csv"
          disabled={busy}
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            setFile(selected); setPreview(null);
            if (selected) void send(selected, false);
          }}
        />

        {busy && !preview && <p className="text-sm text-zinc-400">Reading file…</p>}
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

        {preview && (
          <div className="rounded-lg bg-zinc-50 p-4 text-sm ring-1 ring-zinc-200">
            <p className="font-medium text-zinc-900">
              {preview.paidInvoices} paid invoices, covering {preview.people} people.
            </p>
            {preview.skippedInvoices > 0 && (
              <p className="mt-1 text-zinc-600">{preview.skippedInvoices} unpaid or cancelled invoices are ignored.</p>
            )}
            <p className="mt-1 text-zinc-600">This replaces the current LoveAdmin data.</p>
          </div>
        )}

        {preview && file && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} disabled={busy} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={() => void send(file, true)} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Working…' : 'Apply'}
            </button>
          </div>
        )}
      </div>
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
  // LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
  const [showLoveAdminUpload, setShowLoveAdminUpload] = useState(false);

  // Fetches the latest data straight from ClubControl or GMS (both also happen
  // automatically every Monday morning and on meeting days; see
  // pages/api/private/clubcontrol-sync.ts and gms-sync.ts).
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
  const memberNameById = useMemo(
    () => new Map(members.filter((m) => m.external_id).map((m) => [m.external_id as string, `${m.first_name} ${m.last_name}`.trim()])),
    [members],
  );

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
  // Everyone on the latest LoveAdmin upload, with their team and ClubControl
  // billing method. Anyone with an active ClubControl direct debit has moved,
  // so isn't listed. The list shrinks to nothing as people move over.
  const loveAdminRows = useMemo(() => {
    const playersByKey = new Map(playerRows.map((p) => [p.name_key, p]));
    return loveAdmin
      .filter((l) => !hiddenKeys.has(l.name_key))
      .map((l) => {
        // Moved = an active mandate in ClubControl, their own or the
        // account paying for them, matched by name or a near-identical name.
        return {
          ...l,
          team: playersByKey.get(l.name_key)?.team ?? null,
          ...matchLoveAdminName(l.beneficiary, billingNames, membersByName, memberNameById),
          // Their LoveAdmin payer has moved (an active mandate) but this person
          // wasn't added to the payer's ClubControl account.
          payerNotLinked:
            l.payer && nameKey(l.payer, '') !== l.name_key && paysByDirectDebit(findClubControl(l.payer, billingNames)?.record)
              ? l.payer
              : null,
        };
      })
      .filter((l) => filter === 'all' || (l.team !== null && teamNamesInFilter.has(l.team)))
      .sort((a, b) => byName(a.beneficiary, b.beneficiary));
  }, [loveAdmin, playerRows, membersByName, billingNames, memberNameById, hiddenKeys, filter, teamNamesInFilter]);
  const stillOnLoveAdmin = useMemo(() => loveAdminRows.filter((l) => !l.moved), [loveAdminRows]);
  const movedFromLoveAdmin = loveAdminRows.length - stillOnLoveAdmin.length;
  const notOnClubControl = stillOnLoveAdmin.filter((l) => l.notOnClubControl).length;
  // Without ClubControl's direct debit details nobody can be taken off Still
  // on LoveAdmin, so say which step is missing rather than show everyone.
  const directDebitDataMissing = !members.some((m) => m.billing_method)
    ? `ClubControl’s direct debit details aren’t loaded${membersImport ? ` (last ClubControl fetch ${shortDate(membersImport.uploaded_at)})` : ''}, so nobody is taken off this list yet. Run supabase/policies/membership_billing_method.sql, then press “Fetch from ClubControl now”.`
    : !members.some((m) => m.covered_by_id) || !members.some((m) => m.mandate_status)
      ? `ClubControl hasn’t been fetched since the dashboard started reading who each direct debit pays for${membersImport ? ` (last fetch ${shortDate(membersImport.uploaded_at)})` : ''}, so people paid for by someone else’s direct debit (e.g. a parent’s), or with an active mandate, may still show here. Re-run supabase/policies/membership_billing_method.sql, then press “Fetch from ClubControl now”.`
      : null;

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
                {' · '}LoveAdmin: {loveAdminImport ? shortDate(loveAdminImport.uploaded_at) : 'not uploaded yet'}
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
                {(['clubcontrol', 'gms'] as const).map((source) => (
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
                {/* LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md. */}
                <button
                  type="button"
                  onClick={() => setShowLoveAdminUpload((v) => !v)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {showLoveAdminUpload ? 'Close upload' : '⬆ Upload LoveAdmin invoices'}
                </button>
              </>
            )}
          </div>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {canUpload && showLoveAdminUpload && <LoveAdminUploadPanel onSaved={loadData} setNotice={setNotice} />}

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
                    Paid through LoveAdmin, the old system, so counted as paid, but with no active direct
                    debit mandate in ClubControl yet (their own, or the account paying for them).{' '}
                    {loveAdminImport
                      ? `Latest data: ${loveAdminImport.file_name}, ${shortDate(loveAdminImport.uploaded_at)}.`
                      : 'Nothing uploaded yet: an admin can press “Upload LoveAdmin invoices”.'}
                    {movedFromLoveAdmin > 0 && ` ${movedFromLoveAdmin} more have moved (paid by an active ClubControl direct debit, theirs or the family’s).`}
                    {notOnClubControl > 0 && ` ${notOnClubControl} aren’t on ClubControl at all (flagged ⚠).`}
                    {' Names that differ slightly (e.g. Ste / Steven) are matched; the ClubControl name is shown under the status.'}
                    {filter !== 'all' && ` Showing only those on ${filterLabel}.`}
                  </CardHeading>
                </div>
                {loveAdmin.length > 0 && directDebitDataMissing && (
                  <p role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
                    {directDebitDataMissing}
                  </p>
                )}
                {!openCards.loveAdmin ? null : stillOnLoveAdmin.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-zinc-400">{loveAdminImport ? 'Nobody still on LoveAdmin for this selection.' : 'No LoveAdmin data yet.'}</p>
                ) : (
                  <>
                    <ul className="divide-y divide-zinc-100 sm:hidden">
                      {stillOnLoveAdmin.map((l) => (
                        <li key={l.id} className="flex items-start gap-2 px-4 py-3">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-medium text-zinc-900">{l.beneficiary}</p>
                            <p className="text-xs text-zinc-500">
                              {l.team && <>{l.team} · </>}<ClubControlStatus row={l} />
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
                              <td className="whitespace-nowrap px-3 py-2"><ClubControlStatus row={l} /></td>
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
