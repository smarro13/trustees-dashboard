import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';

type JobStatus = 'Not Started' | 'Ongoing' | 'Completed';
type JobPriority = 'High' | 'Medium' | 'Low';

type JobClubPost = {
  id: string;
  title: string | null;
  description: string | null;
  is_active: boolean | null;
  contact: string | null;
  created_at: string | null;
};

type JobClubNote = {
  id: string;
  name: string;
  notes: string;
  job_club_post_id: string | null;
  created_at: string | null;
};

type ParsedJobMeta = {
  area: string;
  job: string;
  status: JobStatus;
  priority: JobPriority;
  materials: string;
};

type EditValues = Partial<ParsedJobMeta>;

const JOB_META_PREFIX = 'JOB_META:';

const VALID_STATUSES: JobStatus[] = ['Not Started', 'Ongoing', 'Completed'];
const VALID_PRIORITIES: JobPriority[] = ['High', 'Medium', 'Low'];

const parseJobMeta = (description: string | null): ParsedJobMeta | null => {
  if (!description) return null;
  const firstLine = description.split('\n')[0]?.trim() ?? '';
  if (!firstLine.startsWith(JOB_META_PREFIX)) return null;
  try {
    const parsed = JSON.parse(firstLine.replace(JOB_META_PREFIX, '').trim()) as Partial<ParsedJobMeta>;
    if (!parsed.area || !parsed.job || !parsed.materials) return null;
    if (!parsed.status || !VALID_STATUSES.includes(parsed.status)) return null;
    if (!parsed.priority || !VALID_PRIORITIES.includes(parsed.priority)) return null;
    return parsed as ParsedJobMeta;
  } catch {
    return null;
  }
};

const buildDescription = (meta: ParsedJobMeta): string =>
  [
    `${JOB_META_PREFIX}${JSON.stringify(meta)}`,
    '',
    `Area: ${meta.area}`,
    `Job: ${meta.job}`,
    `Status: ${meta.status}`,
    `Priority: ${meta.priority}`,
    `Materials: ${meta.materials}`,
  ].join('\n');

const getStatusClasses = (status: JobStatus) => {
  if (status === 'Ongoing') return 'bg-amber-100 text-amber-800';
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-800';
  return 'bg-zinc-100 text-zinc-700';
};

const getPriorityClasses = (priority: JobPriority) => {
  if (priority === 'High') return 'bg-rose-100 text-rose-800';
  if (priority === 'Medium') return 'bg-amber-100 text-amber-800';
  return 'bg-sky-100 text-sky-800';
};

