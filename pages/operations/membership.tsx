import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import {
  PLAYING_CATEGORIES,
  STATUS_LABELS,
  TEAMS,
  TEAM_BY_NAME,
  TEAM_GROUPS,
  ageOn,
  isSideCategory,
  monthsIntoSeason,
  nameKey,
  seasonStart,
  teamFromBirthDate,
  type PlayerStatus,
  type TeamGroup,
} from '../../lib/membership';

// Who's paid their membership, team by team. Players come from the RFU GMS
// player list, payments from the ClubControl members export — both uploaded here
// by admins via pages/api/private/membership-import.ts. Tables and access
// rules are in supabase/policies/membership.sql: admins, trustees and
// directors can view and comment; only admins can upload, and hide people
// from the report (they then appear on the admins' Hidden tab). Comments
// are saved by pages/api/private/membership-note.ts.

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  categories: string[];
  renewal_date: string | null;
  active: boolean;
};

type Player = {
  id: string;
  name_key: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
};

type Import = { id: string; kind: 'members' | 'players'; file_name: string; uploaded_at: string; uploaded_by: string | null };

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
type PlayerRow = Player & { team: string | null; status: PlayerStatus; member: Member | null };

// 'all', 'group:Juniors' or 'team:Under 7s'.
type Filter = string;
type StatusFilter = 'all' | 'unpaid' | PlayerStatus;
type View = 'report' | 'hidden';
type Card = 'byTeam' | 'players' | 'notOnGms' | 'inactive';

// Which report cards start open. Each viewer's own choice is remembered in
// their browser after that.
const DEFAULT_OPEN: Record<Card, boolean> = { byTeam: true, players: true, notOnGms: false, inactive: false };
const OPEN_CARDS_KEY = 'membership-open-cards';

type MembersPreview = { total: number; inactive: number };
type PlayersPreview = {
  total: number;
  added: number;
  updated: number;
  perTeam: Record<string, number>;
};

const VIEW_ROLES = new Set(['admin', 'trustee', 'director']);
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

// GMS lists every emergency contact in one field ("Jo Bloggs, Sam Bloggs",
// "07700 900123 / 07700 900456"); the table shows just the first.
const firstEntry = (value: string | null) => value?.split(/[,/;]/)[0].trim() || null;

// UK numbers as 07… — GMS often stores them as "44 7…" or "+44 7…".
// Anything that isn't a UK number is shown as it was.
const ukPhone = (value: string | null) => {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  const national = digits.startsWith('44') ? `0${digits.slice(2).replace(/^0/, '')}` : digits;
  if (!/^0\d{10}$/.test(national)) return value;
  // Mobiles as "07700 900123"; landline area codes vary, so leave those unspaced.
  return national.startsWith('07') ? `${national.slice(0, 5)} ${national.slice(5)}` : national;
};

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

const fileToBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

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
          <span aria-hidden className={`inline-block text-xs text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          {title}
        </button>
      </h2>
      {open && children && <div className="mt-0.5 pl-5 text-xs text-zinc-500">{children}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: PlayerStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[status].badge}`}>
      {STATUS_LABELS[status]}
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

