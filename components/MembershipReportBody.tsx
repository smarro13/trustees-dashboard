import MembershipSummaryView from './MembershipSummaryView';
import type { MembershipSummary } from '../lib/membershipSummary';

// A saved membership_reports row. Reports saved since 21 Oct 2026 carry a
// summary from /operations/membership; older ones show the LoveAdmin figures
// that were typed in by hand. Bottomline is no longer used, so its old figures
// (num_people, and money_total on rows without a summary) aren't shown.

const LEGACY_FIELDS: Array<[string, string]> = [
  ['loveadmin_new_signups', 'LoveAdmin New sign ups'],
  ['loveadmin_total', 'LoveAdmin Total (£)'],
  ['loveadmin_outstanding_total', 'Outstanding payments total (£)'],
  ['loveadmin_cancellations', 'Number of cancellations'],
];

export default function MembershipReportBody({ report, showTeams = false }: { report: any; showTeams?: boolean }) {
  if (report?.summary) {
    return (
      <MembershipSummaryView
        summary={report.summary as MembershipSummary}
        moneyReceived={report.money_total != null ? Number(report.money_total) : null}
        notes={report.notes}
        showTeams={showTeams}
      />
    );
  }

  return (
    <div className="space-y-1 text-sm text-zinc-700">
      {LEGACY_FIELDS.filter(([key]) => report?.[key] != null).map(([key, label]) => (
        <p key={key}>
          <span className="font-semibold">{label}:</span> {report[key]}
        </p>
      ))}
    </div>
  );
}
