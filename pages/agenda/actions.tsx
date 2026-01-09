import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

const STATUS_OPTIONS = ['Open', 'In Progress', 'Completed'];

export default function ActionTrackerPage() {
  const [actions, setActions] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  // manual entry
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState('');

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('action_items')
      .select(
        `
        id,
        title,
        description,
        owner,
        due_date,
        status,
        source,
        created_by,
        meeting_id,
        meetings ( meeting_date )
      `
      )
      .order('status', { ascending: true })
      .order('due_date', { ascending: true }); // ✅ NULLs already last by default

    if (error) {
      console.error(error);
    } else if (data) {
      setActions(data);
    }

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

  const addAction = async () => {
    if (!title.trim()) return;

    setLoading(true);

    const { error } = await supabase.from('action_items').insert({
      title,
      description: description || null,
      owner: owner || null,
      due_date: dueDate || null,
      meeting_id: meetingId,
      source: 'Manual',
      status: 'Open',
      created_by: createdBy || null,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setTitle('');
    setDescription('');
    setOwner('');
    setDueDate('');
    setMeetingId(null);
    setCreatedBy('');

    loadData();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase
      .from('action_items')
      .update({
        status,
        completed_at: status === 'Completed' ? new Date().toISOString() : null,
      })
      .eq('id', id);

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
            Action Tracker
          </h1>
          <p className="mt-1 text-zinc-600">
            Track actions raised across meetings and reports
          </p>
        </header>

        {/* Add action */}
        <section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">Add action</h2>
          </div>

          <div className="space-y-4 px-6 py-6">
            <div>
              <label className="block text-sm font-medium">Title</label>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Description</label>
              <textarea
                rows={3}
                className="w-full rounded-md border px-3 py-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium">Owner</label>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Due date</label>
                <input
                  type="date"
                  className="w-full rounded-md border px-3 py-2"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Linked meeting</label>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={meetingId ?? ''}
                  onChange={(e) => setMeetingId(e.target.value || null)}
                >
                  <option value="">Link to meeting</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {new Date(m.meeting_date).toLocaleDateString('en-GB')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Created by</label>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={addAction}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Add action
              </button>
            </div>
          </div>
        </section>

        {/* Actions table */}
        <section>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading actions…</p>
          ) : actions.length === 0 ? (
            <p className="text-sm text-zinc-500">No actions yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Owner</th>
                    <th className="px-3 py-2 text-left">Due</th>
                    <th className="px-3 py-2 text-left">Meeting</th>
                    <th className="px-3 py-2 text-left">Created by</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-left">Details</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 font-medium">{a.title}</td>
                      <td className="px-3 py-2">{a.owner || '—'}</td>
                      <td className="px-3 py-2">
                        {a.due_date
                          ? new Date(a.due_date).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {a.meetings?.meeting_date
                          ? new Date(a.meetings.meeting_date).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                      <td className="px-3 py-2">{a.created_by || '—'}</td>
                      <td className="px-3 py-2 text-xs">{a.source || '—'}</td>
                      <td className="px-3 py-2">
                        {a.description || <span className="text-zinc-400">No details</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={a.status}
                          onChange={(e) => updateStatus(a.id, e.target.value)}
                          className="rounded-md border px-2 py-1 text-xs"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
