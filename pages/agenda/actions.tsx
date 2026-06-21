import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';

const STATUS_OPTIONS = ['Open', 'In Progress', 'Completed'];
const PUBLIC_ACTION_MARKER = '[Public]';

const stripPublicMarker = (source: string | null | undefined) =>
  (source || '').replace(PUBLIC_ACTION_MARKER, '').trim();

const hasPublicMarker = (source: string | null | undefined) =>
  (source || '').includes(PUBLIC_ACTION_MARKER);

const buildSourceValue = (source: string | null | undefined, isPublic: boolean) => {
  const cleanedSource = stripPublicMarker(source);

  if (isPublic) {
    return cleanedSource ? `${PUBLIC_ACTION_MARKER} ${cleanedSource}` : PUBLIC_ACTION_MARKER;
  }

  return cleanedSource || null;
};

export default function ActionTrackerPage() {
  const [actions, setActions] = useState<any[]>([]);
  const [actionStatusHistory, setActionStatusHistory] = useState<Record<string, any[]>>({});
  const [meetings, setMeetings] = useState<any[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCompletedActions, setShowCompletedActions] = useState(false);

  // Status change modal
  const [statusChangeModal, setStatusChangeModal] = useState<{
    actionId: string;
    currentStatus: string;
    newStatus: string;
    actionTitle: string;
  } | null>(null);
  const [statusUpdateNote, setStatusUpdateNote] = useState('');

  // Edit action modal
  const [editActionModal, setEditActionModal] = useState<{
    actionId: string;
  } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editMeetingId, setEditMeetingId] = useState<string | null>(null);
  const [editCreatedBy, setEditCreatedBy] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(false);

  // manual entry
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState('');
  const [isPublicAction, setIsPublicAction] = useState(false);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);

  const showNotice = (type: InlineNotice['type'], message: string) => {
    setNotice({ type, message });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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

    // Load status update history for all actions
    const { data: historyData } = await supabase
      .from('action_status_updates')
      .select('*')
      .order('updated_at', { ascending: false });

    if (historyData) {
      const historyByAction: Record<string, any[]> = {};
      historyData.forEach((update) => {
        if (!historyByAction[update.action_id]) {
          historyByAction[update.action_id] = [];
        }
        historyByAction[update.action_id].push(update);
      });
      setActionStatusHistory(historyByAction);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const addAction = async () => {
    if (!title.trim()) return;

    setLoading(true);

    const { error } = await supabase.from('action_items').insert({
      title,
      description: description || null,
      owner: owner || null,
      due_date: dueDate || null,
      meeting_id: meetingId,
      source: buildSourceValue('Manual', isPublicAction),
      status: 'Open',
      created_by: createdBy || null,
    });

    setLoading(false);

    if (error) {
      showNotice('error', error.message);
      return;
    }

    setTitle('');
    setDescription('');
    setOwner('');
    setDueDate('');
    setMeetingId(null);
    setCreatedBy('');
    setIsPublicAction(false);

    loadData();
    showNotice('success', 'Action added successfully.');
  };

  const initiateStatusChange = (actionId: string, currentStatus: string, newStatus: string, actionTitle: string) => {
    if (currentStatus === newStatus) return;
    
    setStatusChangeModal({
      actionId,
      currentStatus,
      newStatus,
      actionTitle,
    });
    setStatusUpdateNote('');
  };

  const confirmStatusChange = async () => {
    if (!statusChangeModal) return;

    const { actionId, newStatus } = statusChangeModal;
    
    setLoading(true);

    // Update the action status
    const { error } = await supabase
      .from('action_items')
      .update({
        status: newStatus,
        completed_at: newStatus === 'Completed' ? new Date().toISOString() : null,
      })
      .eq('id', actionId);

    if (error) {
      showNotice('error', 'Failed to update status: ' + error.message);
      setLoading(false);
      return;
    }

    // Insert status update history
    if (statusUpdateNote.trim()) {
      await supabase.from('action_status_updates').insert({
        action_id: actionId,
        status: newStatus,
        update_note: statusUpdateNote.trim(),
        updated_by: createdBy || 'Unknown',
        updated_at: new Date().toISOString(),
      });
    }

    // Reload data first, then close modal
    await loadData();
    
    setStatusChangeModal(null);
    setStatusUpdateNote('');
    setLoading(false);
    showNotice('success', 'Action status updated.');
  };

  const cancelStatusChange = () => {
    setStatusChangeModal(null);
    setStatusUpdateNote('');
  };

  const initiateEditAction = (action: any) => {
    setEditActionModal({
      actionId: action.id,
    });
    setEditTitle(action.title);
    setEditDescription(action.description || '');
    setEditOwner(action.owner || '');
    setEditDueDate(action.due_date || '');
    setEditMeetingId(action.meeting_id || null);
    setEditCreatedBy(action.created_by || '');
    setEditSource(stripPublicMarker(action.source || ''));
    setEditIsPublic(hasPublicMarker(action.source));
  };

  const confirmEditAction = async () => {
    if (!editActionModal || !editTitle.trim()) return;

    const { actionId } = editActionModal;

    setLoading(true);

    // Update the action
    const { error } = await supabase
      .from('action_items')
      .update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        owner: editOwner.trim() || null,
        due_date: editDueDate || null,
        meeting_id: editMeetingId || null,
        created_by: editCreatedBy.trim() || null,
        source: buildSourceValue(editSource.trim(), editIsPublic),
      })
      .eq('id', actionId);

    if (error) {
      showNotice('error', 'Failed to update action: ' + error.message);
      setLoading(false);
      return;
    }

    // Reload data first, then close modal
    await loadData();

    setEditActionModal(null);
    setEditTitle('');
    setEditDescription('');
    setEditOwner('');
    setEditDueDate('');
    setEditMeetingId(null);
    setEditCreatedBy('');
    setEditSource('');
    setEditIsPublic(false);
    setLoading(false);
    showNotice('success', 'Action updated successfully.');
  };

  const cancelEditAction = () => {
    setEditActionModal(null);
    setEditTitle('');
    setEditDescription('');
    setEditOwner('');
    setEditDueDate('');
    setEditMeetingId(null);
    setEditCreatedBy('');
    setEditSource('');
    setEditIsPublic(false);
  };

  // Filter actions into active and completed
  const activeActions = actions.filter((a) => a.status !== 'Completed');
  const completedActions = actions.filter((a) => a.status === 'Completed');

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

        <InlineNoticeBanner notice={notice} className="mb-6" />

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

            <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={isPublicAction}
                onChange={(e) => setIsPublicAction(e.target.checked)}
              />
              Make this action public
            </label>

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

        {/* Active Actions table */}
        <section className="mb-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">Active Actions</h2>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading actions…</p>
          ) : activeActions.length === 0 ? (
            <p className="text-sm text-zinc-500">No active actions.</p>
          ) : (
            <>
              {/* Mobile: Card view */}
              <div className="space-y-4 lg:hidden">
                {activeActions.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-zinc-200 bg-white"
                  >
                    <button
                      onClick={() => toggleExpanded(a.id)}
                      className="w-full p-4 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="flex-1 font-semibold text-zinc-900">
                          {a.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            a.status === 'Completed' ? 'bg-green-100 text-green-800' :
                            a.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                            'bg-zinc-100 text-zinc-800'
                          }`}>
                            {a.status}
                          </span>
                          <svg
                            className={`w-5 h-5 text-zinc-400 transition-transform ${
                              expandedIds.has(a.id) ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </button>

                    {expandedIds.has(a.id) && (
                      <div className="px-4 pb-4 border-t pt-3">
                      <div className="flex gap-2 mb-3">
                        <select
                          value={a.status}
                          onChange={(e) => initiateStatusChange(a.id, a.status, e.target.value, a.title)}
                          className="flex-1 min-h-[44px] rounded-md border px-3 py-2 text-sm"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => initiateEditAction(a)}
                          className="min-h-[44px] rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                          title="Edit action details"
                        >
                          ✏️
                        </button>
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
                          {stripPublicMarker(a.source) || '—'}
                          {hasPublicMarker(a.source) && (
                            <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Public
                            </span>
                          )}
                        </p>
                      </div>
                      
                      {actionStatusHistory[a.id] && actionStatusHistory[a.id].length > 0 && (
                        <div className="mt-4 pt-3 border-t border-zinc-200">
                          <p className="font-medium text-sm mb-2">Status History:</p>
                          <div className="space-y-2">
                            {actionStatusHistory[a.id].map((update) => (
                              <div key={update.id} className="rounded-md bg-zinc-50 p-2 text-xs">
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`px-2 py-0.5 rounded ${
                                    update.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                    update.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                    'bg-zinc-100 text-zinc-800'
                                  }`}>
                                    {update.status}
                                  </span>
                                  <span className="text-zinc-500">
                                    {new Date(update.updated_at).toLocaleDateString('en-GB')} {new Date(update.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                {update.update_note && (
                                  <p className="text-zinc-700 mt-1">{update.update_note}</p>
                                )}
                                {update.updated_by && (
                                  <p className="text-zinc-500 mt-1">— {update.updated_by}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      </div>
                      </div>
                    )}
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
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeActions.map((a) => (
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
                        <td className="px-3 py-2 text-xs">
                          {stripPublicMarker(a.source) || '—'}
                          {hasPublicMarker(a.source) && (
                            <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                              Public
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {a.description || <span className="text-zinc-400">No details</span>}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={a.status}
                            onChange={(e) => initiateStatusChange(a.id, a.status, e.target.value, a.title)}
                            className="rounded-md border px-2 py-1 text-xs"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => initiateEditAction(a)}
                            className="inline-flex items-center justify-center rounded bg-blue-600 p-1.5 text-white hover:bg-blue-700"
                            title="Edit action details"
                          >
                            ✏️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Completed Actions - Collapsible section */}
        {completedActions.length > 0 && (
          <section className="mt-6">
            <button
              onClick={() => setShowCompletedActions(!showCompletedActions)}
              className="flex items-center justify-between w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200 px-4 sm:px-6 py-3 sm:py-4 hover:bg-zinc-50 transition-colors"
            >
              <h2 className="text-lg sm:text-xl font-semibold text-zinc-900">
                ✓ Completed Actions ({completedActions.length})
              </h2>
              <svg
                className={`w-5 h-5 text-zinc-400 transition-transform ${
                  showCompletedActions ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showCompletedActions && (
              <div className="mt-4">
                {/* Mobile: Card view */}
                <div className="space-y-4 lg:hidden">
                  {completedActions.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-lg border border-zinc-200 bg-white"
                    >
                      <button
                        onClick={() => toggleExpanded(a.id)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="flex-1 font-semibold text-zinc-900">
                            {a.title}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">
                              {a.status}
                            </span>
                            <svg
                              className={`w-5 h-5 text-zinc-400 transition-transform ${
                                expandedIds.has(a.id) ? 'rotate-180' : ''
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </button>

                      {expandedIds.has(a.id) && (
                        <div className="px-4 pb-4 border-t pt-3">
                        <select
                          value={a.status}
                          onChange={(e) => initiateStatusChange(a.id, a.status, e.target.value, a.title)}
                          className="w-full mb-3 min-h-[44px] rounded-md border px-3 py-2 text-sm"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      
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
                            {stripPublicMarker(a.source) || '—'}
                            {hasPublicMarker(a.source) && (
                              <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                Public
                              </span>
                            )}
                          </p>
                        </div>
                        
                        {actionStatusHistory[a.id] && actionStatusHistory[a.id].length > 0 && (
                          <div className="mt-4 pt-3 border-t border-zinc-200">
                            <p className="font-medium text-sm mb-2">Status History:</p>
                            <div className="space-y-2">
                              {actionStatusHistory[a.id].map((update) => (
                                <div key={update.id} className="rounded-md bg-zinc-50 p-2 text-xs">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={`px-2 py-0.5 rounded ${
                                      update.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                      update.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                      'bg-zinc-100 text-zinc-800'
                                    }`}>
                                      {update.status}
                                    </span>
                                    <span className="text-zinc-500">
                                      {new Date(update.updated_at).toLocaleDateString('en-GB')} {new Date(update.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  {update.update_note && (
                                    <p className="text-zinc-700 mt-1">{update.update_note}</p>
                                  )}
                                  {update.updated_by && (
                                    <p className="text-zinc-500 mt-1">— {update.updated_by}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        </div>
                        </div>
                      )}
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
                        <th className="px-3 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedActions.map((a) => (
                        <tr key={a.id} className="bg-green-50/30">
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
                          <td className="px-3 py-2 text-xs">
                            {stripPublicMarker(a.source) || '—'}
                            {hasPublicMarker(a.source) && (
                              <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                                Public
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {a.description || <span className="text-zinc-400">No details</span>}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={a.status}
                              onChange={(e) => initiateStatusChange(a.id, a.status, e.target.value, a.title)}
                              className="rounded-md border px-2 py-1 text-xs"
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => initiateEditAction(a)}
                              className="inline-flex items-center justify-center rounded bg-blue-600 p-1.5 text-white hover:bg-blue-700"
                              title="Edit action details"
                            >
                              ✏️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Status Change Modal */}
        {statusChangeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
              <div className="border-b border-zinc-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-zinc-900">Update Action Status</h3>
              </div>
              
              <div className="px-6 py-4 space-y-4">
                <div>
                  <p className="text-sm font-medium text-zinc-700 mb-1">Action:</p>
                  <p className="text-sm text-zinc-600">{statusChangeModal.actionTitle}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-zinc-700 mb-1">Status Change:</p>
                  <p className="text-sm">
                    <span className="inline-block px-2 py-1 rounded bg-zinc-100 text-zinc-800">
                      {statusChangeModal.currentStatus}
                    </span>
                    <span className="mx-2">→</span>
                    <span className={`inline-block px-2 py-1 rounded ${
                      statusChangeModal.newStatus === 'Completed' ? 'bg-green-100 text-green-800' :
                      statusChangeModal.newStatus === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-zinc-100 text-zinc-800'
                    }`}>
                      {statusChangeModal.newStatus}
                    </span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Update / Closing Note
                    {statusChangeModal.newStatus === 'Completed' && (
                      <span className="text-red-600 ml-1">*</span>
                    )}
                  </label>
                  <textarea
                    value={statusUpdateNote}
                    onChange={(e) => setStatusUpdateNote(e.target.value)}
                    placeholder="Describe the progress made or why this action is being closed..."
                    rows={4}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {statusChangeModal.newStatus === 'Completed' && !statusUpdateNote.trim() && (
                    <p className="mt-1 text-xs text-amber-600">A closing note is strongly recommended for completed actions</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4">
                <button
                  onClick={cancelStatusChange}
                  disabled={loading}
                  className="min-h-[44px] rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmStatusChange}
                  disabled={loading}
                  className="min-h-[44px] rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Updating...' : 'Confirm Update'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Action Modal */}
        {editActionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="border-b border-zinc-200 px-6 py-4 sticky top-0 bg-white">
                <h3 className="text-lg font-semibold text-zinc-900">Edit Action Details</h3>
              </div>
              
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Enter action title"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Add description"
                    rows={3}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Owner</label>
                    <input
                      type="text"
                      value={editOwner}
                      onChange={(e) => setEditOwner(e.target.value)}
                      placeholder="Assign owner"
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Due Date</label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Linked Meeting</label>
                    <select
                      value={editMeetingId ?? ''}
                      onChange={(e) => setEditMeetingId(e.target.value || null)}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">No meeting linked</option>
                      {meetings.map((m) => (
                        <option key={m.id} value={m.id}>
                          {new Date(m.meeting_date).toLocaleDateString('en-GB')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Created By</label>
                    <input
                      type="text"
                      value={editCreatedBy}
                      onChange={(e) => setEditCreatedBy(e.target.value)}
                      placeholder="Creator name"
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Source</label>
                  <input
                    type="text"
                    value={editSource}
                    onChange={(e) => setEditSource(e.target.value)}
                    placeholder="e.g., Manual, AOB, Treasury"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={editIsPublic}
                    onChange={(e) => setEditIsPublic(e.target.checked)}
                  />
                  Make this action public
                </label>
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 sticky bottom-0 bg-white">
                <button
                  onClick={cancelEditAction}
                  disabled={loading}
                  className="min-h-[44px] rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmEditAction}
                  disabled={loading || !editTitle.trim()}
                  className="min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Updating...' : 'Update Action'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
