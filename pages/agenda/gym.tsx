import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import { canCurrentUserEditThisAgendaPage, PRESIDENT_EDIT_BLOCK_MESSAGE } from '../../lib/presidentPermissions';

type UploadedAsset = {
  name: string;
  url: string;
};

type JobClubIdea = {
  id: string;
  area: string;
  job: string;
  status: 'Not Started' | 'Ongoing' | 'Completed';
  priority: 'High' | 'Medium' | 'Low';
};

const JOB_META_PREFIX = 'JOB_META:';

const parseJobClubIdea = (row: any): JobClubIdea | null => {
  const description: string | null = row?.description ?? null;
  if (!description) return null;

  const firstLine = description.split('\n')[0]?.trim() || '';
  if (!firstLine.startsWith(JOB_META_PREFIX)) return null;

  try {
    const parsed = JSON.parse(firstLine.replace(JOB_META_PREFIX, '').trim()) as Partial<JobClubIdea>;
    if (!parsed.area || !parsed.job || !parsed.status || !parsed.priority) return null;
    return {
      id: row.id,
      area: parsed.area,
      job: parsed.job,
      status: parsed.status,
      priority: parsed.priority,
    };
  } catch {
    return null;
  }
};

const asUploadedAssets = (value: unknown): UploadedAsset[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as { name?: unknown; url?: unknown };
      if (typeof candidate.name !== 'string' || typeof candidate.url !== 'string') return null;
      return { name: candidate.name, url: candidate.url };
    })
    .filter((item): item is UploadedAsset => Boolean(item));
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

