import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function RugbyReportPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState<string | null>(null);

  const [miniReport, setMiniReport] = useState('');
  const [juniorReport, setJuniorReport] = useState('');
  const [seniorReport, setSeniorReport] = useState('');
  const [managementRequests, setManagementRequests] = useState('');

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('rugby_reports')
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
    setLoading(true);

    await supabase.from('rugby_reports').insert({
      meeting_id: meetingId,
      mini_report: miniReport || null,
      junior_report: juniorReport || null,
      senior_report: seniorReport || null,
      management_requests: managementRequests || null,
    });

    setMeetingId(null);
    setMiniReport('');
    setJuniorReport('');
    setSeniorReport('');
    setManagementRequests('');

    setLoading(false);
    loadData();
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Rugby Report
          </h1>
          <p className="mt-1 text-zinc-600">
            Updates from Mini, Junior and Senior rugby sections
          </p>
        </header>

        {/* New report */}
        <section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">Add rugby report</h2>
          </div>

          <div className="space-y-6 px-6 py-6">
            {/* Meeting */}
            <select
              value={meetingId ?? ''}
              onChange={(e) => setMeetingId(e.target.value || null)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Link to meeting (optional)</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {new Date(m.meeting_date).toLocaleDateString('en-GB')}
                </option>
              ))}
            </select>

            {/* Mini */}
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Mini Rugby Report
              </label>
              <textarea
                rows={4}
                value={miniReport}
                onChange={(e) => setMiniReport(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </div>

            {/* Junior */}
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Junior Rugby Report
              </label>
              <textarea
                rows={4}
                value={juniorReport}
                onChange={(e) => setJuniorReport(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </div>

            {/* Senior */}
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Senior Rugby Report
              </label>
              <textarea
                rows={4}
                value={seniorReport}
                onChange={(e) => setSeniorReport(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </div>

            {/* Management requests */}
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
              <label className="block text-sm font-semibold text-amber-900">
                Requests to Management Team
              </label>
              <p className="mb-2 text-xs text-amber-700">
                Items entered here can later be linked to the Action Tracker.
              </p>
              <textarea
                rows={4}
                value={managementRequests}
                onChange={(e) => setManagementRequests(e.target.value)}
                className="w-full rounded-md border border-amber-300 px-3 py-2"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveReport}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Save rugby report'}
              </button>
            </div>
          </div>
        </section>

        {/* Existing reports */}
        <section className="space-y-4">
          {loading && (
            <p className="text-sm text-zinc-500">Loading rugby reports…</p>
          )}

          {!loading &&
            reports.map((r) => (
              <div key={r.id} className="player-card">
                {r.meetings?.meeting_date && (
                  <p className="pc-meta">
                    Meeting:{' '}
                    {new Date(r.meetings.meeting_date).toLocaleDateString('en-GB')}
                  </p>
                )}

                {r.mini_report && (
                  <p className="mt-2 whitespace-pre-wrap">
                    <strong>Mini:</strong> {r.mini_report}
                  </p>
                )}

                {r.junior_report && (
                  <p className="mt-2 whitespace-pre-wrap">
                    <strong>Junior:</strong> {r.junior_report}
                  </p>
                )}

                {r.senior_report && (
                  <p className="mt-2 whitespace-pre-wrap">
                    <strong>Seniors:</strong> {r.senior_report}
                  </p>
                )}

                {r.management_requests && (
                  <p className="mt-3 whitespace-pre-wrap text-amber-900">
                    <strong>Requests to management:</strong>{' '}
                    {r.management_requests}
                  </p>
                )}

                <p className="mt-2 text-xs text-zinc-400">
                  Added {new Date(r.created_at).toLocaleString('en-GB')}
                </p>
              </div>
            ))}
        </section>
      </div>
    </main>
  );
}
