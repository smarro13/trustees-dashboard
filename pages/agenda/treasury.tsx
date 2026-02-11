import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { User } from '@supabase/supabase-js';

type Item = {
  dateRange?: string; // now a single month (e.g. "March 2025")
  moneyIn?: string;
  moneyOut?: string;
};

type RegularPayment = {
  id: number;
  description: string;
  frequency: string;
  amount: string;
  notes: string;
};

type RegularIncome = {
  description: string;
  frequency: string;
  amount: string;
  notes: string;
};

type MoneyOwed = {
  name: string;
  amount: string;
};

export default function TreasuryPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [period, setPeriod] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Item[]>([
    { dateRange: '', moneyIn: '', moneyOut: '' },
  ]);
  const [regularPayments, setRegularPayments] = useState<RegularPayment[]>([
    { id: 1, description: 'Gas', frequency: 'Monthly', amount: '300', notes: 'Monthly Readings' },
    { id: 2, description: 'Water', frequency: 'Monthly', amount: '580', notes: 'Catch Up Payments' },
    { id: 3, description: 'BT Group (Phone)', frequency: 'Monthly TC', amount: '99', notes: '' },
    { id: 4, description: 'BT Group (Broadband)', frequency: 'Monthly TC', amount: '246', notes: '' },
    { id: 5, description: '3 Mobile', frequency: 'Monthly TC', amount: '30', notes: 'Steward Mobile' },
    { id: 6, description: 'Bottom Line', frequency: 'Monthly', amount: '85', notes: 'On Average' },
    { id: 7, description: 'Sky TV', frequency: 'Monthly TC', amount: '450', notes: '' },
    { id: 8, description: 'Coaching Staff', frequency: 'Monthly', amount: '1353', notes: '' },
    { id: 9, description: 'Laundry', frequency: 'Monthly', amount: '650', notes: 'Average over the year' },
    { id: 10, description: 'DK Services', frequency: 'Monthly TC', amount: '104', notes: 'Pot Washers' },
    { id: 11, description: 'FDMS', frequency: 'Monthly TC', amount: '520', notes: 'Varies on the amount taken' },
    { id: 12, description: 'Mark Bates', frequency: 'Monthly', amount: '140', notes: 'Average' },
    { id: 13, description: 'Physio', frequency: 'Monthly', amount: '320', notes: '' },
    { id: 14, description: 'Concept Hygiene', frequency: 'Monthly', amount: '270', notes: '' },
    { id: 15, description: 'Aldermore Bank PLC', frequency: 'Monthly TC', amount: '255.60', notes: 'Club Control' },
    { id: 16, description: 'Biffa Waste', frequency: 'Monthly TC', amount: '557', notes: '' },
    { id: 17, description: 'HMRC', frequency: 'Monthly', amount: '355', notes: 'PAYE for RM (Increased)' },
    { id: 18, description: 'Club Insure', frequency: 'Monthly', amount: '858.33', notes: '' },
    { id: 19, description: 'Coporate Asset Sols', frequency: 'Monthly TC', amount: '400.80', notes: '' },
  ]);
  const [regularIncomes, setRegularIncomes] = useState<RegularIncome[]>([
    { description: 'Road Riders', frequency: 'Monthly', amount: '450', notes: '' },
    { description: 'LoveAdmin', frequency: 'Monthly', amount: '4800', notes: '' },
    { description: 'BottomLine', frequency: 'Monthly', amount: '800', notes: '' },
    { description: 'Aldwinians TC', frequency: 'Monthly', amount: '1000', notes: '' },
  ]);
  const [moniesOwed, setMoniesOwed] = useState<MoneyOwed[]>([
    { name: 'TGL Solutions', amount: '2500' },
    { name: 'Smirfit Sponsorship', amount: '1000' },
    { name: '6 Nations Tickets', amount: '2280' },
  ]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    // Get current user
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    setUser(currentUser);

    // Fetch reports (RLS will filter to user's only)
    const { data: reportsData } = await supabase
      .from('treasury_reports')
      .select('*')
      .order('created_at', { ascending: false });

    // Fetch items separately
    let reportsWithItems: any[] = [];
    if (reportsData) {
      reportsWithItems = await Promise.all(
        reportsData.map(async (report) => {
          const { data: items = [] } = await supabase
            .from('treasury_report_items')
            .select('label, amount')
            .eq('report_id', report.id);

          let meeting = null;
          if (report.meeting_id) {
            const { data: meetingData } = await supabase
              .from('meetings')
              .select('meeting_date')
              .eq('id', report.meeting_id)
              .single();
            meeting = meetingData;
          }

          return {
            ...report,
            meetings: meeting,
            treasury_report_items: items || [],
          };
        })
      );
    }

    if (reportsWithItems) setReports(reportsWithItems);

    // only fetch meetings that are not yet linked OR (if you prefer) that exist at all.
    // Here: fetch meetings in the future or with no linked report yet.
    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true });

    if (meetingsData) setMeetings(meetingsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addRow = () =>
    setItems([
      ...items,
      { dateRange: '', moneyIn: '', moneyOut: '' },
    ]);

  const updateRow = (i: number, key: keyof Item, value: string) => {
    const copy = [...items];
    copy[i][key] = value;
    if (key === 'dateRange' && value) {
      const [year, month] = value.split('-');
      const d = new Date(Number(year), Number(month) - 1, 1);
      copy[i].dateRange = d.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });
    }
    setItems(copy);
  };

  const addRegularPaymentRow = () =>
    setRegularPayments([
      ...regularPayments,
      { id: Date.now(), description: '', frequency: '', amount: '', notes: '' },
    ]);

  const updateRegularPaymentRow = (
    id: number,
    key: keyof RegularPayment,
    value: string,
  ) => {
    setRegularPayments((prev) =>
      prev.map((rp) =>
        rp.id === id ? { ...rp, [key]: value } : rp
      )
    );
  };

  const addRegularIncomeRow = () =>
    setRegularIncomes([
      ...regularIncomes,
      { description: '', frequency: '', amount: '', notes: '' },
    ]);

  const updateRegularIncomeRow = (
    i: number,
    key: keyof RegularIncome,
    value: string,
  ) => {
    const copy = [...regularIncomes];
    copy[i][key] = value;
    setRegularIncomes(copy);
  };

  const addMoneyOwedRow = () =>
    setMoniesOwed([
      ...moniesOwed,
      { name: '', amount: '' },
    ]);

  const updateMoneyOwedRow = (i: number, key: keyof MoneyOwed, value: string) => {
    const copy = [...moniesOwed];
    copy[i][key] = value;
    setMoniesOwed(copy);
  };

  const removeMoneyOwedRow = (index: number) => {
    setMoniesOwed((prev) => prev.filter((_, i) => i !== index));
  };

  const removeRegularIncomeRow = (index: number) => {
    setRegularIncomes((prev) => prev.filter((_, i) => i !== index));
  };

  const removeRegularPaymentRow = (id: number) => {
    setRegularPayments((prev) => prev.filter((rp) => rp.id !== id));
  };

  const saveReport = async () => {
    if (!period.trim()) {
      alert('Please enter a reporting period');
      return;
    }

    if (!user) {
      alert('You must be logged in to save a report');
      return;
    }

    setLoading(true);

    try {
      const { data: report, error: reportError } = await supabase
        .from('treasury_reports')
        .insert({
          reporting_period: period,
          meeting_id: meetingId,
          notes,
          user_id: user.id,
        })
        .select()
        .single();

      if (reportError) {
        alert(`Error creating report: ${reportError.message}`);
        setLoading(false);
        return;
      }

      if (report) {
        const rows = items
          .filter(
            (i) =>
              (i.moneyIn && Number(i.moneyIn)) ||
              (i.moneyOut && Number(i.moneyOut))
          )
          .map((i, idx) => {
            const moneyIn = Number(i.moneyIn || '0');
            const moneyOut = Number(i.moneyOut || '0');
            const diff = moneyIn - moneyOut;
            const baseLabel = i.dateRange || `Entry ${idx + 1}`;
            return {
              report_id: report.id,
              label: baseLabel,
              amount: diff,
              user_id: user.id,
              moneyIn,
              moneyOut,
            };
          });

        // Extract rows for database insertion (without moneyIn/moneyOut)
        const rowsForDb = rows.map(({ moneyIn, moneyOut, ...rest }) => ({
          ...rest,
          money_in: moneyIn,
          money_out: moneyOut,
        }));

        const regularRows = regularPayments
          .filter((rp) => rp.description && rp.amount)
          .map((rp) => ({
            report_id: report.id,
            label: `Regular: ${rp.description} (${rp.frequency}${
              rp.notes ? ` – ${rp.notes}` : ''
            })`,
            amount: Number(rp.amount || '0'),
            user_id: user.id,
          }));

        const regularIncomeRows = regularIncomes
          .filter((ri) => ri.description && ri.amount)
          .map((ri) => ({
            report_id: report.id,
            label: `Regular income: ${ri.description} (${ri.frequency}${
              ri.notes ? ` – ${ri.notes}` : ''
            })`,
            amount: Number(ri.amount || '0'),
            user_id: user.id,
          }));

        const moniesOwedRows = moniesOwed
          .filter((m) => m.name && m.amount)
          .map((m) => ({
            report_id: report.id,
            label: `Monies owed: ${m.name}`,
            amount: -Number(m.amount || '0'), // negative because this is owed
            user_id: user.id,
          }));

        const allRows = [
          ...rowsForDb,
          ...regularRows,
          ...regularIncomeRows,
          ...moniesOwedRows,
        ];

        if (allRows.length) {
          const { error: itemsError } = await supabase
            .from('treasury_report_items')
            .insert(allRows);

          if (itemsError) {
            alert(`Error saving report items: ${itemsError.message}`);
            setLoading(false);
            return;
          }

          // Build summary from items for display on meeting page
          const moneyInTotal = rows.reduce((sum, r) => sum + r.moneyIn, 0);
          const moneyOutTotal = rows.reduce((sum, r) => sum + r.moneyOut, 0);
          const difference = Math.round((moneyInTotal - moneyOutTotal) * 100) / 100;

          // Monthly entries summary
          const monthlyEntriesSummary = rows
            .map((row) => {
              const moneyIn = Number(row.moneyIn || '0');
              const moneyOut = Number(row.moneyOut || '0');
              const diff = Math.round((moneyIn - moneyOut) * 100) / 100;
              return `${row.label}: In £${moneyIn.toFixed(2)} | Out £${moneyOut.toFixed(2)} | Diff £${diff.toFixed(2)}`;
            })
            .join('\n');

          const regularSummary = regularRows
            .map((row) => `${row.label}: £${Number(row.amount).toFixed(2)}`)
            .join('\n');

          const incomesSummary = regularIncomeRows
            .map((row) => `${row.label}: £${Number(row.amount).toFixed(2)}`)
            .join('\n');

          const owedSummary = moniesOwedRows
            .map((row) => `${row.label}: £${Math.abs(Number(row.amount)).toFixed(2)}`)
            .join('\n');

          const summary = [
            `💰 Money In: £${moneyInTotal.toFixed(2)}`,
            `💸 Money Out: £${moneyOutTotal.toFixed(2)}`,
            `📊 Difference: £${difference.toFixed(2)}`,
            '',
            monthlyEntriesSummary ? `Monthly Entries:\n${monthlyEntriesSummary}` : '',
            regularSummary ? `Regular Payments:\n${regularSummary}` : '',
            incomesSummary ? `Regular Incomes:\n${incomesSummary}` : '',
            owedSummary ? `Monies Owed:\n${owedSummary}` : '',
            notes ? `Additional Comments:\n${notes}` : '',
          ]
            .filter((s) => s)
            .join('\n\n');

          // Update report with summary
          await supabase
            .from('treasury_reports')
            .update({ summary })
            .eq('id', report.id);
        }
      }

      // Reset form after successful save
      setPeriod('');
      setMeetingId(null);
      setNotes('');
      setItems([{ dateRange: '', moneyIn: '', moneyOut: '' }]);
      setRegularPayments([
        { description: 'Gas', frequency: 'Monthly', amount: '300', notes: 'Monthly Readings' },
        { description: 'Water', frequency: 'Monthly', amount: '580', notes: 'Catch Up Payments' },
        { description: 'BT Group (Phone)', frequency: 'Monthly TC', amount: '99', notes: '' },
        { description: 'BT Group (Broadband)', frequency: 'Monthly TC', amount: '246', notes: '' },
        { description: '3 Mobile', frequency: 'Monthly TC', amount: '30', notes: 'Steward Mobile' },
        { description: 'Bottom Line', frequency: 'Monthly', amount: '85', notes: 'On Average' },
        { description: 'Sky TV', frequency: 'Monthly TC', amount: '450', notes: '' },
        { description: 'Coaching Staff', frequency: 'Monthly', amount: '1353', notes: '' },
        { description: 'Laundry', frequency: 'Monthly', amount: '650', notes: 'Average over the year' },
        { description: 'DK Services', frequency: 'Monthly TC', amount: '104', notes: 'Pot Washers' },
        { description: 'FDMS', frequency: 'Monthly TC', amount: '520', notes: 'Varies on the amount taken' },
        { description: 'Mark Bates', frequency: 'Monthly', amount: '140', notes: 'Average' },
        { description: 'Physio', frequency: 'Monthly', amount: '320', notes: '' },
        { description: 'Concept Hygiene', frequency: 'Monthly', amount: '270', notes: '' },
        { description: 'Aldermore Bank PLC', frequency: 'Monthly TC', amount: '255.60', notes: 'Club Control' },
        { description: 'Biffa Waste', frequency: 'Monthly TC', amount: '557', notes: '' },
        { description: 'HMRC', frequency: 'Monthly', amount: '355', notes: 'PAYE for RM (Increased)' },
        { description: 'Club Insure', frequency: 'Monthly', amount: '858.33', notes: '' },
        { description: 'Coporate Asset Sols', frequency: 'Monthly TC', amount: '400.80', notes: '' },
      ]);
      setRegularIncomes([
        { description: 'Road Riders', frequency: 'Monthly', amount: '450', notes: '' },
        { description: 'LoveAdmin', frequency: 'Monthly', amount: '4800', notes: '' },
        { description: 'BottomLine', frequency: 'Monthly', amount: '800', notes: '' },
        { description: 'Aldwinians TC', frequency: 'Monthly', amount: '1000', notes: '' },
      ]);
      setMoniesOwed([
        { name: 'TGL Solutions', amount: '2500' },
        { name: 'Smirfit Sponsorship', amount: '1000' },
        { name: '6 Nations Tickets', amount: '2280' },
      ]);

      alert('Report saved successfully!');
      await loadData();
    } catch (error) {
      console.error('Error saving report:', error);
      alert(`An unexpected error occurred: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // helper to sort for UX without mutating state
  const getSortedRegularPayments = () => {
    return [...regularPayments].sort((a, b) => {
      const fa = a.frequency.trim().toLowerCase();
      const fb = b.frequency.trim().toLowerCase();

      const rank = (f: string) => {
        if (f.startsWith('monthly') && !f.includes('tc')) return 0; // Monthly first
        if (f.includes('monthly tc')) return 1;                      // then Monthly TC
        return 2;                                                    // then everything else
      };

      const ra = rank(fa);
      const rb = rank(fb);
      if (ra !== rb) return ra - rb;

      // within same group, sort alphabetically by description
      return a.description.localeCompare(b.description);
    });
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      {/* widen content area more to reduce cramping */}
      <div className="mx-auto w-full max-w-6xl sm:max-w-7xl lg:max-w-[1200px] px-2 sm:px-4 lg:px-6 py-6 sm:py-8 lg:py-10">
        {/* Header */}
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            💰 Treasury Report
          </h1>
          <p className="mt-1 text-zinc-600">
            Financial overview for Aldwinians RUFC - Monthly Update
          </p>
        </header>

        {/* New report – flat, full-width section */}
        <section className="mb-10 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <h2 className="text-xl font-semibold text-zinc-900">
              ➕ Add treasury report
            </h2>
          </div>

          {/* Any new inputs/tables/buttons should be added inside this padded block */}
          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-6">
            {/* Period + meeting row */}
            <div className="grid gap-4 lg:grid-cols-2">
              <input
                type="text"
                placeholder="Reporting period (e.g. March 2025)"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />

              <select
                value={meetingId ?? ''}
                onChange={(e) => setMeetingId(e.target.value || null)}
                className="w-full rounded-md border px-3 py-2"
              >
                <option value="">Link to meeting (optional)</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {new Date(m.meeting_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </option> 
                ))}
              </select>
            </div>

            {/* Month / Money table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border min-w-max sm:table-fixed">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="border px-2 py-1 text-left whitespace-nowrap">Month</th>
                    <th className="border px-2 py-1 text-right whitespace-nowrap">Money In (£)</th>
                    <th className="border px-2 py-1 text-right whitespace-nowrap">Money Out (£)</th>
                    <th className="border px-2 py-1 text-right whitespace-nowrap">Difference</th>
                    <th className="border px-2 py-1 text-right whitespace-nowrap">Balance</th>
                    <th className="border px-2 py-1 text-right whitespace-nowrap">New Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => {
                    const moneyIn = Number(row.moneyIn || '0');
                    const moneyOut = Number(row.moneyOut || '0');
                    const diff = moneyIn - moneyOut;

                    const balance = items
                      .slice(0, idx + 1)
                      .reduce((acc, r) => {
                        const mi = Number(r.moneyIn || '0');
                        const mo = Number(r.moneyOut || '0');
                        return acc + (mi - mo);
                      }, 0);

                    return (
                      <tr key={idx}>
                        <td className="border px-2 py-1 align-top">
                          <input
                            type="month"
                            onChange={(e) =>
                              updateRow(idx, 'dateRange', e.target.value)
                            }
                            className="w-full rounded border px-2 py-1"
                          />
                          {row.dateRange && (
                            <p className="mt-1 text-xs text-zinc-500">
                              {row.dateRange}
                            </p>
                          )}
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.moneyIn || ''}
                            onChange={(e) =>
                              updateRow(idx, 'moneyIn', e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-right"
                          />
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.moneyOut || ''}
                            onChange={(e) =>
                              updateRow(idx, 'moneyOut', e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-right"
                          />
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          £{diff.toFixed(2)}
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          £{balance.toFixed(2)}
                        </td>
                        <td className="border px-2 py-1 text-right align-top">
                          <input
                            type="number"
                            step="0.01"
                            className="w-full rounded border px-2 py-1 text-right"
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold bg-zinc-50">
                    <td className="border px-2 py-1">
                      Totals
                    </td>
                    <td className="border px-2 py-1 text-right">
                    <td className="border px-2 py-1 text-right">
                      £
                      {items
                        .reduce(
                          (sum, r) => sum + Number(r.moneyIn || '0'),
                          0
                        )
                        .toFixed(2)}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      £
                      {items
                        .reduce(
                          (sum, r) => sum + Number(r.moneyOut || '0'),
                          0
                        )
                        .toFixed(2)}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      £
                      {items
                        .reduce((sum, r) => {
                          const mi = Number(r.moneyIn || '0');
                          const mo = Number(r.moneyOut || '0');
                          return sum + (mi - mo);
                        }, 0)
                        .toFixed(2)}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      £
                      {items
                        .reduce((sum, r) => {
                          const mi = Number(r.moneyIn || '0');
                          const mo = Number(r.moneyOut || '0');
                          return sum + (mi - mo);
                        }, 0)
                        .toFixed(2)}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Regular income table */}
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                Regular income
              </h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm border min-w-max">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="border px-2 py-1 text-left whitespace-nowrap">Regular Payments</th>
                    <th className="border px-2 py-1 text-left whitespace-nowrap">Frequency</th>
                    <th className="border px-2 py-1 text-right whitespace-nowrap">Amount (£)</th>
                    <th className="border px-2 py-1 text-left whitespace-nowrap">Notes</th>
                    <th className="border px-2 py-1 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {regularIncomes.map((ri, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="border px-2 py-1 align-top">
                        <input
                          type="text"
                          value={ri.description}
                          onChange={(e) =>
                            updateRegularIncomeRow(idx, 'description', e.target.value)
                          }
                          className="w-full rounded border px-2 py-1"
                          placeholder="e.g. Membership fees"
                        />
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <input
                          type="text"
                          value={ri.frequency}
                          onChange={(e) =>
                            updateRegularIncomeRow(idx, 'frequency', e.target.value)
                          }
                          className="w-full rounded border px-2 py-1"
                          placeholder="e.g. Monthly"
                        />
                      </td>
                      <td className="border px-2 py-1 text-right align-top">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ri.amount}
                          onChange={(e) =>
                            updateRegularIncomeRow(idx, 'amount', e.target.value)
                          }
                          className="w-full rounded border px-2 py-1 text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <textarea
                          value={ri.notes}
                          onChange={(e) =>
                            updateRegularIncomeRow(idx, 'notes', e.target.value)
                          }
                          rows={2}
                          className="w-full rounded border px-2 py-1 resize-y"
                          placeholder="Optional notes"
                        />
                      </td>
                      <td className="border px-2 py-1 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => removeRegularIncomeRow(idx)}
                          className="rounded border px-2 py-0.5 text-xs text-red-600"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
                <button
                  type="button"
                  onClick={addRegularIncomeRow}
                  className="rounded-md border px-3 py-1 text-sm"
                >
                  + Add regular income
                </button>
                <span className="font-semibold whitespace-nowrap">
                  Total regular income:{' '}
                  £
                  {regularIncomes
                    .reduce(
                      (sum, ri) => sum + Number(ri.amount || '0'),
                      0,
                    )
                    .toFixed(2)}
                </span>
              </div>
            </div>

            {/* Monies owed table */}
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                Monies owed
              </h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm border min-w-max">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="border px-2 py-1 text-left whitespace-nowrap">Name</th>
                    <th className="border px-2 py-1 text-right whitespace-nowrap">Amount (£)</th>
                    <th className="border px-2 py-1 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {moniesOwed.map((m, idx) => (
                    <tr key={idx}>
                      <td className="border px-2 py-1">
                        <input
                          type="text"
                          value={m.name}
                          onChange={(e) =>
                            updateMoneyOwedRow(idx, 'name', e.target.value)
                          }
                          className="w-full rounded border px-2 py-1"
                          placeholder="e.g. Player subs outstanding"
                        />
                      </td>
                      <td className="border px-2 py-1 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={m.amount}
                          onChange={(e) =>
                            updateMoneyOwedRow(idx, 'amount', e.target.value)
                          }
                          className="w-full rounded border px-2 py-1 text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="border px-2 py-1 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => removeMoneyOwedRow(idx)}
                          className="rounded border px-2 py-0.5 text-xs text-red-600"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
                <button
                  type="button"
                  onClick={addMoneyOwedRow}
                  className="rounded-md border px-3 py-1 text-sm"
                >
                  + Add monies owed
                </button>
                <span className="font-semibold whitespace-nowrap">
                  Total owed:{' '}
                  £
                  {moniesOwed
                    .reduce(
                      (sum, m) => sum + Number(m.amount || '0'),
                      0,
                    )
                    .toFixed(2)}
                </span>
              </div>
            </div>

            {/* Regular payments table */}
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                Regular payments
              </h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm border min-w-max">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="border px-2 py-1 text-left whitespace-nowrap">Description</th>
                    <th className="border px-2 py-1 text-left whitespace-nowrap">Frequency</th>
                    <th className="border px-2 py-1 text-right whitespace-nowrap">Amount (£)</th>
                    <th className="border px-2 py-1 text-left whitespace-nowrap">Notes</th>
                    <th className="border px-2 py-1 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedRegularPayments().map((rp) => (
                    <tr key={rp.id} className="align-top">
                      <td className="border px-2 py-1 align-top">
                        <input
                          type="text"
                          value={rp.description}
                          onChange={(e) =>
                            updateRegularPaymentRow(
                              rp.id,
                              'description',
                              e.target.value,
                            )
                          }
                          className="w-full rounded border px-2 py-1"
                          placeholder="e.g. Pitch hire"
                        />
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <input
                          type="text"
                          value={rp.frequency}
                          onChange={(e) =>
                            updateRegularPaymentRow(
                              rp.id,
                              'frequency',
                              e.target.value,
                            )
                          }
                          className="w-full rounded border px-2 py-1"
                          placeholder="e.g. Monthly"
                        />
                      </td>
                      <td className="border px-2 py-1 text-right align-top">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rp.amount}
                          onChange={(e) =>
                            updateRegularPaymentRow(
                              rp.id,
                              'amount',
                              e.target.value,
                            )
                          }
                          className="w-full rounded border px-2 py-1 text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <textarea
                          value={rp.notes}
                          onChange={(e) =>
                            updateRegularPaymentRow(
                              rp.id,
                              'notes',
                              e.target.value,
                            )
                          }
                          rows={3}
                          className="w-full rounded border px-2 py-1 resize-y"
                          placeholder="Optional notes (will be included in report label)"
                        />
                      </td>
                      <td className="border px-2 py-1 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => removeRegularPaymentRow(rp.id)}
                          className="rounded border px-2 py-0.5 text-xs text-red-600"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {/* Grouped totals */}
              <div className="mt-3 text-sm">
                {(() => {
                  const monthlyTotal = regularPayments
                    .filter(
                      (rp) =>
                        rp.frequency.trim().toLowerCase().startsWith('monthly') &&
                        !rp.frequency.toLowerCase().includes('tc'),
                    )
                    .reduce((sum, rp) => sum + Number(rp.amount || '0'), 0);

                  const monthlyTcTotal = regularPayments
                    .filter((rp) =>
                      rp.frequency.trim().toLowerCase().includes('monthly tc'),
                    )
                    .reduce((sum, rp) => sum + Number(rp.amount || '0'), 0);

                  const combinedTotal = monthlyTotal + monthlyTcTotal;

                  return (
                    <div className="space-y-1">
                      <p>
                        <span className="font-semibold">Monthly total:</span>{' '}
                        £{monthlyTotal.toFixed(2)}
                      </p>
                      <p>
                        <span className="font-semibold">Monthly TC total:</span>{' '}
                        £{monthlyTcTotal.toFixed(2)}
                      </p>
                      <p>
                        <span className="font-semibold">
                          Combined regular payments total:
                        </span>{' '}
                        £{combinedTotal.toFixed(2)}
                      </p>
                    </div>
                  );
                })()}
              </div>

              <button
                type="button"
                onClick={addRegularPaymentRow}
                className="mt-3 rounded-md border px-3 py-1 text-sm"
              >
                + Add regular payment
              </button>
            </div>

            {/* Notes + save */}
            <textarea
              placeholder="Additional commentary / updates"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2"
            />

            <div className="flex justify-end">
              <button
                onClick={saveReport}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Save report'}
              </button>
            </div>
          </div>
        </section>

        {/* Reports */}
        <section className="space-y-6">
          {reports.map((r) => (
            <div key={r.id} className="player-card">
              <h3 className="pc-name text-lg">{r.reporting_period}</h3>

              {r.meetings?.meeting_date && (
                <p className="pc-meta">
                  Meeting:{' '}
                  {new Date(r.meetings.meeting_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </p>
              )}

              <table className="mt-3 w-full border text-sm overflow-x-auto">
                <tbody>
                  {r.treasury_report_items.map((i: any) => (
                    <tr key={i.label}>
                      <td className="border px-2 py-1 whitespace-nowrap">{i.label}</td>
                      <td className="border px-2 py-1 text-right whitespace-nowrap">
                        £{Number(i.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {r.notes && (
                <p className="mt-3 whitespace-pre-wrap text-zinc-700">
                  {r.notes}
                </p>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}