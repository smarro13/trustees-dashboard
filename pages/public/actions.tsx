import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type PublicAction = {
  id: string;
  title: string;
  description?: string | null;
  owner?: string | null;
  due_date?: string | null;
  status?: string | null;
  source?: string | null;
};

const PUBLIC_ACTION_MARKER = '[Public]';

const stripPublicMarker = (source: string | null | undefined) =>
  (source || '').replace(PUBLIC_ACTION_MARKER, '').trim();

const isPublicAction = (source: string | null | undefined) =>
  (source || '').includes(PUBLIC_ACTION_MARKER);

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'No due date';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export default function PublicActionsPage() {
  const [actions, setActions] = useState<PublicAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadActions = async () => {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from('action_items')
        .select('id, title, description, owner, due_date, status, source, created_at')
        .neq('status', 'Completed')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (loadError) {
        setError(loadError.message);
        setActions([]);
        setLoading(false);
        return;
      }

      setActions((data || []).filter((action) => isPublicAction(action.source)));
      setLoading(false);
    };

    loadActions();
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Aldwinians</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">Public Actions</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
            These are the live actions the admin team has approved for wider sharing.
          </p>

          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <a
              href="https://www.aldwinians.co.uk"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full bg-zinc-900 px-4 py-2 font-medium text-white transition hover:bg-zinc-700"
            >
              Raise an action on the club website
            </a>
            <Link
              href="/public/minutes"
              className="inline-flex items-center rounded-full border border-zinc-300 px-4 py-2 font-medium text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900"
            >
              View shared minutes
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            Loading public actions...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            Unable to load public actions: {error}
          </section>
        ) : actions.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            No public actions are available right now.
          </section>
        ) : (
          <div className="grid gap-4">
            {actions.map((action) => (
              <article
                key={action.id}
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-zinc-900">{action.title}</h2>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                        {action.status || 'Open'}
                      </span>
                    </div>
                    {action.description && (
                      <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                        {action.description}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                    {stripPublicMarker(action.source) || 'Action tracker'}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
                  <p>
                    <span className="font-medium text-zinc-900">Owner:</span>{' '}
                    {action.owner || 'Not assigned'}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-900">Due date:</span>{' '}
                    {formatDate(action.due_date)}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-900">Status:</span>{' '}
                    {action.status || 'Open'}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}