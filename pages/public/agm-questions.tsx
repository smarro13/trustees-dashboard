import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import PublicSectionNav from '../../components/PublicSectionNav';
import { supabase } from '../../lib/supabaseClient';

type AGMQuestionRecord = {
  id: string;
  title: string;
  section: string;
  update_text: string | null;
  status: string;
};

export default function PublicAGMQuestionsPage() {
  const [questions, setQuestions] = useState<AGMQuestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    let agmQuestionsChannel: RealtimeChannel;

    const loadQuestions = async () => {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from('agm_questions')
        .select('id, title, section, update_text, status')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (loadError) {
        setError(loadError.message);
        setQuestions([]);
        setLoading(false);
        return;
      }

      setQuestions(data || []);
      setLastSyncedAt(new Date().toISOString());
      setLoading(false);
    };

    loadQuestions();

    agmQuestionsChannel = supabase
      .channel('public-agm-questions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agm_questions' }, () => loadQuestions())
      .subscribe();

    return () => {
      if (agmQuestionsChannel) supabase.removeChannel(agmQuestionsChannel);
    };
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
          {lastSyncedAt && (
            <p className="mt-2 text-xs text-zinc-500">Last synced: {new Date(lastSyncedAt).toLocaleString('en-GB')}</p>
          )}

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
              const isClosed = question.status === 'Closed/Actioned';

              return (
                <article
                  key={question.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-zinc-900">{question.title}</h2>
                      {question.section && (
                        <p className="mt-2 text-sm text-zinc-600">
                          <span className="font-medium text-zinc-900">Category:</span> {question.section}
                        </p>
                      )}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      isClosed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {question.status}
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Update</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                      {question.update_text || 'No update has been added yet.'}
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
