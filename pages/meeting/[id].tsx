import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { AGENDA_SECTIONS } from '../../components/agenda/agendaConfig';

export default function MeetingPage() {
  const router = useRouter();
  const meetingId = useMemo(
    () => (typeof router.query.id === 'string' ? router.query.id : null),
    [router.query.id],
  );

  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // section data
  const [apologies, setApologies] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [correspondence, setCorrespondence] = useState<any[]>([]);
  const [safeguarding, setSafeguarding] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [membership, setMembership] = useState<any[]>([]);
  const [trading, setTrading] = useState<any[]>([]);
  const [treasury, setTreasury] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);

  // placeholders for tables you may not have created yet
  const [mattersArising, setMattersArising] = useState<any[]>([]);
  const [aob, setAob] = useState<any[]>([]);
  const [rugby, setRugby] = useState<any[]>([]);
  const [minutes, setMinutes] = useState<any[]>([]);

  useEffect(() => {
    if (!meetingId) return;

    const load = async () => {
      setLoading(true);

      const { data: m } = await supabase
        .from('meetings')
        .select('id, meeting_date, is_locked')
        .eq('id', meetingId)
        .single();

      setMeeting(m ?? null);

      // helper so missing tables don’t crash the meeting page
      const safeFetch = async <T,>(fn: () => Promise<{ data: T[] | null; error: any }>) => {
        const res = await fn();
        if (res.error) {
          console.warn(res.error.message);
          return [];
        }
        return res.data ?? [];
      };

      const [
        apol,
        conf,
        corr,
        safe,
        ev,
        mem,
        trad,
        tres,
        act,

        ma,
        aobItems,
        rugbyItems,
        mins,
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
            .select('id, title, summary, status, review_date, team, meeting_id, created_at')
            .order('created_at', { ascending: false })
            .limit(20),
        ),

        safeFetch(() =>
          supabase
            .from('events_planning')
            .select('id, title, event_date, suggested_date, lead, status, budget, expected_revenue, notes, setmore_url, created_at')
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
            .from('trading_reports')
            .select('id, reporting_period, notes, turnover_notes, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),

        safeFetch(() =>
          supabase
            .from('treasury_reports')
            .select('id, reporting_period, notes, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),

      safeFetch(() =>
        supabase
          .from('action_items')
          .select('id, title, description, owner, due_date, status, source, created_by, meeting_id, created_at')
          .neq('status', 'Completed')
          .order('due_date', { ascending: true, nullsLast: true })
          .order('created_at', { ascending: false })
          .limit(15),
      ),

        // future tables (won’t crash if missing)
        safeFetch(() =>
          supabase
            .from('matters_arising')
            .select('id, title, notes, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),
        safeFetch(() =>
          supabase
            .from('aob_items')
            .select('id, text, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),
        safeFetch(() =>
          supabase
            .from('rugby_reports')
            .select('id, mini_report, junior_report, seniors_report, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),
        safeFetch(() =>
          supabase
            .from('minutes')
            .select('id, content, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),
        ),
      ]);

      setApologies(apol);
      setConflicts(conf);
      setCorrespondence(corr);
      setSafeguarding(safe);
      setEvents(ev);
      setMembership(mem);
      setTrading(trad);
      setTreasury(tres);
      setActions(act);

      setMattersArising(ma);
      setAob(aobItems);
      setRugby(rugbyItems);
      setMinutes(mins);

      setLoading(false);
    };

    load();
  }, [meetingId]);

  if (!meetingId) return null;

  const dateLabel =
    meeting?.meeting_date
      ? new Date(meeting.meeting_date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';

  const sectionBody = (key: string, emptyText: string) => {
    const box = (children: any) => <div className="space-y-2">{children}</div>;

    if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;

    switch (key) {
      case 'apologies':
        if (!apologies.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(
          apologies.map((a) => (
            <div key={a.id} className="rounded-md border border-zinc-200 p-3">
              <p className="font-semibold text-zinc-900">{a.name}</p>
              {a.note && <p className="text-sm text-zinc-700">{a.note}</p>}
              <p className="text-xs text-zinc-400">
                Added {new Date(a.created_at).toLocaleString('en-GB')}
              </p>
            </div>
          )),
        );

      case 'conflicts':
        if (!conflicts.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(
          conflicts.map((c) => (
            <div key={c.id} className="rounded-md border border-zinc-200 p-3">
              <p className="font-semibold text-zinc-900">{c.trustee_name}</p>
              <p className="text-sm text-zinc-700">{c.interest_description}</p>
              <div className="mt-2 text-xs text-zinc-500 space-y-1">
                {c.standing && <p>Standing interest</p>}
                {c.action_taken && <p>Action taken: {c.action_taken}</p>}
              </div>
            </div>
          )),
        );

      case 'correspondence':
        if (!correspondence.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(
          correspondence.map((c) => (
            <div key={c.id} className="rounded-md border border-zinc-200 p-3">
              <p className="font-semibold text-zinc-900">{c.subject}</p>
              <div className="text-xs text-zinc-500 space-y-1 mt-1">
                {c.sender && <p>From: {c.sender}</p>}
                {c.received_date && <p>Received: {new Date(c.received_date).toLocaleDateString('en-GB')}</p>}
              </div>
              <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{c.summary}</p>
            </div>
          )),
        );

      case 'safeguarding':
        if (!safeguarding.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(
          safeguarding.map((u) => (
            <div key={u.id} className="rounded-md border border-zinc-200 p-3">
              <p className="font-semibold text-zinc-900">{u.title}</p>
              <p className="text-xs text-zinc-500">
                Team: {u.team || '—'} • Status: <span className="font-semibold">{u.status}</span>
                {u.review_date ? ` • Review by ${new Date(u.review_date).toLocaleDateString('en-GB')}` : ''}
              </p>
              <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{u.summary}</p>
            </div>
          )),
        );

      case 'events':
        if (!events.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(
          events.map((e) => {
            const baseDate = e.suggested_date || e.event_date;
            return (
              <div key={e.id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-zinc-900">{e.title}</p>
                  <span className="text-xs rounded bg-zinc-100 px-2 py-0.5">{e.status}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {baseDate ? `Date: ${new Date(baseDate).toLocaleDateString('en-GB')}` : 'No date'}
                  {e.lead ? ` • Lead: ${e.lead}` : ''}
                </p>
                {e.notes && <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{e.notes}</p>}
                {e.setmore_url && (
                  <a className="mt-2 block text-sm text-blue-600 hover:underline" href={e.setmore_url} target="_blank" rel="noreferrer">
                    Setmore link →
                  </a>
                )}
              </div>
            );
          }),
        );

      case 'membership':
        if (!membership.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(
          membership.map((r) => (
            <div key={r.id} className="rounded-md border border-zinc-200 p-3">
              <p className="text-sm text-zinc-700">
                <span className="font-semibold">People:</span> {r.num_people ?? '—'}
              </p>
              <p className="text-sm text-zinc-700">
                <span className="font-semibold">Bottomline total:</span> £{Number(r.money_total ?? 0).toFixed(2)}
              </p>
              <p className="text-sm text-zinc-700">
                <span className="font-semibold">LoveAdmin total:</span> £{Number(r.loveadmin_total ?? 0).toFixed(2)}
              </p>
              <div className="mt-2 text-xs text-zinc-500 space-y-1">
                {r.loveadmin_new_signups != null && <p>New signups: {r.loveadmin_new_signups}</p>}
                {r.loveadmin_outstanding_total != null && <p>Outstanding: £{Number(r.loveadmin_outstanding_total).toFixed(2)}</p>}
                {r.loveadmin_cancellations != null && <p>Cancellations: {r.loveadmin_cancellations}</p>}
              </div>
            </div>
          )),
        );

      case 'trading':
        if (!trading.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(
          trading.map((r) => (
            <div key={r.id} className="rounded-md border border-zinc-200 p-3">
              <p className="font-semibold text-zinc-900">{r.reporting_period}</p>
              {r.turnover_notes && <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{r.turnover_notes}</p>}
              {r.notes && <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{r.notes}</p>}
            </div>
          )),
        );

      case 'treasury':
        if (!treasury.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(
          treasury.map((r) => (
            <div key={r.id} className="rounded-md border border-zinc-200 p-3">
              <p className="font-semibold text-zinc-900">{r.reporting_period}</p>
              {r.notes && <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{r.notes}</p>}
            </div>
          )),
        );

      case 'actions':
        if (!actions.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return (
          <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left">Title</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left">Owner</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left">Due</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className="border-b border-zinc-100 px-3 py-2 font-medium">{a.title}</td>
                    <td className="border-b border-zinc-100 px-3 py-2">{a.owner || '—'}</td>
                    <td className="border-b border-zinc-100 px-3 py-2">
                      {a.due_date ? new Date(a.due_date).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-2">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      // future sections (won’t crash, will show content if/when you add tables)
      case 'matters_arising':
        if (!mattersArising.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(mattersArising.map((x) => <div key={x.id} className="rounded-md border p-3">{x.title}</div>));

      case 'aob':
        if (!aob.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return box(aob.map((x) => <div key={x.id} className="rounded-md border p-3 whitespace-pre-wrap">{x.text}</div>));

      case 'rugby_reports':
        if (!rugby.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        // latest entry only is normally best
        const latest = rugby[0];
        return (
          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <p className="font-semibold">Mini</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{latest.mini_report || '—'}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-semibold">Juniors</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{latest.junior_report || '—'}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-semibold">Seniors</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{latest.seniors_report || '—'}</p>
            </div>
          </div>
        );

      case 'minutes':
        if (!minutes.length) return <p className="text-sm text-zinc-500">{emptyText}</p>;
        return <div className="rounded-md border p-3 whitespace-pre-wrap text-sm">{minutes[0].content}</div>;

      default:
        return <p className="text-sm text-zinc-500">{emptyText}</p>;
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Meeting {dateLabel}
          </h1>
          <p className="mt-1 text-zinc-600">
            Built from agenda pages • {meeting?.is_locked ? '🔒 Locked' : 'Open'}
          </p>
        </header>

        <section className="space-y-6">
          {AGENDA_SECTIONS.map((s) => (
            <div key={s.key} className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6">
                <h2 className="text-lg font-semibold text-zinc-900">{s.label}</h2>
                <Link
                  href={`${s.href}?meetingId=${meetingId}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Edit →
                </Link>
              </div>
              <div className="px-4 py-4 sm:px-6">
                {sectionBody(s.key, s.emptyText)}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
