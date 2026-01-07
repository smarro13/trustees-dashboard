import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

type Item = {
  dateRange?: string; // now a single month (e.g. "March 2025")
  moneyIn?: string;
  moneyOut?: string;
};

type TillSummary = {
  highestProfitItem?: {
    name: string;
    profit: number;
  } | null;
  mostPopularItems?: {
    name: string;
    quantity: number;
  }[];
};

export default function TradingPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [period, setPeriod] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Item[]>([
    { dateRange: '', moneyIn: '', moneyOut: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [turnoverNotes, setTurnoverNotes] = useState(''); // new turnover section

  const [tillFile, setTillFile] = useState<File | null>(null);
  const [tillSummary, setTillSummary] = useState<TillSummary | null>(null);
  const [tillParsing, setTillParsing] = useState(false);
  const [tillError, setTillError] = useState<string | null>(null);

  const loadData = async () => {
    const { data } = await supabase
      .from('treasury_reports')
      .select(`
        *,
        meetings ( meeting_date ),
        treasury_report_items ( label, amount )
      `)
      .order('created_at', { ascending: false });

    if (data) setReports(data);

    // only fetch meetings that are not yet linked OR (if you prefer) that exist at all.
    // Here: fetch meetings in the future or with no linked report yet.
    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true });

    if (meetingsData) setMeetings(meetingsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addRow = () =>
    setItems([
      ...items,
      { dateRange: '', moneyIn: '', moneyOut: '' },
    ]);

  const updateRow = (i: number, key: keyof Item, value: string) => {
    const copy = [...items];
    copy[i][key] = value;
    if (key === 'dateRange' && value) {
      const [year, month] = value.split('-');
      const d = new Date(Number(year), Number(month) - 1, 1);
      copy[i].dateRange = d.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });
    }
    setItems(copy);
  };

  const saveReport = async () => {
    if (!period.trim()) return;

    setLoading(true);

    const { data: report } = await supabase
      .from('treasury_reports')
      .insert({
        reporting_period: period,
        meeting_id: meetingId,
        notes,
        turnover_notes: turnoverNotes || null, // save turnover text
      })
      .select()
      .single();

    if (report) {
      const rows = items
        .filter(
          (i) =>
            (i.moneyIn && Number(i.moneyIn)) ||
            (i.moneyOut && Number(i.moneyOut))
        )
        .map((i, idx) => {
          const moneyIn = Number(i.moneyIn || '0');
          const moneyOut = Number(i.moneyOut || '0');
          const diff = moneyIn - moneyOut;
          const baseLabel = i.dateRange || `Entry ${idx + 1}`;
          return {
            report_id: report.id,
            label: baseLabel,
            amount: diff,
          };
        });

      if (rows.length) {
        await supabase.from('treasury_report_items').insert(rows);
      }
    }

    setPeriod('');
    setMeetingId(null);
    setNotes('');
    setTurnoverNotes(''); // reset turnover
    setItems([{ dateRange: '', moneyIn: '', moneyOut: '' }]);
    setLoading(false);

    loadData();
  };

  const handleTillPdfChange = async (file: File | null) => {
    setTillFile(file);
    setTillSummary(null);
    setTillError(null);
    if (!file) return;

    // Optional: size/type guard
    if (file.type !== 'application/pdf') {
      setTillError('Please upload a PDF file.');
      return;
    }

    setTillParsing(true);
    try {
      // Read file as ArrayBuffer to send to API route
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      const res = await fetch('/api/till-sales-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentBase64: base64,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to analyse till PDF');
      }

      const data = await res.json();
      // Expect shape: { highestProfitItem: { name, profit }, mostPopularItems: [{ name, quantity }, ...] }
      setTillSummary({
        highestProfitItem: data.highestProfitItem ?? null,
        mostPopularItems: data.mostPopularItems ?? [],
      });
    } catch (err: any) {
      setTillError(err.message || 'Error analysing till PDF');
    } finally {
      setTillParsing(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      {/* widen content area more to reduce cramping */}
      <div className="mx-auto w-full max-w-6xl sm:max-w-7xl lg:max-w-[1200px] px-2 sm:px-4 lg:px-6 py-6 sm:py-8 lg:py-10">
        {/* Header */}
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Trading Report
          </h1>
          <p className="mt-1 text-zinc-600">
            Financial overview for Aldwinians RUFC Trading Company - Monthly Update
          </p>
        </header>

        {/* New report – flat, full-width section */}
        <section className="mb-10 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <h2 className="text-xl font-semibold text-zinc-900">
              Add trading report
            </h2>
          </div>

          {/* Any new inputs/tables/buttons should be added inside this padded block */}
          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-6">
            {/* Period + meeting row */}
            <div className="grid gap-4 lg:grid-cols-2">
              <input
                type="text"
                placeholder="Reporting period (e.g. March 2025)"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />

              <select
                value={meetingId ?? ''}
                onChange={(e) => setMeetingId(e.target.value || null)}
                className="w-full rounded-md border px-3 py-2"
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

            {/* Setmore functions booking box */}
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-semibold text-blue-900">
                  Book functions in Setmore
                </h3>
                <p className="text-xs text-blue-800">
                  Use Setmore to view and manage room hire, events, and other bookings.
                </p>
              </div>
              <a
                href="https://aldwiniansrufc.setmore.com/bookings"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                View bookings
              </a>
            </div>

            {/* Month / Money table */}
            <div>
              <table className="w-full text-sm border table-fixed">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="border px-2 py-1 text-left">Month</th>
                    <th className="border px-2 py-1 text-right">Money In (£)</th>
                    <th className="border px-2 py-1 text-right">Money Out (£)</th>
                    <th className="border px-2 py-1 text-right">Difference</th>
                    <th className="border px-2 py-1 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => {
                    const moneyIn = Number(row.moneyIn || '0');
                    const moneyOut = Number(row.moneyOut || '0');
                    const diff = moneyIn - moneyOut;

                    const balance = items
                      .slice(0, idx + 1)
                      .reduce((acc, r) => {
                        const mi = Number(r.moneyIn || '0');
                        const mo = Number(r.moneyOut || '0');
                        return acc + (mi - mo);
                      }, 0);

                    return (
                      <tr key={idx}>
                        <td className="border px-2 py-1 align-top">
                          <input
                            type="month"
                            onChange={(e) =>
                              updateRow(idx, 'dateRange', e.target.value)
                            }
                            className="w-full rounded border px-2 py-1"
                          />
                          {row.dateRange && (
                            <p className="mt-1 text-xs text-zinc-500">
                              {row.dateRange}
                            </p>
                          )}
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.moneyIn || ''}
                            onChange={(e) =>
                              updateRow(idx, 'moneyIn', e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-right"
                          />
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.moneyOut || ''}
                            onChange={(e) =>
                              updateRow(idx, 'moneyOut', e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-right"
                          />
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          £{diff.toFixed(2)}
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          £{balance.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold bg-zinc-50">
                    <td className="border px-2 py-1" colSpan={2}>
                      Totals
                    </td>
                    <td className="border px-2 py-1 text-right">
                      £
                      {items
                        .reduce(
                          (sum, r) => sum + Number(r.moneyIn || '0'),
                          0
                        )
                        .toFixed(2)}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      £
                      {items
                        .reduce(
                          (sum, r) => sum + Number(r.moneyOut || '0'),
                          0
                        )
                        .toFixed(2)}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      £
                      {items
                        .reduce((sum, r) => {
                          const mi = Number(r.moneyIn || '0');
                          const mo = Number(r.moneyOut || '0');
                          return sum + (mi - mo);
                        }, 0)
                        .toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Turnover section */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                Turnover – additional updates
              </h3>
              <textarea
                placeholder="Notes about turnover or other trading updates"
                value={turnoverNotes}
                onChange={(e) => setTurnoverNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>

            {/* Till sales PDF upload */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-800">
                Till sales PDF
              </h3>
              <p className="text-xs text-zinc-500">
                Upload the till sales PDF to extract the highest profit item and most popular items.
              </p>

              {/* Styled like Save report, now red */}
              <label className="inline-flex cursor-pointer items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                Choose PDF…
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleTillPdfChange(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {tillFile && (
                <span className="ml-2 text-xs text-zinc-600 align-middle">
                  {tillFile.name}
                </span>
              )}

              {tillParsing && (
                <p className="text-xs text-zinc-500">Analyzing till PDF…</p>
              )}
              {tillError && (
                <p className="text-xs text-red-600">{tillError}</p>
              )}

              {tillSummary && (
                <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm space-y-2">
                  {tillSummary.highestProfitItem && (
                    <p>
                      <span className="font-semibold">Highest profit item: </span>
                      {tillSummary.highestProfitItem.name} (
                      £{tillSummary.highestProfitItem.profit.toFixed(2)})
                    </p>
                  )}
                  {tillSummary.mostPopularItems &&
                    tillSummary.mostPopularItems.length > 0 && (
                      <div>
                        <p className="font-semibold mb-1">Most popular items:</p>
                        <ul className="list-disc pl-5 space-y-0.5">
                          {tillSummary.mostPopularItems.map((it) => (
                            <li key={it.name}>
                              {it.name} – {it.quantity} sold
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  {!tillSummary.highestProfitItem &&
                    (!tillSummary.mostPopularItems ||
                      tillSummary.mostPopularItems.length === 0) && (
                      <p className="text-xs text-zinc-500">
                        No summary could be extracted from this PDF.
                      </p>
                    )}
                </div>
              )}
            </div>

            {/* Notes + save */}
            <textarea
              placeholder="Additional commentary / updates"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2"
            />

            <div className="flex justify-end">
              <button
                onClick={saveReport}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Save report'}
              </button>
            </div>
          </div>
        </section>

        {/* Reports */}
        <section className="space-y-6">
          {reports.map((r) => (
            <div key={r.id} className="player-card">
              <h3 className="pc-name text-lg">{r.reporting_period}</h3>

              {r.meetings?.meeting_date && (
                <p className="pc-meta">
                  Meeting:{' '}
                  {new Date(r.meetings.meeting_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </p>
              )}

              <table className="mt-3 w-full border text-sm">
                <tbody>
                  {r.treasury_report_items.map((i: any) => (
                    <tr key={i.label}>
                      <td className="border px-2 py-1">{i.label}</td>
                      <td className="border px-2 py-1 text-right">
                        £{Number(i.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {r.turnover_notes && (
                <p className="mt-3 whitespace-pre-wrap text-zinc-700">
                  <span className="font-semibold">Turnover updates: </span>
                  {r.turnover_notes}
                </p>
              )}

              {r.notes && (
                <p className="mt-3 whitespace-pre-wrap text-zinc-700">
                  {r.notes}
                </p>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}