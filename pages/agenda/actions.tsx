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
  const [createdBy, setCreatedBy] = useState(''); // new: who created the action

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);

    const { data } = await supabase
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
      `,
      )
      .order('status', { ascending: true })
      .order('due_date', { ascending: true, nullsLast: true });

    if (data) setActions(data);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true }); // changed to ascending

    if (meetingsData) setMeetings(meetingsData);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addAction = async () => {
    if (!title.trim()) return;

    setLoading(true);

    const { data, error } = await supabase.from('action_items').insert({
      title,
      description: description || null,
      owner: owner || null,
      due_date: dueDate || null,
      meeting_id: meetingId,
      source: 'Manual',
      status: 'Open', // ensure new actions start as Open
      created_by: createdBy || null, // new
    });

    console.log('insert result:', data, error);

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
    setCreatedBy(''); // reset
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

        {/* Manual action */}
        <section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">Add action</h2>
          </div>

          <div className="space-y-4 px-6 py-6">
            {/* Title */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                Title
              </label>
              <input
                type="text"
                placeholder="Action title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                Description
              </label>
              <textarea
                placeholder="Details"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* Owner */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">
                  Owner
                </label>
                <input
                  type="text"
                  placeholder="Owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>

              {/* Due date */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">
                  Due date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>

              {/* Meeting */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">
                  Linked meeting
                </label>
                <select
                  value={meetingId ?? ''}
                  onChange={(e) => setMeetingId(e.target.value || null)}
                  className="w-full rounded-md border px-3 py-2"
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

            {/* Created by */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">
                Created by
              </label>
              <input
                type="text"
                placeholder="Created by (optional)"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={addAction}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
              >
                Add action
              </button>
            </div>
          </div>
        </section>

        {/* Action list as table */}
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">Actions</h2>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading actions…</p>
          ) : actions.length === 0 ? (
            <p className="text-sm text-zinc-500">No actions yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Title
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Owner
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Due
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Meeting
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Created by
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Source
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Details
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id} className="align-top">
                      <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">
                        {a.title}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2">
                        {a.owner || '—'}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2">
                        {a.due_date
                          ? new Date(a.due_date).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2">
                        {a.meetings?.meeting_date
                          ? new Date(
                              a.meetings.meeting_date,
                            ).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2">
                        {a.created_by || '—'}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 text-xs text-zinc-600">
                        {a.source || '—'}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 max-w-xs">
                        {a.description ? (
                          <p className="whitespace-pre-wrap text-zinc-700">
                            {a.description}
                          </p>
                        ) : (
                          <span className="text-zinc-400 text-xs">No details</span>
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2">
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
