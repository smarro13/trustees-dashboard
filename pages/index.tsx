import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';
import AgendaMenu from '../components/AgendaMenu';

export default function LandingPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [dueActions, setDueActions] = useState<any[]>([]);

  const updateActionStatus = async (actionId: string, status: string) => {
    await supabase.from('actions').update({ status }).eq('id', actionId);
  };

  // fetch meetings
  const fetchMeetings = async () => {
    const { data } = await supabase
      .from('meetings')
      .select('*')
      .order('meeting_date', { ascending: true })
      .limit(5);
    if (data) setMeetings(data);
  };

  // fetch dashboard actions (from `actions` table)
  const fetchActions = async () => {
    const { data } = await supabase
      .from('actions')
      .select('*')
      .order('due_date', { ascending: true })
      .limit(5);
    if (data) setActions(data);
  };

  // fetch upcoming (non-completed) actions from action_items
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
      .order('due_date', { ascending: true, nullsLast: true })
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
    fetchActions();
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
      .channel('actions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'actions' },
        () => fetchActions(),
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
      <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
            Aldwinians RUFC - Management Dashboard
          </h1>
          <p className="mt-2 text-zinc-600">
            Dashboard overview
            <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              ● Live
            </span>
          </p>
        </header>

        <div className="mt-8 flex flex-col items-start gap-8 sm:flex-row">
          <AgendaMenu />
          <div className="flex-1 min-w-0 w-full">
            {/* Upcoming Meetings */}
            <section className="mb-12">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900">Upcoming Meetings</h2>
                <Link href="/meetings" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                  View all
                </Link>
              </div>

              {meetings.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 bg-white p-6 text-zinc-500">
                  No meetings scheduled.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {meetings.map((m) => {
                    const dateLabel = new Date(m.meeting_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    });
                    const isLocked = Boolean(m.is_locked);
                    return (
                      <div key={m.id} className="player-card meeting-card transition-base hover:-translate-y-0.5 hover:shadow-md">
                        <div className="pc-wrap">
                          <div className="pc-image">
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 text-xl">
                              📅
                            </div>
                          </div>

                          <div className="pc-mobile-header">
                            <h3 className="pc-name">{dateLabel}</h3>
                            <p className="pc-sponsor-text">
                              {isLocked ? '🔒 Locked for editing' : 'Open for agenda updates'}
                            </p>
                          </div>

                          <div className="pc-details">
                            <h3 className="pc-name">
                              <Link href={`/meeting/${m.id}`} className="hover:underline">
                                {dateLabel}
                              </Link>
                            </h3>
                            <p className="pc-meta">{isLocked ? '🔒 Locked' : 'Open for updates'}</p>
                            <div className="pc-tags">
                              <span className={`pc-tag ${isLocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isLocked ? 'Locked' : 'Open'}
                              </span>
                            </div>
                          </div>

                          <details className="pc-dropdown">
                            <summary>Details</summary>
                            <p className="pc-meta">{isLocked ? '🔒 Locked' : 'Open for updates'}</p>
                            <div className="pc-tags">
                              <span className={`pc-tag ${isLocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {isLocked ? 'Locked' : 'Open'}
                              </span>
                            </div>
                            <div className="mt-2 text-sm">
                              <Link href={`/meeting/${m.id}`} className="text-blue-600 hover:underline">
                                Open meeting
                              </Link>
                            </div>
                          </details>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Upcoming Actions – show dated actions in a table */}
            <section>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900">Upcoming Actions</h2>
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
                <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="border-b border-zinc-200 px-3 py-2 text-left">Title</th>
                        <th className="border-b border-zinc-200 px-3 py-2 text-left">Owner</th>
                        <th className="border-b border-zinc-200 px-3 py-2 text-left">Due</th>
                        <th className="border-b border-zinc-200 px-3 py-2 text-left">Meeting</th>
                        <th className="border-b border-zinc-200 px-3 py-2 text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionsWithDue.map((a) => {
                        const due = a.due_date ? new Date(a.due_date) : null;
                        const isOverdue =
                          due && due < new Date() && a.status !== 'Completed';

                        return (
                          <tr key={a.id} className="align-middle">
                            <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">
                              {a.title}
                            </td>
                            <td className="border-b border-zinc-100 px-3 py-2">
                              {a.owner || '—'}
                            </td>
                            <td className="border-b border-zinc-100 px-3 py-2">
                              {due ? (
                                <span
                                  className={
                                    isOverdue ? 'text-red-600 font-semibold' : ''
                                  }
                                >
                                  {due.toLocaleDateString('en-GB')}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="border-b border-zinc-100 px-3 py-2 text-xs text-zinc-600">
                              {a.meetings?.meeting_date
                                ? new Date(
                                    a.meetings.meeting_date,
                                  ).toLocaleDateString('en-GB')
                                : '—'}
                            </td>
                            <td className="border-b border-zinc-100 px-3 py-2 text-right">
                              <Link
                                href="/agenda/actions"
                                className="text-sm text-blue-600 hover:underline"
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
              )}
            </section>

            {/* Action Tracker – open actions with NO due date, also in a table */}
            <section className="mb-12 mt-12">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900">
                  Action Tracker
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
                <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="border-b border-zinc-200 px-3 py-2 text-left">Title</th>
                        <th className="border-b border-zinc-200 px-3 py-2 text-left">Owner</th>
                        <th className="border-b border-zinc-200 px-3 py-2 text-left">Meeting</th>
                        <th className="border-b border-zinc-200 px-3 py-2 text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionsWithoutDue.map((a) => (
                        <tr key={a.id} className="align-middle">
                          <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">
                            {a.title}
                          </td>
                          <td className="border-b border-zinc-100 px-3 py-2">
                            {a.owner || '—'}
                          </td>
                          <td className="border-b border-zinc-100 px-3 py-2 text-xs text-zinc-600">
                            {a.meetings?.meeting_date
                              ? new Date(
                                  a.meetings.meeting_date,
                                ).toLocaleDateString('en-GB')
                              : '—'}
                          </td>
                          <td className="border-b border-zinc-100 px-3 py-2 text-right">
                            <Link
                              href="/agenda/actions"
                              className="text-sm text-blue-600 hover:underline"
                            >
                              Open →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}