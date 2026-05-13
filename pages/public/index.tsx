import Link from 'next/link';
import { useEffect, useState } from 'react';
import PublicSectionNav from '../../components/PublicSectionNav';
import { supabase } from '../../lib/supabaseClient';

type PublicAction = {
  id: string;
  title: string;
  description?: string | null;
  owner?: string | null;
  due_date?: string | null;
  status?: string | null;
  source?: string | null;
  created_at?: string | null;
};

type Minute = {
  id: string;
  title: string;
  file_url: string;
  created_at: string;
  meetings?: { meeting_date?: string | null } | { meeting_date?: string | null }[] | null;
};

const AGM_MINUTES_PREFIX = 'AGM - ';
const PUBLIC_ACTION_MARKER = '[Public]';

const stripPublicMarker = (source: string | null | undefined) =>
  (source || '').replace(PUBLIC_ACTION_MARKER, '').trim();

const isPublicAction = (source: string | null | undefined) =>
  (source || '').includes(PUBLIC_ACTION_MARKER);

const formatDate = (value: string | null | undefined, fallback: string) => {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const getMeetingDate = (minute: Minute) => {
  if (Array.isArray(minute.meetings)) {
    return minute.meetings[0]?.meeting_date ?? null;
  }

  return minute.meetings?.meeting_date ?? null;
};

export default function PublicHomePage() {
  const [actions, setActions] = useState<PublicAction[]>([]);
  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [agmMinutes, setAgmMinutes] = useState<Minute[]>([]);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      const [actionsResult, minutesResult, agmMinutesResult] = await Promise.all([
        supabase
          .from('action_items')
          .select('id, title, description, owner, due_date, status, source, created_at')
          .neq('status', 'Completed')
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('minutes')
          .select(`
            id,
            title,
            file_url,
            created_at,
            meetings ( meeting_date )
          `)
          .not('title', 'ilike', `${AGM_MINUTES_PREFIX}%`)
          .order('created_at', { ascending: false }),
        supabase
          .from('minutes')
          .select(`
            id,
            title,
            file_url,
            created_at,
            meetings ( meeting_date )
          `)
          .ilike('title', `${AGM_MINUTES_PREFIX}%`)
          .order('created_at', { ascending: false }),
      ]);

      const loadError = actionsResult.error || minutesResult.error || agmMinutesResult.error;
      if (loadError) {
        setError(loadError.message);
        setActions([]);
        setMinutes([]);
        setAgmMinutes([]);
        setLoading(false);
        return;
      }

      setActions((actionsResult.data || []).filter((action) => isPublicAction(action.source)));
      setMinutes(minutesResult.data || []);
      setAgmMinutes(agmMinutesResult.data || []);
      setLoading(false);
    };

    loadData();
  }, []);

  const submitAction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formTitle.trim()) {
      setFormStatus('Please add a title for the action.');
      return;
    }

    setSubmitting(true);
    setFormStatus(null);

    try {
      const response = await fetch('/api/public/raise-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription,
          name: formName,
          email: formEmail,
          website: '',
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setFormStatus(payload.error || 'Unable to submit your action right now.');
        setSubmitting(false);
        return;
      }

      setFormTitle('');
      setFormDescription('');
      setFormName('');
      setFormEmail('');
      setFormStatus('Your action has been submitted for the club to review.');
    } catch (submitError) {
      setFormStatus('Unable to submit your action right now.');
    }

    setSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-red-900 via-red-800 to-red-700 px-6 py-8 text-white sm:px-8">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-red-100">Aldwinians</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Members Information Hub</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-red-50 sm:text-base">
              Shared updates from the club in one place, including live member actions, previous minutes, and AGM minutes.
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link
                href="/public/actions"
                className="inline-flex items-center rounded-full bg-white px-4 py-2 font-medium text-red-800 transition hover:bg-red-50"
              >
                View all member actions
              </Link>
              <Link
                href="/public/minutes"
                className="inline-flex items-center rounded-full border border-red-300/50 px-4 py-2 font-medium text-white transition hover:border-red-100 hover:bg-white/10"
              >
                Browse previous minutes
              </Link>
              <Link
                href="/public/agm-minutes"
                className="inline-flex items-center rounded-full border border-red-300/50 px-4 py-2 font-medium text-white transition hover:border-red-100 hover:bg-white/10"
              >
                Browse AGM minutes
              </Link>
            </div>
          </div>

          <div className="grid gap-4 border-t border-red-100 bg-red-50/60 px-6 py-5 sm:grid-cols-3 sm:px-8">
            <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Open member actions</p>
              <p className="mt-2 text-3xl font-semibold text-zinc-900">{actions.length}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Shared minutes</p>
              <p className="mt-2 text-3xl font-semibold text-zinc-900">{minutes.length}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Shared AGM minutes</p>
              <p className="mt-2 text-3xl font-semibold text-zinc-900">{agmMinutes.length}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            Loading members content...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            Unable to load members content: {error}
          </section>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.9fr]">
            <div className="grid gap-8">
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">Raise an Action</h2>
                    <p className="mt-1 text-sm text-zinc-600">Submit an item for the club to review and add to the action tracker.</p>
                  </div>
                </div>

                <form id="raise-action" className="mt-5 space-y-4 scroll-mt-24" onSubmit={submitAction}>
                  <div>
                    <label htmlFor="action-title" className="mb-1 block text-sm font-medium text-zinc-700">
                      Title
                    </label>
                    <input
                      id="action-title"
                      value={formTitle}
                      onChange={(event) => setFormTitle(event.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      placeholder="Brief summary of the action"
                    />
                  </div>

                  <div>
                    <label htmlFor="action-description" className="mb-1 block text-sm font-medium text-zinc-700">
                      Details
                    </label>
                    <textarea
                      id="action-description"
                      value={formDescription}
                      onChange={(event) => setFormDescription(event.target.value)}
                      rows={5}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      placeholder="Add any useful background or context"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="action-name" className="mb-1 block text-sm font-medium text-zinc-700">
                        Your name
                      </label>
                      <input
                        id="action-name"
                        value={formName}
                        onChange={(event) => setFormName(event.target.value)}
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                        placeholder="Optional"
                      />
                    </div>

                    <div>
                      <label htmlFor="action-email" className="mb-1 block text-sm font-medium text-zinc-700">
                        Email
                      </label>
                      <input
                        id="action-email"
                        type="email"
                        value={formEmail}
                        onChange={(event) => setFormEmail(event.target.value)}
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                  />

                  {formStatus && (
                    <p className={`text-sm ${formStatus.includes('submitted') ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formStatus}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                  >
                    {submitting ? 'Submitting...' : 'Submit action'}
                  </button>
                </form>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">Members Actions</h2>
                    <p className="mt-1 text-sm text-zinc-600">Current actions approved for wider member sharing.</p>
                  </div>
                  <Link href="/public/actions" className="text-sm font-medium text-red-700 hover:underline">
                    Full list
                  </Link>
                </div>

                <div className="mt-5 space-y-4">
                  {actions.length === 0 ? (
                    <p className="text-sm text-zinc-500">No member actions are available right now.</p>
                  ) : (
                    actions.slice(0, 6).map((action) => (
                      <article key={action.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-zinc-900">{action.title}</h3>
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                {action.status || 'Open'}
                              </span>
                            </div>
                            {action.description && (
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                                {action.description}
                              </p>
                            )}
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                            {stripPublicMarker(action.source) || 'Action tracker'}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                          <p>
                            <span className="font-medium text-zinc-900">Owner:</span> {action.owner || 'Not assigned'}
                          </p>
                          <p>
                            <span className="font-medium text-zinc-900">Due date:</span> {formatDate(action.due_date, 'No due date')}
                          </p>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="grid gap-8">
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">Previous Minutes</h2>
                    <p className="mt-1 text-sm text-zinc-600">Approved club minutes shared with members.</p>
                  </div>
                  <Link href="/public/minutes" className="text-sm font-medium text-red-700 hover:underline">
                    Full archive
                  </Link>
                </div>

                <div className="mt-5 space-y-4">
                  {minutes.length === 0 ? (
                    <p className="text-sm text-zinc-500">No minutes uploaded yet.</p>
                  ) : (
                    minutes.slice(0, 4).map((minute) => (
                      <article key={minute.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <h3 className="text-base font-semibold text-zinc-900">{minute.title}</h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          Meeting: {formatDate(getMeetingDate(minute), 'No meeting date')}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <a
                            href={minute.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-red-700 hover:underline"
                          >
                            Open minutes
                          </a>
                          <span className="text-zinc-500">
                            {formatDate(minute.created_at, minute.created_at)}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">AGM Minutes</h2>
                    <p className="mt-1 text-sm text-zinc-600">Annual general meeting records available for members.</p>
                  </div>
                  <Link href="/public/agm-minutes" className="text-sm font-medium text-red-700 hover:underline">
                    Full archive
                  </Link>
                </div>

                <div className="mt-5 space-y-4">
                  {agmMinutes.length === 0 ? (
                    <p className="text-sm text-zinc-500">No AGM minutes uploaded yet.</p>
                  ) : (
                    agmMinutes.slice(0, 4).map((minute) => (
                      <article key={minute.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <h3 className="text-base font-semibold text-zinc-900">{minute.title}</h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          Meeting: {formatDate(getMeetingDate(minute), 'No meeting date')}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <a
                            href={minute.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-red-700 hover:underline"
                          >
                            Open AGM minutes
                          </a>
                          <span className="text-zinc-500">
                            {formatDate(minute.created_at, minute.created_at)}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}