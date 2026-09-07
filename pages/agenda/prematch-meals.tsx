import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import {
  type AnalyticsResponse,
  DAY_PRESETS,
  fetchPrematchMealsAnalytics,
  formatCurrency,
  getAvatarClass,
  getInitials,
} from '../../lib/prematchMeals';

export default function PreMatchMealsPage() {
  const router = useRouter();
  const embedded = router.query.embedded === '1';
  const [days, setDays] = useState(90);
  const [productFilter, setProductFilter] = useState('pre match');
  const [excludeUnitPrice, setExcludeUnitPrice] = useState('0.50');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setNotice(null);

    const result = await fetchPrematchMealsAnalytics(days, productFilter, excludeUnitPrice);

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
  const regularAttendees = data?.regularAttendees || [];

  // Detail links deliberately drop `embedded` and use target="_top": clicking a
  // meal should break out of the Commercial & Transformation iframe into a
  // real, full page — not navigate inside the small embedded frame.
  const detailHref = (productName: string) => {
    const params = new URLSearchParams({ days: String(days), productFilter });
    if (excludeUnitPrice.trim()) params.set('excludeUnitPrice', excludeUnitPrice.trim());
    return `/agenda/prematch-meals/${encodeURIComponent(productName)}?${params.toString()}`;
  };

  return (
    <main className="min-h-screen">
      <div className={embedded ? 'mx-auto w-full px-2 py-2' : 'mx-auto w-full max-w-6xl px-4 py-10'}>
        <header className={embedded ? 'mb-4' : 'mb-8'}>
          {!embedded && (
            <Link href="/agenda/commercial-transformation" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to Commercial & Transformation
            </Link>
          )}

          <h1 className="text-3xl font-extrabold text-zinc-900">🍽️ Pre-Match Meals</h1>
          <p className="mt-1 text-zinc-600">
            Live sales figures from{' '}
            <a
              href="https://www.aldwinians.co.uk/pre-match-meals"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              aldwinians.co.uk/pre-match-meals
            </a>
          </p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        <section className="mb-6 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-zinc-900">Filters</h2>
          </div>
          <div className="flex flex-wrap items-end gap-3 px-6 py-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Date range</label>
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Matches against the Squarespace product name — adjust if a fixture's listing is named differently.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Exclude price (£)</label>
              <input
                type="text"
                inputMode="decimal"
                value={excludeUnitPrice}
                onChange={(e) => setExcludeUnitPrice(e.target.value)}
                placeholder="0.50"
                className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">Leave blank to include everything.</p>
            </div>

            <button
              onClick={loadAnalytics}
              disabled={loading}
              className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </section>

        {loading && !data ? (
          <p className="text-sm text-zinc-500">Loading sales analytics…</p>
        ) : data ? (
          <>
            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-sm text-zinc-500">🎟️ Tickets/meals sold</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">{data.totalQuantity ?? 0}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-sm text-zinc-500">💷 Revenue</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">
                  {formatCurrency(data.totalRevenue ?? 0, currency)}
                </p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-sm text-zinc-500">🔁 Regular attendees</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">{regularAttendees.length}</p>
                <p className="mt-1 text-xs text-zinc-400">bought more than once in this range</p>
              </div>
            </section>

            <section className="mb-6 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-zinc-900">By meal</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Click a meal for the buyer breakdown.</p>
              </div>
              <div className="px-6 py-5">
                {!data.byProduct || data.byProduct.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No matching orders in this date range. Try widening the range or adjusting the product name filter.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {data.byProduct.map((p) => (
                      <Link
                        key={p.productName}
                        href={detailHref(p.productName)}
                        target="_top"
                        className="flex flex-col justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:bg-zinc-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold leading-snug text-zinc-900">{p.productName}</h3>
                          <span className="text-zinc-400">→</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-zinc-600">{p.quantity} sold</span>
                          <span className="font-semibold text-zinc-900">{formatCurrency(p.revenue, currency)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-zinc-900">Regular attendees</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Buyers with more than one order in this date range.</p>
              </div>
              <div className="px-2 py-2 sm:px-4">
                {regularAttendees.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-zinc-500">No repeat buyers in this date range yet.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {regularAttendees.map((attendee) => (
                      <li key={attendee.name} className="flex items-center justify-between gap-3 px-2 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarClass(attendee.name)}`}>
                            {getInitials(attendee.name)}
                          </span>
                          <span className="font-medium text-zinc-800">{attendee.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                            {attendee.orderCount} orders
                          </span>
                          <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                            {attendee.totalQuantity} meals
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {data.generatedAt && (
              <p className="mt-4 text-xs text-zinc-400">
                Last refreshed {new Date(data.generatedAt).toLocaleString('en-GB')}
              </p>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
