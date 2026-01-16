import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function SafeguardingPage() {
  const [updates, setUpdates] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState('Information');
  const [reviewDate, setReviewDate] = useState('');
  const [team, setTeam] = useState('Under 7s');
  const [meetingId, setMeetingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('safeguarding_updates')
      .select(`
        *,
        safeguarding_references ( label, url )
      `)
      .order('created_at', { ascending: false });

    if (data) setUpdates(data);

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

  const saveUpdate = async () => {
    if (!summary) return;

    setLoading(true);

    const { data, error } = await supabase.from('safeguarding_updates').insert({
      title: `${team} - ${status}`,
      summary,
      status,
      review_date: reviewDate || null,
      team,
      meeting_id: meetingId,
    });

    if (error) {
      console.error('Error saving safeguarding update:', error);
      alert('Failed to save safeguarding update: ' + error.message);
      setLoading(false);
      return;
    }

    setSummary('');
    setStatus('Information');
    setReviewDate('');
    setTeam('Under 7s');
    setMeetingId(null);

    setLoading(false);
    loadData();
    alert('Safeguarding update saved successfully!');
  };

  const teamBuckets = [
    'Mini Winnies',
    'Under 7s',
    'Under 8s',
    'Under 9s',
    'Under 10s',
    'Under 11s',
    'Under 12s',
    'Under 13s',
    'Under 14s',
    'Under 15s',
    'Under 16s',
    'Under 17s',
    'Under 18s',
    'Seniors',
    'Other',
  ];

  return (
    <main className="min-h-screen">
      {/* expand width similar to other agenda pages */}
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
            Safeguarding
          </h1>
          <p className="mt-1 text-zinc-600">
            Board-level safeguarding oversight (no personal data)
          </p>
        </header>

        {/* New update – full-width, lightly styled section instead of player-card */}
        <section className="mb-10 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            {/* keep pc-name for consistent red styling if defined globally */}
            <h2 className="pc-name text-xl font-semibold">
              Add safeguarding update
            </h2>
          </div>

          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-4">
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

            <textarea
              placeholder="Summary (high-level, no personal detail)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2"
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border px-3 py-2"
              >
                <option>Information</option>
                <option>Ongoing</option>
                <option>Resolved</option>
                <option>Escalated</option>
              </select>

              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="rounded-md border px-3 py-2"
              />

              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="rounded-md border px-3 py-2"
              >
                {teamBuckets.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveUpdate}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Save safeguarding update'}
              </button>
            </div>
          </div>
        </section>

        {/* Updates list grouped into team boxes */}
        <section className="space-y-8">
          {teamBuckets.map((bucket) => (
            <div
              key={bucket}
              className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200"
            >
              <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 lg:px-8">
                <h2 className="text-lg font-semibold">{bucket}</h2>
              </div>
              <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8">
                {updates
                  .filter((u) => u.team === bucket)
                  .map((u) => (
                    <div key={u.id} className="player-card">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="pc-name text-lg">{u.title}</h3>
                          <p className="pc-meta">
                            Status: <strong>{u.status}</strong>
                            {u.review_date &&
                              ` • Review by ${new Date(
                                u.review_date
                              ).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-zinc-700">
                        {u.summary}
                      </p>

                      {u.safeguarding_references?.length > 0 && (
                        <ul className="mt-3 list-disc pl-5 text-sm">
                          {u.safeguarding_references.map((r: any) => (
                            <li key={r.url}>
                              <a
                                href={r.url}
                                target="_blank"
                                className="text-blue-600 hover:underline"
                              >
                                {r.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                {updates.filter((u) => u.team === bucket).length === 0 && (
                  <p className="text-sm text-zinc-500">
                    No safeguarding updates yet.
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
