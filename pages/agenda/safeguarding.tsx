import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { User } from '@supabase/supabase-js';

export default function SafeguardingPage() {
  const [updates, setUpdates] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState('Information');
  const [reviewDate, setReviewDate] = useState('');
  const [team, setTeam] = useState('Under 7s');
  const [meetingId, setMeetingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);

    // Get current user
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    setUser(currentUser);

    const { data, error } = await supabase
      .from('safeguarding_updates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading safeguarding updates:', error);
    } else if (data) {
      setUpdates(data);
    }

    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('id, meeting_date')
      .order('meeting_date', { ascending: true });

    if (meetingsData) setMeetings(meetingsData);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveUpdate = async () => {
    if (!summary) return;

    if (!user) {
      alert('You must be logged in to save');
      return;
    }

    setLoading(true);

    if (editingId) {
      // Update existing
      const { error } = await supabase
        .from('safeguarding_updates')
        .update({
          title: `${team} - ${status}`,
          summary,
          status,
          review_date: reviewDate || null,
          team,
          meeting_id: meetingId,
        })
        .eq('id', editingId);

      if (error) {
        console.error('Error updating safeguarding update:', error);
        alert('Failed to update safeguarding update: ' + error.message);
        setLoading(false);
        return;
      }
    } else {
      // Create new
      const { data, error } = await supabase.from('safeguarding_updates').insert({
        title: `${team} - ${status}`,
        summary,
        status,
        review_date: reviewDate || null,
        team,
        meeting_id: meetingId,
        user_id: user.id,
      });

      if (error) {
        console.error('Error saving safeguarding update:', error);
        alert('Failed to save safeguarding update: ' + error.message);
        setLoading(false);
        return;
      }
    }

    setSummary('');
    setStatus('Information');
    setReviewDate('');
    setTeam('Under 7s');
    setMeetingId(null);
    setEditingId(null);

    setLoading(false);
    loadData();
    alert(editingId ? 'Safeguarding update updated successfully!' : 'Safeguarding update saved successfully!');
  };

  const startEdit = (u: any) => {
    setEditingId(u.id);
    setSummary(u.summary || '');
    setStatus(u.status || 'Information');
    setReviewDate(u.review_date || '');
    setTeam(u.team || 'Under 7s');
    setMeetingId(u.meeting_id || null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setSummary('');
    setStatus('Information');
    setReviewDate('');
    setTeam('Under 7s');
    setMeetingId(null);
  };

  const deleteUpdate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this safeguarding update?')) return;

    setLoading(true);

    const { error } = await supabase
      .from('safeguarding_updates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting safeguarding update:', error);
      alert('Failed to delete safeguarding update: ' + error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    loadData();
    alert('Safeguarding update deleted successfully!');
  };

  const teamBuckets = [
    'Mini Winnies',
    'Under 7s',
    'Under 8s',
    'Under 9s',
    'Under 10s',
    'Under 11s',
    'Under 12s',
    'Under 13s',
    'Under 14s',
    'Under 15s',
    'Under 16s',
    'Under 17s',
    'Under 18s',
    'Seniors',
    'Other',
  ];

  return (
    <main className="min-h-screen">
      {/* expand width similar to other agenda pages */}
      <div className="mx-auto w-full max-w-6xl sm:max-w-7xl lg:max-w-[1200px] px-2 sm:px-4 lg:px-6 py-6 sm:py-8 lg:py-10">
        {/* Header */}
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Safeguarding
          </h1>
          <p className="mt-1 text-zinc-600">
            Board-level safeguarding oversight (no personal data)
          </p>
        </header>

        {/* New update – full-width, lightly styled section instead of player-card */}
        <section className="mb-10 w-full rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            {/* keep pc-name for consistent red styling if defined globally */}
            <h2 className="pc-name text-xl font-semibold">
              {editingId ? 'Edit safeguarding update' : 'Add safeguarding update'}
            </h2>
          </div>

          <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-4">
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

            <textarea
              placeholder="Summary (high-level, no personal detail)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2"
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border px-3 py-2"
              >
                <option>Information</option>
                <option>Ongoing</option>
                <option>Resolved</option>
                <option>Escalated</option>
              </select>

              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="rounded-md border px-3 py-2"
              />

              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="rounded-md border px-3 py-2"
              >
                {teamBuckets.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              {editingId && (
                <button
                  onClick={cancelEdit}
                  disabled={loading}
                  className="rounded-md bg-zinc-300 px-4 py-2 font-medium text-zinc-800 hover:bg-zinc-400 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={saveUpdate}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Saving…' : editingId ? 'Update safeguarding update' : 'Save safeguarding update'}
              </button>
            </div>
          </div>
        </section>

        {/* Updates list grouped into team boxes */}
        <section className="space-y-8">
          {teamBuckets.map((bucket) => (
            <div
              key={bucket}
              className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200"
            >
              <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 lg:px-8">
                <h2 className="text-lg font-semibold">{bucket}</h2>
              </div>
              <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8">
                {updates
                  .filter((u) => u.team === bucket)
                  .map((u) => (
                    <div key={u.id} className="player-card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="pc-name text-lg">{u.title}</h3>
                          <p className="pc-meta">
                            Status: <strong>{u.status}</strong>
                            {u.review_date &&
                              ` • Review by ${new Date(
                                u.review_date
                              ).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(u)}
                            className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteUpdate(u.id)}
                            className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-zinc-700">
                        {u.summary}
                      </p>
                    </div>
                  ))}
                {updates.filter((u) => u.team === bucket).length === 0 && (
                  <p className="text-sm text-zinc-500">
                    No safeguarding updates yet.
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
