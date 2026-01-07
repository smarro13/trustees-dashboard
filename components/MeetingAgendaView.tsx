import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

type Props = {
  meetingId: string;
};

export default function MeetingAgendaView({ meetingId }: Props) {
  const [loading, setLoading] = useState(false);

  const [apologies, setApologies] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [correspondence, setCorrespondence] = useState<any[]>([]);
  const [safeguarding, setSafeguarding] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [membership, setMembership] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);

  const safeFetch = async <T,>(
    fn: () => Promise<{ data: T[] | null; error: any }>,
  ) => {
    const res = await fn();
    if (res.error) {
      console.warn('MeetingAgendaView fetch error:', res.error.message);
      return [];
    }
    return res.data ?? [];
  };

  useEffect(() => {
    if (!meetingId) return;

    const load = async () => {
      setLoading(true);

      const [
        apol,
        conf,
        corr,
        safe,
        ev,
        mem,
        act,
      ] = await Promise.all([
        safeFetch(() =>
          supabase
            .from('apologies')
            .select('id, name, note, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),

        safeFetch(() =>
          supabase
            .from('conflicts_of_interest')
            .select('id, trustee_name, interest_description, standing, action_taken, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),

        safeFetch(() =>
          supabase
            .from('correspondence')
            .select('id, subject, sender, summary, received_date, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),

        safeFetch(() =>
          supabase
            .from('safeguarding_updates')
            .select('id, title, summary, status, review_date, team, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),

        safeFetch(() =>
          supabase
            .from('events_planning')
            .select('id, title, suggested_date, event_date, lead, status, notes, setmore_url, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),

        safeFetch(() =>
          supabase
            .from('membership_reports')
            .select('id, num_people, money_total, loveadmin_total, loveadmin_new_signups, loveadmin_outstanding_total, loveadmin_cancellations, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),

        safeFetch(() =>
          supabase
            .from('action_items')
            .select('id, title, owner, due_date, status, created_at')
            .eq('meeting_id', meetingId)
            .order('due_date', { ascending: true, nullsLast: true }),
        ),
      ]);

      setApologies(apol);
      setConflicts(conf);
      setCorrespondence(corr);
      setSafeguarding(safe);
      setEvents(ev);
      setMembership(mem);
      setActions(act);

      setLoading(false);
    };

    load();
  }, [meetingId]);

  const Section = ({
    title,
    editHref,
    children,
  }: {
    title: string;
    editHref?: string;
    children: React.ReactNode;
  }) => (
    <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6 lg:px-8">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        {editHref ? (
          <Link href={editHref} className="text-sm font-medium text-blue-600 hover:underline">
            Edit →
          </Link>
        ) : null}
      </div>
      <div className="px-4 py-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading meeting agenda…</p>;
  }

  return (
    <div className="space-y-6">
      <Section title="Apologies" editHref={`/agenda/apologies?meetingId=${meetingId}`}>
        {apologies.length === 0 ? (
          <p className="text-sm text-zinc-500">No apologies recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {apologies.map((a) => (
              <li key={a.id}>
                <span className="font-medium text-zinc-900">{a.name}</span>
                {a.note ? <span className="text-zinc-600"> — {a.note}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Conflicts of Interest" editHref={`/agenda/conflicts?meetingId=${meetingId}`}>
        {conflicts.length === 0 ? (
          <p className="text-sm text-zinc-500">No conflicts recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {conflicts.map((c) => (
              <li key={c.id}>
                <div className="font-medium text-zinc-900">{c.trustee_name}</div>
                <div className="text-zinc-700">{c.interest_description}</div>
                <div className="text-xs text-zinc-500">
                  {c.action_taken ? `Action: ${c.action_taken}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Correspondence" editHref={`/agenda/correspondence?meetingId=${meetingId}`}>
        {correspondence.length === 0 ? (
          <p className="text-sm text-zinc-500">No correspondence recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {correspondence.map((c) => (
              <li key={c.id}>
                <div className="font-medium text-zinc-900">{c.subject}</div>
                <div className="text-xs text-zinc-500">
                  {c.sender ? `From: ${c.sender}` : null}
                  {c.received_date ? ` • Received: ${new Date(c.received_date).toLocaleDateString('en-GB')}` : null}
                </div>
                <div className="mt-1 text-zinc-700 whitespace-pre-wrap">{c.summary}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Safeguarding" editHref={`/agenda/safeguarding?meetingId=${meetingId}`}>
        {safeguarding.length === 0 ? (
          <p className="text-sm text-zinc-500">No safeguarding updates.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {safeguarding.map((s) => (
              <li key={s.id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">{s.title}</div>
                    <div className="text-xs text-zinc-500">
                      {s.team || '—'} • {s.status}
                      {s.review_date ? ` • Review by ${new Date(s.review_date).toLocaleDateString('en-GB')}` : ''}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-zinc-700 whitespace-pre-wrap">{s.summary}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Events" editHref={`/agenda/events?meetingId=${meetingId}`}>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events linked to this meeting.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id}>
                <div className="font-medium text-zinc-900">{e.title}</div>
                <div className="text-xs text-zinc-500">
                  {e.status}
                  {e.suggested_date ? ` • Suggested: ${new Date(e.suggested_date).toLocaleDateString('en-GB')}` : ''}
                </div>
                {e.setmore_url ? (
                  <a className="text-xs text-blue-600 hover:underline" href={e.setmore_url} target="_blank" rel="noreferrer">
                    Setmore link
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Membership" editHref={`/agenda/membership?meetingId=${meetingId}`}>
        {membership.length === 0 ? (
          <p className="text-sm text-zinc-500">No membership report recorded.</p>
        ) : (
          <div className="text-sm text-zinc-800 space-y-1">
            {/* Show latest report */}
            <p>People: <span className="font-medium">{membership[0].num_people ?? '—'}</span></p>
            <p>Bottomline: £{Number(membership[0].money_total ?? 0).toFixed(2)}</p>
            <p>LoveAdmin: £{Number(membership[0].loveadmin_total ?? 0).toFixed(2)}</p>
            <p className="text-xs text-zinc-500">
              Added {new Date(membership[0].created_at).toLocaleString('en-GB')}
            </p>
          </div>
        )}
      </Section>

      <Section title="Actions (linked to this meeting)" editHref={`/agenda/actions?meetingId=${meetingId}`}>
        {actions.length === 0 ? (
          <p className="text-sm text-zinc-500">No actions linked to this meeting.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {actions.map((a) => (
              <li key={a.id}>
                <span className="font-medium text-zinc-900">{a.title}</span>
                <span className="text-zinc-600">
                  {' '}— {a.status}
                  {a.due_date ? ` (due ${new Date(a.due_date).toLocaleDateString('en-GB')})` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
