import Link from 'next/link';
import { useEffect, useState } from 'react';
import PublicSectionNav from '../../components/PublicSectionNav';
import { supabase } from '../../lib/supabaseClient';

type SavedAGMQuestion = {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
};

const AGM_PUBLIC_SOURCE = '🏛️ AGM Questions [Public]';

const parseDescriptionValue = (description: string | null | undefined, key: 'Category' | 'Update' | 'Status') => {
  const line = (description || '')
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${key}:`));

  if (!line) {
    return '';
  }

  return line.replace(`${key}:`, '').trim();
};

export default function PublicAGMQuestionsPage() {
  const [questions, setQuestions] = useState<SavedAGMQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadQuestions = async () => {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from('action_items')
        .select('id, title, description, status, created_at')
        .eq('source', AGM_PUBLIC_SOURCE)
        .order('created_at', { ascending: false });

      if (loadError) {
        setError(loadError.message);
        setQuestions([]);
        setLoading(false);
        return;
      }

      setQuestions(data || []);
      setLoading(false);
    };

    loadQuestions();
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Aldwinians AGM</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">AGM Questions</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
            These are saved AGM questions and updates shared publicly by the trustees team.
          </p>

          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link
              href="/public"
              className="inline-flex items-center rounded-full border border-zinc-300 px-4 py-2 font-medium text-zinc-700 transition hover:border-red-300 hover:text-red-800"
            >
              Back to public home
            </Link>
            <Link
              href="/public/agm-minutes"
              className="inline-flex items-center rounded-full bg-red-700 px-4 py-2 font-medium text-white transition hover:bg-red-800"
            >
              Browse AGM minutes
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            Loading AGM questions...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            Unable to load AGM questions: {error}
          </section>
        ) : questions.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            No AGM questions have been shared yet.
          </section>
        ) : (
          <div className="grid gap-4">
            {questions.map((question) => {
              const category = parseDescriptionValue(question.description, 'Category');
              const update = parseDescriptionValue(question.description, 'Update');
              const status =
                parseDescriptionValue(question.description, 'Status') ||
                (question.status === 'Completed' ? 'Dealt with' : question.status || 'Pending');

              return (
                <article
                  key={question.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-zinc-900">{question.title}</h2>
                      {category && (
                        <p className="mt-2 text-sm text-zinc-600">
                          <span className="font-medium text-zinc-900">Category:</span> {category}
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                      {status}
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Update</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                      {update || 'No update has been added yet.'}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
