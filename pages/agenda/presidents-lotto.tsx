import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';

type LottoMember = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

type DrawResult = {
  first: string;
  second: string;
  third: string;
};

type SavedDraw = {
  id: string;
  first_place: string;
  second_place: string;
  third_place: string;
  drawn_at: string;
};

// ── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLOURS = [
  '#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#ffffff',
];

function Confetti({ active }: { active: boolean }) {
  const pieces = useRef(
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 1.2}s`,
      duration: `${1.8 + Math.random() * 1.4}s`,
      colour: CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)],
      size: `${6 + Math.random() * 8}px`,
      rotate: `${Math.random() * 360}deg`,
      isCircle: Math.random() > 0.5,
    })),
  );

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.current.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '-20px',
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.colour,
            borderRadius: p.isCircle ? '50%' : '2px',
            transform: `rotate(${p.rotate})`,
            animation: `confettiFall ${p.duration} ${p.delay} ease-in forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Slot reel ─────────────────────────────────────────────────────────────────
const PLACE_META = [
  { label: '1st Place', emoji: '🥇', gradient: 'from-yellow-300 via-amber-400 to-yellow-500', glow: 'shadow-yellow-400/60' },
  { label: '2nd Place', emoji: '🥈', gradient: 'from-slate-300 via-zinc-300 to-slate-400',    glow: 'shadow-zinc-400/60'   },
  { label: '3rd Place', emoji: '🥉', gradient: 'from-orange-400 via-amber-500 to-orange-600', glow: 'shadow-orange-400/60' },
] as const;

function SlotReel({
  displayName, locked, place, revealed,
}: {
  displayName: string; locked: boolean; place: 0 | 1 | 2; revealed: boolean;
}) {
  const meta = PLACE_META[place];
  return (
    <div
      className={`
        relative flex flex-col items-center justify-center rounded-2xl p-5 text-center
        transition-all duration-700 ease-out
        ${
          revealed
            ? `bg-gradient-to-br ${meta.gradient} shadow-2xl ${meta.glow} scale-105`
            : locked
            ? `bg-gradient-to-br ${meta.gradient} shadow-lg scale-100`
            : 'bg-white/10 scale-95'
        }
      `}
    >
      <span className="text-2xl mb-1">{meta.emoji}</span>
      <span className={`text-xs font-bold uppercase tracking-widest mb-3 ${
        revealed || locked ? 'text-white/80' : 'text-white/50'
      }`}>
        {meta.label}
      </span>
      <div className={`w-full min-h-[3rem] flex items-center justify-center rounded-xl px-3 py-2 transition-all duration-300 ${
        locked ? 'bg-white/20' : 'bg-black/20'
      }`}>
        <span className={`text-lg font-extrabold leading-tight text-white drop-shadow-md break-words text-center transition-all duration-100 ${
          !locked ? 'opacity-60' : 'opacity-100'
        }`}>
          {displayName || '—'}
        </span>
      </div>
      {revealed && (
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_1.5s_ease-in-out_1]" />
        </div>
      )}
    </div>
  );
}

