import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import { canCurrentUserEditThisAgendaPage, PRESIDENT_EDIT_BLOCK_MESSAGE } from '../../lib/presidentPermissions';

export default function MattersArisingPage() {
  const [matters, setMatters] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [raisedBy, setRaisedBy] = useState('');
  const [addToActions, setAddToActions] = useState(false);
  const [nextMeetingId, setNextMeetingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [canEdit, setCanEdit] = useState(true);

  // Editing an existing matter in place
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editRaisedBy, setEditRaisedBy] = useState('');
  const [editMeetingId, setEditMeetingId] = useState<string | null>(null);
  const [editAddToActions, setEditAddToActions] = useState(false);
  const [editWasOnActions, setEditWasOnActions] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const showNotice = (type: InlineNotice['type'], message: string) => {
    setNotice({ type, message });
  };

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

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const loadCanEdit = async () => {
      const allowed = await canCurrentUserEditThisAgendaPage();
      setCanEdit(allowed);
    };

    void loadCanEdit();
  }, []);

  const saveMatter = async () => {
    if (!(await canCurrentUserEditThisAgendaPage())) {
      showNotice('error', PRESIDENT_EDIT_BLOCK_MESSAGE);
      return;
    }

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
      showNotice('error', 'Error saving matter: ' + error.message);
      setLoading(false);
      return;
    }

    // 2️⃣ Optionally create action
    if (addToActions && data) {
      const { error: actionError } = await supabase.from('action_items').insert({
        title,
        description: details || null,
        meeting_id: nextMeetingId,
        source: 'Matters Arising',
        status: 'Open',
        created_by: raisedBy || null,
      });

      if (actionError) {
        setLoading(false);
        loadData();
        showNotice('error', 'Matter saved, but the linked action could not be created: ' + actionError.message);
        return;
      }
    }

    setTitle('');
    setDetails('');
    setRaisedBy('');
    setAddToActions(false);
    setLoading(false);
    loadData();
    showNotice('success', 'Matter arising saved successfully.');
  };

  const startEdit = (m: any) => {
    setEditingId(m.id);
    setEditTitle(m.title ?? '');
    setEditDetails(m.details ?? '');
    setEditRaisedBy(m.raised_by ?? '');
    setEditMeetingId(m.meeting_id ?? null);
    setEditAddToActions(Boolean(m.add_to_actions));
    setEditWasOnActions(Boolean(m.add_to_actions));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!(await canCurrentUserEditThisAgendaPage())) {
      showNotice('error', PRESIDENT_EDIT_BLOCK_MESSAGE);
      return;
    }
    if (!editTitle.trim()) return;

    setSavingEdit(true);
    const { error } = await supabase
      .from('matters_arising')
      .update({
        title: editTitle.trim(),
        details: editDetails,
        raised_by: editRaisedBy || null,
        meeting_id: editMeetingId,
        // Once on the Action Tracker it stays there; untick by closing the action.
        add_to_actions: editAddToActions || editWasOnActions,
      })
      .eq('id', editingId);

    if (error) {
      setSavingEdit(false);
      showNotice('error', 'Failed to update matter: ' + error.message);
      return;
    }

    // Newly ticked: create the action, as when a matter is first saved.
    if (editAddToActions && !editWasOnActions) {
      const { error: actionError } = await supabase.from('action_items').insert({
        title: editTitle.trim(),
        description: editDetails || null,
        meeting_id: editMeetingId,
        source: 'Matters Arising',
        status: 'Open',
        created_by: editRaisedBy || null,
      });
      if (actionError) {
        setSavingEdit(false);
        setEditingId(null);
        loadData();
        showNotice('error', 'Matter updated, but the linked action could not be created: ' + actionError.message);
        return;
      }
    }

    setSavingEdit(false);
    setEditingId(null);
    loadData();
    showNotice('success', 'Matter arising updated.');
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

        <InlineNoticeBanner notice={notice} className="mt-4" />

        {!canEdit && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {PRESIDENT_EDIT_BLOCK_MESSAGE}
          </div>
        )}

        <section className="mt-8 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200 p-6 space-y-4">
          <input
            type="text"
            placeholder="Topic title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            disabled={!canEdit}
          />

          <textarea
            placeholder="Details / context"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            className="w-full rounded-md border px-3 py-2"
            disabled={!canEdit}
          />

          <input
            type="text"
            placeholder="Raised by (optional)"
            value={raisedBy}
            onChange={(e) => setRaisedBy(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            disabled={!canEdit}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addToActions}
              onChange={(e) => setAddToActions(e.target.checked)}
              disabled={!canEdit}
            />
            Add to Action Tracker
          </label>

          <div className="flex justify-end">
            <button
              onClick={saveMatter}
              disabled={loading || !canEdit}
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
            matters.map((m) =>
              editingId === m.id ? (
              <div key={m.id} className="player-card space-y-3">
                <input
                  type="text"
                  placeholder="Topic title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />

                <textarea
                  placeholder="Details / context"
                  value={editDetails}
                  onChange={(e) => setEditDetails(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border px-3 py-2"
                />

                <input
                  type="text"
                  placeholder="Raised by (optional)"
                  value={editRaisedBy}
                  onChange={(e) => setEditRaisedBy(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />

                <select
                  value={editMeetingId ?? ''}
                  onChange={(e) => setEditMeetingId(e.target.value || null)}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="">Not linked to a meeting</option>
                  {meetings.map((mt) => (
                    <option key={mt.id} value={mt.id}>
                      {new Date(mt.meeting_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </option>
                  ))}
                </select>

                {editWasOnActions ? (
                  <p className="text-xs text-blue-600">
                    ✓ Already on the Action Tracker (edit or close it there)
                  </p>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editAddToActions}
                      onChange={(e) => setEditAddToActions(e.target.checked)}
                    />
                    Add to Action Tracker
                  </label>
                )}

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
                    disabled={savingEdit || !editTitle.trim()}
                    className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
              ) : (
              <div key={m.id} className="player-card">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="pc-name text-lg">{m.title}</h3>
                  {canEdit && (
                    <button
                      onClick={() => startEdit(m)}
                      className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>

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
              )
            )}
        </section>
      </div>
    </main>
  );
}
