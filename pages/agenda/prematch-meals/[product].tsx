import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import InlineNoticeBanner, { type InlineNotice } from '../../../components/InlineNotice';
import {
  type AnalyticsResponse,
  buyersForProduct,
  fetchPrematchMealsAnalytics,
  formatCurrency,
  getAvatarClass,
  getInitials,
} from '../../../lib/prematchMeals';

export default function PreMatchMealDetailPage() {
  const router = useRouter();
  const { product, days: daysQuery, productFilter: productFilterQuery, embedded: embeddedQuery } = router.query;

  const embedded = embeddedQuery === '1';
  const productName = typeof product === 'string' ? product : '';
  const days = typeof daysQuery === 'string' && parseInt(daysQuery, 10) > 0 ? parseInt(daysQuery, 10) : 90;
  const productFilter = typeof productFilterQuery === 'string' ? productFilterQuery : 'pre match';

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const load = async () => {
      setLoading(true);
      const result = await fetchPrematchMealsAnalytics(days, productFilter);

      if (!result.ok || !result.payload) {
        setNotice({ type: 'error', message: result.error || 'Failed to load sales analytics.' });
        setData(null);
      } else {
        setData(result.payload);
      }

      setLoading(false);
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, days, productFilter]);

  const currency = data?.currency || 'GBP';
  const stat = data?.byProduct?.find((p) => p.productName === productName);
  const buyers = data?.orders ? buyersForProduct(data.orders, productName) : [];

  const backHref = (() => {
    const params = new URLSearchParams({ days: String(days), productFilter });
    if (embedded) params.set('embedded', '1');
    return `/agenda/prematch-meals?${params.toString()}`;
  })();

  return (
    <main className="min-h-screen bg-gradient-to-b from-red-50/40 via-white to-white">
      <div className={embedded ? 'mx-auto w-full px-2 py-2' : 'mx-auto w-full max-w-4xl px-4 py-10'}>
        <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
          ← Back to Pre-Match Meals
        </Link>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-16 shadow-sm ring-1 ring-zinc-200">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-200 border-t-red-600" />
            <p className="mt-3 text-sm text-zinc-500">Loading buyer breakdown…</p>
          </div>
        ) : !stat ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
            <p className="text-3xl">🔍</p>
            <p className="mt-2 text-sm text-zinc-500">
              Couldn't find "{productName}" in the current date range. It may have sold outside this window.
            </p>
            <Link href={backHref} className="mt-3 inline-block text-sm font-medium text-red-700 hover:underline">
              ← Back to Pre-Match Meals
            </Link>
          </div>
        ) : (
          <>
            <header className="mb-8 flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-3xl shadow-md shadow-red-200">
                🍽️
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">{productName}</h1>
                <p className="mt-1 text-zinc-600">Buyer breakdown for this meal</p>
              </div>
            </header>

            <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 to-red-600" />
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50 text-2xl ring-1 ring-zinc-100">🎟️</span>
                  <div>
                    <p className="text-sm text-zinc-500">Sold</p>
                    <p className="mt-0.5 text-2xl font-bold text-zinc-900">{stat.quantity}</p>
                  </div>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-600" />
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50 text-2xl ring-1 ring-zinc-100">💷</span>
                  <div>
                    <p className="text-sm text-zinc-500">Revenue</p>
                    <p className="mt-0.5 text-2xl font-bold text-zinc-900">{formatCurrency(stat.revenue, currency)}</p>
                  </div>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-blue-600" />
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50 text-2xl ring-1 ring-zinc-100">👥</span>
                  <div>
                    <p className="text-sm text-zinc-500">Unique buyers</p>
                    <p className="mt-0.5 text-2xl font-bold text-zinc-900">{buyers.length}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-100 bg-zinc-50/60 px-6 py-4">
                <h2 className="text-base font-semibold text-zinc-900">Buyers</h2>
              </div>
              <div className="px-2 py-2 sm:px-4">
                {buyers.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-zinc-500">No buyer detail available for this meal.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {buyers.map((buyer, index) => (
                      <li
                        key={buyer.name}
                        className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 ${index % 2 === 1 ? 'bg-zinc-50/60' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarClass(buyer.name)}`}>
                            {getInitials(buyer.name)}
                          </span>
                          <span className="font-medium text-zinc-800">{buyer.name}</span>
                        </div>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
                          × {buyer.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
