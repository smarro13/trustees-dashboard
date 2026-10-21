import { TEAM_GROUPS } from '../lib/membership';
import { formatMoney, formatUploadDate, type MembershipSummary } from '../lib/membershipSummary';

// The membership agenda item: figures from /operations/membership plus the
// money received, which is entered by hand until the ClubControl API is
// connected. Used on the agenda page, the meeting view and the detailed report.

type Props = {
  summary: MembershipSummary;
  moneyReceived?: number | null;
  notes?: string | null;
  showTeams?: boolean;
};

function Stat({ label, value, detail, tone = 'text-zinc-900' }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

export default function MembershipSummaryView({ summary, moneyReceived, notes, showTeams = false }: Props) {
  const p = summary.players;
  const notPaying = p.lapsed + p.missing;
  const seasonCost = p.unpaidMonthly * summary.monthsIntoSeason;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Players" value={String(p.total)} detail="on the GMS player list" />
        <Stat
          label="Paid"
          value={String(p.paid)}
          tone="text-emerald-700"
          detail={p.total ? `${Math.round((p.paid / p.total) * 100)}% of players` : undefined}
        />
        <Stat
          label="Not paying"
          value={String(notPaying)}
          tone="text-rose-700"
          detail={`${p.lapsed} lapsed · ${p.missing} not on ClubControl`}
        />
        <Stat
          label="Unpaid per month"
          value={formatMoney(p.unpaidMonthly)}
          detail={`${formatMoney(seasonCost)} this season (${summary.monthsIntoSeason} month${summary.monthsIntoSeason === 1 ? '' : 's'})`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Money received"
          value={moneyReceived != null ? formatMoney(moneyReceived) : '—'}
          detail="Entered by hand from ClubControl"
        />
        <Stat label="Active members" value={String(summary.activeMembers)} detail="on ClubControl" />
        <Stat label="Inactive members" value={String(summary.inactiveMembers)} />
        <Stat label="Not on GMS" value={String(summary.notOnGms)} detail="playing members to register" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">{showTeams ? 'Team' : 'Section'}</th>
              <th className="py-1.5 pr-3 text-right font-medium">Players</th>
              <th className="py-1.5 pr-3 text-right font-medium">Paid</th>
              <th className="py-1.5 pr-3 text-right font-medium">Lapsed</th>
              <th className="py-1.5 pr-3 text-right font-medium">Not on ClubControl</th>
              <th className="py-1.5 text-right font-medium">Unpaid / month</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(showTeams
              ? summary.byTeam.filter((t) => t.total > 0).map((t) => ({ label: t.team, ...t }))
              : TEAM_GROUPS.map((g) => ({ label: g, ...summary.byGroup[g] }))
            ).map((row) => (
              <tr key={row.label}>
                <td className="py-1.5 pr-3 font-medium text-zinc-800">{row.label}</td>
                <td className="py-1.5 pr-3 text-right">{row.total}</td>
                <td className="py-1.5 pr-3 text-right text-emerald-700">{row.paid}</td>
                <td className="py-1.5 pr-3 text-right text-amber-700">{row.lapsed}</td>
                <td className="py-1.5 pr-3 text-right text-rose-700">{row.missing}</td>
                <td className="py-1.5 text-right">{formatMoney(row.unpaidMonthly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {notes && <p className="whitespace-pre-wrap text-zinc-700">{notes}</p>}

      <p className="text-xs text-zinc-500">
        From the ClubControl export ({formatUploadDate(summary.membersUploadedAt)}) and GMS player list (
        {formatUploadDate(summary.playersUploadedAt)}). People hidden on the Membership page are left out.
      </p>
    </div>
  );
}
