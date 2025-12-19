import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function ConflictsPage() {
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  const [trusteeName, setTrusteeName] = useState('');
  const [description, setDescription] = useState('');
  const [standing, setStanding] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [actionTaken, setActionTaken] = useState('');

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const { data } = await supabase
      .from('conflicts_of_interest')
      .select(`
        *,
        meetings ( meeting_date )
      `)
      .order('created_at', { ascending: false });

    if (data) setConflicts(data);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true }); // month order (Jan → Dec)

    if (meetingsData) setMeetings(meetingsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addConflict = async () => {
    if (!trusteeName.trim() || !description.trim()) return;

    setLoading(true);

    await supabase.from('conflicts_of_interest').insert({
      trustee_name: trusteeName,
      interest_description: description,
      standing,
      meeting_id: standing ? null : meetingId,
      action_taken: actionTaken || null
    });

    setTrusteeName('');
    setDescription('');
    setStanding(false);
    setMeetingId(null);
    setActionTaken('');
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
            Conflicts of Interest
          </h1>
          <p className="mt-1 text-zinc-600">
            Declare and record trustee conflicts
          </p>
        </header>

        {/* Add conflict */}
        <section className="player-card mb-10">
          <h2 className="pc-name mb-4">Declare a conflict</h2>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Name"
              value={trusteeName}
              onChange={(e) => setTrusteeName(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            />

            <textarea
              placeholder="Nature of interest (required)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              rows={3}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={standing}
                onChange={(e) => setStanding(e.target.checked)}
              />
              Standing interest (ongoing)
            </label>

            {!standing && (
              <select
                value={meetingId ?? ''}
                onChange={(e) => setMeetingId(e.target.value || null)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              >
                <option value="">Link to meeting</option>
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
            )}

            <input
              type="text"
              placeholder="Action taken (e.g. abstaining from vote)"
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            />

            <button
              onClick={addConflict}
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Record conflict'}
            </button>
          </div>
        </section>

        {/* List */}
        <section className="space-y-4">
          {conflicts.length === 0 ? (
            <p className="text-zinc-500">No conflicts recorded.</p>
          ) : (
            conflicts.map((c) => (
              <div key={c.id} className="player-card">
                <h3 className="pc-name text-lg">{c.trustee_name}</h3>

                <p className="mt-1 text-zinc-700">{c.interest_description}</p>

                <div className="pc-meta mt-2 space-y-1">
                  {c.standing && <p>Standing interest</p>}
                  {c.meetings?.meeting_date && (
                    <p>
                      Declared at:{' '}
                      {new Date(c.meetings.meeting_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  {c.action_taken && <p>Action taken: {c.action_taken}</p>}
                </div>

                <p className="mt-2 text-xs text-zinc-400">
                  Recorded {new Date(c.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