function UploadPanel({ onSaved, setNotice }: { onSaved: () => Promise<void>; setNotice: (n: InlineNotice) => void }) {
  const [kind, setKind] = useState<'members' | 'players'>('members');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MembersPreview | PlayersPreview | null>(null);
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
          kind,
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
      setNotice({
        type: 'success',
        message: kind === 'members'
          ? `ClubControl export saved — ${body.saved.total} members.`
          : `GMS player list saved — ${body.saved.added} added, ${body.saved.updated} updated.`,
      });
      reset();
      await onSaved();
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const playersPreview = kind === 'players' ? (preview as PlayersPreview | null) : null;
  const membersPreview = kind === 'members' ? (preview as MembersPreview | null) : null;

  return (
    <section className="mb-8 rounded-2xl bg-white shadow-sm ring-1 ring-blue-200">
      <div className="border-b border-blue-200 bg-blue-50 px-5 py-3">
        <h2 className="text-lg font-semibold text-zinc-900">Upload data</h2>
        <p className="text-xs text-zinc-600">Nothing is saved until you check the summary and press Apply.</p>
      </div>
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <Chip active={kind === 'members'} onClick={() => { setKind('members'); reset(); }}>ClubControl members export</Chip>
          <Chip active={kind === 'players'} onClick={() => { setKind('players'); reset(); }}>GMS player list</Chip>
        </div>
        <p className="text-sm text-zinc-600">
          {kind === 'members'
            ? 'The members .csv from ClubControl. It replaces the previous export.'
            : 'The player list from GMS (.xlsx or .csv). New players are added and existing ones updated — nobody is removed. Teams come from each player’s date of birth and gender.'}
        </p>
        <input
          key={inputKey}
          type="file"
          accept={kind === 'members' ? '.csv' : '.xlsx,.csv'}
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

        {membersPreview && (
          <div className="rounded-lg bg-zinc-50 p-4 text-sm ring-1 ring-zinc-200">
            <p className="font-medium text-zinc-900">{membersPreview.total} members, {membersPreview.inactive} inactive.</p>
            <p className="mt-1 text-zinc-600">This replaces the current ClubControl data.</p>
          </div>
        )}

        {playersPreview && (
          <div className="space-y-3 rounded-lg bg-zinc-50 p-4 text-sm ring-1 ring-zinc-200">
            <p className="font-medium text-zinc-900">
              {playersPreview.total} players: {playersPreview.added} new, {playersPreview.updated} already uploaded.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {[...TEAMS.map((t) => t.name), 'No date of birth']
                .filter((name) => playersPreview.perTeam[name])
                .map((name) => (
                  <li key={name} className="rounded-md bg-white px-2 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200">
                    {name} <span className="font-semibold tabular-nums">{playersPreview.perTeam[name]}</span>
                  </li>
                ))}
            </ul>
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

export default function MembershipPage() {
  const [role, setRole] = useState<string | null>(null);
  const [checkedRole, setCheckedRole] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
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
  const [showUpload, setShowUpload] = useState(false);

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
      const [memberRows, playerRows, noteRows] = await Promise.all([
        latestMembers
          ? loadAll<Member>((from, to) =>
              supabase.from('membership_members').select('id, first_name, last_name, email, categories, renewal_date, active')
                .eq('import_id', latestMembers.id).order('id').range(from, to))
          : Promise.resolve([] as Member[]),
        loadAll<Player>((from, to) =>
          supabase.from('membership_players').select('id, name_key, first_name, last_name, date_of_birth, gender, emergency_contact, emergency_phone')
            .order('last_name').order('first_name').order('id').range(from, to)),
        loadAll<Note>((from, to) =>
          supabase.from('membership_notes').select('*').order('person_key').range(from, to)),
      ]);
      setImports(importRows);
      setMembers(memberRows);
      setPlayers(playerRows);
      setNotes(new Map(noteRows.map((n) => [n.person_key, n])));
    } catch (error: any) {
      setNotice({ type: 'error', message: `Failed to load membership data: ${error.message}` });
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const userRole = resolveRoleFromUser(data.user);
      setRole(userRole);
      setCheckedRole(true);
      if (userRole && VIEW_ROLES.has(userRole)) await loadData();
      else setLoading(false);
    };
    void init();
  }, []);

  const canView = !!role && VIEW_ROLES.has(role);
  const canUpload = role === 'admin';
  const months = monthsIntoSeason();
  // e.g. "since Sep ’26"
  const seasonLabel = `since ${seasonStart().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace(' ', ' ’')}`;

  const membersImport = imports.find((i) => i.kind === 'members');
  const playersImport = imports.find((i) => i.kind === 'players');

  // Everyone in the ClubControl export, by name. Someone listed twice counts
  // as active if either record is.
  const membersByName = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of members) {
      const key = nameKey(m.first_name, m.last_name);
      const existing = map.get(key);
      if (!existing || (!existing.active && m.active)) map.set(key, m);
    }
    return map;
  }, [members]);

  const playerRows: PlayerRow[] = useMemo(
    () =>
      players.map((p) => {
        const member = membersByName.get(p.name_key) ?? null;
        return {
          ...p,
          team: teamFromBirthDate(p.date_of_birth, p.gender),
          member,
          status: !member ? 'missing' : member.active ? 'paid' : 'lapsed',
        };
      }),
    [players, membersByName],
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
        if (q && !`${p.first_name} ${p.last_name} ${p.emergency_contact ?? ''}`.toLowerCase().includes(q)) return false;
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
      .filter((m) => !m.active && !hiddenKeys.has(nameKey(m.first_name, m.last_name)))
      .map((m) => ({ ...m, teams: teamsByName.get(nameKey(m.first_name, m.last_name)) ?? [] }))
      .filter((m) => filter === 'all' || m.teams.some((t) => teamNamesInFilter.has(t)))
      .filter((m) => !q || `${m.first_name} ${m.last_name} ${m.email ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  }, [members, teamsByName, filter, teamNamesInFilter, inactiveSearch, hiddenKeys]);

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
          status: player ? STATUS_LABELS[player.status] : member ? (member.active ? 'Active member' : 'Inactive member') : 'Not in the latest uploads',
        };
      })
      .sort((a, b) => a.note.display_name.localeCompare(b.note.display_name));
  }, [notes, playerRows, membersByName]);

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
                ClubControl export: {membersImport ? shortDate(membersImport.uploaded_at) : 'not uploaded yet'}
                {' · '}GMS player list: {playersImport ? shortDate(playersImport.uploaded_at) : 'not uploaded yet'}
              </p>
            )}
          </div>
          {canUpload && (
            <button
              type="button"
              onClick={() => setShowUpload((v) => !v)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {showUpload ? 'Close upload' : '⬆ Upload data'}
            </button>
          )}
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {canUpload && showUpload && <UploadPanel onSaved={loadData} setNotice={setNotice} />}

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
            <section className="mb-6 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
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
                  placeholder="Search name or contact…"
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
                  {filteredPlayers.length === 0 ? 'No players uploaded for this selection yet.' : 'No players match.'}
                </p>
              ) : (
                <div className="relative overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-5 py-2 font-semibold">Name</th>
                        {!singleTeam && <th className="px-3 py-2 font-semibold">Team</th>}
                        <th className="px-3 py-2 text-right font-semibold">Age</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">ClubControl</th>
                        <th className="px-3 py-2 font-semibold">Emergency contact</th>
                        <th className="w-12 px-3 py-2"><span className="sr-only">Comment</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {visiblePlayers.map((p) => (
                        <tr key={p.id} className="align-top">
                          <td className="px-5 py-2 font-medium text-zinc-900">{p.first_name} {p.last_name}</td>
                          {!singleTeam && <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{p.team}</td>}
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{ageOn(p.date_of_birth) ?? '—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                          <td className="px-3 py-2 text-zinc-600">
                            {p.status === 'lapsed' ? `Renewal was due ${shortDate(p.member?.renewal_date ?? null)}` : membershipType(p.member)}
                          </td>
                          <td className="px-3 py-2 text-zinc-600">
                            {p.emergency_contact || p.emergency_phone ? (
                              <>
                                <p>{firstEntry(p.emergency_contact)}</p>
                                <p className="text-xs text-zinc-400">{ukPhone(firstEntry(p.emergency_phone))}</p>
                              </>
                            ) : '—'}
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
                  {members.length === 0 || players.length === 0 ? 'Upload both the ClubControl export and the GMS player list to see this.' : 'Everyone with a playing membership is on GMS.'}
                </p>
              ) : (
                <div className="relative overflow-x-auto">
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
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${m.active ? STATUS_STYLES.paid.badge : STATUS_STYLES.lapsed.badge}`}>
                              {m.active ? 'Active' : 'Inactive'}
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
              )}
            </section>

            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-amber-200">
              <div className={`flex flex-wrap items-center justify-between gap-3 bg-amber-50 px-5 py-4 ${openCards.inactive ? 'border-b border-amber-200' : ''}`}>
                <CardHeading open={openCards.inactive} onToggle={() => toggleCard('inactive')} title={`Inactive members (${inactiveMembers.length})`}>
                  Marked inactive in ClubControl — they haven’t paid.
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
                  {members.length === 0 ? 'No ClubControl export uploaded yet.' : 'No inactive members for this selection.'}
                </p>
              ) : (
                <div className="relative overflow-x-auto">
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
