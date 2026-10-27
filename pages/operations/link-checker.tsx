import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import { authJsonHeaders } from '../../lib/authHeaders';
import type { LinkProblem } from '../../lib/linkChecker';

// Admin only (proxy.ts requires admin for this page, the API checks the role again).
// Broken links on the club website, found by the weekly link check
// (lib/linkChecker.ts, pages/api/cron/link-check.ts) or "Check now".

type RunSummary = {
  id: number;
  started_at: string;
  finished_at: string;
  triggered_by: string;
  pages_checked: number;
  links_checked: number;
  broken_count: number;
  blocked_count: number;
  truncated: boolean;
};

type Run = RunSummary & { site_url: string; problems: LinkProblem[] };

type Filter = 'broken' | 'blocked' | 'all';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

const pagePath = (url: string) => {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
};

const problemLabel = (p: LinkProblem) => {
  if (p.status === 404) return '404 Not found';
  if (p.status === 410) return '410 Gone';
  if (p.status !== null) return `Error ${p.status}`;
  return p.error || 'No response';
};

function StatTile({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'bad' | 'warn' | 'good' }) {
  const valueClass = tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-zinc-900';
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold tabular-nums ${valueClass}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

export default function LinkCheckerPage() {
  const [latest, setLatest] = useState<Run | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [filter, setFilter] = useState<Filter>('broken');

  const load = async (method: 'GET' | 'POST') => {
    const res = await fetch('/api/admin/link-check', { method, headers: await authJsonHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(body.error || `Request failed (${res.status})`);
    setLatest(body.latest);
    setHistory(body.history);
    return body.latest as Run | null;
  };

  useEffect(() => {
    load('GET')
      .catch((err) => setNotice({ type: 'error', message: `Failed to load link checks: ${err.message}` }))
      .finally(() => setLoading(false));
  }, []);

  const checkNow = async () => {
    setRunning(true);
    setNotice({ type: 'info', message: 'Checking the website… this takes up to a minute.' });
    try {
      const run = await load('POST');
      setNotice({
        type: run && run.broken_count ? 'error' : 'success',
        message: run
          ? `Checked ${run.pages_checked} pages and ${run.links_checked} links: ${run.broken_count} broken.`
          : 'Check finished.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: `Link check failed: ${err.message}` });
    } finally {
      setRunning(false);
    }
  };

  const problems = useMemo(
    () => (latest?.problems ?? []).filter((p) => filter === 'all' || p.kind === filter),
    [latest, filter],
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to dashboard
            </Link>
            <h1 className="text-3xl font-extrabold text-zinc-900">🔗 Website Link Checker</h1>
            <p className="mt-1 text-zinc-600">
              Every page of {latest ? shortUrl(latest.site_url) : 'the club website'} is checked for dead links and
              images each Monday. Links to other websites aren&rsquo;t checked. Admins only.
            </p>
          </div>
          <button
            type="button"
            onClick={checkNow}
            disabled={running}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-60"
          >
            {running ? 'Checking…' : 'Check now'}
          </button>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : !latest ? (
          <p className="rounded-2xl bg-white px-5 py-6 text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-200">
            No checks yet. Press &ldquo;Check now&rdquo; to run the first one.
          </p>
        ) : (
          <>
            <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Broken links"
                value={String(latest.broken_count)}
                detail="Dead pages, files or images"
                tone={latest.broken_count ? 'bad' : 'good'}
              />
              <StatTile
                label="Couldn't check"
                value={String(latest.blocked_count)}
                detail="Password-protected or blocked pages"
                tone={latest.blocked_count ? 'warn' : undefined}
              />
              <StatTile label="Pages checked" value={String(latest.pages_checked)} detail={`${latest.links_checked} links in total`} />
              <StatTile label="Last checked" value={new Date(latest.finished_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} detail={`${formatDate(latest.finished_at)} · ${latest.triggered_by}`} />
            </section>

            {latest.truncated && (
              <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                The last check ran out of time before reaching every link, so some may not have been checked.
              </p>
            )}

            <section className="mb-8 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Problems found</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">From the check on {formatDate(latest.finished_at)}</p>
                </div>
                <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-xs font-medium">
                  {([
                    ['broken', `Broken (${latest.broken_count})`],
                    ['blocked', `Couldn't check (${latest.blocked_count})`],
                    ['all', 'All'],
                  ] as [Filter, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      className={`rounded-md px-2.5 py-1 ${filter === value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {problems.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-500">
                  {filter === 'blocked' ? 'Every page answered the check.' : '✅ No broken links found.'}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {problems.map((p) => (
                    <li key={p.url} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-sm font-medium text-blue-700 hover:underline"
                          >
                            {shortUrl(p.url)}
                          </a>
                          {p.text && <p className="mt-0.5 text-xs text-zinc-500">Link text: &ldquo;{p.text}&rdquo;</p>}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.kind === 'broken' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}
                          >
                            {problemLabel(p)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-zinc-600">
                        On:{' '}
                        {p.found_on.map((page, i) => (
                          <span key={page}>
                            {i > 0 && ', '}
                            <a href={page} target="_blank" rel="noreferrer" className="text-zinc-800 underline decoration-zinc-300 hover:decoration-zinc-600">
                              {pagePath(page)}
                            </a>
                          </span>
                        ))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-zinc-900">Recent checks</h2>
              </div>
              <div className="overflow-x-auto px-5 py-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="py-2 pr-4 font-semibold">When</th>
                      <th className="py-2 pr-4 font-semibold">By</th>
                      <th className="py-2 pr-4 text-right font-semibold">Pages</th>
                      <th className="py-2 pr-4 text-right font-semibold">Links</th>
                      <th className="py-2 pr-4 text-right font-semibold">Broken</th>
                      <th className="py-2 text-right font-semibold">Couldn&rsquo;t check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {history.map((run) => (
                      <tr key={run.id}>
                        <td className="py-2 pr-4 text-zinc-900">
                          {formatDate(run.started_at)}
                          {run.truncated && <span className="ml-1 text-xs text-amber-700">(partial)</span>}
                        </td>
                        <td className="py-2 pr-4 text-zinc-600">{run.triggered_by}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-zinc-600">{run.pages_checked}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-zinc-600">{run.links_checked}</td>
                        <td className={`py-2 pr-4 text-right font-semibold tabular-nums ${run.broken_count ? 'text-rose-700' : 'text-zinc-900'}`}>
                          {run.broken_count}
                        </td>
                        <td className="py-2 text-right tabular-nums text-zinc-600">{run.blocked_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
