import { useEffect, useMemo, useState } from 'react';
import PublicSectionNav from '../../components/PublicSectionNav';
import { supabase } from '../../lib/supabaseClient';

// Team Registers — CSV upload, present/absent + notes, one register per
// team. Seniors is open; every other team is gated behind a shared
// passcode set by that team's coach/manager (see
// pages/api/public/registers-unlock.ts and lib/registerAuth.ts for how
// that's actually checked — it's a real server-side check now, not a
// client-side hash like the old static page this replaces).
//
// Roster names, attendance and notes live in Supabase (register_teams /
// register_players / register_attendance), so they're shared across
// devices — unlike the static Squarespace version, a coach can start a
// register on their phone and finish it on a laptop.

type Team = { slug: string; name: string; is_protected: boolean; sort_order: number };
type Player = { id: string; name: string; default_note: string; sort_order: number };
type AttendanceState = Record<string, { status: 'present' | 'absent' | null; notes: string }>;

const TOKENS_KEY = 'aldw_registers_tokens';

const todayStr = () => new Date().toISOString().slice(0, 10);

function loadTokens(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(TOKENS_KEY) || '{}');
  } catch {
    return {};
  }
}
function persistTokens(tokens: Record<string, string>) {
  try {
    sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    /* ignore — worst case the coach re-enters the password next reload */
  }
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length);
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  });
}

