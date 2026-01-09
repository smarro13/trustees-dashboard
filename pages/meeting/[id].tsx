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

      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select('id, meeting_date, is_locked')
        .eq('id', meetingId)
        .single();

      if (meetingError) {
        console.error(meetingError);
        setLoading(false);
        return;
      }

      setMeeting(meetingData);

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
        supabase.from('apologies')
          .select('id, name, note, created_at')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('conflicts_of_interest')
          .select('id, trustee_name, interest_description, standing, action_taken, created_at')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('correspondence')
          .select('id, subject, sender, summary, received_date, created_at')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('safeguarding_updates')
          .select('id, title, summary, status, review_date, team, created_at')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('events_planning')
          .select('id, title, event_date, suggested_date, lead, status, notes, setmore_url, created_at')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('membership_reports')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('trading_reports')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('treasury_reports')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('action_items')
          .select('id, title, owner, due_date, status')
          .eq('meeting_id', meetingId)
          .neq('status', 'Completed')
          .order('due_date', { ascending: true })
          .order('created_at', { ascending: false }),

        supabase.from('matters_arising')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('aob_items')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('rugby_reports')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),

        supabase.from('minutes')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false }),
      ]);

      if (apol.data) setApologies(apol.data);
      if (conf.data) setConflicts(conf.data);
      if (corr.data) setCorrespondence(corr.data);
      if (safe.data) setSafeguarding(safe.data);
      if (ev.data) setEvents(ev.data);
      if (mem.data) setMembership(mem.data);
      if (trad.data) setTrading(trad.data);
      if (tres.data) setTreasury(tres.data);
      if (act.data) setActions(act.data);
      if (ma.data) setMattersArising(ma.data);
      if (aobItems.data) setAob(aobItems.data);
      if (rugbyItems.data) setRugby(rugbyItems.data);
      if (mins.data) setMinutes(mins.data);

      setLoading(false);
    };

    load();
  }, [meetingId]);

  if (!meetingId || loading) {
    return <p className="p-6 text-sm text-zinc-500">Loading meeting…</p>;
  }

  const dateLabel = meeting?.meeting_date
    ? new Date(meeting.meeting_date).toLocaleDateString('en-GB')
    : '';

  const sectionBody = (key: string, emptyText: string) => {
    const dataMap: Record<string, any[]> = {
      apologies,
      conflicts,
      correspondence,
      safeguarding,
      events,
      membership,
      trading,
      treasury,
      actions,
      matters_arising: mattersArising,
      aob,
      rugby_reports: rugby,
      minutes,
    };

    const data = dataMap[key] ?? [];

    if (!data.length) {
      return <p className="text-sm text-zinc-500">{emptyText}</p>;
    }

    return <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-[1200px] px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold">Meeting {dateLabel}</h1>
        </header>

        <section className="space-y-6">
          {AGENDA_SECTIONS.map((s) => (
            <div key={s.key} className="rounded-lg bg-white ring-1 ring-zinc-200">
              <div className="flex justify-between border-b px-4 py-3">
                <h2 className="font-semibold">{s.label}</h2>
                <Link
                  href={`${s.href}?meetingId=${meetingId}`}
                  className="text-sm text-blue-600 hover:underline"
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
