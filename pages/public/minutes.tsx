import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

const AGM_MINUTES_PREFIX = 'AGM - ';

export default function PublicMinutesPage() {
  const [minutes, setMinutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const { data } = await supabase
        .from('minutes')
        .select(`
          *,
          meetings ( meeting_date )
        `)
        .not('title', 'ilike', `${AGM_MINUTES_PREFIX}%`)
        .order('created_at', { ascending: false });

      setMinutes(data ?? []);
      setLoading(false);
    };

    loadData();
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-zinc-900">Previous Minutes</h1>
          <p className="mt-1 text-zinc-600">Read-only page for sharing approved club minutes.</p>
          <div className="mt-3">
            <Link href="/public/agm-minutes" className="text-sm font-medium text-blue-600 hover:underline">
              View AGM minutes →
            </Link>
          </div>
        </header>

        <section className="space-y-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading minutes…</p>
          ) : minutes.length === 0 ? (
            <p className="text-zinc-500">No minutes uploaded yet.</p>
          ) : (
            minutes.map((minute) => (
              <div key={minute.id} className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900">{minute.title}</h2>

                {minute.meetings?.meeting_date && (
                  <p className="mt-1 text-sm text-zinc-600">
                    Meeting:{' '}
                    {new Date(minute.meetings.meeting_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </p>
                )}

                <a
                  href={minute.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-blue-600 hover:underline"
                >
                  Open minutes
                </a>

                <p className="mt-2 text-xs text-zinc-400">
                  Uploaded {new Date(minute.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}