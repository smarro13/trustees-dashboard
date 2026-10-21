import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import MembershipSummaryView from '../../../components/MembershipSummaryView';
import { STATUS_LABELS } from '../../../lib/membership';
import {
  buildMembershipDetail,
  buildMembershipSummary,
  loadMembershipData,
  type MembershipDetail,
  type MembershipSummary,
} from '../../../lib/membershipSummary';

// Detailed membership report, opened from the Membership agenda item
// ("Generate detailed report") and made for printing or saving as a PDF.
// Built live from /operations/membership's data, so it names people: only
// the roles that can read the membership tables see it (RLS in
// supabase/policies/membership.sql and dor_role.sql; proxy.ts guards the page).
// ?meetingId= adds that meeting's date and its latest saved money received.

const longDate = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

function NameTable({ title, intro, rows }: { title: string; intro: string; rows: Array<{ name: string; extra?: string; status?: string }> }) {
  return (
    <section className="mt-8 break-inside-avoid-page">
      <h2 className="text-lg font-semibold text-zinc-900">
        {title} <span className="text-sm font-normal text-zinc-500">({rows.length})</span>
      </h2>
      <p className="mt-0.5 text-sm text-zinc-600">{intro}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">None.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row, i) => (
              <tr key={`${row.name}-${i}`} className="break-inside-avoid">
                <td className="py-1.5 pr-3 text-zinc-800">{row.name}</td>
                {row.extra !== undefined && <td className="py-1.5 pr-3 text-zinc-600">{row.extra}</td>}
                {row.status !== undefined && <td className="py-1.5 text-zinc-600">{row.status}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function MembershipDetailedReportPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [detail, setDetail] = useState<MembershipDetail | null>(null);
  const [meetingDate, setMeetingDate] = useState<string | null>(null);
  const [moneyReceived, setMoneyReceived] = useState<number | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!router.isReady) return;
    const meetingId = typeof router.query.meetingId === 'string' ? router.query.meetingId : null;

    const load = async () => {
      try {
        const data = await loadMembershipData();
        setSummary(buildMembershipSummary(data));
        setDetail(buildMembershipDetail(data));
      } catch {
        setError('The detailed membership report is only available to admins, trustees, directors and the Director of Rugby.');
        setLoading(false);
        return;
      }

      if (meetingId) {
        const [{ data: meeting }, { data: saved }] = await Promise.all([
          supabase.from('meetings').select('meeting_date').eq('id', meetingId).maybeSingle(),
          supabase
            .from('membership_reports')
            .select('money_total, notes')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (meeting?.meeting_date) setMeetingDate(String(meeting.meeting_date));
        if (saved?.money_total != null) setMoneyReceived(Number(saved.money_total));
        if (saved?.notes) setNotes(saved.notes);
      }
      setLoading(false);
    };
    void load();
  }, [router.isReady, router.query.meetingId]);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 print:max-w-none print:p-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/operations/membership" className="text-sm font-medium text-blue-600 hover:underline">
            ← Membership
          </Link>
          {summary && (
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              🖨 Print or save as PDF
            </button>
          )}
        </div>

        <header className="mb-6 border-b border-zinc-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Aldwinians RUFC</p>
          <h1 className="mt-1 text-2xl font-extrabold text-zinc-900 sm:text-3xl">Membership report</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {meetingDate ? `For the meeting on ${longDate(meetingDate)}. ` : ''}
            Generated {longDate(new Date().toISOString())}.
          </p>
          <p className="mt-2 text-xs text-zinc-500">Contains members&rsquo; personal details. Don&rsquo;t share beyond the committee.</p>
        </header>

        {loading ? (
          <p className="text-sm text-zinc-400">Building the report…</p>
        ) : error ? (
          <p className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">{error}</p>
        ) : summary && detail ? (
          <>
            <MembershipSummaryView summary={summary} moneyReceived={moneyReceived} notes={notes} showTeams />

            <NameTable
              title="Players not paying"
              intro="On the GMS player list but lapsed or not on ClubControl, by team."
              rows={detail.unpaidPlayers.map((p) => ({ name: p.name, extra: p.team, status: STATUS_LABELS[p.status] }))}
            />
            <NameTable
              title="Not on GMS"
              intro="ClubControl members with a playing membership who aren't in the GMS player list, so should be registered."
              rows={detail.notOnGms.map((m) => ({ name: m.name }))}
            />
            <NameTable
              title="Inactive ClubControl members"
              intro="Members whose ClubControl membership is no longer active."
              rows={detail.inactiveMembers.map((m) => ({ name: m.name }))}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}
