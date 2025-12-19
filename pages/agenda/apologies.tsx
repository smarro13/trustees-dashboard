import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';

export default function ApologiesPage() {
  const [apologies, setApologies] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const router = useRouter();

  const loadApologies = async (filterId?: string | null) => {
    const base = supabase
      .from('apologies')
      .select(`
        *,
        meetings ( meeting_date )
      `)
      .order('created_at', { ascending: false });

    const { data } = await (filterId ? base.eq('meeting_id', filterId) : base);
    if (data) setApologies(data);
  };

  useEffect(() => {
    const loadMeetings = async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id, meeting_date')
        .order('meeting_date', { ascending: true }); // month order (Jan → Dec)
      if (data) setMeetings(data);
    };

    loadMeetings();
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const qId =
      typeof router.query.meetingId === 'string' ? router.query.meetingId : null;
    setMeetingId(qId);
  }, [router.isReady, router.query.meetingId]);

  useEffect(() => {
    loadApologies(meetingId);
  }, [meetingId]);

  const addApology = async () => {
    if (!name.trim()) return;

    setLoading(true);
    await supabase.from('apologies').insert({
      name,
      note,
      meeting_id: meetingId
    });

    setName('');
    setNote('');
    setMeetingId(null);
    setLoading(false);
    loadApologies();
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Apologies for Absence
          </h1>
          <p className="mt-1 text-zinc-600">
            Manage apologies received for this meeting.
          </p>
        </header>

        {/* Add apology */}
        <section className="player-card mb-8">
          <h2 className="pc-name mb-4">Add apology</h2>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            />

            <textarea
              placeholder="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              rows={3}
            />

            {(() => {
              const selected = meetings.find((m) => m.id === meetingId);
              return selected ? (
                <p className="text-sm text-zinc-600">
                  Linking to meeting{' '}
                  {new Date(selected.meeting_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </p>
              ) : null;
            })()}
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

            <button
              onClick={addApology}
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Adding…' : 'Add apology'}
            </button>
          </div>
        </section>

        {/* List */}
        <section>
          {apologies.length === 0 ? (
            <p className="text-zinc-500">No apologies recorded.</p>
          ) : (
            <div className="space-y-4">
              {apologies.map((a) => (
                <div key={a.id} className="player-card">
                  <h3 className="pc-name text-lg">{a.name}</h3>
                  {a.note && <p className="pc-meta">{a.note}</p>}
                  {a.meetings?.meeting_date && (
                    <p className="mt-1 text-sm text-zinc-500">
                      Linked to meeting:{' '}
                      {new Date(a.meetings.meeting_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-400">
                    Added {new Date(a.created_at).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
