import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function EventsPlanningPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  // treat as calendar month, store as yyyy-MM
  const [eventMonth, setEventMonth] = useState('');
  const [suggestedDate, setSuggestedDate] = useState('');
  const [lead, setLead] = useState('');
  const [status, setStatus] = useState('Idea');
  const [budget, setBudget] = useState('');
  const [expectedRevenue, setExpectedRevenue] = useState('');
  const [notes, setNotes] = useState('');
  const [discussionPoints, setDiscussionPoints] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [setmoreUrl, setSetmoreUrl] = useState('');
  const [loading, setLoading] = useState(false);

  // calendar state
  const today = new Date();
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth()); // 0-11
  const [suggestedDays, setSuggestedDays] = useState<number[]>([]);

  // keep the rest of your state (title, eventMonth, etc.) even if unused

  const loadData = async () => {
    const { data } = await supabase
      .from('events_planning')
      .select(`*, meetings ( meeting_date )`)
      // order by month then suggested date
      .order('event_date', { ascending: true, nullsFirst: false })
      .order('suggested_date', { ascending: true, nullsFirst: true });

    if (data) setEvents(data);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: false });

    if (meetingsData) setMeetings(meetingsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addEvent = async () => {
    if (!title.trim()) return;

    setLoading(true);

    // convert yyyy-MM to a proper date string (1st of the month) for storage
    const monthDate =
      eventMonth && eventMonth.includes('-')
        ? new Date(eventMonth + '-01').toISOString()
        : null;

    await supabase.from('events_planning').insert({
      title,
      event_date: monthDate, // store month as first day
      suggested_date: suggestedDate || null,
      lead: lead || null,
      status,
      budget: budget || null,
      expected_revenue: expectedRevenue || null,
      notes: notes || null,
      discussion_points: discussionPoints || null,
      meeting_id: meetingId,
      setmore_url: setmoreUrl || null,
    });

    setTitle('');
    setEventMonth('');
    setSuggestedDate('');
    setLead('');
    setStatus('Idea');
    setBudget('');
    setExpectedRevenue('');
    setNotes('');
    setDiscussionPoints('');
    setMeetingId(null);
    setSetmoreUrl('');
    setLoading(false);
    loadData();
  };

  const statusBadge = (s: string) => {
    const v = (s || '').toLowerCase();
    if (v === 'confirmed') return 'bg-green-100 text-green-700';
    if (v === 'planning') return 'bg-yellow-100 text-yellow-800';
    if (v === 'completed') return 'bg-zinc-100 text-zinc-700';
    if (v === 'cancelled') return 'bg-red-100 text-red-700';
    return 'bg-blue-100 text-blue-700'; // Idea
  };

  // events that fall in the current calendar month
  const eventsInMonth = useMemo(() => {
    return events.filter((e) => {
      const baseDate = e.suggested_date || e.event_date;
      if (!baseDate) return false;
      const d = new Date(baseDate);
      return d.getFullYear() === calendarYear && d.getMonth() === calendarMonth;
    });
  }, [events, calendarYear, calendarMonth]);

  // compute simple calendar grid info
  const calendarMeta = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const firstWeekday = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    return { firstWeekday, daysInMonth };
  }, [calendarYear, calendarMonth]);

  const changeMonth = (delta: number) => {
    const newMonth = calendarMonth + delta;
    const d = new Date(calendarYear, newMonth, 1);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
  };

  // full key‑date set for 2026 & 2027, using your list
  const planForProfitDates: { name: string; date: string }[] = [
    // 2026
    { name: "Bank Holiday", date: "2026-01-01" },
    { name: "Bank Holiday (Scotland)", date: "2026-01-02" },
    { name: "Burns Night", date: "2026-01-25" },

    { name: "Six Nations Opening Match", date: "2026-02-05" },
    { name: "Valentine's Day", date: "2026-02-14" },
    { name: "Shrove Tuesday (Pancake Day)", date: "2026-02-17" },
    { name: "Chinese New Year", date: "2026-02-17" },
    { name: "Ramadan Begins", date: "2026-02-18" },

    { name: "St David's Day", date: "2026-03-01" },
    { name: "Six Nations Final Matches", date: "2026-03-14" },
    { name: "Mother's Day", date: "2026-03-15" },
    { name: "St Patrick's Day", date: "2026-03-17" },

    { name: "Good Friday Bank Holiday", date: "2026-04-03" },
    { name: "The Boat Race", date: "2026-04-04" },
    { name: "Easter Day", date: "2026-04-05" },
    { name: "Easter Monday Bank Holiday", date: "2026-04-06" },
    { name: "The Grand National", date: "2026-04-11" },
    { name: "St George's Day", date: "2026-04-23" },
    { name: "London Marathon", date: "2026-04-26" },

    { name: "Early May Bank Holiday", date: "2026-05-04" },
    { name: "FA Cup Final", date: "2026-05-16" },
    { name: "UEFA Europa League Final", date: "2026-05-20" },
    { name: "Spring Bank Holiday", date: "2026-05-25" },
    { name: "UEFA Champions League Final", date: "2026-05-30" },

    { name: "World Cup (starts – 39 days)", date: "2026-06-11" },
    { name: "Trooping The Colour", date: "2026-06-13" },
    { name: "Royal Ascot (5 days)", date: "2026-06-16" },
    { name: "Father's Day", date: "2026-06-21" },
    { name: "Wimbledon (14 days)", date: "2026-06-29" },

    { name: "Tour de France (23 days)", date: "2026-07-04" },
    { name: "British Grand Prix", date: "2026-07-05" },
    { name: "World Cup Final", date: "2026-07-19" },

    { name: "Summer Bank Holiday", date: "2026-08-31" },

    { name: "The Great North Run", date: "2026-09-13" },

    { name: "Halloween", date: "2026-10-31" },

    { name: "Guy Fawkes Night", date: "2026-11-05" },
    { name: "Diwali (5 days)", date: "2026-11-08" },
    { name: "King Charles's Birthday", date: "2026-11-14" },
    { name: "St Andrew's Day", date: "2026-11-30" },

    // 2027
    { name: "Bank Holiday", date: "2027-01-01" },
    { name: "Bank Holiday (Scotland)", date: "2027-01-04" },
    { name: "Burns Night", date: "2027-01-25" },

    { name: "Chinese New Year", date: "2027-02-06" },
    { name: "Ramadan Begins", date: "2027-02-08" },
    { name: "Shrove Tuesday (Pancake Day)", date: "2027-02-09" },
    { name: "Valentine's Day", date: "2027-02-14" },

    { name: "St David's Day", date: "2027-03-01" },
    { name: "Mother's Day", date: "2027-03-07" },
    { name: "St Patrick's Day", date: "2027-03-17" },

    // Generic (non‑year specific) – used only for 2027 where applicable
    { name: "New Year's Day (Bank Holiday)", date: "2027-01-01" },
    { name: "ReBalance Festival (Bath)", date: "2027-01-29" }, // Jan 29
    { name: "ReBalance Festival (Bath)", date: "2027-02-15" }, // Feb 15

    { name: "Pancake Day (Shrove Tuesday)", date: "2027-02-09" },
    { name: "Chinese New Year (Year of the Snake)", date: "2027-02-06" },

    { name: "Good Friday (Bank Holiday)", date: "2027-04-03" },
    { name: "Easter Day", date: "2027-04-05" },
    { name: "Easter Monday (Bank Holiday)", date: "2027-04-06" },
    { name: "The Grand National (Aintree)", date: "2027-04-11" },
    { name: "St. George's Day (England)", date: "2027-04-23" },
    { name: "London Marathon", date: "2027-04-26" },

    { name: "Early May Bank Holiday", date: "2027-05-04" },
    { name: "FA Cup Final", date: "2027-05-16" },
    { name: "Spring Bank Holiday", date: "2027-05-25" },

    { name: "Trooping the Colour", date: "2027-06-13" },
    { name: "Royal Ascot", date: "2027-06-16" },
    { name: "Father's Day", date: "2027-06-21" },
    { name: "Wimbledon (start)", date: "2027-06-29" },

    { name: "Tour de France (start)", date: "2027-07-04" },
    { name: "British Grand Prix (Silverstone)", date: "2027-07-05" },
    { name: "World Cup Final", date: "2027-07-19" },

    { name: "Summer Bank Holiday", date: "2027-08-31" },

    { name: "Halloween", date: "2027-10-31" },

    { name: "Guy Fawkes Night (Bonfire Night)", date: "2027-11-05" },
    { name: "Diwali (5 days)", date: "2027-11-08" },
    { name: "King Charles III's Birthday", date: "2027-11-14" },
    { name: "Black Friday", date: "2027-11-28" },

    { name: "Christmas Day", date: "2027-12-25" },
    { name: "Boxing Day", date: "2027-12-26" },
  ];

  // map of plan-for-profit key dates for current month/year, keyed by YYYY-MM-DD
  const [planForProfitDays, setPlanForProfitDays] = useState<
    Record<string, string>
  >({});

  // fetch bank holidays and then overlay plan-for-profit dates (skip bank-holiday days)
  useEffect(() => {
    const fetchSuggestions = async () => {
      const days: number[] = [];
      const bankHolidayDaySet = new Set<number>();

      try {
        // UK public holidays from gov.uk API
        const res = await fetch('https://www.gov.uk/bank-holidays.json');
        if (res.ok) {
          const data = await res.json();
          const englandWales = data['england-and-wales']?.events || [];
          englandWales.forEach((ev: any) => {
            const d = new Date(ev.date);
            if (
              d.getFullYear() === calendarYear &&
              d.getMonth() === calendarMonth
            ) {
              const dayNum = d.getDate();
              if (!days.includes(dayNum)) days.push(dayNum);
              bankHolidayDaySet.add(dayNum);
            }
          });
        }
      } catch {
        // ignore; we still add plan-for-profit dates
      }

      // Plan-for-profit style dates: only if not already a bank holiday day
      const pfpForThisMonth: Record<string, string> = {};
      planForProfitDates.forEach((ev) => {
        const d = new Date(ev.date);
        if (
          d.getFullYear() === calendarYear &&
          d.getMonth() === calendarMonth
        ) {
          const dayNum = d.getDate();
          // skip if this day is a bank holiday (per requirement)
          if (bankHolidayDaySet.has(dayNum)) return;

          const key = ev.date; // YYYY-MM-DD already
          pfpForThisMonth[key] = ev.name;
          if (!days.includes(dayNum)) days.push(dayNum);
        }
      });

      setPlanForProfitDays(pfpForThisMonth);
      setSuggestedDays(days.sort((a, b) => a - b));
    };

    fetchSuggestions();
  }, [calendarYear, calendarMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthName = useMemo(
    () =>
      new Date(calendarYear, calendarMonth, 1).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarYear, calendarMonth],
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl sm:max-w-7xl lg:max-w-[1200px] px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10">
        <header className="mb-6 sm:mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900">
            Events Planning
          </h1>
          <p className="mt-1 text-sm sm:text-base text-zinc-600">
            Plan and track upcoming club events
          </p>
        </header>

        {/* Add new event form */}
        <section className="mb-6 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 lg:px-8">
            <h2 className="text-lg font-semibold text-zinc-900">
              Add new event
            </h2>
          </div>
          <div className="px-4 py-4 sm:px-6 lg:px-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Event title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                  placeholder="e.g. Summer BBQ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Event month (yyyy-MM)
                </label>
                <input
                  type="month"
                  value={eventMonth}
                  onChange={(e) => setEventMonth(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Suggested date
                </label>
                <input
                  type="date"
                  value={suggestedDate}
                  onChange={(e) => setSuggestedDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Lead person
                </label>
                <input
                  type="text"
                  value={lead}
                  onChange={(e) => setLead(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                  placeholder="Person responsible"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                >
                  <option value="Idea">Idea</option>
                  <option value="Planning">Planning</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Budget (£)
                </label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Expected revenue (£)
                </label>
                <input
                  type="number"
                  value={expectedRevenue}
                  onChange={(e) => setExpectedRevenue(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Link to meeting
                </label>
                <select
                  value={meetingId || ''}
                  onChange={(e) => setMeetingId(e.target.value || null)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                >
                  <option value="">None</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {new Date(m.meeting_date).toLocaleDateString('en-GB')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Setmore booking URL
                </label>
                <input
                  type="url"
                  value={setmoreUrl}
                  onChange={(e) => setSetmoreUrl(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                  placeholder="https://aldwiniansrufc.setmore.com/..."
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                  placeholder="Additional notes..."
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Discussion points for meeting
                </label>
                <textarea
                  value={discussionPoints}
                  onChange={(e) => setDiscussionPoints(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
                  placeholder="Add discussion points to raise at the trustees meeting..."
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={addEvent}
                disabled={loading || !title.trim()}
                className="min-h-[44px] w-full sm:w-auto rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add event'}
              </button>
            </div>
          </div>
        </section>

        {/* Calendar view */}
        <section className="mt-0 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6 lg:px-8">
            <h2 className="text-base sm:text-lg font-semibold text-zinc-900">
              Events calendar
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="min-h-[44px] min-w-[44px] rounded border border-zinc-300 bg-white px-3 py-2 text-lg font-medium hover:bg-zinc-50"
                aria-label="Previous month"
              >
                ‹
              </button>
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap px-2">
                {monthName}
              </span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="min-h-[44px] min-w-[44px] rounded border border-zinc-300 bg-white px-3 py-2 text-lg font-medium hover:bg-zinc-50"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-7 text-xs font-semibold text-zinc-500">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                <div key={d} className="px-1 py-1 text-center">
                  {d}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-px rounded-md border border-zinc-200 bg-zinc-200 text-xs">
              {Array.from({ length: calendarMeta.firstWeekday }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[80px] bg-zinc-50"
                />
              ))}

              {Array.from({ length: calendarMeta.daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateObj = new Date(calendarYear, calendarMonth, day);
                const dateKey = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD

                const dayEvents = eventsInMonth.filter((e) => {
                  const base = e.suggested_date || e.event_date;
                  if (!base) return false;
                  return new Date(base).toISOString().slice(0, 10) === dateKey;
                });

                const isSuggested = suggestedDays.includes(day);
                const planEventTitle = planForProfitDays[dateKey] ?? null;
                const isPlanForProfitDay = !!planEventTitle;
                const isSuggestedOnly = isSuggested && dayEvents.length === 0;

                const baseCellClasses =
                  'flex min-h-[80px] flex-col border border-zinc-200 px-1 py-1';

                const bgClass = isPlanForProfitDay
                  ? 'bg-red-50'
                  : isSuggestedOnly
                    ? 'bg-amber-50'
                    : 'bg-white';

                return (
                  <div
                    key={day}
                    className={`${baseCellClasses} ${bgClass}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-800">
                        {day}
                      </span>
                      {isPlanForProfitDay ? (
                        <span className="rounded bg-red-100 px-1 text-[10px] font-medium text-red-800">
                          key date
                        </span>
                      ) : isSuggested ? (
                        <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">
                          suggested
                        </span>
                      ) : null}
                    </div>

                    {/* Plan for Profit / key-date title */}
                    {planEventTitle && (
                      <p className="mb-1 text-[10px] font-medium text-red-900">
                        {planEventTitle}
                      </p>
                    )}

                    <div className="space-y-1">
                      {dayEvents.map((e) => (
                        <div
                          key={e.id}
                          className="rounded bg-blue-50 px-1 py-0.5 text-[11px] text-blue-900"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-semibold">
                              {e.title}
                            </span>
                            <span
                              className={`pc-tag ml-1 whitespace-nowrap rounded px-1 text-[9px] ${statusBadge(
                                e.status,
                              )}`}
                            >
                              {e.status}
                            </span>
                          </div>
                          {e.setmore_url && (
                            <a
                              href={e.setmore_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 block truncate text-[10px] text-blue-700 underline"
                            >
                              Setmore
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-zinc-500">
              Yellow “suggested” days are UK public holidays from gov.uk.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Red “key date” days are important 2026–2027 events from the Plan for Profit.
            </p>
          </div>
        </section>

        {/* New: separate box under the calendar to book functions */}
        <section className="mt-4 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="px-4 py-4 sm:px-6 lg:px-8">
            <h2 className="text-lg font-semibold text-zinc-900">
              Book a function
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Use the booking system to book events.
            </p>
            <div className="mt-3">
              <a
                href="https://aldwiniansrufc.setmore.com/bookings"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700"
              >
                Book functions online
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
