import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function CorrespondencePage() {
  const [items, setItems] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  const [subject, setSubject] = useState('');
  const [sender, setSender] = useState('');
  const [summary, setSummary] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const { data } = await supabase
      .from('correspondence')
      .select(`
        *,
        meetings ( meeting_date )
      `)
      .order('created_at', { ascending: false });

    if (data) setItems(data);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: false });

    if (meetingsData) setMeetings(meetingsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addCorrespondence = async () => {
    if (!subject.trim() || !summary.trim()) return;

    setLoading(true);

    await supabase.from('correspondence').insert({
      subject,
      sender: sender || null,
      summary,
      received_date: receivedDate || null,
      meeting_id: meetingId,
    });

    setSubject('');
    setSender('');
    setSummary('');
    setReceivedDate('');
    setMeetingId(null);
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
            Correspondence
          </h1>
          <p className="mt-1 text-zinc-600">
            Record correspondence received by the board
          </p>
        </header>

        {/* Add correspondence */}
        <section className="player-card mb-10">
          <h2 className="pc-name mb-4">Record correspondence</h2>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Subject (e.g. RFU Safeguarding Guidance)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            />

            <input
              type="text"
              placeholder="From (e.g. RFU, Local Council)"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            />

            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            />

            <textarea
              placeholder="Summary of correspondence (required)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              rows={4}
            />

            <select
              value={meetingId ?? ''}
              onChange={(e) => setMeetingId(e.target.value || null)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            >
              <option value="">Link to meeting (optional)</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {new Date(m.meeting_date).toLocaleDateString()}
                </option>
              ))}
            </select>

            <button
              onClick={addCorrespondence}
              disabled={loading}
              className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save correspondence'}
            </button>
          </div>
        </section>

        {/* Correspondence list */}
        <section className="space-y-4">
          {items.length === 0 ? (
            <p className="text-zinc-500">No correspondence recorded.</p>
          ) : (
            items.map((c) => (
              <div key={c.id} className="player-card">
                <h3 className="pc-name text-lg">{c.subject}</h3>

                <div className="pc-meta space-y-1">
                  {c.sender && <p>From: {c.sender}</p>}
                  {c.received_date && (
                    <p>
                      Received:{' '}
                      {new Date(c.received_date).toLocaleDateString()}
                    </p>
                  )}
                  {c.meetings?.meeting_date && (
                    <p>
                      Noted at meeting:{' '}
                      {new Date(c.meetings.meeting_date).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <p className="mt-3 text-zinc-700 whitespace-pre-wrap">
                  {c.summary}
                </p>

                <p className="mt-2 text-xs text-zinc-400">
                  Recorded {new Date(c.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