export default function PresidentsLottoPage() {
  const [members, setMembers] = useState<LottoMember[]>([]);
  const [draws, setDraws] = useState<SavedDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);

  // Add member form
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  // Delete confirm
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Draw state
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [slots, setSlots] = useState<[string, string, string]>(['', '', '']);
  const [locked, setLocked] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [revealed, setRevealed] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [confetti, setConfetti] = useState(false);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  const showNotice = (type: InlineNotice['type'], message: string) =>
    setNotice({ type, message });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const loadData = async () => {
    setLoading(true);
    const [membersRes, drawsRes] = await Promise.all([
      supabase
        .from('presidents_lotto_members')
        .select('id, name, is_active, created_at')
        .order('name', { ascending: true }),
      supabase
        .from('presidents_lotto_draws')
        .select('id, first_place, second_place, third_place, drawn_at')
        .order('drawn_at', { ascending: false })
        .limit(10),
    ]);
    if (membersRes.data) setMembers(membersRes.data);
    if (drawsRes.data) setDraws(drawsRes.data);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const activeMembers = members.filter((m) => m.is_active);

  // ── Add member ──────────────────────────────────────────────────────────────
  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    const { error } = await supabase
      .from('presidents_lotto_members')
      .insert({ name: trimmed, is_active: true });
    setAdding(false);
    if (error) { showNotice('error', 'Failed to add member: ' + error.message); return; }
    setNewName('');
    await loadData();
    showNotice('success', `${trimmed} added to the lotto.`);
  };

  // ── Toggle active ────────────────────────────────────────────────────────────
  const toggleActive = async (member: LottoMember) => {
    const { error } = await supabase
      .from('presidents_lotto_members')
      .update({ is_active: !member.is_active })
      .eq('id', member.id);
    if (error) { showNotice('error', 'Failed to update member.'); return; }
    await loadData();
    showNotice('success', `${member.name} ${member.is_active ? 'removed from' : 'added to'} this draw.`);
  };

  // ── Delete member ────────────────────────────────────────────────────────────
  const deleteMember = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    const { error } = await supabase
      .from('presidents_lotto_members')
      .delete()
      .eq('id', deleteTargetId);
    setDeleting(false);
    if (error) { showNotice('error', 'Failed to delete member: ' + error.message); return; }
    setDeleteTargetId(null);
    await loadData();
    showNotice('success', 'Member removed.');
  };

  // ── Run draw ─────────────────────────────────────────────────────────────────
  const runDraw = () => {
    if (activeMembers.length < 3) {
      showNotice('error', 'You need at least 3 active members to run the draw.');
      return;
    }

    clearTimers();
    setResult(null);
    setSlots(['', '', '']);
    setLocked([false, false, false]);
    setRevealed([false, false, false]);
    setConfetti(false);
    setDrawing(true);

    // Fisher-Yates shuffle for truly random selection
    const shuffled = [...activeMembers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const winners: [string, string, string] = [shuffled[0].name, shuffled[1].name, shuffled[2].name];
    const names = activeMembers.map((m) => m.name);

    // Spin all three slots rapidly at 80ms
    intervalRef.current = setInterval(() => {
      setSlots((prev) => [
        prev[0] !== winners[0] ? names[Math.floor(Math.random() * names.length)] : prev[0],
        prev[1] !== winners[1] ? names[Math.floor(Math.random() * names.length)] : prev[1],
        prev[2] !== winners[2] ? names[Math.floor(Math.random() * names.length)] : prev[2],
      ]);
    }, 80);

    // Lock 1st place
    const t1 = setTimeout(() => {
      setSlots((prev) => [winners[0], prev[1], prev[2]]);
      setLocked([true, false, false]);
    }, 2000);

    // Lock 2nd place
    const t2 = setTimeout(() => {
      setSlots((prev) => [prev[0], winners[1], prev[2]]);
      setLocked([true, true, false]);
    }, 3200);

    // Lock 3rd place & stop spinning
    const t3 = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSlots(winners);
      setLocked([true, true, true]);
      setDrawing(false);
      setResult({ first: winners[0], second: winners[1], third: winners[2] });
    }, 4400);

    // Staggered reveal + confetti
    const t4 = setTimeout(() => setRevealed([true, false, false]), 4700);
    const t5 = setTimeout(() => setRevealed([true, true, false]), 5400);
    const t6 = setTimeout(() => { setRevealed([true, true, true]); setConfetti(true); }, 6100);
    const t7 = setTimeout(() => setConfetti(false), 8500);

    timeoutsRef.current = [t1, t2, t3, t4, t5, t6, t7];
  };

  // ── Save draw ─────────────────────────────────────────────────────────────────
  const saveDraw = async () => {
    if (!result) return;
    setSaving(true);
    const { error } = await supabase.from('presidents_lotto_draws').insert({
      first_place: result.first,
      second_place: result.second,
      third_place: result.third,
    });
    setSaving(false);
    if (error) { showNotice('error', 'Failed to save draw: ' + error.message); return; }
    await loadData();
    showNotice('success', 'Draw saved to history.');
  };

  const drawPhase = drawing ? 'spinning' : result ? (revealed[2] ? 'done' : 'revealing') : 'idle';

  return (
    <main className="min-h-screen bg-zinc-50">
      <Confetti active={confetti} />

      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">🎰 Presidents Lotto</h1>
          <p className="mt-1 text-zinc-600">Draw 1st, 2nd and 3rd place from the active members pool.</p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {/* ── DRAW ARENA ────────────────────────────────────────────────────── */}
        <section className="mb-10 overflow-hidden rounded-3xl bg-gradient-to-br from-red-950 via-red-800 to-rose-700 shadow-2xl ring-1 ring-red-900">

          {/* Header bar */}
          <div className="flex items-center justify-between px-6 py-5 sm:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-300">Aldwinians RUFC</p>
              <h2 className="mt-0.5 text-2xl font-extrabold text-white">Presidents Lotto Draw</h2>
              <p className="mt-1 text-sm text-red-200">
                {activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''} in the pool
              </p>
            </div>

            {drawPhase === 'idle' && (
              <button
                type="button"
                onClick={runDraw}
                disabled={activeMembers.length < 3}
                className="group relative overflow-hidden rounded-2xl bg-white px-8 py-4 text-lg font-extrabold text-red-800 shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="relative z-10">🎰 Draw!</span>
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-red-50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </button>
            )}

            {drawPhase === 'spinning' && (
              <div className="flex flex-col items-center gap-1">
                <div className="text-4xl animate-bounce">🎲</div>
                <span className="text-xs font-semibold text-red-200 animate-pulse">Drawing…</span>
              </div>
            )}

            {(drawPhase === 'revealing' || drawPhase === 'done') && (
              <button
                type="button"
                onClick={runDraw}
                className="rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition"
              >
                🔄 Redraw
              </button>
            )}
          </div>

          {/* Slot reels */}
          <div className="px-6 pb-4 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-3">
              {([0, 1, 2] as const).map((i) => (
                <SlotReel
                  key={i}
                  place={i}
                  displayName={slots[i] || (drawPhase === 'idle' ? '—' : '?')}
                  locked={locked[i]}
                  revealed={revealed[i]}
                />
              ))}
            </div>
          </div>

          {/* Save button */}
          {drawPhase === 'done' && result && (
            <div className="flex justify-end px-6 pb-6 sm:px-8">
              <button
                type="button"
                onClick={saveDraw}
                disabled={saving}
                className="rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition disabled:opacity-50"
              >
                {saving ? 'Saving…' : '💾 Save draw to history'}
              </button>
            </div>
          )}

          {/* Ticker */}
          <div className="border-t border-white/10 bg-black/20 px-6 py-2 sm:px-8">
            <p className="text-[11px] font-medium text-red-300/70 text-center tracking-widest uppercase">
              {drawPhase === 'spinning' ? '🎲 Picking winners at random…' :
               drawPhase === 'revealing' ? '🏆 Revealing results…' :
               drawPhase === 'done' ? '🎉 Draw complete!' :
               'Press Draw to begin'}
            </p>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* ── MEMBERS POOL ──────────────────────────────── */}
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-zinc-900">Members Pool</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {activeMembers.length} active · {members.filter((m) => !m.is_active).length} inactive
              </p>
            </div>

            {/* Add member form */}
            <form onSubmit={addMember} className="flex gap-2 border-b border-zinc-100 px-5 py-3">
              <input
                type="text"
                placeholder="Member name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={adding || !newName.trim()}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {adding ? '…' : 'Add'}
              </button>
            </form>

            {loading ? (
              <p className="px-5 py-6 text-sm text-zinc-400">Loading…</p>
            ) : members.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-400">No members yet. Add some above.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 max-h-[480px] overflow-y-auto">
                {members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                          member.is_active ? 'bg-emerald-500' : 'bg-zinc-300'
                        }`}
                      />
                      <span className={`text-sm truncate ${member.is_active ? 'text-zinc-900 font-medium' : 'text-zinc-400 line-through'}`}>
                        {member.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleActive(member)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                          member.is_active
                            ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {member.is_active ? 'Exclude' : 'Include'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(member.id)}
                        className="rounded-md border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── DRAW HISTORY ──────────────────────────────── */}
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-zinc-900">Draw History</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Last 10 draws</p>
            </div>

            {draws.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-400">No draws saved yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 max-h-[480px] overflow-y-auto">
                {draws.map((draw) => (
                  <li key={draw.id} className="px-5 py-4">
                    <p className="text-xs text-zinc-400 mb-2">
                      {new Date(draw.drawn_at).toLocaleString('en-GB')}
                    </p>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-semibold">🥇</span> {draw.first_place}</p>
                      <p><span className="font-semibold">🥈</span> {draw.second_place}</p>
                      <p><span className="font-semibold">🥉</span> {draw.third_place}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTargetId}
        title="Delete member?"
        description="This will permanently remove them from the lotto pool."
        confirmLabel="Delete"
        onConfirm={deleteMember}
        onCancel={() => setDeleteTargetId(null)}
        loading={deleting}
      />

      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </main>
  );
}
