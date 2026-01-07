import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function AOBPage() {
  const [items, setItems] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [addToActionTracker, setAddToActionTracker] = useState(false);
  const [actionNotes, setActionNotes] = useState('');

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true }); // changed to ascending

    if (meetingsData) setMeetings(meetingsData);

    const { data } = await supabase
      .from('aob_items')
      .select(`*, meetings ( meeting_date )`)
      .order('created_at', { ascending: false });

    if (data) setItems(data);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveItem = async () => {
    if (!title.trim() || !meetingId) return;

    setLoading(true);

    await supabase.from('aob_items').insert({
      title,
      description: description || null,
      meeting_id: meetingId,
      add_to_action_tracker: addToActionTracker,
      action_notes: addToActionTracker ? actionNotes : null,
    });

    setTitle('');
    setDescription('');
    setAddToActionTracker(false);
    setActionNotes('');

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
            Any Other Business (AOB)
          </h1>
          <p className="mt-1 text-zinc-600">
            Items raised during or after a meeting
          </p>
        </header>

        {/* Add AOB item */}
        <section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">
              Add AOB item
            </h2>
          </div>

          <div className="space-y-5 px-6 py-6">
            <select
              value={meetingId ?? ''}
              onChange={(e) => setMeetingId(e.target.value || null)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Select meeting (required)</option>
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

            <input
              type="text"
              placeholder="AOB title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />

            <textarea
              placeholder="Details / notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2"
            />

            {/* Action tracker option */}
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <input
                  type="checkbox"
                  checked={addToActionTracker}
                  onChange={(e) => setAddToActionTracker(e.target.checked)}
                />
                Add to Action Tracker
              </label>

              {addToActionTracker && (
                <textarea
                  placeholder="Action details"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-md border border-amber-300 px-3 py-2"
                />
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveItem}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Add AOB'}
              </button>
            </div>
          </div>
        </section>

        {/* AOB list */}
        <section className="space-y-4">
          {loading && (
            <p className="text-sm text-zinc-500">Loading AOB items…</p>
          )}

          {!loading &&
            items.map((i) => (
              <div key={i.id} className="player-card">
                <h3 className="pc-name text-lg">{i.title}</h3>

                {i.meetings?.meeting_date && (
                  <p className="pc-meta">
                    Meeting:{' '}
                    {new Date(i.meetings.meeting_date).toLocaleDateString('en-GB')}
                  </p>
                )}

                {i.description && (
                  <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                    {i.description}
                  </p>
                )}

                {i.add_to_action_tracker && (
                  <p className="mt-2 text-sm text-amber-900">
                    <strong>Action required:</strong>{' '}
                    {i.action_notes || 'Yes'}
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
