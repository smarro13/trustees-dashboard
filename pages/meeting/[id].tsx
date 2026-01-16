import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { AGENDA_SECTIONS } from '../../components/agenda/agendaConfig';

// Truncate text component for mobile
function TruncatedText({ text, maxLength = 100 }: { text: string; maxLength?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (text.length <= maxLength) {
    return <span>{text}</span>;
  }
  
  return (
    <span>
      {isExpanded ? text : `${text.slice(0, maxLength)}...`}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="ml-2 text-blue-600 hover:underline text-sm font-medium"
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </button>
    </span>
  );
}

export default function MeetingPage() {
  const router = useRouter();
  const meetingId = useMemo(
    () => (typeof router.query.id === 'string' ? router.query.id : null),
    [router.query.id],
  );

  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [apologies, setApologies] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [correspondence, setCorrespondence] = useState<any[]>([]);
  const [safeguarding, setSafeguarding] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [membership, setMembership] = useState<any[]>([]);
  const [trading, setTrading] = useState<any[]>([]);
  const [treasury, setTreasury] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [mattersArising, setMattersArising] = useState<any[]>([]);
  const [aob, setAob] = useState<any[]>([]);
  const [rugby, setRugby] = useState<any[]>([]);
  const [minutes, setMinutes] = useState<any[]>([]);

  useEffect(() => {
    if (!meetingId) return;

    const load = async () => {
      setLoading(true);

      const { data: meetingData } = await supabase
        .from('meetings')
        .select('id, meeting_date, is_locked')
        .eq('id', meetingId)
        .single();

      setMeeting(meetingData ?? null);

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
        supabase.from('apologies').select('*').eq('meeting_id', meetingId),
        supabase.from('conflicts_of_interest').select('*').eq('meeting_id', meetingId),
        supabase.from('correspondence').select('*').eq('meeting_id', meetingId),
        supabase.from('safeguarding_updates').select('*').eq('meeting_id', meetingId),
        supabase.from('events_planning').select('*').eq('meeting_id', meetingId),
        supabase.from('membership_reports').select('*').eq('meeting_id', meetingId),
        supabase.from('trading_reports').select('*').eq('meeting_id', meetingId),
        supabase.from('treasury_reports').select('*').eq('meeting_id', meetingId),
        supabase.from('action_items').select('*').eq('meeting_id', meetingId),
        supabase.from('matters_arising').select('*').eq('meeting_id', meetingId),
        supabase.from('aob_items').select('*').eq('meeting_id', meetingId),
        supabase.from('rugby_reports').select('*').eq('meeting_id', meetingId),
        supabase
          .from('minutes')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),
      ]);

      setApologies(apol.data ?? []);
      setConflicts(conf.data ?? []);
      setCorrespondence(corr.data ?? []);
      setSafeguarding(safe.data ?? []);
      setEvents(ev.data ?? []);
      setMembership(mem.data ?? []);
      setTrading(trad.data ?? []);
      setTreasury(tres.data ?? []);
      setActions(act.data ?? []);
      setMattersArising(ma.data ?? []);
      setAob(aobItems.data ?? []);
      setRugby(rugbyItems.data ?? []);
      setMinutes(mins.data ?? []);

      setLoading(false);
    };

    load();
  }, [meetingId]);

  if (!meetingId || loading) {
    return <p className="p-6 text-sm text-zinc-500">Loading meeting…</p>;
  }

  const dateLabel = meeting?.meeting_date
    ? new Date(meeting.meeting_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

  const empty = (text: string) => (
    <p className="text-sm text-zinc-500">{text}</p>
  );

  const sectionBody = (key: string, emptyText: string) => {
    switch (key) {
      case 'apologies':
        if (!apologies.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {apologies.map((a) => (
              <div key={a.id} className="rounded-md border p-3">
                <p className="font-semibold">{a.name}</p>
                {a.note && <p className="text-sm text-zinc-700">{a.note}</p>}
              </div>
            ))}
          </div>
        );

      case 'conflicts':
        if (!conflicts.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {conflicts.map((c) => (
              <div key={c.id} className="rounded-md border p-3">
                <p className="font-semibold">{c.trustee_name}</p>
                <p className="text-sm text-zinc-700">{c.interest_description}</p>
              </div>
            ))}
          </div>
        );

      case 'correspondence':
        if (!correspondence.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {correspondence.map((c) => (
              <div key={c.id} className="rounded-md border p-3">
                <p className="font-semibold">{c.subject}</p>
                <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                  <TruncatedText text={c.summary} maxLength={150} />
                </p>
              </div>
            ))}
          </div>
        );

      case 'actions':
        if (!actions.length) return empty(emptyText);
        return (
          <ul className="space-y-1 text-sm">
            {actions.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong> — {a.status}
              </li>
            ))}
          </ul>
        );

      case 'membership':
        if (!membership.length) return empty(emptyText);
        return (
          <div className="space-y-3 text-sm">
            {membership.map((m) => (
              <div key={m.id} className="rounded-md border p-3">
                <div className="space-y-1">
                  {m.num_people != null && (
                    <p>
                      <span className="font-semibold">Number of people from Bottomline:</span>{' '}
                      {m.num_people}
                    </p>
                  )}
                  {m.money_total != null && (
                    <p>
                      <span className="font-semibold">Bottomline Total (£):</span>{' '}
                      {m.money_total}
                    </p>
                  )}
                  {m.loveadmin_new_signups != null && (
                    <p>
                      <span className="font-semibold">LoveAdmin New sign ups:</span>{' '}
                      {m.loveadmin_new_signups}
                    </p>
                  )}
                  {m.loveadmin_total != null && (
                    <p>
                      <span className="font-semibold">LoveAdmin Total (£):</span>{' '}
                      {m.loveadmin_total}
                    </p>
                  )}
                  {m.loveadmin_outstanding_total != null && (
                    <p>
                      <span className="font-semibold">Outstanding payments total (£):</span>{' '}
                      {m.loveadmin_outstanding_total}
                    </p>
                  )}
                  {m.loveadmin_cancellations != null && (
                    <p>
                      <span className="font-semibold">Number of cancellations:</span>{' '}
                      {m.loveadmin_cancellations}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        );

      case 'rugby':
        if (!rugby.length) return empty(emptyText);
        return (
          <div className="space-y-3 text-sm">
            {rugby.map((r) => (
              <div key={r.id} className="rounded-md border p-3 space-y-2">
                {r.mini_report && (
                  <div>
                    <p className="font-semibold">Mini Rugby:</p>
                    <p className="text-zinc-700 whitespace-pre-wrap">{r.mini_report}</p>
                  </div>
                )}
                {r.junior_report && (
                  <div>
                    <p className="font-semibold">Junior Rugby:</p>
                    <p className="text-zinc-700 whitespace-pre-wrap">{r.junior_report}</p>
                  </div>
                )}
                {r.senior_report && (
                  <div>
                    <p className="font-semibold">Senior Rugby:</p>
                    <p className="text-zinc-700 whitespace-pre-wrap">{r.senior_report}</p>
                  </div>
                )}
                {r.management_requests && (
                  <div>
                    <p className="font-semibold">Management Requests:</p>
                    <p className="text-zinc-700 whitespace-pre-wrap">{r.management_requests}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      case 'minutes':
        if (!minutes.length) return empty(emptyText);
        return (
          <div className="space-y-3 text-sm">
            {minutes.map((m) => (
              <div key={m.id} className="rounded-md border p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold">
                    {m.title || 'Minutes file'}
                  </p>
                  {m.created_at && (
                    <span className="text-xs text-zinc-500">
                      Uploaded {new Date(m.created_at).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>

                {m.file_url ? (
                  <a
                    href={m.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center text-blue-600 hover:underline"
                  >
                    Open minutes →
                  </a>
                ) : (
                  <p className="mt-2 text-zinc-600 whitespace-pre-wrap">
                    {m.content || 'No content available.'}
                  </p>
                )}
              </div>
            ))}
          </div>
        );

      default:
        return empty(emptyText);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:py-10">
        <header className="mb-6 sm:mb-8">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold">
            Meeting {dateLabel}
          </h1>
          <p className="text-sm sm:text-base text-zinc-600">
            {meeting?.is_locked ? '🔒 Locked' : 'Open for updates'}
          </p>
        </header>

        <section className="space-y-4 sm:space-y-6">
          {AGENDA_SECTIONS.map((s) => (
            <div key={s.key} className="rounded-lg bg-white ring-1 ring-zinc-200">
              <div className="flex justify-between items-center border-b px-4 py-3">
                <h2 className="text-base sm:text-lg font-semibold">{s.label}</h2>
                <Link
                  href={`${s.href}?meetingId=${meetingId}`}
                  className="min-h-[44px] flex items-center text-sm text-blue-600 hover:underline"
                >
                  Edit →
                </Link>
              </div>
              <div className="px-4 py-4">
                {sectionBody(s.key, s.emptyText)}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