export default function GymUpdatesPage() {
  const router = useRouter();
  const embedded = router.query.embedded === '1';
  const [user, setUser] = useState<User | null>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [jobIdeas, setJobIdeas] = useState<JobClubIdea[]>([]);

  const [period, setPeriod] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [issues, setIssues] = useState('');
  const [updates, setUpdates] = useState('');
  const [equipment, setEquipment] = useState('');
  const [other, setOther] = useState('');
  const [selectedJobClubIdeas, setSelectedJobClubIdeas] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const [saving, setSaving] = useState(false);
  const [linkingReportId, setLinkingReportId] = useState<string | null>(null);
  const [meetingSelectionByReport, setMeetingSelectionByReport] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [canEdit, setCanEdit] = useState(true);

  const showNotice = (type: InlineNotice['type'], message: string) => {
    setNotice({ type, message });
  };

  const selectedIdeasLabel = useMemo(() => {
    const selected = jobIdeas.filter((idea) => selectedJobClubIdeas.includes(idea.id));
    return selected.map((idea) => `${idea.area} - ${idea.job}`);
  }, [jobIdeas, selectedJobClubIdeas]);

  const meetingDateById = useMemo(() => {
    const map = new Map<string, string>();
    for (const meeting of meetings) {
      if (!meeting?.id || !meeting?.meeting_date) continue;
      map.set(
        meeting.id,
        new Date(meeting.meeting_date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      );
    }
    return map;
  }, [meetings]);

  const loadData = async () => {
    const [{ data: authData }, meetingsResult, reportsResult, jobsResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('meetings').select('id, meeting_date').order('meeting_date', { ascending: true }),
      supabase.from('gym_updates').select('*').order('created_at', { ascending: false }),
      supabase
        .from('job_club_posts')
        .select('id, description, is_active, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(300),
    ]);

    setUser(authData.user);
    setMeetings(meetingsResult.data || []);
    setReports(reportsResult.data || []);

    const parsedIdeas = ((jobsResult.data || []) as any[])
      .map((row) => parseJobClubIdea(row))
      .filter((row): row is JobClubIdea => Boolean(row))
      .filter((row) => row.area.toLowerCase().includes('gym'));
    setJobIdeas(parsedIdeas);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const loadCanEdit = async () => {
      const allowed = await canCurrentUserEditThisAgendaPage();
      setCanEdit(allowed);
    };

    void loadCanEdit();
  }, []);

  const toggleJobIdea = (id: string) => {
    setSelectedJobClubIdeas((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const uploadAttachments = async (): Promise<UploadedAsset[]> => {
    if (!files.length) return [];

    const uploaded: UploadedAsset[] = [];

    for (const file of files) {
      const filePath = `gym-updates/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file.name.replace(/\s+/g, '-')}`;
      const { error: uploadError } = await supabase.storage
        .from('minutes')
        .upload(filePath, file, { upsert: false, cacheControl: '3600' });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage.from('minutes').getPublicUrl(filePath);
      uploaded.push({ name: file.name, url: data.publicUrl });
    }

    return uploaded;
  };

  const saveReport = async () => {
    if (!(await canCurrentUserEditThisAgendaPage())) {
      showNotice('error', PRESIDENT_EDIT_BLOCK_MESSAGE);
      return;
    }

    if (!period.trim()) {
      showNotice('error', 'Please enter a reporting period.');
      return;
    }

    if (!updates.trim()) {
      showNotice('error', 'Please add update details.');
      return;
    }

    if (!user) {
      showNotice('error', 'You must be logged in to save.');
      return;
    }

    setSaving(true);

    try {
      const uploadedAssets = await uploadAttachments();

      const { error: insertError } = await supabase.from('gym_updates').insert({
        reporting_period: period.trim(),
        meeting_id: meetingId,
        issues: issues.trim() || null,
        updates: updates.trim(),
        equipment: equipment.trim() || null,
        other: other.trim() || null,
        attachments: uploadedAssets,
        selected_job_club_ideas: selectedIdeasLabel,
        user_id: user.id,
      });

      if (insertError) {
        showNotice('error', `Failed to save update: ${insertError.message}`);
        setSaving(false);
        return;
      }

      setPeriod('');
      setMeetingId(null);
      setIssues('');
      setUpdates('');
      setEquipment('');
      setOther('');
      setSelectedJobClubIdeas([]);
      setFiles([]);

      await loadData();
      showNotice('success', 'Gym update saved.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to save update.');
    }

    setSaving(false);
  };

  const addReportToMeeting = async (reportId: string) => {
    if (!(await canCurrentUserEditThisAgendaPage())) {
      showNotice('error', PRESIDENT_EDIT_BLOCK_MESSAGE);
      return;
    }

    const selectedMeetingId = meetingSelectionByReport[reportId];
    if (!selectedMeetingId) {
      showNotice('error', 'Please select a meeting first.');
      return;
    }

    setLinkingReportId(reportId);
    const { error } = await supabase
      .from('gym_updates')
      .update({ meeting_id: selectedMeetingId })
      .eq('id', reportId);

    if (error) {
      showNotice('error', `Failed to add update to meeting: ${error.message}`);
      setLinkingReportId(null);
      return;
    }

    await loadData();
    showNotice('success', 'Update added to meeting.');
    setLinkingReportId(null);
  };

  return (
    <main className="min-h-screen">
      <div className={embedded ? 'mx-auto w-full px-2 py-2' : 'mx-auto w-full max-w-[1200px] px-4 py-10'}>
        <header className={embedded ? 'mb-4' : 'mb-8'}>
          {!embedded && (
            <Link
              href="/"
              className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              ← Back to dashboard
            </Link>
          )}

          <h1 className="text-3xl font-extrabold text-zinc-900">Gym Updates</h1>
          <p className="mt-1 text-zinc-600">Track gym issues, updates, equipment changes, and other notes.</p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {!canEdit && (
          <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {PRESIDENT_EDIT_BLOCK_MESSAGE}
          </div>
        )}

        <section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">Add update</h2>
          </div>

          <div className="space-y-5 px-6 py-6">
            <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-70">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="Reporting period (e.g. July 2026)"
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
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Issues</label>
              <textarea
                value={issues}
                onChange={(e) => setIssues(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Any blockers, incidents, maintenance problems, or safety concerns"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Updates</label>
              <textarea
                value={updates}
                onChange={(e) => setUpdates(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="What changed this period, what progress was made, and what is next"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Equipment</label>
              <textarea
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Equipment status, repairs, purchases, or replacements"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Other</label>
              <textarea
                value={other}
                onChange={(e) => setOther(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Any extra notes, asks, or decisions needed"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Upload Items</label>
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="gym-upload-items"
                  className="inline-flex cursor-pointer items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Choose files
                </label>
                <input
                  id="gym-upload-items"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="hidden"
                />
                <span className="text-sm text-zinc-600">
                  {files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No file chosen'}
                </span>
              </div>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-zinc-600">
                  {files.map((file) => (
                    <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-zinc-700">Optional Job Club Gym ideas/streams</p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3">
                {jobIdeas.length === 0 ? (
                  <p className="text-sm text-zinc-500">No Gym Job Club ideas available.</p>
                ) : (
                  jobIdeas.map((idea) => (
                    <label key={idea.id} className="flex items-start gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        checked={selectedJobClubIdeas.includes(idea.id)}
                        onChange={() => toggleJobIdea(idea.id)}
                        className="mt-0.5"
                      />
                      <span>
                        <strong>{idea.area}</strong> - {idea.job}
                        <span className="ml-1 text-xs text-zinc-500">({idea.status}, {idea.priority})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveReport}
                disabled={saving || !canEdit}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Update'}
              </button>
            </div>
            </fieldset>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-900">Recent Gym updates</h2>
          {reports.length === 0 ? (
            <p className="text-sm text-zinc-500">No updates saved yet.</p>
          ) : (
            reports.map((report) => {
              const attachments = asUploadedAssets(report.attachments);
              const selectedIdeas = asStringArray(report.selected_job_club_ideas);
              const linkedMeetingDate = report.meeting_id ? meetingDateById.get(report.meeting_id) : null;
              const selectedMeetingForReport = meetingSelectionByReport[report.id] || '';

              return (
                <article key={report.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                  <h3 className="text-lg font-semibold text-zinc-900">{report.reporting_period}</h3>
                  <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                    <p>
                      <span className="font-semibold">Meeting:</span>{' '}
                      {linkedMeetingDate || 'Not linked'}
                    </p>
                    {!linkedMeetingDate && (
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <select
                          value={selectedMeetingForReport}
                          onChange={(e) =>
                            setMeetingSelectionByReport((current) => ({
                              ...current,
                              [report.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 sm:w-auto"
                        >
                          <option value="">Select meeting</option>
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
                        <button
                          type="button"
                          onClick={() => addReportToMeeting(report.id)}
                          disabled={linkingReportId === report.id || !canEdit}
                          className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {linkingReportId === report.id ? 'Adding...' : 'Add to meeting'}
                        </button>
                      </div>
                    )}
                  </div>

                  {report.issues && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                      <span className="font-semibold">Issues:</span>
                      <br />
                      {report.issues}
                    </p>
                  )}

                  {report.updates && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">
                      <span className="font-semibold">Updates:</span>
                      <br />
                      {report.updates}
                    </p>
                  )}

                  {report.equipment && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">
                      <span className="font-semibold">Equipment:</span>
                      <br />
                      {report.equipment}
                    </p>
                  )}

                  {report.other && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">
                      <span className="font-semibold">Other:</span>
                      <br />
                      {report.other}
                    </p>
                  )}

                  {selectedIdeas.length > 0 && (
                    <div className="mt-3 text-sm text-zinc-700">
                      <p className="font-semibold">Linked Gym Job Club ideas/streams:</p>
                      <ul className="mt-1 list-disc pl-5">
                        {selectedIdeas.map((idea) => (
                          <li key={`${report.id}-${idea}`}>{idea}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div className="mt-3 text-sm text-zinc-700">
                      <p className="font-semibold">Uploaded items:</p>
                      <ul className="mt-1 list-disc pl-5">
                        {attachments.map((asset) => (
                          <li key={`${report.id}-${asset.url}`}>
                            <a href={asset.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {asset.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
