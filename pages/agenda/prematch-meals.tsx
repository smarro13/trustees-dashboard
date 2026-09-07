import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';

type ProductStat = {
  productName: string;
  quantity: number;
  revenue: number;
};

type AnalyticsResponse = {
  ok: boolean;
  error?: string;
  dateRange?: { from: string; to: string };
  productFilter?: string;
  totalOrdersScanned?: number;
  matchedOrderCount?: number;
  totalQuantity?: number;
  totalRevenue?: number;
  currency?: string;
  byProduct?: ProductStat[];
  generatedAt?: string;
};

const DAY_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 6 months', days: 182 },
  { label: 'Last 12 months', days: 365 },
];

const formatCurrency = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
  } catch {
    return `£${value.toFixed(2)}`;
  }
};

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

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setNotice({ type: 'error', message: 'You are not logged in.' });
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ days: String(days), productFilter });

    try {
      const response = await fetch(`/api/private/prematch-meals-orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as AnalyticsResponse;

      if (!response.ok || !payload.ok) {
        setNotice({ type: 'error', message: payload.error || 'Failed to load sales analytics.' });
        setData(null);
        setLoading(false);
        return;
      }

      setData(payload);
    } catch (err) {
      setNotice({ type: 'error', message: 'Failed to reach the analytics API.' });
      setData(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currency = data?.currency || 'GBP';

  return (
    <main className="min-h-screen">
      <div className={embedded ? 'mx-auto w-full px-2 py-2' : 'mx-auto w-full max-w-6xl px-4 py-10'}>
        <header className={embedded ? 'mb-4' : 'mb-8'}>
          {!embedded && (
            <Link href="/agenda/commercial-transformation" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to Commercial & Transformation
            </Link>
          )}

          <h1 className="text-3xl font-extrabold text-zinc-900">Pre-Match Meals</h1>
          <p className="mt-1 text-zinc-600">
            Live sales figures pulled from the club shop, sourced from{' '}
            <a
              href="https://www.aldwinians.co.uk/pre-match-meals"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              aldwinians.co.uk/pre-match-meals
            </a>
            .
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
                <p className="text-sm text-zinc-500">Tickets/meals sold</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">{data.totalQuantity ?? 0}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-sm text-zinc-500">Revenue</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">
                  {formatCurrency(data.totalRevenue ?? 0, currency)}
                </p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-sm text-zinc-500">Matching orders</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">{data.matchedOrderCount ?? 0}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  out of {data.totalOrdersScanned ?? 0} orders scanned in range
                </p>
              </div>
            </section>

            <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-zinc-900">By product</h2>
              </div>
              <div className="px-6 py-5">
                {!data.byProduct || data.byProduct.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No matching orders in this date range. Try widening the range or adjusting the product name filter.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700">Product</th>
                          <th className="px-3 py-2 text-right font-semibold text-zinc-700">Quantity</th>
                          <th className="px-3 py-2 text-right font-semibold text-zinc-700">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {data.byProduct.map((p) => (
                          <tr key={p.productName}>
                            <td className="px-3 py-2 text-zinc-800">{p.productName}</td>
                            <td className="px-3 py-2 text-right text-zinc-800">{p.quantity}</td>
                            <td className="px-3 py-2 text-right text-zinc-800">{formatCurrency(p.revenue, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
