import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PublicSectionNav from '../../components/PublicSectionNav';
import {
  type PublicVeoCheckout,
  VEO_ACCESSORIES,
  VEO_CAMERAS,
  VEO_PURPOSES,
  VEO_TEAMS,
  formatVeoTime,
  nowForDateTimeInput,
  veoCameraLabel,
  veoDurationSince,
} from '../../lib/veoBookings';

// Public VEO camera sign-out / sign-in. Taking a camera out records the time
// out; coming back to "Return a camera" records the time in.

type Mode = 'out' | 'return';

const OTHER_TEAM = '__other__';

const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none';
const labelClass = 'block text-sm font-medium text-zinc-800';

const emptyOutForm = () => ({
  name: '',
  email: '',
  team: '',
  otherTeam: '',
  camera: '',
  purpose: 'match',
  fixture: '',
  timeOut: nowForDateTimeInput(),
  accessories: [...VEO_ACCESSORIES] as string[],
  notes: '',
  agreed: false,
  website: '',
});

const emptyReturnForm = () => ({
  id: '',
  name: '',
  timeIn: nowForDateTimeInput(),
  returnNotes: '',
  charged: false,
  website: '',
});

// datetime-local values are local (UK) time; send them as exact instants.
const toIso = (value: string) => (value ? new Date(value).toISOString() : '');

