import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import MembershipReportBody from '../../components/MembershipReportBody';
import MembershipSummaryView from '../../components/MembershipSummaryView';
import { canCurrentUserEditThisAgendaPage, PRESIDENT_EDIT_BLOCK_MESSAGE } from '../../lib/presidentPermissions';
import { buildMembershipSummary, loadMembershipData, type MembershipSummary } from '../../lib/membershipSummary';

// Membership agenda item. The figures come from /operations/membership (the
// ClubControl export and the GMS player list); saving stores a snapshot of
// them on membership_reports.summary, so the meeting keeps the numbers as they
// were. The money is the total of the ClubControl export's Amount column,
// worked out with the rest (no ClubControl API is needed). Older reports still
// show the money that was typed in by hand, or their LoveAdmin figures.
// pages/api/cron/membership-report.ts saves the summary automatically on
// meeting day if nobody has.

const meetingLabel = (date: string) =>
  new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function MembershipReportPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [canEdit, setCanEdit] = useState(true);

  const showNotice = (type: InlineNotice['type'], message: string) => setNotice({ type, message });

  const loadReports = async () => {
    const { data } = await supabase
      .from('membership_reports')
      .select(`*, meetings ( meeting_date )`)
      .order('created_at', { ascending: false });
    if (data) setReports(data);
  };

  useEffect(() => {
    const load = async () => {
      const { data: meetingsData } = await supabase
        .from('meetings')
        .select('id, meeting_date')
        .order('meeting_date', { ascending: true });
      if (meetingsData) {
        setMeetings(meetingsData);
        // Default to the next meeting (today counts).
        const today = new Date().toISOString().slice(0, 10);
        const next = meetingsData.find((m) => String(m.meeting_date).slice(0, 10) >= today);
        if (next) setMeetingId(next.id);
      }

      await loadReports();

      try {
        setSummary(buildMembershipSummary(await loadMembershipData()));
      } catch {
        setSummaryError('The membership figures are only available to admins, trustees, directors and the Director of Rugby.');
      }
      setLoading(false);
    };
    void load();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    void canCurrentUserEditThisAgendaPage().then(setCanEdit);
  }, []);

  const saveReport = async () => {
    if (!(await canCurrentUserEditThisAgendaPage())) {
      showNotice('error', PRESIDENT_EDIT_BLOCK_MESSAGE);
      return;
    }
    if (!summary) return;
    if (!meetingId) {
      showNotice('error', 'Choose the meeting this report is for.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('membership_reports').insert({
      meeting_id: meetingId,
      summary,
      // Also kept in money_total so it can be read without unpacking the summary.
      money_total: summary.amountTotal ?? null,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      showNotice('error', `Failed to save: ${error.message}`);
      return;
    }

    setNotes('');
    showNotice('success', 'Membership report saved to the meeting.');
    void loadReports();
  };

  const detailedReportHref = `/operations/membership/report${meetingId ? `?meetingId=${meetingId}` : ''}`;

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to dashboard
            </Link>
            <h1 className="text-3xl font-extrabold text-zinc-900">Membership Report</h1>
            <p className="mt-1 text-zinc-600">
              A summary from the{' '}
              <Link href="/operations/membership" className="text-blue-600 hover:underline">Membership page</Link>.
            </p>
          </div>
          {summary && (
            <a
              href={detailedReportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              📄 Generate detailed report
            </a>
          )}
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {!canEdit && (
          <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {PRESIDENT_EDIT_BLOCK_MESSAGE}
          </div>
        )}

        <section className="mb-10 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <h2 className="text-xl font-semibold">This month&rsquo;s figures</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Worked out from the latest data, fetched automatically from ClubControl, GMS and Thrive4. On the day of each meeting this is saved to the meeting automatically (early morning), unless it already has one. Save it yourself to add notes or to save it sooner. A saved copy doesn&rsquo;t change when new data is fetched.
            </p>
          </div>

          <div className="space-y-6 px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            {loading ? (
              <p className="text-sm text-zinc-400">Loading the membership figures…</p>
            ) : summaryError ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">{summaryError}</p>
            ) : summary ? (
              <MembershipSummaryView summary={summary} />
            ) : null}

            {summary && (
              <fieldset disabled={!canEdit || saving} className="space-y-4 border-t border-zinc-200 pt-5 disabled:opacity-70">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="membership-meeting" className="block text-sm font-medium text-zinc-700">
                      Meeting
                    </label>
                    <select
                      id="membership-meeting"
                      value={meetingId ?? ''}
                      onChange={(e) => setMeetingId(e.target.value || null)}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2"
                    >
                      <option value="">Choose a meeting</option>
                      {meetings.map((m) => (
                        <option key={m.id} value={m.id}>{meetingLabel(m.meeting_date)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="membership-notes" className="block text-sm font-medium text-zinc-700">
                    Notes (optional)
                  </label>
                  <textarea
                    id="membership-notes"
                    rows={3}
                    placeholder="Anything to add for the meeting"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={saveReport}
                    className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save to meeting'}
                  </button>
                </div>
              </fieldset>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-900">Saved reports</h2>
          {!loading && reports.length === 0 && <p className="text-sm text-zinc-500">No membership reports yet.</p>}
          {reports.map((r) => (
            <div key={r.id} className="player-card">
              {r.meetings?.meeting_date && (
                <p className="pc-meta mb-3">Meeting: {new Date(r.meetings.meeting_date).toLocaleDateString('en-GB')}</p>
              )}
              <MembershipReportBody report={r} />
              <p className="mt-3 text-xs text-zinc-400">Added {new Date(r.created_at).toLocaleString('en-GB')}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
