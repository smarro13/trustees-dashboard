import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { User } from '@supabase/supabase-js';

export default function RugbyReportPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [miniReport, setMiniReport] = useState('');
  const [juniorReport, setJuniorReport] = useState('');
  const [seniorReport, setSeniorReport] = useState('');
  const [miniRequests, setMiniRequests] = useState('');
  const [juniorRequests, setJuniorRequests] = useState('');
  const [seniorRequests, setSeniorRequests] = useState('');

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    setUser(currentUser);

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

  const getCurrentUser = async () => {
    if (user) return user;

    const { data: { user: currentUser }, error } = await supabase.auth.getUser();
    if (error) {
      console.error('Error fetching user:', error);
    }

    if (currentUser) setUser(currentUser);
    return currentUser ?? null;
  };

  const saveReport = async (section: 'mini' | 'junior' | 'senior') => {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      alert('You must be logged in to save');
      return;
    }

    setLoading(true);

    const payload: Record<string, string | null> = {
      meeting_id: meetingId,
      user_id: currentUser.id,
    };

    if (section === 'mini') {
      payload.mini_report = miniReport || null;
      payload.management_requests = miniRequests || null;
    }
    if (section === 'junior') {
      payload.junior_report = juniorReport || null;
      payload.management_requests = juniorRequests || null;
    }
    if (section === 'senior') {
      payload.senior_report = seniorReport || null;
      payload.management_requests = seniorRequests || null;
    }

    const { data, error } = await supabase.from('rugby_reports').insert(payload);

    if (error) {
      console.error('Error saving rugby report:', error);
      alert('Failed to save rugby report: ' + error.message);
      setLoading(false);
      return;
    }

    if (section === 'mini') {
      setMiniReport('');
      setMiniRequests('');
    }
    if (section === 'junior') {
      setJuniorReport('');
      setJuniorRequests('');
    }
    if (section === 'senior') {
      setSeniorReport('');
      setSeniorRequests('');
    }

    setLoading(false);
    loadData();
    alert('Rugby report saved successfully!');
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

          <div className="space-y-8 px-6 py-6">
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
            <div className="rounded-md border border-zinc-200 p-4">
              <label className="block text-sm font-medium text-zinc-700">
                Mini Rugby Report
              </label>
              <textarea
                rows={4}
                value={miniReport}
                onChange={(e) => setMiniReport(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                <label className="block text-xs font-semibold text-amber-900">
                  Mini requests to Management Team
                </label>
                <p className="mb-2 text-xs text-amber-700">
                  Items entered here can later be linked to the Action Tracker.
                </p>
                <textarea
                  rows={3}
                  value={miniRequests}
                  onChange={(e) => setMiniRequests(e.target.value)}
                  className="w-full rounded-md border border-amber-300 px-3 py-2"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => saveReport('mini')}
                  disabled={loading}
                  className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Submit mini report'}
                </button>
              </div>
            </div>

            {/* Junior */}
            <div className="rounded-md border border-zinc-200 p-4">
              <label className="block text-sm font-medium text-zinc-700">
                Junior Rugby Report
              </label>
              <textarea
                rows={4}
                value={juniorReport}
                onChange={(e) => setJuniorReport(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                <label className="block text-xs font-semibold text-amber-900">
                  Junior requests to Management Team
                </label>
                <p className="mb-2 text-xs text-amber-700">
                  Items entered here can later be linked to the Action Tracker.
                </p>
                <textarea
                  rows={3}
                  value={juniorRequests}
                  onChange={(e) => setJuniorRequests(e.target.value)}
                  className="w-full rounded-md border border-amber-300 px-3 py-2"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => saveReport('junior')}
                  disabled={loading}
                  className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Submit junior report'}
                </button>
              </div>
            </div>

            {/* Senior */}
            <div className="rounded-md border border-zinc-200 p-4">
              <label className="block text-sm font-medium text-zinc-700">
                Senior Rugby Report
              </label>
              <textarea
                rows={4}
                value={seniorReport}
                onChange={(e) => setSeniorReport(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                <label className="block text-xs font-semibold text-amber-900">
                  Senior requests to Management Team
                </label>
                <p className="mb-2 text-xs text-amber-700">
                  Items entered here can later be linked to the Action Tracker.
                </p>
                <textarea
                  rows={3}
                  value={seniorRequests}
                  onChange={(e) => setSeniorRequests(e.target.value)}
                  className="w-full rounded-md border border-amber-300 px-3 py-2"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => saveReport('senior')}
                  disabled={loading}
                  className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Submit senior report'}
                </button>
              </div>
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