const formatDate = (value: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateTime = (value: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleString('en-GB');
};

export default function JobClubManagementPage() {
  const [posts, setPosts] = useState<JobClubPost[]>([]);
  const [notes, setNotes] = useState<JobClubNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'All' | JobStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | JobPriority>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showNotice = (type: InlineNotice['type'], message: string) => {
    setNotice({ type, message });
  };

  const loadData = async (withSpinner = true) => {
    if (withSpinner) {
      setLoading(true);
    }

    const [postsResult, notesResult] = await Promise.all([
      supabase
        .from('job_club_posts')
        .select('id, title, description, is_active, contact, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('job_club_notes')
        .select('id, name, notes, job_club_post_id, created_at')
        .order('created_at', { ascending: false }),
    ]);
    if (postsResult.data) setPosts(postsResult.data);
    if (notesResult.data) setNotes(notesResult.data);
    setLastSyncedAt(new Date().toISOString());

    if (withSpinner) {
      setLoading(false);
    }
  };

  useEffect(() => {
    let postsChannel: RealtimeChannel;
    let notesChannel: RealtimeChannel;

    loadData();

    postsChannel = supabase
      .channel('agenda-job-club-posts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_club_posts' }, () => loadData(false))
      .subscribe();

    notesChannel = supabase
      .channel('agenda-job-club-notes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_club_notes' }, () => loadData(false))
      .subscribe();

    return () => {
      if (postsChannel) supabase.removeChannel(postsChannel);
      if (notesChannel) supabase.removeChannel(notesChannel);
    };
  }, []);

  const refreshNow = async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
    showNotice('success', 'Job Club data refreshed.');
  };

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const notesByPost = useMemo(() => {
    const map = new Map<string, JobClubNote[]>();
    for (const note of notes) {
      if (!note.job_club_post_id) continue;
      const existing = map.get(note.job_club_post_id) ?? [];
      map.set(note.job_club_post_id, [...existing, note]);
    }
    return map;
  }, [notes]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const meta = parseJobMeta(post.description);
      if (statusFilter !== 'All' && meta?.status !== statusFilter) return false;
      if (priorityFilter !== 'All' && meta?.priority !== priorityFilter) return false;
      return true;
    });
  }, [posts, statusFilter, priorityFilter]);

  const stats = useMemo(() => {
    const all = posts.map((p) => parseJobMeta(p.description)).filter(Boolean) as ParsedJobMeta[];
    return {
      total: all.length,
      notStarted: all.filter((m) => m.status === 'Not Started').length,
      ongoing: all.filter((m) => m.status === 'Ongoing').length,
      completed: all.filter((m) => m.status === 'Completed').length,
    };
  }, [posts]);

  const startEdit = (post: JobClubPost) => {
    const meta = parseJobMeta(post.description);
    setEditValues(meta ?? {});
    setEditingPost(post.id);
  };

  const cancelEdit = () => {
    setEditingPost(null);
    setEditValues({});
  };

  const saveEdit = async (post: JobClubPost) => {
    const existingMeta = parseJobMeta(post.description);
    if (!existingMeta) return;

    const updated: ParsedJobMeta = {
      area: String(editValues.area ?? existingMeta.area).trim(),
      job: String(editValues.job ?? existingMeta.job).trim(),
      status: (editValues.status ?? existingMeta.status) as JobStatus,
      priority: (editValues.priority ?? existingMeta.priority) as JobPriority,
      materials: String(editValues.materials ?? existingMeta.materials).trim(),
    };

    setSaving(post.id);
    const { error } = await supabase
      .from('job_club_posts')
      .update({ description: buildDescription(updated), title: `${updated.area} - ${updated.job}` })
      .eq('id', post.id);
    setSaving(null);

    if (error) {
      showNotice('error', 'Failed to save changes: ' + error.message);
      return;
    }

    setEditingPost(null);
    setEditValues({});
    await loadData();
    showNotice('success', 'Job updated successfully.');
  };

  const toggleActive = async (post: JobClubPost) => {
    const { error } = await supabase
      .from('job_club_posts')
      .update({ is_active: !post.is_active })
      .eq('id', post.id);
    if (error) {
      showNotice('error', 'Failed to change visibility: ' + error.message);
      return;
    }
    await loadData();
    showNotice('success', `Job visibility set to ${post.is_active ? 'closed' : 'open'}.`);
  };

  const deletePost = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);

    const { error } = await supabase.from('job_club_posts').delete().eq('id', deleteTargetId);
    setDeleting(false);

    if (error) {
      showNotice('error', 'Failed to delete job: ' + error.message);
      return;
    }

    setDeleteTargetId(null);
    await loadData();
    showNotice('success', 'Job deleted.');
  };

  const toggleNotes = (postId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-zinc-900">Job Club Management</h1>
              <p className="mt-1 text-sm text-zinc-600">
                Manage job listings, update metadata and status, and review member notes and assignments.
              </p>
              {lastSyncedAt && (
                <p className="mt-2 text-xs text-zinc-500">Last synced: {formatDateTime(lastSyncedAt)}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refreshNow}
                disabled={refreshing}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <Link
                href="/public/job-club"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                View public page ↗
              </Link>
            </div>
          </div>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total jobs', value: stats.total },
            { label: 'Not started', value: stats.notStarted },
            { label: 'Ongoing', value: stats.ongoing },
            { label: 'Completed', value: stats.completed },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-white px-4 py-4 shadow-sm ring-1 ring-zinc-200">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | JobStatus)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="All">All statuses</option>
            {VALID_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'All' | JobPriority)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="All">All priorities</option>
            {VALID_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          {(statusFilter !== 'All' || priorityFilter !== 'All') && (
            <button
              type="button"
              onClick={() => { setStatusFilter('All'); setPriorityFilter('All'); }}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Clear filters
            </button>
          )}
          <p className="ml-auto text-sm text-zinc-500">{filteredPosts.length} of {posts.length} shown</p>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : filteredPosts.length === 0 ? (
          <p className="text-sm text-zinc-500">No jobs match the current filters.</p>
        ) : (
          <div className="space-y-5">
            {filteredPosts.map((post) => {
              const meta = parseJobMeta(post.description);
              const postNotes = notesByPost.get(post.id) ?? [];
              const isEditing = editingPost === post.id;
              const isSaving = saving === post.id;
              const notesExpanded = expandedNotes.has(post.id);

              return (
                <section key={post.id} className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-900">{post.title ?? 'Untitled'}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        {post.contact && <span>Submitted by: <span className="font-medium">{post.contact}</span></span>}
                        {post.created_at && <span>{formatDate(post.created_at)}</span>}
                        <span className={`rounded-full px-2 py-0.5 font-medium ${post.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>
                          {post.is_active ? 'Public: Open' : 'Public: Closed'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => startEdit(post)}
                          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleActive(post)}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        {post.is_active ? 'Close' : 'Open'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(post.id)}
                        className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  {isEditing && meta ? (
                    <div className="space-y-4 px-6 py-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-700">Area</label>
                          <input
                            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            value={editValues.area ?? meta.area}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, area: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-700">Job</label>
                          <input
                            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            value={editValues.job ?? meta.job}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, job: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-700">Status</label>
                          <select
                            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            value={editValues.status ?? meta.status}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, status: e.target.value as JobStatus }))}
                          >
                            {VALID_STATUSES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-700">Priority</label>
                          <select
                            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            value={editValues.priority ?? meta.priority}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, priority: e.target.value as JobPriority }))}
                          >
                            {VALID_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-700">Materials / Notes</label>
                        <textarea
                          rows={3}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                          value={editValues.materials ?? meta.materials}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, materials: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(post)}
                          disabled={isSaving}
                          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {isSaving ? 'Saving…' : 'Save changes'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : meta ? (
                    <div className="grid gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Area</p>
                        <p className="mt-1 text-sm text-zinc-900">{meta.area}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusClasses(meta.status)}`}>
                          {meta.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Priority</p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityClasses(meta.priority)}`}>
                          {meta.priority}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Materials / Notes</p>
                        <p className="mt-1 text-sm text-zinc-900">{meta.materials}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 py-5">
                      <p className="whitespace-pre-wrap text-sm text-zinc-700">{post.description}</p>
                    </div>
                  )}

                  {/* Member notes / task assignments */}
                  {postNotes.length > 0 && (
                    <div className="border-t border-zinc-200">
                      <button
                        type="button"
                        onClick={() => toggleNotes(post.id)}
                        className="flex w-full items-center justify-between px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        <span>
                          {postNotes.length} member {postNotes.length === 1 ? 'note' : 'notes'} / {postNotes.length === 1 ? 'assignment' : 'assignments'}
                        </span>
                        <span aria-hidden>{notesExpanded ? '▴' : '▾'}</span>
                      </button>
                      {notesExpanded && (
                        <div className="space-y-3 px-6 pb-5">
                          {postNotes.map((note) => (
                            <div key={note.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-zinc-900">{note.name}</p>
                                <p className="text-xs text-zinc-400">{formatDateTime(note.created_at)}</p>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{note.notes}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Delete this job?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        loading={deleting}
        onConfirm={deletePost}
        onCancel={() => setDeleteTargetId(null)}
      />
    </main>
  );
}
