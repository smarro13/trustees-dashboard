import { useState } from 'react';
import Link from 'next/link';
import PublicSectionNav from '../../components/PublicSectionNav';

export default function PadelVoteTestPage() {
  const [name, setName] = useState('');
  const [vote, setVote] = useState<'yes' | 'no'>('yes');
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitVote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      setStatus('Please enter your name.');
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch('/api/public/padel-vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          vote,
          website: '',
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setStatus(payload.error || 'Unable to submit vote right now.');
        setSubmitting(false);
        return;
      }

      setStatus('Vote submitted. Thank you.');
      setName('');
      setVote('yes');
    } catch {
      setStatus('Unable to submit vote right now.');
    }

    setSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Internal Test</p>
              <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Padel Partnership Vote</h1>
              <p className="mt-2 text-sm text-zinc-600">Question: Should Aldwinians partner with Raw Padel?</p>
            </div>
            <Link href="/public" className="text-sm font-medium text-red-700 hover:underline">
              Back to members page
            </Link>
          </div>

          <form className="mt-6 space-y-4" onSubmit={submitVote}>
            <div>
              <label htmlFor="vote-name" className="mb-1 block text-sm font-medium text-zinc-700">
                Name
              </label>
              <input
                id="vote-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                placeholder="Your full name"
              />
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-zinc-700">Vote</legend>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="padel-vote"
                    value="yes"
                    checked={vote === 'yes'}
                    onChange={() => setVote('yes')}
                  />
                  Yes
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="padel-vote"
                    value="no"
                    checked={vote === 'no'}
                    onChange={() => setVote('no')}
                  />
                  No
                </label>
              </div>
            </fieldset>

            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" />

            {status && (
              <p className={`text-sm ${status.toLowerCase().includes('thank') ? 'text-emerald-700' : 'text-rose-700'}`}>
                {status}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
            >
              {submitting ? 'Submitting...' : 'Submit vote'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
