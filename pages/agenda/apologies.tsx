import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import { canCurrentUserEditThisAgendaPage, PRESIDENT_EDIT_BLOCK_MESSAGE } from '../../lib/presidentPermissions';

export default function ApologiesPage() {
  const [apologies, setApologies] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  // Editing an existing apology in place
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editMeetingId, setEditMeetingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
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

  useEffect(() => {
    const loadCanEdit = async () => {
      const allowed = await canCurrentUserEditThisAgendaPage();
      setCanEdit(allowed);
    };

    void loadCanEdit();
  }, []);

  const addApology = async () => {
    if (!(await canCurrentUserEditThisAgendaPage())) {
      window.alert(PRESIDENT_EDIT_BLOCK_MESSAGE);
      return;
    }

    if (!name.trim()) return;

    setLoading(true);
    const { error } = await supabase.from('apologies').insert({
      name,
      note,
      meeting_id: meetingId
    });
    setLoading(false);

    if (error) {
      window.alert(`Could not save apology: ${error.message}`);
      return;
    }

    setName('');
    setNote('');
    setMeetingId(null);
    loadApologies();
  };

  const startEdit = (a: any) => {
    setEditingId(a.id);
    setEditName(a.name ?? '');
    setEditNote(a.note ?? '');
    setEditMeetingId(a.meeting_id ?? null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!(await canCurrentUserEditThisAgendaPage())) {
      window.alert(PRESIDENT_EDIT_BLOCK_MESSAGE);
      return;
    }
    if (!editName.trim()) return;

    setSavingEdit(true);
    const { error } = await supabase
      .from('apologies')
      .update({ name: editName.trim(), note: editNote, meeting_id: editMeetingId })
      .eq('id', editingId);
    setSavingEdit(false);

    if (error) {
      window.alert(`Could not update apology: ${error.message}`);
      return;
    }

    setEditingId(null);
    loadApologies(meetingId);
  };

  const formatMeeting = (date: string) =>
    new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  return (
    <main className="min-h-screen">
      {/* expand width similar to other agenda pages */}
      <div className="mx-auto w-full max-w-6xl sm:max-w-7xl lg:max-w-[1200px] px-2 sm:px-4 lg:px-6 py-6 sm:py-8 lg:py-10">
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

        {!canEdit && (
          <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {PRESIDENT_EDIT_BLOCK_MESSAGE}
          </div>
        )}

        {/* Add apology – full-width, lightly styled section */}
        <section className="mb-8 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <h2 className="pc-name text-xl font-semibold">
              Add apology
            </h2>
          </div>

          {/* Any future controls should live inside this padded block */}
          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-3">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              disabled={!canEdit}
            />

            <textarea
              placeholder="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              rows={3}
              disabled={!canEdit}
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
              disabled={!canEdit}
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

            <div className="flex justify-end">
              <button
                onClick={addApology}
                disabled={loading || !canEdit}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Adding…' : 'Add apology'}
              </button>
            </div>
          </div>
        </section>

        {/* List */}
        <section>
          {apologies.length === 0 ? (
            <p className="text-zinc-500">No apologies recorded.</p>
          ) : (
            <div className="space-y-4">
              {apologies.map((a) =>
                editingId === a.id ? (
                <div key={a.id} className="player-card space-y-3">
                  <input
                    type="text"
                    placeholder="Name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <textarea
                    placeholder="Optional note"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                    rows={3}
                  />
                  <select
                    value={editMeetingId ?? ''}
                    onChange={(e) => setEditMeetingId(e.target.value || null)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  >
                    <option value="">Not linked to a meeting</option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatMeeting(m.meeting_date)}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={savingEdit}
                      className="rounded-md border border-zinc-300 px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={savingEdit || !editName.trim()}
                      className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {savingEdit ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
                ) : (
                <div key={a.id} className="player-card">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="pc-name text-lg">{a.name}</h3>
                    {canEdit && (
                      <button
                        onClick={() => startEdit(a)}
                        className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
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
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
