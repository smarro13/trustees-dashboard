import { useState } from 'react';

type MarkOrderFulfilled = (orderId: string) => Promise<{ ok: boolean; error?: string }>;

// Shared by the Pre-Match Meals and 90th Anniversary Ties pages: shows a
// "Fulfilled" badge once Squarespace has the order marked fulfilled,
// otherwise a button that calls the shared /api/private/mark-order-fulfilled
// route. Takes the feature's own markOrderFulfilled helper (from
// lib/prematchMeals.ts or lib/anniversaryTies.ts) as a prop so this
// component has no dependency on either feature.
export default function FulfillmentAction({
  orderId,
  status,
  markOrderFulfilled,
  onFulfilled,
}: {
  orderId: string;
  status: string;
  markOrderFulfilled: MarkOrderFulfilled;
  onFulfilled: (orderId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'FULFILLED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
        ✓ Fulfilled
      </span>
    );
  }

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    const result = await markOrderFulfilled(orderId);
    setBusy(false);

    if (!result.ok) {
      setError(result.error || 'Failed to mark as fulfilled.');
      return;
    }

    onFulfilled(orderId);
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title="Marks the whole order as fulfilled in Squarespace, including any other items on it."
        className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
      >
        {busy ? 'Marking…' : 'Mark fulfilled'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
