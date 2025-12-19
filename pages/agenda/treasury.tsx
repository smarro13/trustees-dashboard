import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

type Item = { label: string; amount: string };

export default function TreasuryPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  const [period, setPeriod] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Item[]>([{ label: '', amount: '' }]);

  const [loading, setLoading] = useState(false);

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

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: false });

    if (meetingsData) setMeetings(meetingsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addRow = () =>
    setItems([...items, { label: '', amount: '' }]);

  const updateRow = (i: number, key: keyof Item, value: string) => {
    const copy = [...items];
    copy[i][key] = value;
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
        notes
      })
      .select()
      .single();

    if (report) {
      const rows = items
        .filter(i => i.label && i.amount)
        .map(i => ({
          report_id: report.id,
          label: i.label,
          amount: Number(i.amount)
        }));

      if (rows.length) {
        await supabase.from('treasury_report_items').insert(rows);
      }
    }

    setPeriod('');
    setMeetingId(null);
    setNotes('');
    setItems([{ label: '', amount: '' }]);
    setLoading(false);

    loadData();
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Treasury Report
          </h1>
          <p className="mt-1 text-zinc-600">
            Financial overview for the board
          </p>
        </header>

        {/* New report */}
        <section className="player-card mb-10">
          <h2 className="pc-name mb-4">Add treasury report</h2>

          <div className="space-y-4">
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
              {meetings.map(m => (
                <option key={m.id} value={m.id}>
                  {new Date(m.meeting_date).toLocaleDateString()}
                </option>
              ))}
            </select>

            {/* Table */}
            <table className="w-full border text-sm">
              <thead className="bg-zinc-100">
                <tr>
                  <th className="border px-2 py-1 text-left">Item</th>
                  <th className="border px-2 py-1 text-right">Amount (£)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1">
                      <input
                        value={row.label}
                        onChange={(e) =>
                          updateRow(i, 'label', e.target.value)
                        }
                        className="w-full"
                      />
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) =>
                          updateRow(i, 'amount', e.target.value)
                        }
                        className="w-full text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              onClick={addRow}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add row
            </button>

            <textarea
              placeholder="Additional commentary / updates"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2"
            />

            <button
              onClick={saveReport}
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save report'}
            </button>
          </div>
        </section>

        {/* Reports */}
        <section className="space-y-6">
          {reports.map(r => (
            <div key={r.id} className="player-card">
              <h3 className="pc-name text-lg">{r.reporting_period}</h3>

              {r.meetings?.meeting_date && (
                <p className="pc-meta">
                  Meeting:{' '}
                  {new Date(r.meetings.meeting_date).toLocaleDateString()}
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
