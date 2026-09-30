import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  type VeoBookingStatus,
  VEO_CAMERAS,
  VEO_PURPOSES,
  formatVeoTime,
  nowForDateTimeInput,
  veoDurationSince,
} from '../../lib/veoBookings';

// The VEO camera sign-out log from /public/veo-booking. Admins, trustees and
// directors can sign a camera back in (if the coach forgot) or cancel a
// mistaken sign-out — both via pages/api/private/veo-booking-status.ts, which
// also emails the club.

type Booking = {
  id: string;
  camera: string;
  booked_by: string;
  contact_email: string | null;
  team_name: string;
  purpose: string;
  fixture: string | null;
  time_out: string;
  time_in: string | null;
  accessories: string[];
  notes: string | null;
  status: VeoBookingStatus;
  returned_at: string | null;
  return_notes: string | null;
  updated_by: string | null;
};

const EDIT_ROLES = new Set(['admin', 'trustee', 'director']);
const LONG_OUT_HOURS = 48;

const STATUS_STYLES: Record<VeoBookingStatus, { label: string; className: string }> = {
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
  const [cameraFilter, setCameraFilter] = useState<string>('all');

  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnTime, setReturnTime] = useState('');
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
      .order('time_out', { ascending: false })
      .limit(300);
    if (error) setNotice({ type: 'error', message: `Failed to load the log: ${error.message}` });
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

  // Saves the change and emails the club.
  const update = async (booking: Booking, action: 'returned' | 'cancelled', message: string, extra?: Record<string, string>) => {
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const response = await fetch('/api/private/veo-booking-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ id: booking.id, action, ...extra }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setNotice({ type: 'error', message: `Failed to update: ${body.error ?? 'unknown error'}` });
        return false;
      }
      setNotice({
        type: 'success',
        message: body.emailed ? `${message} Club emailed.` : `${message} (The club email could not be sent.)`,
      });
      await loadBookings();
      return true;
    } catch {
      setNotice({ type: 'error', message: 'Failed to update: could not reach the server.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const hoursOut = (b: Booking) => (Date.now() - new Date(b.time_out).getTime()) / 3_600_000;
  const outNow = bookings.filter((b) => b.status === 'out');
  const shown = bookings.filter((b) => cameraFilter === 'all' || b.camera === cameraFilter);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">🎥 VEO Cameras</h1>
          <p className="mt-1 text-zinc-600">
            Sign-out log from the{' '}
            <Link href="/public/veo-booking" className="font-medium text-blue-600 hover:underline">public VEO page</Link>.
          </p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          {VEO_CAMERAS.map((camera) => {
            const current = outNow.find((b) => b.camera === camera);
            const long = current && hoursOut(current) > LONG_OUT_HOURS;
            return (
              <div key={camera} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{camera}</p>
                {current ? (
                  <>
                    <p className={`mt-1 text-lg font-bold ${long ? 'text-rose-700' : 'text-amber-700'}`}>
                      Out with {current.team_name}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {current.booked_by} · since {formatVeoTime(current.time_out)} ({veoDurationSince(current.time_out)})
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-lg font-bold text-emerald-700">At the club</p>
                )}
              </div>
            );
          })}
        </section>

        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">Log</h2>
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
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
            No sign-outs yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((b) => {
              const status = STATUS_STYLES[b.status] ?? STATUS_STYLES.cancelled;
              const long = b.status === 'out' && hoursOut(b) > LONG_OUT_HOURS;
              return (
                <li key={b.id} className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ${long ? 'ring-rose-300' : 'ring-zinc-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-zinc-900">
                        {b.camera} · {b.team_name}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${long ? 'bg-rose-100 text-rose-800' : status.className}`}>
                          {long ? `Out ${veoDurationSince(b.time_out)}` : status.label}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-700">
                        Out {formatVeoTime(b.time_out)}
                        {b.time_in ? ` → in ${formatVeoTime(b.time_in)} (${veoDurationSince(b.time_out, new Date(b.time_in).getTime())})` : ''}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {purposeLabel(b.purpose)}{b.fixture ? ` · ${b.fixture}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium text-zinc-900">{b.booked_by}</p>
                      {b.contact_email && (
                        <a href={`mailto:${b.contact_email}`} className="block text-blue-600 hover:underline">{b.contact_email}</a>
                      )}
                    </div>
                  </div>

                  {(b.accessories.length > 0 || b.notes || b.return_notes) && (
                    <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
                      {b.accessories.length > 0 && <p>Taken: {b.accessories.join(', ')}</p>}
                      {b.notes && <p>Notes: {b.notes}</p>}
                      {b.return_notes && <p>Return notes: {b.return_notes}</p>}
                    </div>
                  )}

                  {canEdit && b.status === 'out' && returningId !== b.id && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { setReturningId(b.id); setReturnTime(nowForDateTimeInput()); setReturnNotes(''); }}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Sign back in
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setCancelTarget(b)}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                      >
                        Cancel (entered by mistake)
                      </button>
                    </div>
                  )}

                  {returningId === b.id && (
                    <form
                      className="mt-3 grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-[auto_1fr_auto]"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await update(b, 'returned', `${b.camera} signed back in.`, {
                          timeIn: new Date(returnTime).toISOString(),
                          returnNotes,
                        });
                        if (ok) setReturningId(null);
                      }}
                    >
                      <input
                        type="datetime-local"
                        aria-label="Time in"
                        value={returnTime}
                        onChange={(e) => setReturnTime(e.target.value)}
                        required
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                      />
                      <input
                        placeholder="Condition / anything missing (optional)"
                        value={returnNotes}
                        onChange={(e) => setReturnNotes(e.target.value)}
                        className="min-w-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                          Save
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
        title="Cancel this sign-out?"
        description={cancelTarget ? `${cancelTarget.camera} for ${cancelTarget.team_name}, ${formatVeoTime(cancelTarget.time_out)}. Use this only if it was entered by mistake — the camera shows as available again.` : ''}
        confirmLabel="Cancel sign-out"
        onConfirm={async () => {
          if (!cancelTarget) return;
          const ok = await update(cancelTarget, 'cancelled', 'Sign-out cancelled.');
          if (ok) setCancelTarget(null);
        }}
        onCancel={() => setCancelTarget(null)}
        loading={busy}
      />
    </main>
  );
}
