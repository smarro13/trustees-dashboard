import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function MattersArisingPage() {
  const [matters, setMatters] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [raisedBy, setRaisedBy] = useState('');
  const [addToActions, setAddToActions] = useState(false);
  const [nextMeetingId, setNextMeetingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);

    const { data: mattersData } = await supabase
      .from('matters_arising')
      .select(`
        *,
        meetings ( meeting_date )
      `)
      .order('created_at', { ascending: false });

    if (mattersData) setMatters(mattersData);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true });

    if (meetingsData) setMeetings(meetingsData);

    setLoading(false);
  };

  useEffect(() => {
    const loadAll = async () => {
      await loadData();

      const { data } = await supabase
        .from('meetings')
        .select('id')
        .gte('meeting_date', new Date().toISOString())
        .order('meeting_date', { ascending: true })
        .limit(1)
        .single();

      if (data) setNextMeetingId(data.id);
    };

    loadAll();
  }, []);

  const saveMatter = async () => {
    if (!title.trim()) return;

    setLoading(true);

    // 1️⃣ Save matter
    const { data, error } = await supabase
      .from('matters_arising')
      .insert({
        title,
        details,
        raised_by: raisedBy || null,
        meeting_id: nextMeetingId,
        add_to_actions: addToActions,
      })
      .select()
      .single();

    if (error) {
      alert('Error saving matter: ' + error.message);
      setLoading(false);
      return;
    }

    // 2️⃣ Optionally create action
    if (addToActions && data) {
      await supabase.from('action_items').insert({
        title,
        description: details || null,
        meeting_id: nextMeetingId,
        source: 'Matters Arising',
        status: 'Open',
        created_by: raisedBy || null,
      });
    }

    setTitle('');
    setDetails('');
    setRaisedBy('');
    setAddToActions(false);
    setLoading(false);
    loadData();
    alert('Matter arising saved successfully!');
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[800px] px-4 py-10">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to dashboard
        </Link>

        <h1 className="mt-4 text-3xl font-extrabold text-zinc-900">
          Matters Arising
        </h1>
        <p className="mt-1 text-zinc-600">
          Topics to be discussed at the next meeting
        </p>

        <section className="mt-8 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200 p-6 space-y-4">
          <input
            type="text"
            placeholder="Topic title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />

          <textarea
            placeholder="Details / context"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            className="w-full rounded-md border px-3 py-2"
          />

          <input
            type="text"
            placeholder="Raised by (optional)"
            value={raisedBy}
            onChange={(e) => setRaisedBy(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addToActions}
              onChange={(e) => setAddToActions(e.target.checked)}
            />
            Add to Action Tracker
          </label>

          <div className="flex justify-end">
            <button
              onClick={saveMatter}
              disabled={loading}
              className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save matter'}
            </button>
          </div>
        </section>

        {/* Previous matters list */}
        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold text-zinc-900">Previous Matters</h2>
          {loading && (
            <p className="text-zinc-500 text-sm">Loading matters…</p>
          )}
          {!loading && matters.length === 0 && (
            <p className="text-zinc-500 text-sm">No matters recorded yet.</p>
          )}
          {!loading &&
            matters.map((m) => (
              <div key={m.id} className="player-card">
                <h3 className="pc-name text-lg">{m.title}</h3>

                {m.meetings?.meeting_date && (
                  <p className="pc-meta">
                    Meeting: {new Date(m.meetings.meeting_date).toLocaleDateString('en-GB')}
                  </p>
                )}

                {m.details && (
                  <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">
                    {m.details}
                  </p>
                )}

                {m.raised_by && (
                  <p className="mt-1 text-xs text-zinc-600">
                    Raised by: {m.raised_by}
                  </p>
                )}

                {m.add_to_actions && (
                  <p className="mt-1 text-xs text-blue-600">
                    ✓ Added to Action Tracker
                  </p>
                )}

                <p className="mt-2 text-xs text-zinc-400">
                  Added {new Date(m.created_at).toLocaleString('en-GB')}
                </p>
              </div>
            ))}
        </section>
      </div>
    </main>
  );
}
