import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import { type AnalyticsResponse, type OrderLineItem, fetchPrematchMealsAnalytics } from '../../lib/prematchMeals';

// Halloween Family Fun Night (Sat 31 Oct 2026) is sold as a Squarespace store
// product on /events. The orders API is shared with pre-match meals; it just
// filters on a different product name. Tickets are per child, so the
// quantity on an order is the number of children.
const PRODUCT_FILTER = 'halloween';
const LOOKBACK_DAYS = 120;

type Child = { id: string; name: string; bookedBy: string; named: boolean };

// The child's name comes from the product's form. Prefer a field labelled
// "child" or "name"; fall back to the first answer.
const childNameAnswer = (line: OrderLineItem) => {
  const answers = line.formAnswers || [];
  return (
    answers.find((a) => /child/i.test(a.label)) ||
    answers.find((a) => /name/i.test(a.label)) ||
    answers[0]
  )?.value;
};

// One row per child. A parent booking two children may type both names in
// one box ("Amy, Ben" / "Amy & Ben"), so split those out. If fewer names
// than tickets were given, the rest show as unnamed under the buyer.
const buildChildren = (orders: OrderLineItem[]): Child[] => {
  const children: Child[] = [];
  for (const line of orders) {
    const names = (childNameAnswer(line) || '')
      .split(/\s*(?:\n|,|;|&|\+|\band\b)\s*/i)
      .map((n) => n.trim())
      .filter(Boolean);
    const count = Math.max(line.quantity, names.length);
    for (let i = 0; i < count; i += 1) {
      children.push({
        id: `${line.orderId}-${line.productName}-${i}`,
        name: names[i] || `Unnamed child`,
        bookedBy: line.customerName,
        named: Boolean(names[i]),
      });
    }
  }
  return children.sort((a, b) => Number(b.named) - Number(a.named) || a.name.localeCompare(b.name));
};

export default function HalloweenPage() {
  const router = useRouter();
  const embedded = router.query.embedded === '1';
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [search, setSearch] = useState('');

  const loadOrders = async () => {
    setLoading(true);
    setNotice(null);

    const result = await fetchPrematchMealsAnalytics(LOOKBACK_DAYS, PRODUCT_FILTER);

    if (!result.ok || !result.payload) {
      setNotice({ type: 'error', message: result.error || 'Failed to load Halloween bookings.' });
      setData(null);
    } else {
      setData(result.payload);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const children = useMemo(() => buildChildren(data?.orders || []), [data]);
  const visibleChildren = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return children;
    return children.filter((c) => c.name.toLowerCase().includes(term) || c.bookedBy.toLowerCase().includes(term));
  }, [children, search]);

  return (
    <main className="min-h-screen">
      <div className={embedded ? 'mx-auto w-full px-2 py-2' : 'mx-auto w-full max-w-3xl px-4 py-10 print:max-w-none print:p-0'}>
        <header className="mb-6 print:mb-4">
          {!embedded && (
            <Link href="/agenda/commercial-transformation" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline print:hidden">
              ← Back to Commercial & Transformation
            </Link>
          )}
          <h1 className="text-3xl font-extrabold text-zinc-900">🎃 Halloween Family Fun Night</h1>
          <p className="mt-1 text-zinc-600">Saturday 31 October 2026, 7pm–10pm · Door list</p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {loading && !data ? (
          <p className="text-sm text-zinc-500">Loading bookings…</p>
        ) : data ? (
          <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200 print:shadow-none print:ring-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 print:px-0">
              <p className="text-lg font-semibold text-zinc-900">
                {children.length} {children.length === 1 ? 'child' : 'children'} booked
              </p>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a name"
                  className="w-48 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => window.print()}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Print
                </button>
                <button
                  onClick={loadOrders}
                  disabled={loading}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>

            {children.length === 0 ? (
              <p className="px-6 py-5 text-sm text-zinc-500">No Halloween bookings yet.</p>
            ) : visibleChildren.length === 0 ? (
              <p className="px-6 py-5 text-sm text-zinc-500">No names match &ldquo;{search}&rdquo;.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {visibleChildren.map((child) => (
                  <li key={child.id} className="break-inside-avoid px-6 py-2.5 print:px-0">
                    <label className="flex cursor-pointer items-center gap-4">
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-red-600" />
                      <span className={`text-base ${child.named ? 'font-medium text-zinc-900' : 'italic text-zinc-500'}`}>
                        {child.name}
                      </span>
                      <span className="ml-auto text-xs text-zinc-400">booked by {child.bookedBy}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
