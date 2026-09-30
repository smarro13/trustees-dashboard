import { useEffect, useState } from 'react';
import Link from 'next/link';
import PublicSectionNav from '../../components/PublicSectionNav';
import {
  type PublicVeoBooking,
  VEO_ACCESSORIES,
  VEO_CAMERAS,
  VEO_PURPOSES,
  VEO_TEAMS,
  formatVeoTime,
} from '../../lib/veoBookings';

const OTHER_TEAM = '__other__';

const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none';
const labelClass = 'block text-sm font-medium text-zinc-800';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  team: '',
  otherTeam: '',
  camera: 'VEO 1',
  purpose: 'match',
  fixture: '',
  timeOut: '',
  timeIn: '',
  accessories: [...VEO_ACCESSORIES] as string[],
  notes: '',
  agreed: false,
  website: '',
};

export default function VeoBookingPage() {
  const [form, setForm] = useState(emptyForm);
  const [bookings, setBookings] = useState<PublicVeoBooking[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const set = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadBookings = async () => {
    try {
      const response = await fetch('/api/public/veo-bookings');
      const payload = await response.json();
      if (response.ok && payload.ok) setBookings(payload.bookings);
    } catch {
      // The form still works without the list.
    }
  };

  useEffect(() => { void loadBookings(); }, []);

  // Warn before submitting if the chosen camera is already taken then.
  const clash = (() => {
    if (!form.timeOut || !form.timeIn) return null;
    const out = new Date(form.timeOut).getTime();
    const back = new Date(form.timeIn).getTime();
    return bookings.find(
      (b) => b.camera === form.camera && new Date(b.time_out).getTime() < back && new Date(b.time_in).getTime() > out,
    ) ?? null;
  })();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const team = form.team === OTHER_TEAM ? form.otherTeam.trim() : form.team;
    if (!team) { setError('Choose a team.'); return; }
    if (!form.agreed) { setError('Please confirm you’ll return the camera charged and in its case.'); return; }

    setSubmitting(true);
    try {
      const response = await fetch('/api/public/veo-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          team,
          // datetime-local values are local (UK) time; send them as exact instants.
          timeOut: form.timeOut ? new Date(form.timeOut).toISOString() : '',
          timeIn: form.timeIn ? new Date(form.timeIn).toISOString() : '',
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setError(payload.error || 'The booking could not be saved. Please try again.');
        return;
      }
      setConfirmation(
        `${form.camera} is booked for ${team} from ${formatVeoTime(new Date(form.timeOut).toISOString())} to ${formatVeoTime(new Date(form.timeIn).toISOString())}.`,
      );
      setForm(emptyForm);
      await loadBookings();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">VEO Camera Booking</h1>
              <p className="mt-2 text-sm text-zinc-600">
                Book one of the club&apos;s VEO cameras to record a match or training session.
              </p>
            </div>
            <Link href="/public" className="shrink-0 text-sm font-medium text-red-700 hover:underline">
              Back to members page
            </Link>
          </div>

          {confirmation && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
              <p className="text-sm font-semibold text-emerald-900">Booking confirmed</p>
              <p className="mt-1 text-sm text-emerald-800">{confirmation}</p>
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="mt-2 text-sm font-medium text-emerald-800 underline"
              >
                Make another booking
              </button>
            </div>
          )}

          {!confirmation && (
            <form onSubmit={submit} className="mt-6 space-y-5">
              {/* Honeypot — hidden from people, filled in by bots */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                className="hidden"
                aria-hidden
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Your name
                  <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} required autoComplete="name" />
                </label>
                <label className={labelClass}>
                  Mobile number
                  <input className={inputClass} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required autoComplete="tel" />
                </label>
                <label className={labelClass}>
                  Email <span className="font-normal text-zinc-500">(optional)</span>
                  <input className={inputClass} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
                </label>
                <label className={labelClass}>
                  Team
                  <select className={inputClass} value={form.team} onChange={(e) => set('team', e.target.value)} required>
                    <option value="">Choose a team…</option>
                    {VEO_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                    <option value={OTHER_TEAM}>Other…</option>
                  </select>
                </label>
                {form.team === OTHER_TEAM && (
                  <label className={`${labelClass} sm:col-span-2`}>
                    Team or group name
                    <input className={inputClass} value={form.otherTeam} onChange={(e) => set('otherTeam', e.target.value)} required />
                  </label>
                )}
              </div>

              <fieldset>
                <legend className={labelClass}>Camera</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {VEO_CAMERAS.map((c) => (
                    <label
                      key={c}
                      className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-3 text-sm font-semibold ${
                        form.camera === c ? 'border-red-700 bg-red-50 text-red-800' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <input type="radio" name="camera" value={c} checked={form.camera === c} onChange={() => set('camera', c)} className="sr-only" />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Time out (collecting)
                  <input className={inputClass} type="datetime-local" value={form.timeOut} onChange={(e) => set('timeOut', e.target.value)} required />
                </label>
                <label className={labelClass}>
                  Time back in (returning)
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={form.timeIn}
                    min={form.timeOut || undefined}
                    onChange={(e) => set('timeIn', e.target.value)}
                    required
                  />
                </label>
              </div>

              {clash && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {form.camera} is already booked by {clash.team_name} from {formatVeoTime(clash.time_out)} to {formatVeoTime(clash.time_in)}.
                  Try {form.camera === 'VEO 1' ? 'VEO 2' : 'VEO 1'} or a different time.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  What&apos;s it for?
                  <select className={inputClass} value={form.purpose} onChange={(e) => set('purpose', e.target.value)}>
                    {VEO_PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className={labelClass}>
                  {form.purpose === 'match' ? 'Fixture' : 'Session details'} <span className="font-normal text-zinc-500">(optional)</span>
                  <input
                    className={inputClass}
                    placeholder={form.purpose === 'match' ? 'e.g. Home v Broughton Park' : 'e.g. Tuesday training'}
                    value={form.fixture}
                    onChange={(e) => set('fixture', e.target.value)}
                  />
                </label>
              </div>

              <fieldset>
                <legend className={labelClass}>Taking with the camera</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  {VEO_ACCESSORIES.map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        checked={form.accessories.includes(a)}
                        onChange={(e) =>
                          set('accessories', e.target.checked ? [...form.accessories, a] : form.accessories.filter((x) => x !== a))
                        }
                        className="h-4 w-4 rounded border-zinc-300 text-red-700"
                      />
                      {a}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className={labelClass}>
                Notes <span className="font-normal text-zinc-500">(optional)</span>
                <textarea
                  className={inputClass}
                  rows={3}
                  placeholder="Anything the club should know, e.g. who is collecting it"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </label>

              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={form.agreed}
                  onChange={(e) => set('agreed', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-700"
                />
                I&apos;ll return the camera charged, in its case, by the time above, and report any damage.
              </label>

              {error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 sm:w-auto"
              >
                {submitting ? 'Booking…' : 'Book camera'}
              </button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Upcoming bookings</h2>
          <p className="mt-1 text-sm text-zinc-600">Check when each camera is free before booking.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {VEO_CAMERAS.map((camera) => {
              const list = bookings.filter((b) => b.camera === camera);
              return (
                <div key={camera} className="rounded-xl border border-zinc-200">
                  <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-900">{camera}</p>
                  {list.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-zinc-500">No upcoming bookings.</p>
                  ) : (
                    <ul className="divide-y divide-zinc-100">
                      {list.map((b) => (
                        <li key={b.id} className="px-4 py-3 text-sm">
                          <p className="font-medium text-zinc-900">
                            {b.team_name}
                            {b.status === 'out' && (
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Out now</span>
                            )}
                          </p>
                          <p className="text-zinc-600">{formatVeoTime(b.time_out)} → {formatVeoTime(b.time_in)}</p>
                          {b.fixture && <p className="text-xs text-zinc-500">{b.fixture}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
