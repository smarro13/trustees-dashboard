import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import InlineNoticeBanner, { type InlineNotice } from '../../../components/InlineNotice';
import {
  type AnalyticsResponse,
  buyersForProduct,
  discountCodesByCustomerForProduct,
  fetchPrematchMealsAnalytics,
  formatCurrency,
  getAvatarClass,
  getInitials,
} from '../../../lib/prematchMeals';

export default function PreMatchMealDetailPage() {
  const router = useRouter();
  const {
    product,
    days: daysQuery,
    productFilter: productFilterQuery,
    excludeUnitPrice: excludeUnitPriceQuery,
    embedded: embeddedQuery,
  } = router.query;

  const embedded = embeddedQuery === '1';
  const productName = typeof product === 'string' ? product : '';
  const days = typeof daysQuery === 'string' && parseInt(daysQuery, 10) > 0 ? parseInt(daysQuery, 10) : 90;
  const productFilter = typeof productFilterQuery === 'string' ? productFilterQuery : 'pre match';
  const excludeUnitPrice = typeof excludeUnitPriceQuery === 'string' ? excludeUnitPriceQuery : '';

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const load = async () => {
      setLoading(true);
      const result = await fetchPrematchMealsAnalytics(days, productFilter, excludeUnitPrice);

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
  }, [router.isReady, days, productFilter, excludeUnitPrice]);

  const currency = data?.currency || 'GBP';
  const stat = data?.byProduct?.find((p) => p.productName === productName);
  const buyers = data?.orders ? buyersForProduct(data.orders, productName) : [];
  const discountCodesByCustomer = data?.discountUsage
    ? discountCodesByCustomerForProduct(data.discountUsage, productName)
    : new Map<string, string[]>();

  const backHref = (() => {
    const params = new URLSearchParams({ days: String(days), productFilter });
    if (excludeUnitPrice) params.set('excludeUnitPrice', excludeUnitPrice);
    if (embedded) params.set('embedded', '1');
    return `/agenda/prematch-meals?${params.toString()}`;
  })();

  return (
    <main className="min-h-screen">
      <div className={embedded ? 'mx-auto w-full px-2 py-2' : 'mx-auto w-full max-w-4xl px-4 py-10'}>
        <Link href={backHref} className="mb-4 inline-block text-sm font-medium text-blue-600 hover:underline">
          ← Back to Pre-Match Meals
        </Link>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {loading ? (
          <p className="text-sm text-zinc-500">Loading buyer breakdown…</p>
        ) : !stat ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
            <p className="text-sm text-zinc-500">
              Couldn't find "{productName}" in the current date range. It may have sold outside this window.
            </p>
            <Link href={backHref} className="mt-3 inline-block text-sm font-medium text-red-700 hover:underline">
              ← Back to Pre-Match Meals
            </Link>
          </div>
        ) : (
          <>
            <header className="mb-8">
              <h1 className="text-3xl font-extrabold text-zinc-900">🍽️ {productName}</h1>
              <p className="mt-1 text-zinc-600">Buyer breakdown for this meal</p>
            </header>

            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-sm text-zinc-500">🎟️ Sold</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">{stat.quantity}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-sm text-zinc-500">💷 Revenue</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">{formatCurrency(stat.revenue, currency)}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-sm text-zinc-500">👥 Unique buyers</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900">{buyers.length}</p>
              </div>
            </section>

            <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-zinc-900">Buyers</h2>
              </div>
              <div className="px-2 py-2 sm:px-4">
                {buyers.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-zinc-500">No buyer detail available for this meal.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {buyers.map((buyer) => {
                      const discountCodes = discountCodesByCustomer.get(buyer.key);
                      return (
                        <li key={buyer.key} className="flex items-center justify-between gap-3 px-2 py-3">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarClass(buyer.name)}`}>
                              {getInitials(buyer.name)}
                            </span>
                            <div>
                              <p className="font-medium text-zinc-800">{buyer.name}</p>
                              {discountCodes && discountCodes.length > 0 && (
                                <p className="mt-0.5 text-xs font-medium text-amber-700">
                                  🏷️ Discount used ({discountCodes.join(', ')})
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
                            × {buyer.quantity}
                          </span>
                        </li>
                      );
                    })}
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
