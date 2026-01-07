import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import MeetingAgendaView from '../../components/MeetingAgendaView';

export default function MeetingPage() {
  const router = useRouter();
  const meetingId = typeof router.query.id === 'string' ? router.query.id : null;

  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!meetingId) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single();

      if (error) console.error(error);
      setMeeting(data ?? null);
      setLoading(false);
    };

    load();
  }, [meetingId]);

  const dateLabel = meeting?.meeting_date
    ? new Date(meeting.meeting_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Meeting {dateLabel ? `— ${dateLabel}` : ''}
          </h1>

          <p className="mt-1 text-zinc-600">
            {meeting?.is_locked ? '🔒 Locked for editing' : 'Open for updates'}
          </p>
        </header>

        {loading || !meetingId ? (
          <p className="text-sm text-zinc-500">Loading meeting…</p>
        ) : !meeting ? (
          <p className="text-sm text-red-600">Meeting not found.</p>
        ) : (
          <MeetingAgendaView meetingId={meetingId} />
        )}
      </div>
    </main>
  );
}
