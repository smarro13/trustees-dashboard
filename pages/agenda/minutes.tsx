import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function MinutesPage() {
  const [minutes, setMinutes] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const { data: minutesData } = await supabase
      .from('minutes')
      .select(`
        *,
        meetings ( meeting_date )
      `)
      .order('created_at', { ascending: false });

    if (minutesData) setMinutes(minutesData);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true }); // month order (Jan → Dec)

    if (meetingsData) setMeetings(meetingsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const uploadMinutes = async () => {
    if (!file || !title.trim()) return;

    setLoading(true);

    const filePath = `${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('minutes')
      .upload(filePath, file);

    if (uploadError) {
      setLoading(false);
      return;
    }

    const { data } = supabase.storage
      .from('minutes')
      .getPublicUrl(filePath);

    await supabase.from('minutes').insert({
      title,
      file_url: data.publicUrl,
      meeting_id: meetingId
    });

    setTitle('');
    setMeetingId(null);
    setFile(null);
    setLoading(false);
    loadData();
  };

  return (
    <main className="min-h-screen">
      {/* expand width similar to treasury page */}
      <div className="mx-auto w-full max-w-6xl sm:max-w-7xl lg:max-w-[1200px] px-2 sm:px-4 lg:px-6 py-6 sm:py-8 lg:py-10">
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Previous Minutes
          </h1>
          <p className="mt-1 text-zinc-600">
            Upload and review approved board minutes
          </p>
        </header>

        {/* Upload – full-width, lightly styled section instead of player-card */}
        <section className="mb-10 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            {/* keep pc-name so it inherits your red styling from globals */}
            <h2 className="pc-name text-xl font-semibold">
              Upload minutes
            </h2>
          </div>

          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-4">
            <input
              type="text"
              placeholder="e.g. Aldwinians Management Meeting - 25th December 2025"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            />

            <select
              value={meetingId ?? ''}
              onChange={(e) => setMeetingId(e.target.value || null)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            >
              <option value="">Link to meeting (optional)</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {new Date(m.meeting_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </option>
              ))}
            </select>

            <div>
              <label
                htmlFor="file-upload"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 cursor-pointer transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {file ? file.name : 'Choose file'}
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {file && (
                <span className="ml-3 text-sm text-zinc-600">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={uploadMinutes}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Uploading…' : 'Upload minutes'}
              </button>
            </div>
          </div>
        </section>

        {/* List – keep existing player-card styling for items */}
        <section className="space-y-4">
          {minutes.length === 0 ? (
            <p className="text-zinc-500">No minutes uploaded yet.</p>
          ) : (
            minutes.map((m) => (
              <div key={m.id} className="player-card">
                <h3 className="pc-name text-lg">{m.title}</h3>

                {m.meetings?.meeting_date && (
                  <p className="pc-meta">
                    Meeting:{' '}
                    {new Date(m.meetings.meeting_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </p>
                )}

                <a
                  href={m.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-blue-600 hover:underline"
                >
                  Open minutes
                </a>

                <p className="mt-1 text-xs text-zinc-400">
                  Uploaded {new Date(m.created_at).toLocaleString('en-GB', {
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
