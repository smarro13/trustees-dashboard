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
  const [lockSaving, setLockSaving] = useState(false);
  const [metaOpen, setMetaOpen] = useState(true);

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
  const [isMobile, setIsMobile] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

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
        supabase
          .from('events_planning')
          .select('*')
          .or(`meeting_id.eq.${meetingId},meeting_id.is.null`)
          .order('suggested_date', { ascending: true })
          .order('event_date', { ascending: true }),
        supabase.from('membership_reports').select('*').eq('meeting_id', meetingId),
        supabase.from('trading_reports').select('*').eq('meeting_id', meetingId),
        supabase.from('treasury_reports').select('*').eq('meeting_id', meetingId),
        supabase.from('action_items').select('*').eq('meeting_id', meetingId),
        supabase
          .from('matters_arising')
          .select('*')
          .or(`meeting_id.eq.${meetingId},meeting_id.is.null`)
          .order('created_at', { ascending: false }),
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

  // detect mobile and set default accordion state
  useEffect(() => {
    const mq = () => (typeof window !== 'undefined' ? window.innerWidth < 640 : false);
    const syncState = () => {
      const mobile = mq();
      setIsMobile(mobile);
      setOpenSections((prev) => {
        // if no entries yet, seed defaults based on breakpoint
        if (Object.keys(prev).length === 0) {
          const seeded: Record<string, boolean> = {};
          AGENDA_SECTIONS.forEach((s) => {
            seeded[s.key] = !mobile; // collapsed on mobile, open on desktop
          });
          return seeded;
        }
        return prev;
      });
    };

    syncState();
    window.addEventListener('resize', syncState);
    return () => window.removeEventListener('resize', syncState);
  }, []);

  const toggleLock = async () => {
    if (!meetingId || !meeting) return;
    setLockSaving(true);

    const newLocked = !meeting.is_locked;
    const { data, error } = await supabase
      .from('meetings')
      .update({ is_locked: newLocked })
      .eq('id', meetingId)
      .select('id, meeting_date, is_locked')
      .single();

    if (error) {
      console.error('Failed to toggle lock', error);
      alert('Could not update lock status.');
    } else if (data) {
      setMeeting(data);
    }

    setLockSaving(false);
  };

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

      case 'matters_arising':
        if (!mattersArising.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {mattersArising.map((m) => (
              <div key={m.id} className="rounded-md border p-3">
                <p className="font-semibold">{m.title}</p>
                {m.details && (
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">{m.details}</p>
                )}
                {m.raised_by && (
                  <p className="text-xs text-zinc-500 mt-1">Raised by: {m.raised_by}</p>
                )}
              </div>
            ))}
          </div>
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
      case 'rugby_reports':
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
                    <p className="font-semibold">
                      {r.mini_report
                        ? 'Mini Management Requests:'
                        : r.junior_report
                          ? 'Junior Management Requests:'
                          : r.senior_report
                            ? 'Senior Management Requests:'
                            : 'Management Requests:'}
                    </p>
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

      case 'safeguarding':
        if (!safeguarding.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {safeguarding.map((s) => (
              <div key={s.id} className="rounded-md border p-3">
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-zinc-700 whitespace-pre-wrap">{s.summary}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Status: {s.status} • Team: {s.team}
                </p>
              </div>
            ))}
          </div>
        );

      case 'events':
        if (!events.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {events
              .slice()
              .sort((a, b) => {
                const aDate = a.suggested_date || a.event_date;
                const bDate = b.suggested_date || b.event_date;
                if (!aDate && !bDate) return 0;
                if (!aDate) return 1;
                if (!bDate) return -1;
                return new Date(aDate).getTime() - new Date(bDate).getTime();
              })
              .map((e) => {
                const primaryDate = e.suggested_date || e.event_date;
                const secondaryDate = e.suggested_date && e.event_date ? e.event_date : null;

                return (
                  <div key={e.id} className="rounded-md border p-3 space-y-1">
                    <p className="font-semibold">{e.title || 'Event'}</p>

                    {primaryDate ? (
                      <p className="text-xs text-zinc-500">
                        {new Date(primaryDate).toLocaleDateString('en-GB')}
                        {secondaryDate
                          ? ` (target month ${new Date(secondaryDate).toLocaleDateString('en-GB', {
                              month: 'short',
                              year: 'numeric',
                            })})`
                          : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-500">Date TBC</p>
                    )}

                    <div className="text-xs text-zinc-600">
                      {e.status && <span className="mr-2">Status: {e.status}</span>}
                      {e.lead && <span>Lead: {e.lead}</span>}
                    </div>

                    {e.notes && (
                      <p className="text-sm text-zinc-700 whitespace-pre-wrap">{e.notes}</p>
                    )}

                    {e.discussion_points && (
                      <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                        Discussion: {e.discussion_points}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        );

      case 'trading':
        if (!trading.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {trading.map((t) => (
              <div key={t.id} className="rounded-md border p-3">
                {t.summary && (
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">{t.summary}</p>
                )}
                {t.turnover_notes && (
                  <p className="mt-3 text-sm text-zinc-700 whitespace-pre-wrap">
                    <span className="font-semibold">Turnover updates:</span>
                    <br />
                    {t.turnover_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        );

      case 'treasury':
        if (!treasury.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {treasury.map((t) => (
              <div key={t.id} className="rounded-md border p-3">
                {t.summary && (
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">{t.summary}</p>
                )}
              </div>
            ))}
          </div>
        );

      case 'aob':
        if (!aob.length) return empty(emptyText);
        return (
          <div className="space-y-2">
            {aob.map((a) => (
              <div key={a.id} className="rounded-md border p-3">
                <p className="font-semibold">{a.title}</p>
                {a.description && (
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">{a.description}</p>
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
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:py-10">
        <header className="mb-6 sm:mb-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              ← Back to dashboard
            </Link>
            <button
              onClick={toggleLock}
              disabled={lockSaving}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
            >
              {lockSaving
                ? 'Updating…'
                : meeting?.is_locked
                  ? 'Unlock meeting'
                  : 'Lock meeting'}
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-white/90 ring-1 ring-slate-200 shadow-md backdrop-blur">
            <button
              onClick={() => setMetaOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900"
            >
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-red-50 text-red-700 text-xs font-semibold">ℹ</span>
                Meeting details
              </span>
              <span className="flex items-center gap-2 text-slate-500 text-xs sm:text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                  {meeting?.is_locked ? '🔒 Locked' : '✅ Open'}
                </span>
                <span className="hidden sm:inline text-slate-700">{dateLabel}</span>
                <span aria-hidden>▾</span>
              </span>
            </button>

            {metaOpen && (
              <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                    📅 {dateLabel || 'Date TBC'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    {meeting?.is_locked ? 'Editing locked' : 'Open for updates'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">Use the lock button above to control agenda edits.</p>
              </div>
            )}
          </div>
        </header>

        <section className="space-y-4 sm:space-y-6">
          {AGENDA_SECTIONS.map((s) => (
            <div key={s.key} className="rounded-lg bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() =>
                  setOpenSections((prev) => ({ ...prev, [s.key]: !(prev[s.key] ?? !isMobile) }))
                }
                className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-semibold text-slate-900">{s.label}</span>
                  <span className="hidden sm:inline text-xs text-slate-500">{openSections[s.key] ?? !isMobile ? 'Hide' : 'Show'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">
                    {(openSections[s.key] ?? !isMobile) ? '▾' : '▸'}
                  </span>
                  <Link
                    href={`${s.href}?meetingId=${meetingId}`}
                    className="min-h-[36px] rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Edit
                  </Link>
                </div>
              </button>
              {(openSections[s.key] ?? !isMobile) && (
                <div className="px-4 py-4 bg-white">{sectionBody(s.key, s.emptyText)}</div>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
