import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AgendaMenu from '../components/AgendaMenu';

export default function LandingPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [dueActions, setDueActions] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const router = useRouter();

  // Get user session
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
      }
    };
    getUser();
  }, []);

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

  useEffect(() => {
    let meetingsChannel: RealtimeChannel;
    let actionsChannel: RealtimeChannel;

    // initial load
    fetchMeetings();
    fetchDueActions();

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

    return () => {
      if (meetingsChannel) supabase.removeChannel(meetingsChannel);
      if (actionsChannel) supabase.removeChannel(actionsChannel);
    };
  }, []);

  // split dueActions: with due date vs no due date
  const actionsWithDue = dueActions.filter((a) => a.due_date);
  const actionsWithoutDue = dueActions.filter((a) => !a.due_date);

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
            {/* Upcoming Meetings */}
            <section className="mb-12">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900">
                  📅 Upcoming Meetings
                </h2>
              </div>

              {meetings.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 bg-white p-6 text-zinc-500">
                  No meetings scheduled.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {meetings.map((m) => {
                    const dateLabel = new Date(m.meeting_date).toLocaleDateString(
                      'en-GB',
                    );
                    const isLocked = Boolean(m.is_locked);

                    return (
                      <Link
                        key={m.id}
                        href={`/meeting/${m.id}`}
                        className="player-card meeting-card transition-base hover:-translate-y-0.5 hover:shadow-md block"
                      >
                        <div className="pc-wrap">
                          <div className="pc-image">
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 text-xl">
                              📅
                            </div>
                          </div>

                          <div className="pc-mobile-header">
                            <h3 className="pc-name">{dateLabel}</h3>
                            <p className="pc-sponsor-text">
                              {isLocked
                                ? '🔒 Locked for editing'
                                : 'Open for agenda updates'}
                            </p>
                          </div>

                          <div className="pc-details">
                            <h3 className="pc-name">
                              {dateLabel}
                            </h3>
                            <p className="pc-meta">
                              {isLocked ? '🔒 Locked' : 'Open for updates'}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
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

