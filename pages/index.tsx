import { useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AgendaMenu from '../components/AgendaMenu';

const SHAREABLE_PAGES = [
  {
    title: 'Members Homepage',
    description: 'One members landing page with actions, previous minutes, and AGM minutes.',
    href: '/public',
  },
  {
    title: 'Previous Minutes',
    description: 'Read-only members page for sharing approved club minutes.',
    href: '/public/minutes',
  },
  {
    title: 'AGM Minutes',
    description: 'Read-only AGM minutes page for members and wider sharing.',
    href: '/public/agm-minutes',
  },
];

type JobClubPost = {
  id: string;
  title: string;
  description?: string | null;
  link_url?: string | null;
  contact?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

type JobClubNote = {
  id: string;
  name: string;
  notes: string;
  job_club_post_id?: string | null;
  created_at?: string | null;
};

export default function LandingPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [dueActions, setDueActions] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [meetingsOpen, setMeetingsOpen] = useState(true);
  const [jobClubPosts, setJobClubPosts] = useState<JobClubPost[]>([]);
  const [jobClubNotes, setJobClubNotes] = useState<JobClubNote[]>([]);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDescription, setNewJobDescription] = useState('');
  const [newJobLink, setNewJobLink] = useState('');
  const [newJobContact, setNewJobContact] = useState('');
  const [submittingJobClub, setSubmittingJobClub] = useState(false);
  const [jobClubStatus, setJobClubStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const jobClubTitleMap = useMemo(() => {
    return new Map(jobClubPosts.map((post) => [post.id, post.title]));
  }, [jobClubPosts]);

  // Get user session and redirect if not authenticated
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          setUserEmail(session.user.email || '');
          setLoading(false);
        } else {
          // Redirect to login if not authenticated
          router.push('/auth/login');
        }
      } catch (err) {
        router.push('/auth/login');
      }
    };
    
    // Only run if router is ready
    if (router.isReady) {
      getUser();
    }
  }, [router, router.isReady]);

  // Logout function
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  // fetch meetings
  const fetchMeetings = async () => {
    const { data } = await supabase
      .from('meetings')
      .select('*')
      .order('meeting_date', { ascending: true })
      .limit(1000);

    if (data) setMeetings(data);
  };

  // fetch upcoming (non-completed) actions
  const fetchDueActions = async () => {
    const { data, error } = await supabase
      .from('action_items')
      .select(`
        id,
        title,
        owner,
        due_date,
        status,
        meetings ( meeting_date )
      `)
      .neq('status', 'Completed')
      .order('due_date', { ascending: true }) // ✅ NULLs last by default
      .limit(6);

    if (error) {
      console.error('Failed to load actions', error);
      return;
    }

    setDueActions(data || []);
  };

  const fetchJobClubData = async () => {
    const [{ data: postsData, error: postsError }, { data: notesData, error: notesError }] = await Promise.all([
      supabase
        .from('job_club_posts')
        .select('id, title, description, link_url, contact, is_active, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('job_club_notes')
        .select('id, name, notes, job_club_post_id, created_at')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (postsError) {
      console.error('Failed to load job club posts', postsError);
      setJobClubPosts([]);
    } else {
      setJobClubPosts(postsData || []);
    }

    if (notesError) {
      console.error('Failed to load job club notes', notesError);
      setJobClubNotes([]);
    } else {
      setJobClubNotes(notesData || []);
    }
  };

  const createJobClubPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newJobTitle.trim()) {
      setJobClubStatus('Please add a title for the Job Club post.');
      return;
    }

    setSubmittingJobClub(true);
    setJobClubStatus(null);

    const { error } = await supabase.from('job_club_posts').insert({
      title: newJobTitle.trim(),
      description: newJobDescription.trim() || null,
      link_url: newJobLink.trim() || null,
      contact: newJobContact.trim() || null,
      is_active: true,
    });

    if (error) {
      setJobClubStatus(error.message);
      setSubmittingJobClub(false);
      return;
    }

    setNewJobTitle('');
    setNewJobDescription('');
    setNewJobLink('');
    setNewJobContact('');
    setJobClubStatus('Job Club post created.');
    setSubmittingJobClub(false);
    await fetchJobClubData();
  };

  const toggleJobClubPost = async (post: JobClubPost) => {
    const { error } = await supabase
      .from('job_club_posts')
      .update({ is_active: !post.is_active })
      .eq('id', post.id);

    if (error) {
      setJobClubStatus(error.message);
      return;
    }

    await fetchJobClubData();
  };

  const deleteJobClubPost = async (postId: string) => {
    const { error } = await supabase.from('job_club_posts').delete().eq('id', postId);
    if (error) {
      setJobClubStatus(error.message);
      return;
    }

    await fetchJobClubData();
  };

  useEffect(() => {
    let meetingsChannel: RealtimeChannel;
    let actionsChannel: RealtimeChannel;
    let jobClubPostsChannel: RealtimeChannel;
    let jobClubNotesChannel: RealtimeChannel;

    // initial load
    fetchMeetings();
    fetchDueActions();
    fetchJobClubData();

    // Realtime: Meetings
    meetingsChannel = supabase
      .channel('meetings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetings' },
        () => fetchMeetings(),
      )
      .subscribe();

    // Realtime: Actions
    actionsChannel = supabase
      .channel('action-items-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_items' },
        () => fetchDueActions(),
      )
      .subscribe();

    jobClubPostsChannel = supabase
      .channel('job-club-posts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_club_posts' },
        () => fetchJobClubData(),
      )
      .subscribe();

    jobClubNotesChannel = supabase
      .channel('job-club-notes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_club_notes' },
        () => fetchJobClubData(),
      )
      .subscribe();

    return () => {
      if (meetingsChannel) supabase.removeChannel(meetingsChannel);
      if (actionsChannel) supabase.removeChannel(actionsChannel);
      if (jobClubPostsChannel) supabase.removeChannel(jobClubPostsChannel);
      if (jobClubNotesChannel) supabase.removeChannel(jobClubNotesChannel);
    };
  }, []);

  // split dueActions: with due date vs no due date
  const actionsWithDue = dueActions.filter((a) => a.due_date);
  const actionsWithoutDue = dueActions.filter((a) => !a.due_date);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-10">
        <header className="mb-6 sm:mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1"></div>
            {userEmail && (
              <div className="text-right">
                <p className="text-sm font-medium text-zinc-900">{userEmail}</p>
                <p className="text-xs text-zinc-500">Logged in</p>
              </div>
            )}
          </div>
          <div className="text-center">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 lg:text-5xl">
              Aldwinians RUFC – Management Dashboard
            </h1>
            <p className="mt-2 text-sm sm:text-base text-zinc-600">
              Dashboard overview
              <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                ● Live
              </span>
            </p>
          </div>
        </header>

        <div className="mt-8 flex flex-col items-start gap-8 sm:flex-row">
          <AgendaMenu />
          <div className="flex-1 min-w-0 w-full">
            <section className="mb-12 rounded-lg bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🔗</span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Shareable Pages</h2>
                    <p className="text-xs text-slate-500">Members links that can be shared outside the dashboard</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                {SHAREABLE_PAGES.map((page) => (
                  <Link
                    key={page.href}
                    href={page.href}
                    className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{page.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{page.description}</p>
                      </div>
                      <span className="text-slate-400">↗</span>
                    </div>
                    <p className="mt-3 text-xs font-medium text-blue-600">Open members page</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="mb-12 rounded-lg bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">💼</span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Job Club Management</h2>
                    <p className="text-xs text-slate-500">Create public job listings and review notes from members</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 px-4 py-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <form className="rounded-lg border border-slate-200 bg-white p-4" onSubmit={createJobClubPost}>
                    <h3 className="text-base font-semibold text-slate-900">Add Job Club Post</h3>
                    <div className="mt-3 space-y-3">
                      <input
                        value={newJobTitle}
                        onChange={(event) => setNewJobTitle(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Title"
                      />
                      <textarea
                        value={newJobDescription}
                        onChange={(event) => setNewJobDescription(event.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Description"
                      />
                      <input
                        value={newJobLink}
                        onChange={(event) => setNewJobLink(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Link URL (optional)"
                      />
                      <input
                        value={newJobContact}
                        onChange={(event) => setNewJobContact(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Contact (optional)"
                      />
                    </div>

                    {jobClubStatus && (
                      <p className="mt-3 text-sm text-slate-700">{jobClubStatus}</p>
                    )}

                    <button
                      type="submit"
                      disabled={submittingJobClub}
                      className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submittingJobClub ? 'Saving...' : 'Create post'}
                    </button>
                  </form>

                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-slate-900">Current Job Club Posts</h3>
                    <div className="mt-3 space-y-3">
                      {jobClubPosts.length === 0 ? (
                        <p className="text-sm text-slate-500">No Job Club posts yet.</p>
                      ) : (
                        jobClubPosts.map((post) => (
                          <div key={post.id} className="rounded-md border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-900">{post.title}</p>
                                {post.description && (
                                  <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{post.description}</p>
                                )}
                                <p className="mt-2 text-xs text-slate-500">
                                  {post.is_active ? 'Public: Open' : 'Public: Closed'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleJobClubPost(post)}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                                >
                                  {post.is_active ? 'Close' : 'Open'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const confirmed = window.confirm('Delete this Job Club post?');
                                    if (confirmed) {
                                      void deleteJobClubPost(post.id);
                                    }
                                  }}
                                  className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-semibold text-slate-900">Recent Job Club Notes</h3>
                  <div className="mt-3 space-y-3 max-h-[560px] overflow-y-auto pr-1">
                    {jobClubNotes.length === 0 ? (
                      <p className="text-sm text-slate-500">No notes submitted yet.</p>
                    ) : (
                      jobClubNotes.map((note) => (
                        <article key={note.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-semibold text-slate-900">{note.name}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{note.notes}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>
                              {note.job_club_post_id
                                ? `Listing: ${jobClubTitleMap.get(note.job_club_post_id) || 'Unknown listing'}`
                                : 'Listing: General note'}
                            </span>
                            <span>•</span>
                            <span>
                              {note.created_at
                                ? new Date(note.created_at).toLocaleString('en-GB')
                                : 'Recently'}
                            </span>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Upcoming Meetings */}
            <section className="mb-12 rounded-lg bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setMeetingsOpen((o) => !o)}
                className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📅</span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Upcoming Meetings</h2>
                    <p className="text-xs text-slate-500">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className="text-slate-600 font-semibold">
                  {meetingsOpen ? '▾' : '▸'}
                </span>
              </button>

              {meetingsOpen && (
                <div className="px-4 py-4 bg-white">
                  {meetings.length === 0 ? (
                    <p className="text-sm text-zinc-500">No meetings scheduled.</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {meetings.map((m) => {
                        const dateLabel = new Date(m.meeting_date).toLocaleDateString(
                          'en-GB',
                        );
                        const isLocked = Boolean(m.is_locked);

                        return (
                          <Link
                            key={m.id}
                            href={`/meeting/${m.id}`}
                            className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 transition"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{dateLabel}</span>
                              {isLocked && <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-1">🔒 Locked</span>}
                            </div>
                            <span className="text-slate-400">→</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Upcoming Actions (with due date) */}
            <section>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900">
                  🎯 Upcoming Actions
                </h2>
                <Link
                  href="/agenda/actions"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View all
                </Link>
              </div>

              {actionsWithDue.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 bg-white p-6 text-zinc-500">
                  No dated actions.
                </p>
              ) : (
                <>
                  {/* Mobile: Card view */}
                  <div className="sm:hidden space-y-3">
                    {actionsWithDue.map((a) => {
                      const due = a.due_date ? new Date(a.due_date) : null;
                      const isOverdue =
                        due && due < new Date() && a.status !== 'Completed';

                      return (
                        <div
                          key={a.id}
                          className="rounded-lg border border-zinc-200 bg-white p-4"
                        >
                          <h3 className="font-semibold text-zinc-900 mb-2">
                            {a.title}
                          </h3>
                          <div className="space-y-1 text-sm text-zinc-600">
                            <p>
                              <span className="font-medium">Owner:</span>{' '}
                              {a.owner || '—'}
                            </p>
                            <p>
                              <span className="font-medium">Due:</span>{' '}
                              {due ? (
                                <span
                                  className={
                                    isOverdue
                                      ? 'text-red-600 font-semibold'
                                      : ''
                                  }
                                >
                                  {due.toLocaleDateString('en-GB')}
                                </span>
                              ) : (
                                '—'
                              )}
                            </p>
                            <p>
                              <span className="font-medium">Meeting:</span>{' '}
                              {a.meetings?.meeting_date
                                ? new Date(
                                    a.meetings.meeting_date,
                                  ).toLocaleDateString('en-GB')
                                : '—'}
                            </p>
                          </div>
                          <Link
                            href="/agenda/actions"
                            className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
                          >
                            Open →
                          </Link>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: Table view */}
                  <div className="hidden sm:block overflow-x-auto rounded-md border border-zinc-200 bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Title</th>
                          <th className="px-3 py-2 text-left">Owner</th>
                          <th className="px-3 py-2 text-left">Due</th>
                          <th className="px-3 py-2 text-left">Meeting</th>
                          <th className="px-3 py-2 text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actionsWithDue.map((a) => {
                          const due = a.due_date
                            ? new Date(a.due_date)
                            : null;
                          const isOverdue =
                            due && due < new Date() && a.status !== 'Completed';

                          return (
                            <tr key={a.id}>
                              <td className="px-3 py-2 font-medium">
                                {a.title}
                              </td>
                              <td className="px-3 py-2">{a.owner || '—'}</td>
                              <td className="px-3 py-2">
                                {due ? (
                                  <span
                                    className={
                                      isOverdue
                                        ? 'text-red-600 font-semibold'
                                        : ''
                                    }
                                  >
                                    {due.toLocaleDateString('en-GB')}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs text-zinc-600">
                                {a.meetings?.meeting_date
                                  ? new Date(
                                      a.meetings.meeting_date,
                                    ).toLocaleDateString('en-GB')
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Link
                                  href="/agenda/actions"
                                  className="text-blue-600 hover:underline"
                                >
                                  Open →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            {/* Undated actions */}
            <section className="mt-12">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900">
                  📋 Action Tracker
                </h2>
                <Link
                  href="/agenda/actions"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View all
                </Link>
              </div>

              {actionsWithoutDue.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 bg-white p-6 text-zinc-500">
                  No open undated actions 🎉
                </p>
              ) : (
                <>
                  {/* Mobile: Card view */}
                  <div className="sm:hidden space-y-3">
                    {actionsWithoutDue.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-zinc-200 bg-white p-4"
                      >
                        <h3 className="font-semibold text-zinc-900 mb-2">
                          {a.title}
                        </h3>
                        <div className="space-y-1 text-sm text-zinc-600">
                          <p>
                            <span className="font-medium">Owner:</span>{' '}
                            {a.owner || '—'}
                          </p>
                          <p>
                            <span className="font-medium">Meeting:</span>{' '}
                            {a.meetings?.meeting_date
                              ? new Date(
                                  a.meetings.meeting_date,
                                ).toLocaleDateString('en-GB')
                              : '—'}
                          </p>
                        </div>
                        <Link
                          href="/agenda/actions"
                          className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
                        >
                          Open →
                        </Link>
                      </div>
                    ))}
                  </div>

                  {/* Desktop: Table view */}
                  <div className="hidden sm:block overflow-x-auto rounded-md border border-zinc-200 bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Title</th>
                          <th className="px-3 py-2 text-left">Owner</th>
                          <th className="px-3 py-2 text-left">Meeting</th>
                          <th className="px-3 py-2 text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actionsWithoutDue.map((a) => (
                          <tr key={a.id}>
                            <td className="px-3 py-2 font-medium">{a.title}</td>
                            <td className="px-3 py-2">{a.owner || '—'}</td>
                            <td className="px-3 py-2 text-xs text-zinc-600">
                              {a.meetings?.meeting_date
                                ? new Date(
                                    a.meetings.meeting_date,
                                  ).toLocaleDateString('en-GB')
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Link
                                href="/agenda/actions"
                                className="text-blue-600 hover:underline"
                              >
                                Open →
                              </Link>
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
        </div>

        {/* Logout Button - Bottom of Page */}
        {userEmail && (
          <div className="mt-12 pb-8 flex justify-center">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

