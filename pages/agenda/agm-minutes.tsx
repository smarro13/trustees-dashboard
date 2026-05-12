import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

const AGM_MINUTES_PREFIX = 'AGM - ';

export default function AGMMinutesPage() {
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
      .ilike('title', `${AGM_MINUTES_PREFIX}%`)
      .order('created_at', { ascending: false });

    if (minutesData) setMinutes(minutesData);

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true });

    if (meetingsData) setMeetings(meetingsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const buildTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      return AGM_MINUTES_PREFIX.trim();
    }

    return trimmed.startsWith(AGM_MINUTES_PREFIX)
      ? trimmed
      : `${AGM_MINUTES_PREFIX}${trimmed}`;
  };

  const uploadMinutes = async () => {
    if (!title.trim()) {
      alert('Please enter a title for the AGM minutes');
      return;
    }

    if (!file) {
      alert('Please select a file to upload');
      return;
    }

    setLoading(true);

    try {
      const filePath = `agm/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('minutes')
        .upload(filePath, file);

      if (uploadError) {
        alert('Failed to upload file: ' + uploadError.message);
        setLoading(false);
        return;
      }

      const { data } = supabase.storage
        .from('minutes')
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase.from('minutes').insert({
        title: buildTitle(),
        file_url: data.publicUrl,
        meeting_id: meetingId,
      });

      if (insertError) {
        alert('Failed to save AGM minutes: ' + insertError.message);
        setLoading(false);
        return;
      }

      setTitle('');
      setMeetingId(null);
      setFile(null);
      setLoading(false);
      loadData();
      alert('AGM minutes uploaded successfully.');
    } catch (error) {
      console.error('AGM minutes upload error:', error);
      alert('An error occurred while uploading AGM minutes');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8">
          <Link
            href="/agenda/agm"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to AGM
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">AGM Minutes</h1>
          <p className="mt-1 text-zinc-600">
            Upload and review AGM minutes. These are stored separately from regular minutes by using the AGM title prefix.
          </p>
        </header>

        <section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-zinc-900">Upload AGM minutes</h2>
          </div>

          <div className="space-y-4 px-6 py-6">
            <input
              type="text"
              placeholder="e.g. 2026 AGM Minutes"
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
              {meetings.map((meeting) => (
                <option key={meeting.id} value={meeting.id}>
                  {new Date(meeting.meeting_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </option>
              ))}
            </select>

            <div>
              <label
                htmlFor="agm-file-upload"
                className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700"
              >
                {file ? file.name : 'Choose file…'}
              </label>
              <input
                id="agm-file-upload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0] ?? null;
                  setFile(selectedFile);
                  if (selectedFile && !title.trim()) {
                    const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
                    setTitle(fileName);
                  }
                }}
                className="hidden"
              />
              {file && (
                <span className="ml-3 text-sm text-zinc-600">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-500">
              Saved titles are automatically prefixed as {AGM_MINUTES_PREFIX} to keep AGM minutes separate.
            </p>

            <div className="flex justify-end">
              <button
                onClick={uploadMinutes}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Uploading…' : 'Upload AGM minutes'}
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {minutes.length === 0 ? (
            <p className="text-zinc-500">No AGM minutes uploaded yet.</p>
          ) : (
            minutes.map((minute) => (
              <div key={minute.id} className="player-card">
                <h3 className="pc-name text-lg">{minute.title}</h3>

                {minute.meetings?.meeting_date && (
                  <p className="pc-meta">
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
                  className="mt-2 inline-block text-blue-600 hover:underline"
                >
                  Open AGM minutes
                </a>

                <p className="mt-1 text-xs text-zinc-400">
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