import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';

export default function LandingPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);

  useEffect(() => {
    let meetingsChannel: RealtimeChannel;
    let actionsChannel: RealtimeChannel;

    const loadMeetings = async () => {
      const { data } = await supabase
        .from('meetings')
        .select('*')
        .order('meeting_date', { ascending: true })
        .limit(5);
      if (data) setMeetings(data);
    };

    const loadActions = async () => {
      const { data } = await supabase
        .from('actions')
        .select('*')
        .order('due_date', { ascending: true })
        .limit(5);
      if (data) setActions(data);
    };

    // Initial load
    loadMeetings();
    loadActions();

    // Realtime: Meetings
    meetingsChannel = supabase
      .channel('meetings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetings' },
        () => loadMeetings()
      )
      .subscribe();

    // Realtime: Actions
    actionsChannel = supabase
      .channel('actions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'actions' },
        () => loadActions()
      )
      .subscribe();

    return () => {
      if (meetingsChannel) supabase.removeChannel(meetingsChannel);
      if (actionsChannel) supabase.removeChannel(actionsChannel);
    };
  }, []);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-10">
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

        {/* Upcoming Actions */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-zinc-900">Upcoming Actions</h2>
            <Link
              href="/actions"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View all
            </Link>
          </div>

          {actions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-white p-6 text-zinc-500">
              No pending actions.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {actions.map((a) => {
                const status = String(a.status ?? '').toLowerCase();
                const badgeClasses =
                  status === 'not_started'
                    ? 'bg-red-200 text-red-800'
                    : status === 'in_progress'
                    ? 'bg-yellow-200 text-yellow-800'
                    : 'bg-green-200 text-green-800';
                return (
                  <div key={a.id} className="player-card transition-base hover:-translate-y-0.5 hover:shadow-md">
                    <div className="pc-wrap">
                      <div className="pc-image">
                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-100 text-2xl">
                          📋
                        </div>
                      </div>

                      <div className="pc-mobile-header">
                        <h3 className="pc-name">{a.title}</h3>
                        <p className="pc-sponsor-text">
                          Assigned to: {a.assigned_to || 'Unassigned'} • Due:{' '}
                          {a.due_date
                            ? new Date(a.due_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                            : 'N/A'}
                        </p>
                      </div>

                      <div className="pc-details">
                        <h3 className="pc-name">{a.title}</h3>
                        <p className="pc-meta">
                          Assigned to: {a.assigned_to || 'Unassigned'} | Due:{' '}
                          {a.due_date
                            ? new Date(a.due_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                            : 'N/A'}
                        </p>
                        <div className="pc-tags">
                          <span className={`pc-tag ${badgeClasses}`}>
                            {String(status).replace('_', ' ').toUpperCase() || 'UNKNOWN'}
                          </span>
                        </div>
                      </div>

                      <details className="pc-dropdown">
                        <summary>Details</summary>
                        <p className="pc-meta">
                          Assigned to: {a.assigned_to || 'Unassigned'} | Due:{' '}
                          {a.due_date
                            ? new Date(a.due_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                            : 'N/A'}
                        </p>
                        <div className="pc-tags">
                          <span className={`pc-tag ${badgeClasses}`}>
                            {String(status).replace('_', ' ').toUpperCase() || 'UNKNOWN'}
                          </span>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
