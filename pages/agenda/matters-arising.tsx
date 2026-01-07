import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function MattersArisingPage() {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [raisedBy, setRaisedBy] = useState('');
  const [addToActions, setAddToActions] = useState(false);
  const [nextMeetingId, setNextMeetingId] = useState<string | null>(null);

  useEffect(() => {
    const loadNextMeeting = async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id')
        .gte('meeting_date', new Date().toISOString())
        .order('meeting_date', { ascending: true })
        .limit(1)
        .single();

      if (data) setNextMeetingId(data.id);
    };

    loadNextMeeting();
  }, []);

  const saveMatter = async () => {
    if (!title.trim()) return;

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
      alert(error.message);
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
              className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
            >
              Save matter
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
