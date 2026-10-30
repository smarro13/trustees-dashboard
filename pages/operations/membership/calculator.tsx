import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { loadMembershipData, type MembershipMember } from '../../../lib/membershipSummary';
import {
  CURRENT_PRICES,
  EXAMPLE_ACCOUNTS,
  MEMBERSHIP_LABELS,
  MULTIPLE_DISCOUNT_PENCE,
  PRICE_ROWS,
  increaseByPercent,
  monthlyIncome,
  priceAccount,
  type AccountMembership,
  type PriceKey,
  type Prices,
} from '../../../lib/membershipPricing';

// Membership price calculator, opened from /operations/membership: try a
// percentage rise or individual prices and see what it does to the club's
// monthly income and what example accounts would pay. Nothing is saved. Members
// are loaded for the income totals only and never shown; RLS and proxy.ts guard
// them, as on the detailed report.

const money = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signedMoney = (pence: number) => `${pence < 0 ? '-' : '+'}${money(Math.abs(pence))}`;

const signedPercent = (from: number, to: number) => {
  if (from === 0) return '';
  const percent = ((to - from) / from) * 100;
  return ` (${percent < 0 ? '-' : '+'}${Math.abs(percent).toFixed(1)}%)`;
};

// null for a blank, negative or unreadable box, so the page falls back to its
// default rather than showing a wrong figure.
const readPence = (value: string) => {
  const pounds = Number(value);
  return value.trim() === '' || !Number.isFinite(pounds) || pounds < 0 ? null : Math.round(pounds * 100);
};

const INPUT = 'rounded-lg border border-zinc-300 bg-white px-3 py-2 text-right text-sm text-zinc-900 tabular-nums';

const PICKABLE_MEMBERSHIPS = Object.keys(MEMBERSHIP_LABELS) as AccountMembership[];

function comparePrices(
  memberships: AccountMembership[],
  prices: Prices,
  multipleDiscount: number,
  excluded: ReadonlySet<PriceKey>,
) {
  const current = priceAccount(memberships, CURRENT_PRICES, MULTIPLE_DISCOUNT_PENCE);
  const proposed = priceAccount(memberships, prices, multipleDiscount, excluded);
  return {
    current,
    proposed,
    currentTotal: current.reduce((sum, pence) => sum + pence, 0),
    proposedTotal: proposed.reduce((sum, pence) => sum + pence, 0),
  };
}

