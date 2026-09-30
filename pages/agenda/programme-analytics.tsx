import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';

// Matchday programme opens, counted by the website's tracking link
// (pages/api/public/programme.ts). Totals come from the programme_opens_weekly
// and programme_opens_by_source views — see supabase/policies/programme_opens.sql.

type WeekRow = { week_start: string; opens: number; mobile: number; desktop: number; tablet: number };
type SourceRow = { source: string; opens: number; last_opened_at: string };

const WEEKS_SHOWN = 12;

const SOURCE_LABELS: Record<string, string> = {
  home: 'Homepage button',
  direct: 'Direct / shared link',
};

// Monday of the current week (local time), as YYYY-MM-DD — matches the
// Monday–Sunday weeks in programme_opens_weekly.
const mondayKey = (offsetWeeks: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offsetWeeks * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const weekLabel = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Saturday of that week — the matchday the programme was for.
const matchdayLabel = (key: string) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + 5);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-zinc-900 tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

export default function ProgrammeAnalyticsPage() {
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [weeksRes, sourcesRes] = await Promise.all([
        supabase.from('programme_opens_weekly').select('*').order('week_start', { ascending: false }).limit(260),
        supabase.from('programme_opens_by_source').select('*').order('opens', { ascending: false }),
      ]);
      if (weeksRes.error || sourcesRes.error) {
        setNotice({ type: 'error', message: `Failed to load programme stats: ${(weeksRes.error || sourcesRes.error)!.message}` });
      } else {
        setWeeks(weeksRes.data as WeekRow[]);
        setSources(sourcesRes.data as SourceRow[]);
      }
      setLoading(false);
    };
    void load();
  }, []);

  const byWeek = useMemo(() => new Map(weeks.map((w) => [w.week_start, w])), [weeks]);

  // Last N weeks, oldest first, with empty weeks filled in as zero.
  const chartWeeks = useMemo(
    () =>
      Array.from({ length: WEEKS_SHOWN }, (_, i) => {
        const key = mondayKey(WEEKS_SHOWN - 1 - i);
        return byWeek.get(key) ?? { week_start: key, opens: 0, mobile: 0, desktop: 0, tablet: 0 };
      }),
    [byWeek],
  );

  const thisWeek = chartWeeks[chartWeeks.length - 1].opens;
  const lastWeek = chartWeeks[chartWeeks.length - 2].opens;
  const allTime = weeks.reduce((sum, w) => sum + w.opens, 0);
  const allMobile = weeks.reduce((sum, w) => sum + w.mobile, 0);
  const mobileShare = allTime ? Math.round((allMobile / allTime) * 100) : 0;
  const maxOpens = Math.max(1, ...chartWeeks.map((w) => w.opens));
  const change = thisWeek - lastWeek;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">📰 Matchday Programme</h1>
          <p className="mt-1 text-zinc-600">
            How many times the programme has been opened from the website. Weeks run Monday to Sunday.
          </p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <>
            <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="This week"
                value={String(thisWeek)}
                detail={`${change >= 0 ? '+' : '−'}${Math.abs(change)} vs last week`}
              />
              <StatTile label="Last week" value={String(lastWeek)} detail={`Matchday ${matchdayLabel(mondayKey(1))}`} />
              <StatTile label="All time" value={String(allTime)} detail="Since tracking started" />
              <StatTile label="On mobile" value={`${mobileShare}%`} detail="Share of all opens" />
            </section>

            <section className="mb-8 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Opens per week</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Last {WEEKS_SHOWN} weeks</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTable((v) => !v)}
                  className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  {showTable ? 'Show chart' : 'Show table'}
                </button>
              </div>

              {showTable ? (
                <div className="overflow-x-auto px-5 py-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="py-2 pr-4 font-semibold">Week of</th>
                        <th className="py-2 pr-4 font-semibold">Matchday</th>
                        <th className="py-2 pr-4 text-right font-semibold">Opens</th>
                        <th className="py-2 pr-4 text-right font-semibold">Mobile</th>
                        <th className="py-2 text-right font-semibold">Desktop</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {[...chartWeeks].reverse().map((w) => (
                        <tr key={w.week_start}>
                          <td className="py-2 pr-4 text-zinc-900">{weekLabel(w.week_start)}</td>
                          <td className="py-2 pr-4 text-zinc-600">{matchdayLabel(w.week_start)}</td>
                          <td className="py-2 pr-4 text-right font-semibold tabular-nums text-zinc-900">{w.opens}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-zinc-600">{w.mobile}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-600">{w.desktop}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 pb-4 pt-8">
                  <div className="relative h-48">
                    {/* Recessive gridlines at the max and half-way */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-zinc-200">
                      <span className="absolute -top-2.5 right-0 bg-white pl-1 text-[11px] tabular-nums text-zinc-400">{maxOpens}</span>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-zinc-100" />
                    <div className="absolute inset-x-0 bottom-0 border-t border-zinc-300" />

                    <div className="absolute inset-0 flex items-end gap-0.5 pr-8">
                      {chartWeeks.map((w, i) => {
                        const isCurrent = i === chartWeeks.length - 1;
                        return (
                          <div key={w.week_start} className="group relative flex h-full flex-1 items-end justify-center">
                            <div
                              className={`w-full max-w-10 rounded-t ${isCurrent ? 'bg-red-400' : 'bg-red-700'} group-hover:bg-red-800`}
                              style={{ height: w.opens ? `${(w.opens / maxOpens) * 100}%` : '2px' }}
                            />
                            <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                              <p className="font-semibold">Week of {weekLabel(w.week_start)}{isCurrent ? ' (so far)' : ''}</p>
                              <p className="tabular-nums">{w.opens} opens · {w.mobile} mobile · {w.desktop} desktop</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-0.5 pr-8">
                    {chartWeeks.map((w, i) => (
                      <span key={w.week_start} className="flex-1 text-center text-[11px] text-zinc-500">
                        {i % 2 === (WEEKS_SHOWN - 1) % 2 ? weekLabel(w.week_start) : ''}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">The lighter bar is the current week, still counting.</p>
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-zinc-900">Where people opened it</h2>
                <p className="text-xs text-zinc-500 mt-0.5">All time, by link</p>
              </div>
              {sources.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-400">No opens recorded yet.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {sources.map((s) => (
                    <li key={s.source} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">{SOURCE_LABELS[s.source] ?? s.source}</p>
                        <p className="text-xs text-zinc-400">Last opened {new Date(s.last_opened_at).toLocaleString('en-GB')}</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-zinc-900">{s.opens}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
