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
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:py-10">
        <header className="mb-6 sm:mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900">
            ✅ Action Tracker
          </h1>
          <p className="mt-1 text-sm sm:text-base text-zinc-600">
            Track actions raised across meetings and reports
          </p>
        </header>

        {/* Add action */}
        <section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-lg sm:text-xl font-semibold">➕ Add action</h2>
          </div>

          <div className="space-y-4 px-4 sm:px-6 py-4 sm:py-6">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                className="w-full rounded-md border px-3 py-3 text-base"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter action title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                rows={3}
                className="w-full rounded-md border px-3 py-3 text-base"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium mb-1">Owner</label>
                <input
                  className="w-full rounded-md border px-3 py-3 text-base"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Assign owner"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Due date</label>
                <input
                  type="date"
                  className="w-full rounded-md border px-3 py-3 text-base"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Linked meeting</label>
                <select
                  className="w-full rounded-md border px-3 py-3 text-base"
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
              <label className="block text-sm font-medium mb-1">Created by</label>
              <input
                className="w-full rounded-md border px-3 py-3 text-base"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={addAction}
                disabled={loading}
                className="min-h-[44px] rounded-md bg-red-600 px-6 py-3 text-base font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add action'}
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
            <>
              {/* Mobile: Card view */}
              <div className="space-y-4 lg:hidden">
                {actions.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <h3 className="flex-1 font-semibold text-zinc-900">
                        {a.title}
                      </h3>
                      <select
                        value={a.status}
                        onChange={(e) => updateStatus(a.id, e.target.value)}
                        className="ml-2 min-h-[44px] rounded-md border px-3 py-2 text-sm"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="space-y-2 text-sm text-zinc-600">
                      {a.description && (
                        <p className="text-zinc-700">{a.description}</p>
                      )}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <p>
                          <span className="font-medium">Owner:</span>{' '}
                          {a.owner || '—'}
                        </p>
                        <p>
                          <span className="font-medium">Due:</span>{' '}
                          {a.due_date
                            ? new Date(a.due_date).toLocaleDateString('en-GB')
                            : '—'}
                        </p>
                        <p>
                          <span className="font-medium">Meeting:</span>{' '}
                          {a.meetings?.meeting_date
                            ? new Date(a.meetings.meeting_date).toLocaleDateString('en-GB')
                            : '—'}
                        </p>
                        <p>
                          <span className="font-medium">Created by:</span>{' '}
                          {a.created_by || '—'}
                        </p>
                        <p>
                          <span className="font-medium">Source:</span>{' '}
                          {a.source || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table view */}
              <div className="hidden lg:block overflow-x-auto rounded-md border bg-white">
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
            </>
          )}
        </section>
      </div>
    </main>
  );
}