function AccountTable({
  memberships,
  costs,
  onRemove,
}: {
  memberships: AccountMembership[];
  costs: ReturnType<typeof comparePrices>;
  onRemove?: (index: number) => void;
}) {
  return (
    <>
      <table className="mt-3 w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th scope="col" className="py-1 font-semibold">Membership</th>
            <th scope="col" className="py-1 text-right font-semibold">Current</th>
            <th scope="col" className="py-1 text-right font-semibold">New</th>
            {onRemove && <th scope="col" className="w-8 py-1"><span className="sr-only">Remove</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {memberships.map((membership, index) => (
            <tr key={`${membership}-${index}`}>
              <td className="py-1.5 pr-3 text-zinc-700">{MEMBERSHIP_LABELS[membership]}</td>
              <td className="py-1.5 text-right tabular-nums text-zinc-700">{money(costs.current[index])}</td>
              <td className="py-1.5 text-right tabular-nums text-zinc-700">{money(costs.proposed[index])}</td>
              {onRemove && (
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    aria-label={`Remove ${MEMBERSHIP_LABELS[membership]}`}
                    onClick={() => onRemove(index)}
                    className="rounded px-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-zinc-300 font-semibold text-zinc-900">
          <tr>
            <td className="pt-2">Total per month</td>
            <td className="pt-2 text-right tabular-nums">{money(costs.currentTotal)}</td>
            <td className="pt-2 text-right tabular-nums">{money(costs.proposedTotal)}</td>
            {onRemove && <td />}
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-right text-sm tabular-nums text-zinc-600">
        {costs.proposedTotal === costs.currentTotal
          ? 'No change'
          : `${signedMoney(costs.proposedTotal - costs.currentTotal)}${signedPercent(costs.currentTotal, costs.proposedTotal)}`}
      </p>
    </>
  );
}

export default function MembershipCalculatorPage() {
  const [percent, setPercent] = useState('');
  const [overrides, setOverrides] = useState<Partial<Record<PriceKey, string>>>({});
  const [discount, setDiscount] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<PriceKey>>(new Set());
  const [customAccount, setCustomAccount] = useState<AccountMembership[]>([]);
  const [members, setMembers] = useState<MembershipMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    loadMembershipData()
      .then((data) => setMembers(data.members))
      .catch(() => setLoadFailed(true));
  }, []);

  const percentValue = Math.max(0, Number(percent) || 0);
  const multipleDiscount = readPence(discount) ?? MULTIPLE_DISCOUNT_PENCE;

  const increased = useMemo(
    () => Object.fromEntries(PRICE_ROWS.map((row) => [row.key, increaseByPercent(row.pence, percentValue)])) as Prices,
    [percentValue],
  );

  const newPrices = useMemo(
    () =>
      Object.fromEntries(
        PRICE_ROWS.map((row) => [row.key, readPence(overrides[row.key] ?? '') ?? increased[row.key]]),
      ) as Prices,
    [increased, overrides],
  );

  const examples = useMemo(
    () =>
      EXAMPLE_ACCOUNTS.map((account) => ({
        ...account,
        costs: comparePrices(account.memberships, newPrices, multipleDiscount, excluded),
      })),
    [newPrices, multipleDiscount, excluded],
  );

  const customCosts = comparePrices(customAccount, newPrices, multipleDiscount, excluded);

  const income = useMemo(
    () => (members ? monthlyIncome(members, newPrices, multipleDiscount, excluded) : null),
    [members, newPrices, multipleDiscount, excluded],
  );
  const monthlyIncrease = income ? income.proposed - income.current : 0;

  const toggleExcluded = (key: PriceKey) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const changed = percent !== '' || discount !== '' || excluded.size > 0 || Object.values(overrides).some(Boolean);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <header className="mb-8">
          <Link href="/operations/membership" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Membership
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">🧮 Membership calculator</h1>
          <p className="mt-1 text-zinc-600">Try new monthly prices and see what they would do to example accounts. Nothing here is saved.</p>
        </header>

        <section className="mb-8 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-6">
          <div className="flex flex-wrap items-end gap-6">
            <label className="text-sm font-medium text-zinc-800">
              Increase all prices by
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  value={percent}
                  onChange={(event) => setPercent(event.target.value)}
                  placeholder="0"
                  className={`${INPUT} w-24`}
                />
                %
              </span>
            </label>
            <label className="text-sm font-medium text-zinc-800">
              Multiple membership discount
              <span className="mt-1 flex items-center gap-2">
                £
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  placeholder={(MULTIPLE_DISCOUNT_PENCE / 100).toFixed(2)}
                  className={`${INPUT} w-24`}
                />
              </span>
            </label>
            {changed && (
              <button
                type="button"
                onClick={() => {
                  setPercent('');
                  setDiscount('');
                  setOverrides({});
                  setExcluded(new Set());
                }}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Reset
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            The percentage doesn&rsquo;t change the multiple membership discount, which stays at the amount shown.
          </p>
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Membership</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Current</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">New price</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Change</th>
                  <th scope="col" className="px-4 py-3 text-center font-semibold">Exclude from discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {PRICE_ROWS.map((row, index) => {
                  const difference = newPrices[row.key] - row.pence;
                  const parent = row.discounted ? PRICE_ROWS[index - 1].label : null;
                  return (
                    <tr key={row.key}>
                      <td className={row.discounted ? 'px-4 py-2 pl-8 text-zinc-600' : 'px-4 py-2 font-medium text-zinc-900'}>
                        {row.label}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-700">{money(row.pence)}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`New price for ${parent ? `${parent} ${row.label}` : row.label}`}
                          value={overrides[row.key] ?? ''}
                          onChange={(event) => setOverrides((prev) => ({ ...prev, [row.key]: event.target.value }))}
                          placeholder={(increased[row.key] / 100).toFixed(2)}
                          className={`${INPUT} w-24`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-zinc-700">
                        {difference === 0 ? '–' : `${signedMoney(difference)}${signedPercent(row.pence, newPrices[row.key])}`}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {!row.discounted && (
                          <input
                            type="checkbox"
                            aria-label={`Exclude ${row.label} from discount`}
                            checked={excluded.has(row.key)}
                            onChange={() => toggleExcluded(row.key)}
                            className="h-4 w-4 rounded border-zinc-300"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
            Type in a new price to override the percentage for that membership. Leave it blank to use the price shown.
            A membership excluded from discount pays its full new price, and still counts towards other memberships&rsquo; discounts.
          </p>
        </section>

        <section className="mb-8 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200 sm:p-6">
          <h2 className="text-xl font-bold text-zinc-900">Income</h2>
          {loadFailed ? (
            <p className="mt-2 text-sm text-rose-700">Couldn&rsquo;t load the membership data, so income can&rsquo;t be shown.</p>
          ) : !income ? (
            <p className="mt-2 text-sm text-zinc-500">Loading…</p>
          ) : income.members === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No ClubControl members fetched yet.</p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  { label: 'Current per month', value: money(income.current) },
                  { label: 'New per month', value: money(income.proposed) },
                  { label: 'Change per month', value: monthlyIncrease === 0 ? '–' : signedMoney(monthlyIncrease) },
                  { label: 'Change per year', value: monthlyIncrease === 0 ? '–' : signedMoney(monthlyIncrease * 12) },
                ].map((tile) => (
                  <div key={tile.label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{tile.label}</dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{tile.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-zinc-600">
                What the {income.members} active members on ClubControl are charged, from the latest fetch, keeping each
                member&rsquo;s current discount unless their membership is excluded. Includes {money(income.lotto)} of Presidents Lotto, which doesn&rsquo;t
                change. Assumes nobody leaves or changes membership.
              </p>
            </>
          )}
        </section>

        <section className="mb-8 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-zinc-900">Custom account</h2>
            {customAccount.length > 0 && (
              <button
                type="button"
                onClick={() => setCustomAccount([])}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-600">Click a membership to add it to the account. Click again to add another.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PICKABLE_MEMBERSHIPS.map((membership) => (
              <button
                key={membership}
                type="button"
                onClick={() => setCustomAccount((prev) => [...prev, membership])}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                + {MEMBERSHIP_LABELS[membership]}
              </button>
            ))}
          </div>
          {customAccount.length > 0 && (
            <AccountTable
              memberships={customAccount}
              costs={customCosts}
              onRemove={(index) => setCustomAccount((prev) => prev.filter((_, i) => i !== index))}
            />
          )}
        </section>

        <section>
          <h2 className="text-xl font-bold text-zinc-900">Example accounts</h2>
          <p className="mb-4 mt-1 text-sm text-zinc-600">
            Monthly cost for combinations based on the ClubControl members export, with no member details.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {examples.map((example) => (
              <article key={example.title} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
                <h3 className="font-semibold text-zinc-900">{example.title}</h3>
                <AccountTable memberships={example.memberships} costs={example.costs} />
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
