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
      <div className="mx-auto max-w-5xl px-6 py-10">
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

        {/* Upload */}
        <section className="player-card mb-10">
          <h2 className="pc-name mb-4">Upload minutes</h2>

          <div className="space-y-4">
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

            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full"
            />

            <button
              onClick={uploadMinutes}
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Uploading…' : 'Upload minutes'}
            </button>
          </div>
        </section>

        {/* List */}
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