function csvRowsFromParsed(rows: string[][]): { name: string; note: string }[] {
  if (!rows.length) return [];
  let start = 0;
  const firstCell = (rows[0][0] || '').toLowerCase();
  if (['name', 'player', 'full name', 'member', 'player name'].includes(firstCell)) start = 1;
  const out: { name: string; note: string }[] = [];
  for (let i = start; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim();
    if (!name) continue;
    out.push({ name, note: (rows[i][1] || '').trim() });
  }
  return out;
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const v = String(cell ?? '');
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(',')
    )
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function RegistersPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<string>('');
  const [tokens, setTokens] = useState<Record<string, string>>({});

  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<AttendanceState>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [date, setDate] = useState(todayStr());

  const [passwordInput, setPasswordInput] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [changePwStatus, setChangePwStatus] = useState<string | null>(null);

  const [sharedNotes, setSharedNotes] = useState('');

  const activeTeam = useMemo(() => teams.find((t) => t.slug === activeSlug) || null, [teams, activeSlug]);
  const isUnlocked = (team: Team | null | undefined) => !!team && (!team.is_protected || Boolean(tokens[team.slug]));

  useEffect(() => {
    setTokens(loadTokens());

    (async () => {
      try {
        const res = await fetch('/api/public/registers-teams');
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not load teams.');
        setTeams(payload.teams);
        if (payload.teams.length > 0) setActiveSlug(payload.teams[0].slug);
      } catch (e: any) {
        setTeamsError(e.message || 'Could not load teams.');
      } finally {
        setTeamsLoading(false);
      }
    })();

    (async () => {
      try {
        const res = await fetch('/api/public/registers-notes');
        const payload = await res.json();
        if (payload.ok) setSharedNotes(payload.notes || '');
      } catch {
        /* shared notes are a nice-to-have, fail quietly */
      }
    })();
  }, []);

  useEffect(() => {
    setUnlockError(null);
    setPasswordInput('');
    setShowPasswordPanel(false);
    setChangePwStatus(null);

    if (!activeTeam || !isUnlocked(activeTeam)) {
      setPlayers([]);
      setAttendance({});
      return;
    }

    let cancelled = false;
    setRosterLoading(true);

    (async () => {
      const token = tokens[activeTeam.slug];
      const rosterParams = new URLSearchParams({ team: activeTeam.slug });
      if (token) rosterParams.set('token', token);
      const attParams = new URLSearchParams({ team: activeTeam.slug, date });
      if (token) attParams.set('token', token);

      const [rosterRes, attRes] = await Promise.all([
        fetch(`/api/public/registers-roster?${rosterParams}`),
        fetch(`/api/public/registers-attendance?${attParams}`),
      ]);

      if (cancelled) return;

      if (rosterRes.status === 401 || attRes.status === 401) {
        setTokens((cur) => {
          const next = { ...cur };
          delete next[activeTeam.slug];
          persistTokens(next);
          return next;
        });
        setRosterLoading(false);
        return;
      }

      const rosterPayload = await rosterRes.json();
      const attPayload = await attRes.json();

      if (rosterPayload.ok) setPlayers(rosterPayload.players);
      if (attPayload.ok) {
        const next: AttendanceState = {};
        for (const row of attPayload.attendance) {
          next[row.player_id] = { status: row.status, notes: row.notes || '' };
        }
        setAttendance(next);
      }

      setRosterLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug, date, tokens, teams]);

  const unlockTeam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeTeam) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await fetch('/api/public/registers-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamSlug: activeTeam.slug, password: passwordInput }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setUnlockError(payload.error || "That password isn't right.");
        return;
      }
      setTokens((cur) => {
        const next = { ...cur, [activeTeam.slug]: payload.token };
        persistTokens(next);
        return next;
      });
    } catch {
      setUnlockError('Could not reach the server. Try again.');
    } finally {
      setUnlocking(false);
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeTeam) return;
    setChangingPw(true);
    setChangePwStatus(null);
    try {
      const { data } = await supabase.auth.getSession();
      const bearerToken = data.session?.access_token;
      const res = await fetch('/api/public/registers-change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
        body: JSON.stringify({
          teamSlug: activeTeam.slug,
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setChangePwStatus(payload.error || 'Could not change the password.');
        return;
      }
      setChangePwStatus('Password changed. Share the new one with your coaches — you will need it next time too.');
      setCurrentPasswordInput('');
      setNewPasswordInput('');
    } catch {
      setChangePwStatus('Could not reach the server. Try again.');
    } finally {
      setChangingPw(false);
    }
  };

  const uploadCSV = async (file: File) => {
    if (!activeTeam) return;
    const text = await file.text();
    const rows = csvRowsFromParsed(parseCSV(text));
    if (!rows.length) return;
    const res = await fetch('/api/public/registers-roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamSlug: activeTeam.slug, token: tokens[activeTeam.slug], rows }),
    });
    const payload = await res.json();
    if (payload.ok) refreshRoster();
  };

  const refreshRoster = async () => {
    if (!activeTeam) return;
    const params = new URLSearchParams({ team: activeTeam.slug });
    if (tokens[activeTeam.slug]) params.set('token', tokens[activeTeam.slug]);
    const res = await fetch(`/api/public/registers-roster?${params}`);
    const payload = await res.json();
    if (payload.ok) setPlayers(payload.players);
  };

  const addPlayer = async () => {
    if (!activeTeam) return;
    const name = window.prompt('Player name?');
    if (!name || !name.trim()) return;
    const res = await fetch('/api/public/registers-roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamSlug: activeTeam.slug, token: tokens[activeTeam.slug], name: name.trim() }),
    });
    const payload = await res.json();
    if (payload.ok) setPlayers((cur) => [...cur, payload.player]);
  };

  const renamePlayer = async (playerId: string, name: string) => {
    if (!activeTeam) return;
    await fetch('/api/public/registers-roster', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamSlug: activeTeam.slug, token: tokens[activeTeam.slug], playerId, name }),
    });
  };

  const removePlayer = async (playerId: string, name: string) => {
    if (!activeTeam) return;
    if (!window.confirm(`Remove ${name || 'this player'} from the ${activeTeam.name} squad?`)) return;
    const params = new URLSearchParams({ team: activeTeam.slug, playerId });
    if (tokens[activeTeam.slug]) params.set('token', tokens[activeTeam.slug]);
    const res = await fetch(`/api/public/registers-roster?${params}`, { method: 'DELETE' });
    const payload = await res.json();
    if (payload.ok) setPlayers((cur) => cur.filter((p) => p.id !== playerId));
  };

  const setStatus = async (playerId: string, status: 'present' | 'absent') => {
    if (!activeTeam) return;
    const current = attendance[playerId]?.status;
    const nextStatus = current === status ? null : status;
    setAttendance((cur) => ({ ...cur, [playerId]: { status: nextStatus, notes: cur[playerId]?.notes || '' } }));
    await fetch('/api/public/registers-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamSlug: activeTeam.slug, token: tokens[activeTeam.slug], date, playerId, status: nextStatus }),
    });
  };

  const setNotes = async (playerId: string, notes: string) => {
    if (!activeTeam) return;
    setAttendance((cur) => ({ ...cur, [playerId]: { status: cur[playerId]?.status ?? null, notes } }));
    await fetch('/api/public/registers-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamSlug: activeTeam.slug, token: tokens[activeTeam.slug], date, playerId, notes }),
    });
  };

  const downloadRegister = () => {
    if (!activeTeam) return;
    const rows: (string | number)[][] = [['Name', 'Status', 'Notes']];
    for (const p of players) {
      const a = attendance[p.id];
      const status = a?.status === 'present' ? 'Present' : a?.status === 'absent' ? 'Absent' : 'Not marked';
      rows.push([p.name, status, a?.notes || p.default_note || '']);
    }
    downloadCSV(`${activeTeam.name.replace(/[^\w]+/g, '-')}-register-${date}.csv`, rows);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/public/registers-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: sharedNotes }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [sharedNotes]);

  const counts = useMemo(() => {
    let present = 0,
      absent = 0,
      unmarked = 0;
    for (const p of players) {
      const s = attendance[p.id]?.status;
      if (s === 'present') present++;
      else if (s === 'absent') absent++;
      else unmarked++;
    }
    return { present, absent, unmarked, total: players.length };
  }, [players, attendance]);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-red-900 via-red-800 to-red-700 px-6 py-8 text-white sm:px-8">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-red-100">For coaches &amp; managers</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">Team Registers</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-red-50 sm:text-base">
              Upload a squad list, take attendance and keep notes for every session. Seniors is open to anyone; every
              age group below it is protected by that team&apos;s own passcode.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-900">Notes &amp; useful links</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Registers are shared across devices now — sign in with the team passcode on any device to pick up where
            you left off. Recording who&apos;s present is also part of the club&apos;s safeguarding practice: use the
            safeguarding contact below for a welfare concern rather than a register note.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <a href="mailto:safeguarding@aldwinians.co.uk" className="rounded-xl border-l-4 border-red-700 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              Safeguarding
              <span className="mt-1 block text-xs font-medium text-zinc-500">Report a welfare concern</span>
            </a>
            <a href="/public/actions" className="rounded-xl border-l-4 border-red-700 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              Member actions
              <span className="mt-1 block text-xs font-medium text-zinc-500">Track open club actions</span>
            </a>
            <a href="/public/minutes" className="rounded-xl border-l-4 border-red-700 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              Minutes
              <span className="mt-1 block text-xs font-medium text-zinc-500">Previous club minutes</span>
            </a>
            <a href="/public/job-club" className="rounded-xl border-l-4 border-red-700 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              Job Club
              <span className="mt-1 block text-xs font-medium text-zinc-500">Volunteer tasks around the club</span>
            </a>
          </div>

          <div className="mt-5">
            <label htmlFor="shared-notes" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Shared club notes (visible to anyone who opens this page)
            </label>
            <textarea
              id="shared-notes"
              value={sharedNotes}
              onChange={(e) => setSharedNotes(e.target.value)}
              rows={3}
              placeholder="e.g. pitch closures, kit reminders, upcoming tournament dates…"
              className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
            />
            <p className="mt-1 text-xs text-zinc-500">Saved automatically as you type.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900">Take a register</h2>

          {teamsLoading ? (
            <p className="text-sm text-zinc-500">Loading teams…</p>
          ) : teamsError ? (
            <p className="text-sm text-rose-700">{teamsError}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {teams.map((team) => (
                  <button
                    key={team.slug}
                    type="button"
                    onClick={() => setActiveSlug(team.slug)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition',
                      team.slug === activeSlug
                        ? 'bg-red-700 text-white'
                        : 'border border-zinc-200 text-zinc-700 hover:border-red-200 hover:bg-red-50 hover:text-red-800',
                    ].join(' ')}
                  >
                    {team.is_protected && <span aria-hidden>🔒</span>}
                    {team.name}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5">
                {!activeTeam ? null : !isUnlocked(activeTeam) ? (
                  <div className="mx-auto max-w-sm py-6 text-center">
                    <h3 className="text-lg font-bold text-zinc-900">{activeTeam.name} register is locked</h3>
                    <p className="mt-2 text-sm text-zinc-600">Ask your coach or team manager for the section password.</p>
                    <form onSubmit={unlockTeam} className="mt-5 flex gap-2">
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Team password"
                        autoComplete="off"
                        required
                        className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      />
                      <button
                        type="submit"
                        disabled={unlocking}
                        className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:bg-red-300"
                      >
                        {unlocking ? 'Checking…' : 'Unlock'}
                      </button>
                    </form>
                    {unlockError && <p className="mt-3 text-sm font-medium text-rose-700">{unlockError}</p>}
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 pb-4">
                      <div>
                        <label htmlFor="reg-date" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Date
                        </label>
                        <input
                          id="reg-date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value || todayStr())}
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex-1" />
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                        Upload CSV
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadCSV(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button type="button" onClick={addPlayer} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                        + Add player
                      </button>
                      <button type="button" onClick={downloadRegister} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
                        Download register (.csv)
                      </button>
                      {activeTeam.is_protected && (
                        <button
                          type="button"
                          onClick={() => setShowPasswordPanel((v) => !v)}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-50"
                        >
                          {showPasswordPanel ? 'Hide password settings' : 'Manage this team’s password'}
                        </button>
                      )}
                    </div>

                    {showPasswordPanel && activeTeam.is_protected && (
                      <form onSubmit={changePassword} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Current password</label>
                          <input
                            type="password"
                            value={currentPasswordInput}
                            onChange={(e) => setCurrentPasswordInput(e.target.value)}
                            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                            placeholder="Leave blank if you're a logged-in admin"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">New password</label>
                          <input
                            type="text"
                            value={newPasswordInput}
                            onChange={(e) => setNewPasswordInput(e.target.value)}
                            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                            placeholder="6+ characters"
                            required
                            minLength={6}
                          />
                        </div>
                        <button type="submit" disabled={changingPw} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:bg-red-300">
                          {changingPw ? 'Saving…' : 'Change password'}
                        </button>
                        {changePwStatus && (
                          <p className={`w-full text-sm ${changePwStatus.startsWith('Password changed') ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {changePwStatus}
                          </p>
                        )}
                      </form>
                    )}

                    {rosterLoading ? (
                      <p className="mt-5 text-sm text-zinc-500">Loading register…</p>
                    ) : players.length === 0 ? (
                      <p className="mt-8 text-center text-sm text-zinc-500">
                        No players yet. Upload a CSV of names (one per line, optionally with a second column of notes) or use
                        &ldquo;+ Add player&rdquo; above.
                      </p>
                    ) : (
                      <>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{counts.present} present</span>
                          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">{counts.absent} absent</span>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{counts.unmarked} not marked</span>
                          <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700">{counts.total} total</span>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full min-w-[640px] border-collapse text-sm">
                            <thead>
                              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                <th className="w-8 pb-2">#</th>
                                <th className="pb-2">Name</th>
                                <th className="w-44 pb-2">Status</th>
                                <th className="pb-2">Notes</th>
                                <th className="w-10 pb-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {players.map((p, idx) => {
                                const a = attendance[p.id];
                                return (
                                  <tr key={p.id} className="border-t border-zinc-200">
                                    <td className="py-2 text-zinc-500">{idx + 1}</td>
                                    <td className="py-2 pr-3">
                                      <input
                                        defaultValue={p.name}
                                        onBlur={(e) => {
                                          const name = e.target.value.trim();
                                          if (name && name !== p.name) {
                                            setPlayers((cur) => cur.map((x) => (x.id === p.id ? { ...x, name } : x)));
                                            renamePlayer(p.id, name);
                                          }
                                        }}
                                        className="w-full rounded-lg border border-transparent px-2 py-1.5 font-semibold hover:bg-white focus:border-red-300 focus:bg-white focus:outline-none"
                                      />
                                    </td>
                                    <td className="py-2 pr-3">
                                      <div className="flex gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setStatus(p.id, 'present')}
                                          className={[
                                            'rounded-lg border px-2.5 py-1.5 text-xs font-semibold',
                                            a?.status === 'present'
                                              ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                                              : 'border-zinc-300 bg-white text-zinc-500',
                                          ].join(' ')}
                                        >
                                          Present
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setStatus(p.id, 'absent')}
                                          className={[
                                            'rounded-lg border px-2.5 py-1.5 text-xs font-semibold',
                                            a?.status === 'absent'
                                              ? 'border-rose-600 bg-rose-50 text-rose-700'
                                              : 'border-zinc-300 bg-white text-zinc-500',
                                          ].join(' ')}
                                        >
                                          Absent
                                        </button>
                                      </div>
                                    </td>
                                    <td className="py-2 pr-3">
                                      <input
                                        defaultValue={a?.notes ?? p.default_note ?? ''}
                                        onBlur={(e) => setNotes(p.id, e.target.value)}
                                        placeholder="Add a note…"
                                        className="w-full rounded-lg border border-transparent px-2 py-1.5 hover:bg-white focus:border-red-300 focus:bg-white focus:outline-none"
                                      />
                                    </td>
                                    <td className="py-2 text-right">
                                      <button
                                        type="button"
                                        onClick={() => removePlayer(p.id, p.name)}
                                        title="Remove player"
                                        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-zinc-400 hover:border-rose-300 hover:text-rose-700"
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
