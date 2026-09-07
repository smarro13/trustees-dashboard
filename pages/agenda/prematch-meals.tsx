import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import { type AnalyticsResponse, DAY_PRESETS, fetchPrematchMealsAnalytics, formatCurrency } from '../../lib/prematchMeals';

const STAT_CARDS = [
  { key: 'quantity', icon: '🎟️', label: 'Tickets/meals sold', accent: 'from-red-500 to-red-600' },
  { key: 'revenue', icon: '💷', label: 'Revenue', accent: 'from-emerald-500 to-emerald-600' },
  { key: 'orders', icon: '🧾', label: 'Matching orders', accent: 'from-blue-500 to-blue-600' },
] as const;

export default function PreMatchMealsPage() {
  const router = useRouter();
  const embedded = router.query.embedded === '1';
  const [days, setDays] = useState(90);
  const [productFilter, setProductFilter] = useState('pre match');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setNotice(null);

    const result = await fetchPrematchMealsAnalytics(days, productFilter);

    if (!result.ok || !result.payload) {
      setNotice({ type: 'error', message: result.error || 'Failed to load sales analytics.' });
      setData(null);
    } else {
      setData(result.payload);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currency = data?.currency || 'GBP';

  const statValues: Record<(typeof STAT_CARDS)[number]['key'], string> = {
    quantity: String(data?.totalQuantity ?? 0),
    revenue: formatCurrency(data?.totalRevenue ?? 0, currency),
    orders: String(data?.matchedOrderCount ?? 0),
  };

  // Detail links deliberately drop `embedded` and use target="_top": clicking a
  // meal should break out of the Commercial & Transformation iframe into a
  // real, full page — not navigate inside the small embedded frame.
  const detailHref = (productName: string) => {
    const params = new URLSearchParams({ days: String(days), productFilter });
    return `/agenda/prematch-meals/${encodeURIComponent(productName)}?${params.toString()}`;
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-red-50/40 via-white to-white">
      <div className={embedded ? 'mx-auto w-full px-2 py-2' : 'mx-auto w-full max-w-6xl px-4 py-10'}>
        <header className={embedded ? 'mb-4' : 'mb-8'}>
          {!embedded && (
            <Link href="/agenda/commercial-transformation" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
              ← Back to Commercial & Transformation
            </Link>
          )}

          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-3xl shadow-md shadow-red-200">
              🍽️
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Pre-Match Meals</h1>
              <p className="mt-1 text-zinc-600">
                Live sales figures from{' '}
                <a
                  href="https://www.aldwinians.co.uk/pre-match-meals"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-red-700 hover:underline"
                >
                  aldwinians.co.uk/pre-match-meals
                </a>
              </p>
            </div>
          </div>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        <section className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-100 bg-zinc-50/60 px-6 py-4">
            <h2 className="text-base font-semibold text-zinc-900">Filters</h2>
          </div>
          <div className="flex flex-wrap items-end gap-4 px-6 py-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Date range</label>
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              >
                {DAY_PRESETS.map((preset) => (
                  <option key={preset.days} value={preset.days}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Product name contains</label>
              <input
                type="text"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                placeholder="pre match"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Matches against the Squarespace product name — adjust if a fixture's listing is named differently.
              </p>
            </div>

            <button
              onClick={loadAnalytics}
              disabled={loading}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 hover:shadow disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </section>

        {loading && !data ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-16 shadow-sm ring-1 ring-zinc-200">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-200 border-t-red-600" />
            <p className="mt-3 text-sm text-zinc-500">Loading sales analytics…</p>
          </div>
        ) : data ? (
          <>
            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {STAT_CARDS.map((card) => (
                <div
                  key={card.key}
                  className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 transition hover:shadow-md"
                >
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-50 text-2xl ring-1 ring-zinc-100">
                      {card.icon}
                    </span>
                    <div>
                      <p className="text-sm text-zinc-500">{card.label}</p>
                      <p className="mt-0.5 text-2xl font-bold text-zinc-900">{statValues[card.key]}</p>
                    </div>
                  </div>
                  {card.key === 'orders' && (
                    <p className="mt-2 text-xs text-zinc-400">
                      out of {data.totalOrdersScanned ?? 0} orders scanned in range
                    </p>
                  )}
                </div>
              ))}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900">By meal</h2>
                <p className="text-sm text-zinc-500">Click a meal for the buyer breakdown</p>
              </div>

              {!data.byProduct || data.byProduct.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
                  <p className="text-3xl">🍽️</p>
                  <p className="mt-2 text-sm text-zinc-500">
                    No matching orders in this date range. Try widening the range or adjusting the product name filter.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.byProduct.map((p) => (
                    <Link
                      key={p.productName}
                      href={detailHref(p.productName)}
                      target="_top"
                      className="group flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-red-200"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-xl">
                            🍽️
                          </span>
                          <h3 className="text-base font-semibold leading-snug text-zinc-900">{p.productName}</h3>
                        </div>
                        <span className="mt-1 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-red-500">
                          →
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-zinc-400">Sold</p>
                          <p className="text-lg font-bold text-zinc-900">{p.quantity}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wide text-zinc-400">Revenue</p>
                          <p className="text-lg font-bold text-emerald-700">{formatCurrency(p.revenue, currency)}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {data.generatedAt && (
              <p className="mt-6 text-center text-xs text-zinc-400">
                Last refreshed {new Date(data.generatedAt).toLocaleString('en-GB')}
              </p>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
