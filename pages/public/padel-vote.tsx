import { useEffect, useState } from 'react';
import Link from 'next/link';
import PublicSectionNav from '../../components/PublicSectionNav';

type PublicPadelUpdate = {
  id: string;
  reporting_period: string;
  padel_updates: string | null;
  supporting_evidence_url: string | null;
  created_at: string;
};

const parseSupportingEvidenceUrls = (value: string | null): string[] => {
  if (!value) return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
    } catch {
      // Fall back to plain text handling
    }
  }

  return trimmed
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export default function PadelVotePage() {
  const [name, setName] = useState('');
  const [vote, setVote] = useState<'yes' | 'no'>('yes');
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [supportingEvidenceUrls, setSupportingEvidenceUrls] = useState<string[]>([]);

  useEffect(() => {
    const loadSupportingEvidence = async () => {
      try {
        const response = await fetch('/api/public/padel-updates');
        const payload = await response.json();

        if (!response.ok || !payload.ok || !Array.isArray(payload.updates)) {
          setSupportingEvidenceUrls([]);
          return;
        }

        const updates = payload.updates as PublicPadelUpdate[];
        const latestWithPdfs = updates
          .map((item) => parseSupportingEvidenceUrls(item.supporting_evidence_url))
          .find((urls) => urls.length > 0);
        setSupportingEvidenceUrls(latestWithPdfs || []);
      } catch {
        setSupportingEvidenceUrls([]);
      }
    };

    loadSupportingEvidence();
  }, []);

  const submitVote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      setStatus('Please enter your member name.');
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
              <h1 className="text-2xl font-semibold text-zinc-900">Padel Partnership Vote</h1>
              <p className="mt-2 text-sm text-zinc-600">Question: Should Aldwinians partner with Raw Padel?</p>
            </div>
            <Link href="/public" className="text-sm font-medium text-red-700 hover:underline">
              Back to members page
            </Link>
          </div>

          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-medium text-zinc-900">Supporting Evidence</p>
            {supportingEvidenceUrls.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {supportingEvidenceUrls.map((url, index) => (
                  <li key={`${url}-${index}`}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-sm font-medium text-red-700 hover:underline"
                    >
                      Open supporting evidence PDF {supportingEvidenceUrls.length > 1 ? index + 1 : ''}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">Supporting evidence will be published here when available.</p>
            )}
          </div>

          <form className="mt-6 space-y-4" onSubmit={submitVote}>
            <div>
              <label htmlFor="vote-name" className="mb-1 block text-sm font-medium text-zinc-700">
                Member name
              </label>
              <input
                id="vote-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                placeholder="Member full name"
                required
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