export default function VeoBookingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('out');
  const [out, setOut] = useState<PublicVeoCheckout[]>([]);
  const [outForm, setOutForm] = useState(emptyOutForm);
  const [returnForm, setReturnForm] = useState(emptyReturnForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (router.query.mode === 'return') setMode('return');
  }, [router.query.mode]);

  const loadOut = async () => {
    try {
      const response = await fetch('/api/public/veo-bookings');
      const payload = await response.json();
      if (response.ok && payload.ok) setOut(payload.out);
    } catch {
      // The forms still work without the status list.
    }
  };

  useEffect(() => { void loadOut(); }, []);

  // Pre-select the only camera that's out when returning.
  useEffect(() => {
    if (mode === 'return' && out.length === 1 && !returnForm.id) {
      setReturnForm((f) => ({ ...f, id: out[0].id }));
    }
  }, [mode, out, returnForm.id]);

  const outByCamera = new Map(out.map((o) => [o.camera, o]));

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setConfirmation(null);
    setOutForm(emptyOutForm());
    setReturnForm(emptyReturnForm());
  };

  const post = async (url: string, body: unknown) => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setError(payload.error || 'That could not be saved. Please try again.');
        return false;
      }
      return true;
    } catch {
      setError('Could not reach the server. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const submitOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const team = outForm.team === OTHER_TEAM ? outForm.otherTeam.trim() : outForm.team;
    if (!outForm.camera) { setError('Choose VEO 1 or VEO 2.'); return; }
    if (!team) { setError('Choose a team.'); return; }
    if (!outForm.agreed) { setError('Please confirm you’ll look after the camera and sign it back in.'); return; }

    const ok = await post('/api/public/veo-booking', { ...outForm, team, timeOut: toIso(outForm.timeOut) });
    if (!ok) return;
    setConfirmation(
      `${veoCameraLabel(outForm.camera)} is signed out to ${team} from ${formatVeoTime(toIso(outForm.timeOut))}. When you bring it back, come back to this page and choose “Return a camera”.`,
    );
    setOutForm(emptyOutForm());
    await loadOut();
  };

  const submitReturn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!returnForm.id) { setError('Choose the camera you’re returning.'); return; }
    if (!returnForm.charged) { setError('Please confirm the camera is back in its case and on charge.'); return; }

    const camera = out.find((o) => o.id === returnForm.id)?.camera ?? 'The camera';
    const ok = await post('/api/public/veo-return', { ...returnForm, timeIn: toIso(returnForm.timeIn) });
    if (!ok) return;
    setConfirmation(`${veoCameraLabel(camera)} is signed back in at ${formatVeoTime(toIso(returnForm.timeIn))}. Thank you!`);
    setReturnForm(emptyReturnForm());
    await loadOut();
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">VEO Camera</h1>
              <p className="mt-2 text-sm text-zinc-600">
                Sign a VEO camera out when you take it, and back in when you return it.
              </p>
            </div>
            <Link href="/public" className="shrink-0 text-sm font-medium text-red-700 hover:underline">
              Back to members page
            </Link>
          </div>

          {/* Camera status */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {VEO_CAMERAS.map((camera) => {
              const current = outByCamera.get(camera);
              return (
                <div key={camera} className={`rounded-xl border p-4 ${current ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <p className="text-sm font-semibold text-zinc-900">{veoCameraLabel(camera)}</p>
                  {current ? (
                    <p className="mt-1 text-sm text-amber-900">
                      Out with {current.team_name} ({current.booked_by}) since {formatVeoTime(current.time_out)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-emerald-800">Available at the club</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mode tabs */}
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1" role="tablist">
            {([['out', 'Take a camera out'], ['return', 'Return a camera']] as [Mode, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => switchMode(value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === value ? 'bg-white text-red-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {confirmation && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
              <p className="text-sm font-semibold text-emerald-900">Done</p>
              <p className="mt-1 text-sm text-emerald-800">{confirmation}</p>
            </div>
          )}

          {!confirmation && mode === 'out' && (
            <form onSubmit={submitOut} className="mt-6 space-y-5">
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={outForm.website}
                onChange={(e) => setOutForm({ ...outForm, website: e.target.value })}
                className="hidden"
                aria-hidden
              />

              <fieldset>
                <legend className={labelClass}>Camera</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {VEO_CAMERAS.map((c) => {
                    const taken = outByCamera.has(c);
                    return (
                      <label
                        key={c}
                        className={`flex items-center justify-center rounded-lg border px-3 py-3 text-sm font-semibold ${
                          taken
                            ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400'
                            : outForm.camera === c
                              ? 'cursor-pointer border-red-700 bg-red-50 text-red-800'
                              : 'cursor-pointer border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="camera"
                          value={c}
                          disabled={taken}
                          checked={outForm.camera === c}
                          onChange={() => setOutForm({ ...outForm, camera: c })}
                          className="sr-only"
                        />
                        {veoCameraLabel(c)}{taken ? ' (out)' : ''}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Your name
                  <input className={inputClass} value={outForm.name} onChange={(e) => setOutForm({ ...outForm, name: e.target.value })} required autoComplete="name" />
                </label>
                <label className={labelClass}>
                  Team
                  <select className={inputClass} value={outForm.team} onChange={(e) => setOutForm({ ...outForm, team: e.target.value })} required>
                    <option value="">Choose a team…</option>
                    {VEO_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                    <option value={OTHER_TEAM}>Other…</option>
                  </select>
                </label>
                {outForm.team === OTHER_TEAM && (
                  <label className={`${labelClass} sm:col-span-2`}>
                    Team or group name
                    <input className={inputClass} value={outForm.otherTeam} onChange={(e) => setOutForm({ ...outForm, otherTeam: e.target.value })} required />
                  </label>
                )}
                <label className={labelClass}>
                  Time out
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={outForm.timeOut}
                    onChange={(e) => setOutForm({ ...outForm, timeOut: e.target.value })}
                    required
                  />
                </label>
                <label className={labelClass}>
                  Email <span className="font-normal text-zinc-500">(optional, for a copy)</span>
                  <input className={inputClass} type="email" value={outForm.email} onChange={(e) => setOutForm({ ...outForm, email: e.target.value })} autoComplete="email" />
                </label>
                <label className={labelClass}>
                  What&apos;s it for?
                  <select className={inputClass} value={outForm.purpose} onChange={(e) => setOutForm({ ...outForm, purpose: e.target.value })}>
                    {VEO_PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className={labelClass}>
                  {outForm.purpose === 'match' ? 'Fixture' : 'Session details'} <span className="font-normal text-zinc-500">(optional)</span>
                  <input
                    className={inputClass}
                    placeholder={outForm.purpose === 'match' ? 'e.g. Home v Broughton Park' : 'e.g. Tuesday training'}
                    value={outForm.fixture}
                    onChange={(e) => setOutForm({ ...outForm, fixture: e.target.value })}
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
                        checked={outForm.accessories.includes(a)}
                        onChange={(e) =>
                          setOutForm({
                            ...outForm,
                            accessories: e.target.checked ? [...outForm.accessories, a] : outForm.accessories.filter((x) => x !== a),
                          })
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
                  rows={2}
                  placeholder="e.g. any existing damage, or who is bringing it back"
                  value={outForm.notes}
                  onChange={(e) => setOutForm({ ...outForm, notes: e.target.value })}
                />
              </label>

              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={outForm.agreed}
                  onChange={(e) => setOutForm({ ...outForm, agreed: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-700"
                />
                I&apos;ll look after the camera, report any damage, and sign it back in on this page when it&apos;s returned.
              </label>

              {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>}

              <button
                type="submit"
                disabled={submitting || out.length === VEO_CAMERAS.length}
                className="w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 sm:w-auto"
              >
                {submitting ? 'Saving…' : 'Sign camera out'}
              </button>
              {out.length === VEO_CAMERAS.length && (
                <p className="text-sm text-zinc-500">Both cameras are out at the moment.</p>
              )}
            </form>
          )}

          {!confirmation && mode === 'return' && (
            out.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
                Both cameras are already signed in.
              </p>
            ) : (
              <form onSubmit={submitReturn} className="mt-6 space-y-5">
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={returnForm.website}
                  onChange={(e) => setReturnForm({ ...returnForm, website: e.target.value })}
                  className="hidden"
                  aria-hidden
                />

                <fieldset>
                  <legend className={labelClass}>Which camera are you returning?</legend>
                  <div className="mt-2 space-y-2">
                    {out.map((o) => (
                      <label
                        key={o.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
                          returnForm.id === o.id ? 'border-red-700 bg-red-50' : 'border-zinc-300 hover:bg-zinc-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="return-camera"
                          checked={returnForm.id === o.id}
                          onChange={() => setReturnForm({ ...returnForm, id: o.id })}
                          className="mt-1"
                        />
                        <span className="text-sm">
                          <span className="font-semibold text-zinc-900">{veoCameraLabel(o.camera)}</span>
                          <span className="text-zinc-700"> — {o.team_name}, {o.booked_by}</span>
                          <span className="block text-zinc-500">
                            Out since {formatVeoTime(o.time_out)} ({veoDurationSince(o.time_out)}){o.fixture ? ` · ${o.fixture}` : ''}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    Time in
                    <input
                      className={inputClass}
                      type="datetime-local"
                      value={returnForm.timeIn}
                      onChange={(e) => setReturnForm({ ...returnForm, timeIn: e.target.value })}
                      required
                    />
                  </label>
                  <label className={labelClass}>
                    Your name <span className="font-normal text-zinc-500">(if not who took it)</span>
                    <input className={inputClass} value={returnForm.name} onChange={(e) => setReturnForm({ ...returnForm, name: e.target.value })} autoComplete="name" />
                  </label>
                </div>

                <label className={labelClass}>
                  Condition / anything to report <span className="font-normal text-zinc-500">(optional)</span>
                  <textarea
                    className={inputClass}
                    rows={2}
                    placeholder="e.g. all fine, tripod leg sticking, battery low"
                    value={returnForm.returnNotes}
                    onChange={(e) => setReturnForm({ ...returnForm, returnNotes: e.target.value })}
                  />
                </label>

                <label className="flex items-start gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={returnForm.charged}
                    onChange={(e) => setReturnForm({ ...returnForm, charged: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-700"
                  />
                  The camera and kit are back in the case and on charge.
                </label>

                {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 sm:w-auto"
                >
                  {submitting ? 'Saving…' : 'Sign camera back in'}
                </button>
              </form>
            )
          )}
        </section>
      </div>
    </main>
  );
}
