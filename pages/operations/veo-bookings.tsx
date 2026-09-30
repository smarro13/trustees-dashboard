import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';
import { type VeoBookingStatus, VEO_CAMERAS, VEO_PURPOSES, formatVeoTime } from '../../lib/veoBookings';

// All VEO camera bookings made on /public/veo-booking, with contact details.
// Admins, trustees and directors can record collection, return and
// cancellation (enforced by RLS in supabase/policies/veo_bookings.sql).

type Booking = {
  id: string;
  camera: string;
  booked_by: string;
  contact_phone: string;
  contact_email: string | null;
  team_name: string;
  purpose: string;
  fixture: string | null;
  time_out: string;
  time_in: string;
  accessories: string[];
  notes: string | null;
  status: VeoBookingStatus;
  collected_at: string | null;
  returned_at: string | null;
  return_notes: string | null;
  created_at: string;
};

type View = 'current' | 'past';

const EDIT_ROLES = new Set(['admin', 'trustee', 'director']);

const STATUS_STYLES: Record<VeoBookingStatus, { label: string; className: string }> = {
  booked: { label: 'Booked', className: 'bg-blue-100 text-blue-800' },
  out: { label: 'Out', className: 'bg-amber-100 text-amber-800' },
  returned: { label: 'Returned', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-100 text-zinc-600' },
};

const purposeLabel = (value: string) => VEO_PURPOSES.find((p) => p.value === value)?.label ?? value;

export default function VeoBookingsAdminPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [view, setView] = useState<View>('current');
  const [cameraFilter, setCameraFilter] = useState<string>('all');

  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnNotes, setReturnNotes] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const loadBookings = async () => {
    const { data, error } = await supabase
      .from('veo_bookings')
      .select('*')
      .order('time_out', { ascending: true })
      .limit(500);
    if (error) setNotice({ type: 'error', message: `Failed to load bookings: ${error.message}` });
    else setBookings(data as Booking[]);
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const role = resolveRoleFromUser(data.user);
      setCanEdit(!!role && EDIT_ROLES.has(role));
      await loadBookings();
    };
    void init();
  }, []);

  // Saves the change and emails the club (pages/api/private/veo-booking-status.ts).
  const update = async (
    booking: Booking,
    action: 'collected' | 'returned' | 'cancelled',
    message: string,
    returnNotes?: string,
  ) => {
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const response = await fetch('/api/private/veo-booking-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ id: booking.id, action, returnNotes }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setNotice({ type: 'error', message: `Failed to update booking: ${body.error ?? 'unknown error'}` });
        return false;
      }
      setNotice({
        type: 'success',
        message: body.emailed ? `${message} Club emailed.` : `${message} (The club email could not be sent.)`,
      });
      await loadBookings();
      return true;
    } catch {
      setNotice({ type: 'error', message: 'Failed to update booking: could not reach the server.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();
  const isPast = (b: Booking) => b.status === 'returned' || b.status === 'cancelled';
  const isOverdue = (b: Booking) => b.status === 'out' && new Date(b.time_in).getTime() < now;
  const outNow = bookings.filter((b) => b.status === 'out');

  const shown = bookings
    .filter((b) => (view === 'past' ? isPast(b) : !isPast(b)))
    .filter((b) => cameraFilter === 'all' || b.camera === cameraFilter);
  if (view === 'past') shown.reverse();

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">🎥 VEO Bookings</h1>
          <p className="mt-1 text-zinc-600">
            Camera bookings made on the{' '}
            <Link href="/public/veo-booking" className="font-medium text-blue-600 hover:underline">public booking page</Link>.
          </p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          {VEO_CAMERAS.map((camera) => {
            const out = outNow.find((b) => b.camera === camera);
            const next = bookings.find((b) => b.camera === camera && b.status === 'booked' && new Date(b.time_in).getTime() >= now);
            return (
              <div key={camera} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{camera}</p>
                {out ? (
                  <>
                    <p className={`mt-1 text-lg font-bold ${isOverdue(out) ? 'text-rose-700' : 'text-amber-700'}`}>
                      {isOverdue(out) ? 'Overdue' : 'Out'} with {out.team_name}
                    </p>
                    <p className="text-sm text-zinc-600">Due back {formatVeoTime(out.time_in)} · {out.booked_by}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-bold text-emerald-700">At the club</p>
                    <p className="text-sm text-zinc-600">
                      {next ? `Next: ${next.team_name}, ${formatVeoTime(next.time_out)}` : 'No upcoming bookings'}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </section>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['current', 'past'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                view === v ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {v === 'current' ? 'Upcoming & out' : 'Past & cancelled'}
            </button>
          ))}
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value)}
            className="ml-auto rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            aria-label="Filter by camera"
          >
            <option value="all">Both cameras</option>
            {VEO_CAMERAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            {view === 'current' ? 'No upcoming bookings.' : 'No past bookings yet.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((b) => {
              const status = STATUS_STYLES[b.status];
              const overdue = isOverdue(b);
              return (
                <li key={b.id} className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ${overdue ? 'ring-rose-300' : 'ring-zinc-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-zinc-900">
                        {b.camera} · {b.team_name}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${overdue ? 'bg-rose-100 text-rose-800' : status.className}`}>
                          {overdue ? 'Overdue' : status.label}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-700">
                        {formatVeoTime(b.time_out)} → {formatVeoTime(b.time_in)}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {purposeLabel(b.purpose)}{b.fixture ? ` · ${b.fixture}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium text-zinc-900">{b.booked_by}</p>
                      <a href={`tel:${b.contact_phone.replace(/\s+/g, '')}`} className="block text-blue-600 hover:underline">{b.contact_phone}</a>
                      {b.contact_email && (
                        <a href={`mailto:${b.contact_email}`} className="block text-blue-600 hover:underline">{b.contact_email}</a>
                      )}
                    </div>
                  </div>

                  {(b.accessories.length > 0 || b.notes || b.return_notes || b.collected_at || b.returned_at) && (
                    <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
                      {b.accessories.length > 0 && <p>Taking: {b.accessories.join(', ')}</p>}
                      {b.notes && <p>Notes: {b.notes}</p>}
                      {b.collected_at && <p>Collected {formatVeoTime(b.collected_at)}</p>}
                      {b.returned_at && <p>Returned {formatVeoTime(b.returned_at)}</p>}
                      {b.return_notes && <p>Return notes: {b.return_notes}</p>}
                    </div>
                  )}

                  {canEdit && !isPast(b) && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                      {b.status === 'booked' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => update(b, 'collected', `${b.camera} marked as collected.`)}
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Mark collected
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { setReturningId(b.id); setReturnNotes(''); }}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Mark returned
                      </button>
                      {b.status === 'booked' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setCancelTarget(b)}
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Cancel booking
                        </button>
                      )}
                    </div>
                  )}

                  {returningId === b.id && (
                    <form
                      className="mt-3 flex flex-col gap-2 sm:flex-row"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await update(b, 'returned', `${b.camera} marked as returned.`, returnNotes);
                        if (ok) setReturningId(null);
                      }}
                    >
                      <input
                        autoFocus
                        placeholder="Condition / battery / anything missing (optional)"
                        value={returnNotes}
                        onChange={(e) => setReturnNotes(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                          Confirm return
                        </button>
                        <button type="button" onClick={() => setReturningId(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel this booking?"
        description={cancelTarget ? `${cancelTarget.camera} for ${cancelTarget.team_name}, ${formatVeoTime(cancelTarget.time_out)}. The camera becomes free for that time.` : ''}
        confirmLabel="Cancel booking"
        onConfirm={async () => {
          if (!cancelTarget) return;
          const ok = await update(cancelTarget, 'cancelled', 'Booking cancelled.');
          if (ok) setCancelTarget(null);
        }}
        onCancel={() => setCancelTarget(null)}
        loading={busy}
      />
    </main>
  );
}
