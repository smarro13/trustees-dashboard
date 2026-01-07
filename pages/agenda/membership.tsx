import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function MembershipReportPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [numPeople, setNumPeople] = useState<string>('');
  const [moneyTotal, setMoneyTotal] = useState<string>(''); // Bottomline only
  const [loading, setLoading] = useState(false);
  const [loveAdminNewSignups, setLoveAdminNewSignups] = useState<string>('');
  const [loveAdminOutstandingTotal, setLoveAdminOutstandingTotal] = useState<string>('');
  const [loveAdminCancellations, setLoveAdminCancellations] = useState<string>('');
  const [loveAdminTotal, setLoveAdminTotal] = useState<string>(''); // LoveAdmin only

  // New: outstanding payments by category
  const outstandingCategories = [
    'Child',
    'Female Player',
    'Girls',
    'Male Player',
    'Mini Winnies',
    'Non Player (Social)',
    'Non Player (Gym)',
    'Student - Unemployed',
    'Vets - Infrequent Player',
    'Presidents Lotto',
  ] as const;
  type OutstandingCategory = (typeof outstandingCategories)[number];

  const [selectedOutstandingCategory, setSelectedOutstandingCategory] =
    useState<OutstandingCategory | ''>('');

  type OutstandingLine = {
    id: number;
    category: OutstandingCategory;
    memberName: string;
    amount: string;
  };

  const [outstandingLines, setOutstandingLines] = useState<OutstandingLine[]>(
    [],
  );

  // New: cancellations by category – just number of people
  const [selectedCancellationCategory, setSelectedCancellationCategory] =
    useState<OutstandingCategory | ''>('');

  type CancellationLine = {
    id: number;
    category: OutstandingCategory;
    count: string;
  };

  const [cancellationLines, setCancellationLines] = useState<CancellationLine[]>(
    [],
  );

  // combined = Bottomline + LoveAdmin totals (only these two)
  const combinedMoneyTotal = (() => {
    const bottom = Number.isFinite(parseFloat(moneyTotal)) ? parseFloat(moneyTotal) : 0;
    const la = Number.isFinite(parseFloat(loveAdminTotal)) ? parseFloat(loveAdminTotal) : 0;
    const sum = bottom + la;
    return sum === 0 && !moneyTotal && !loveAdminTotal ? '' : sum.toFixed(2);
  })();

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('membership_reports')
      .select(`*, meetings ( meeting_date )`)
      .order('created_at', { ascending: false });

    if (data) setReports(data);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true });

    if (meetingsData) setMeetings(meetingsData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveReport = async () => {
    await supabase.from('membership_reports').insert({
      meeting_id: meetingId,
      bottom_line: null,

      num_people: numPeople ? Number(numPeople) : null,

      // Bottomline Total (£)
      money_total: moneyTotal ? Number(moneyTotal) : null,

      // LoveAdmin
      loveadmin_total: loveAdminTotal ? Number(loveAdminTotal) : null,
      loveadmin_new_signups: loveAdminNewSignups
        ? Number(loveAdminNewSignups)
        : null,
      loveadmin_outstanding_total: loveAdminOutstandingTotal
        ? Number(loveAdminOutstandingTotal)
        : null,
      loveadmin_cancellations: loveAdminCancellations
        ? Number(loveAdminCancellations)
        : null,

      // Details (strip local id before saving)
      outstanding_lines: outstandingLines.map(({ id, ...rest }) => rest),
      cancellation_lines: cancellationLines.map(({ id, ...rest }) => rest),
    });

    setMeetingId(null);
    setNumPeople('');
    setMoneyTotal('');
    setLoveAdminNewSignups('');
    setLoveAdminOutstandingTotal('');
    setLoveAdminCancellations('');
    setLoveAdminTotal('');
    setOutstandingLines([]);
    setSelectedOutstandingCategory('');
    setCancellationLines([]);
    setSelectedCancellationCategory('');
    loadData();
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // TODO: parse CSV and update state / Supabase as needed
    // You might use PapaParse or FileReader here.
  };

  // helpers to manage outstandingLines for selected category
  const addOutstandingLine = () => {
    if (!selectedOutstandingCategory) return;
    setOutstandingLines((prev) => [
      ...prev,
      {
        id: Date.now(),
        category: selectedOutstandingCategory,
        memberName: '',
        amount: '',
      },
    ]);
  };

  const updateOutstandingLine = (
    id: number,
    field: 'memberName' | 'amount',
    value: string,
  ) => {
    setOutstandingLines((prev) =>
      prev.map((line) =>
        line.id === id ? { ...line, [field]: value } : line,
      ),
    );
  };

  const linesForSelectedCategory = outstandingLines.filter(
    (l) => l.category === selectedOutstandingCategory,
  );

  // New: helpers for cancellations
  const addCancellationLine = () => {
    if (!selectedCancellationCategory) return;
    setCancellationLines((prev) => [
      ...prev,
      {
        id: Date.now(),
        category: selectedCancellationCategory as OutstandingCategory,
        count: '',
      },
    ]);
  };

  const updateCancellationLine = (id: number, value: string) => {
    setCancellationLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, count: value } : line)),
    );
  };

  const cancellationsForSelectedCategory = cancellationLines.filter(
    (l) => l.category === selectedCancellationCategory,
  );

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Membership Report
          </h1>
          <p className="mt-1 text-zinc-600">
            Membership updates from Bottomline and LoveAdmin
          </p>
        </header>

        {/* Bottom line section */}
        <section className="mb-10 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <h2 className="pc-name text-xl font-semibold">
              Bottom line
            </h2>
          </div>

          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-4">
            {/* Number of people */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                Number of people
              </label>
              <input
                type="number"
                placeholder="Number of people"
                value={numPeople}
                onChange={(e) => setNumPeople(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                min={0}
              />
            </div>

            {/* Bottomline Total (£) – bound ONLY to moneyTotal */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                Bottomline Total (£)
              </label>
              <input
                type="number"
                placeholder="Total amount in pounds from Bottomline"
                value={moneyTotal}
                onChange={(e) => setMoneyTotal(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                min={0}
                step="0.01"
              />
            </div>

            {/* CSV upload */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                Upload CSV
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-red-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-red-700"
              />
            </div>
          </div>
        </section>

        {/* LoveAdmin block */}
        <section className="mb-10 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <h2 className="pc-name text-xl font-semibold">LoveAdmin</h2>
          </div>
          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-4">
            {/* New sign ups */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                New sign ups
              </label>
              <input
                type="number"
                min={0}
                placeholder="Number of new sign ups"
                value={loveAdminNewSignups}
                onChange={(e) => setLoveAdminNewSignups(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </div>

            {/* LoveAdmin Total (£) – bound ONLY to loveAdminTotal */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                LoveAdmin Total (£)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Total amount from LoveAdmin"
                value={loveAdminTotal}
                onChange={(e) => setLoveAdminTotal(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </div>

            {/* Outstanding payments: category selector + expandable fields */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-700">
                Outstanding payments category
              </label>
              <select
                value={selectedOutstandingCategory}
                onChange={(e) =>
                  setSelectedOutstandingCategory(
                    e.target.value as OutstandingCategory | '',
                  )
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">Select a category (optional)</option>
                {outstandingCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* Only allow adding / editing when a category is selected */}
              {selectedOutstandingCategory && (
                <div className="mt-2 space-y-2">
                  <button
                    type="button"
                    onClick={addOutstandingLine}
                    className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-900"
                  >
                    Add outstanding payment
                  </button>

                  {linesForSelectedCategory.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {linesForSelectedCategory.map((line) => (
                        <div
                          key={line.id}
                          className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2 sm:flex-row sm:items-center"
                        >
                          <input
                            type="text"
                            placeholder="Member name"
                            value={line.memberName}
                            onChange={(e) =>
                              updateOutstandingLine(
                                line.id,
                                'memberName',
                                e.target.value,
                              )
                            }
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="Amount (£)"
                            value={line.amount}
                            onChange={(e) =>
                              updateOutstandingLine(
                                line.id,
                                'amount',
                                e.target.value,
                              )
                            }
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm sm:w-32"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Outstanding payments total */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                Outstanding payments total (£)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Outstanding payments total"
                value={loveAdminOutstandingTotal}
                onChange={(e) => setLoveAdminOutstandingTotal(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </div>

            {/* Number of cancellations (overall text field, keep) */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                Number of cancellations
              </label>
              <input
                type="number"
                min={0}
                placeholder="Total number of cancellations"
                value={loveAdminCancellations}
                onChange={(e) => setLoveAdminCancellations(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </div>

            {/* New: cancellations by category – just number of people */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-700">
                Cancellations category
              </label>
              <select
                value={selectedCancellationCategory}
                onChange={(e) =>
                  setSelectedCancellationCategory(
                    e.target.value as OutstandingCategory | '',
                  )
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">Select a category (optional)</option>
                {outstandingCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {selectedCancellationCategory && (
                <div className="mt-2 space-y-2">
                  <button
                    type="button"
                    onClick={addCancellationLine}
                    className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-900"
                  >
                    Add cancellations count
                  </button>

                  {cancellationsForSelectedCategory.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {cancellationsForSelectedCategory.map((line) => (
                        <div
                          key={line.id}
                          className="flex items-center gap-2 rounded-md border border-zinc-200 p-2"
                        >
                          <span className="text-xs text-zinc-600">
                            {line.category}
                          </span>
                          <input
                            type="number"
                            min={0}
                            placeholder="Number of people"
                            value={line.count}
                            onChange={(e) =>
                              updateCancellationLine(line.id, e.target.value)
                            }
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm sm:w-40"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Reports list */}
        <section className="space-y-4">
          {loading && (
            <p className="text-zinc-500 text-sm">Loading membership reports…</p>
          )}
          {!loading &&
            reports.map((r) => (
              <div key={r.id} className="player-card">
                {r.meetings?.meeting_date && (
                  <p className="pc-meta">
                    Meeting: {new Date(r.meetings.meeting_date).toLocaleDateString('en-GB')}
                  </p>
                )}

                {(r.bottom_line || r.num_people != null) && (
                  <div className="mt-2 text-sm text-zinc-700 space-y-1">
                    {r.bottom_line && (
                      <p>
                        <span className="font-semibold">Bottom line:</span>{' '}
                        {r.bottom_line}
                      </p>
                    )}
                    {r.num_people != null && (
                      <p>
                        <span className="font-semibold">Number of people:</span>{' '}
                        {r.num_people}
                      </p>
                    )}
                  </div>
                )}

                <p className="mt-2 text-xs text-zinc-400">
                  Added {new Date(r.created_at).toLocaleString('en-GB')}
                </p>
              </div>
            ))}
        </section>

        {/* Money total summary section */}
        <section className="mt-6 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <h2 className="pc-name text-lg font-semibold">
              Money total
            </h2>
          </div>
          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-2">
            <p className="text-sm text-zinc-600">
              This total equals the sum of the Bottomline Total (£) and the LoveAdmin Total (£).
            </p>
            <input
              type="text"
              readOnly
              value={combinedMoneyTotal}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 bg-zinc-50 text-zinc-800"
            />
          </div>
        </section>

        {/* Link to meeting */}
        <section className="mt-6 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <h2 className="pc-name text-lg font-semibold">
              Link to meeting
            </h2>
          </div>
          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            <select
              value={meetingId ?? ''}
              onChange={(e) => setMeetingId(e.target.value || null)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            >
              <option value="">Link to meeting (optional)</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {new Date(m.meeting_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Global save button */}
        <section className="mt-6 flex justify-end">
          <button
            onClick={saveReport}
            className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
          >
            Save membership report
          </button>
        </section>
      </div>
    </main>
  );
}