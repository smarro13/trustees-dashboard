import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function MattersArisingPage() {
  const [items, setItems] = useState<any[]>([]);
  const [nextMeeting, setNextMeeting] = useState<any | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);

    // Load future meetings – first one is "next meeting"
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .gte('meeting_date', new Date().toISOString())
      .order('meeting_date', { ascending: true })
      .limit(1);

    if (meetings && meetings.length > 0) {
      setNextMeeting(meetings[0]);
    } else {
      setNextMeeting(null);
    }

    const { data } = await supabase
      .from('matters_arising')
      .select(`*, meetings ( meeting_date )`)
      .order('created_at', { ascending: false });

    if (data) setItems(data);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveItem = async () => {
    if (!title.trim()) return;

    setLoading(true);

    await supabase.from('matters_arising').insert({
      title,
      description: description || null,
      meeting_id: nextMeeting?.id ?? null,
    });

    setTitle('');
    setDescription('');

    setLoading(false);
    loadData();
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1000px] px-4 py-10">
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Matters Arising
          </h1>
          <p className="mt-1 text-zinc-600">
            Topics to be carried forward to the next meeting
          </p>
        </header>

        {/* Add new matter */}
        <section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">
              Add matter for next meeting
            </h2>
            {nextMeeting && (
              <p className="mt-1 text-sm text-zinc-600">
                Will be added to meeting on{' '}
                {new Date(nextMeeting.meeting_date).toLocaleDateString('en-GB')}
              </p>
            )}
            {!nextMeeting && (
              <p className="mt-1 text-sm text-red-600">
                No future meeting found — item will remain unassigned.
              </p>
            )}
          </div>

          <div className="space-y-5 px-6 py-6">
            <input
              type="text"
              placeholder="Matter title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />

            <textarea
              placeholder="Details / background (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2"
            />

            <div className="flex justify-end">
              <button
                onClick={saveItem}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Add matter'}
              </button>
            </div>
          </div>
        </section>

        {/* Existing items */}
        <section className="space-y-4">
          {loading && (
            <p className="text-sm text-zinc-500">Loading matters…</p>
          )}

          {!loading &&
            items.map((i) => (
              <div key={i.id} className="player-card">
                <h3 className="pc-name text-lg">{i.title}</h3>

                {i.meetings?.meeting_date && (
                  <p className="pc-meta">
                    For meeting:{' '}
                    {new Date(i.meetings.meeting_date).toLocaleDateString('en-GB')}
                  </p>
                )}

                {i.description && (
                  <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                    {i.description}
                  </p>
                )}

                <p className="mt-2 text-xs text-zinc-400">
                  Added {new Date(i.created_at).toLocaleString('en-GB')}
                </p>
              </div>
            ))}
        </section>
      </div>
    </main>
  );
}
         