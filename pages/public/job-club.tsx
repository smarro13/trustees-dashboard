import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PublicSectionNav from '../../components/PublicSectionNav';
import type { ClubRefreshJob } from './index';
import { CLUB_REFRESH_JOBS } from './index';
import { supabase } from '../../lib/supabaseClient';

type JobClubPostRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  is_active?: boolean | null;
};

type JobClubNoteRow = {
  id: string;
  name: string;
  notes: string;
  created_at?: string | null;
};

type TaskAssignmentSummary = {
  taskLabel: string;
  assignee: string;
  notes: string;
  createdAt?: string | null;
};

const JOB_META_PREFIX = 'JOB_META:';
const MAX_TASK_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const getStatusBadgeClasses = (status: ClubRefreshJob['status']) => {
  if (status === 'Ongoing') return 'bg-amber-100 text-amber-800';
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-800';
  return 'bg-zinc-200 text-zinc-700';
};

const getPriorityBadgeClasses = (priority: ClubRefreshJob['priority']) => {
  if (priority === 'High') return 'bg-rose-100 text-rose-800';
  if (priority === 'Medium') return 'bg-amber-100 text-amber-800';
  return 'bg-sky-100 text-sky-800';
};

const getClubRefreshTaskLabel = (item: ClubRefreshJob) => `${item.area} - ${item.job}`;

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read attachment data.'));
        return;
      }

      const commaIndex = reader.result.indexOf(',');
      resolve(commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result);
    };

    reader.onerror = () => reject(new Error('Could not read attachment data.'));
    reader.readAsDataURL(file);
  });

const parsePostedJob = (row: JobClubPostRow): ClubRefreshJob | null => {
  if (!row?.description) return null;

  const firstLine = row.description.split('\n')[0]?.trim() || '';
  if (!firstLine.startsWith(JOB_META_PREFIX)) return null;

  try {
    const parsed = JSON.parse(firstLine.replace(JOB_META_PREFIX, '').trim()) as Partial<ClubRefreshJob>;
    const validStatuses: ClubRefreshJob['status'][] = ['Not Started', 'Ongoing', 'Completed'];
    const validPriorities: ClubRefreshJob['priority'][] = ['High', 'Medium', 'Low'];

    if (!parsed.area || !parsed.job || !parsed.materials) return null;
    if (!parsed.status || !validStatuses.includes(parsed.status)) return null;
    if (!parsed.priority || !validPriorities.includes(parsed.priority)) return null;

    return {
      area: parsed.area,
      job: parsed.job,
      status: parsed.status,
      priority: parsed.priority,
      materials: parsed.materials,
    };
  } catch {
    return null;
  }
};

const parseTaskAssignmentNote = (row: JobClubNoteRow): TaskAssignmentSummary | null => {
  if (!row?.notes || !row.notes.includes('[Task Assignment]')) return null;

  const lines = row.notes.split('\n').map((line) => line.trim());
  const taskLine = lines.find((line) => line.startsWith('Task:'));
  const notesLine = lines.find((line) => line.startsWith('Notes:'));

  if (!taskLine) return null;

  const taskLabel = taskLine.replace('Task:', '').trim();
  if (!taskLabel) return null;

  return {
    taskLabel,
    assignee: row.name,
    notes: notesLine ? notesLine.replace('Notes:', '').trim() : '',
    createdAt: row.created_at || null,
  };
};

export default function PublicJobClubPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittedJobs, setSubmittedJobs] = useState<ClubRefreshJob[]>([]);
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignmentSummary[]>([]);

  const [jobAreaFilter, setJobAreaFilter] = useState('All areas');
  const [jobStatusFilter, setJobStatusFilter] = useState<'All statuses' | ClubRefreshJob['status']>('All statuses');
  const [jobPriorityFilter, setJobPriorityFilter] = useState<'All priorities' | ClubRefreshJob['priority']>('All priorities');

  const [newJobArea, setNewJobArea] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobStatus, setNewJobStatus] = useState<ClubRefreshJob['status']>('Not Started');
  const [newJobPriority, setNewJobPriority] = useState<ClubRefreshJob['priority']>('Medium');
  const [newJobMaterials, setNewJobMaterials] = useState('');
  const [newJobSubmittedBy, setNewJobSubmittedBy] = useState('');
  const [addingJob, setAddingJob] = useState(false);
  const [addJobStatus, setAddJobStatus] = useState<string | null>(null);

  const [taskAssignmentNamesByJob, setTaskAssignmentNamesByJob] = useState<Record<string, string>>({});
  const [taskAssignmentNotesByJob, setTaskAssignmentNotesByJob] = useState<Record<string, string>>({});
  const [taskAssignmentAttachmentsByJob, setTaskAssignmentAttachmentsByJob] = useState<Record<string, File[]>>({});
  const [taskAssignmentStatusByJob, setTaskAssignmentStatusByJob] = useState<Record<string, string | null>>({});
  const [submittingTaskAssignmentByJob, setSubmittingTaskAssignmentByJob] = useState<Record<string, boolean>>({});

  const allJobClubJobs = useMemo(
    () => [...CLUB_REFRESH_JOBS, ...submittedJobs],
    [submittedJobs],
  );

  const latestAssignmentsByTask = useMemo(() => {
    const map = new Map<string, TaskAssignmentSummary>();

    for (const assignment of taskAssignments) {
      if (!map.has(assignment.taskLabel)) {
        map.set(assignment.taskLabel, assignment);
      }
    }

    return map;
  }, [taskAssignments]);

  const openJobs = useMemo(
    () => allJobClubJobs.filter((job) => !latestAssignmentsByTask.has(getClubRefreshTaskLabel(job))),
    [allJobClubJobs, latestAssignmentsByTask],
  );

  const assignedJobs = useMemo(
    () =>
      allJobClubJobs
        .map((job) => {
          const assignment = latestAssignmentsByTask.get(getClubRefreshTaskLabel(job));
          return assignment ? { job, assignment } : null;
        })
        .filter((value): value is { job: ClubRefreshJob; assignment: TaskAssignmentSummary } => Boolean(value)),
    [allJobClubJobs, latestAssignmentsByTask],
  );

  const clubRefreshAreas = useMemo(
    () => ['All areas', ...Array.from(new Set(allJobClubJobs.map((item) => item.area)))],
    [allJobClubJobs],
  );

  const filteredJobs = useMemo(
    () =>
      allJobClubJobs.filter((item) => {
        const areaMatches = jobAreaFilter === 'All areas' || item.area === jobAreaFilter;
        const statusMatches = jobStatusFilter === 'All statuses' || item.status === jobStatusFilter;
        const priorityMatches = jobPriorityFilter === 'All priorities' || item.priority === jobPriorityFilter;
        return areaMatches && statusMatches && priorityMatches;
      }),
    [allJobClubJobs, jobAreaFilter, jobPriorityFilter, jobStatusFilter],
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [jobsResult, notesResult] = await Promise.all([
      supabase
        .from('job_club_posts')
        .select('id, title, description, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('job_club_notes')
        .select('id, name, notes, created_at')
        .order('created_at', { ascending: false })
        .limit(300),
    ]);

    if (jobsResult.error || notesResult.error) {
      setError(jobsResult.error?.message || notesResult.error?.message || 'Unable to load job club');
      setSubmittedJobs([]);
      setTaskAssignments([]);
      setLoading(false);
      return;
    }

    const parsedJobs = ((jobsResult.data || []) as JobClubPostRow[])
      .map((row) => parsePostedJob(row))
      .filter((row): row is ClubRefreshJob => Boolean(row));

    const parsedAssignments = ((notesResult.data || []) as JobClubNoteRow[])
      .map((row) => parseTaskAssignmentNote(row))
      .filter((row): row is TaskAssignmentSummary => Boolean(row));

    setSubmittedJobs(parsedJobs);
    setTaskAssignments(parsedAssignments);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const submitNewJob = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newJobArea.trim() || !newJobTitle.trim() || !newJobMaterials.trim()) {
      setAddJobStatus('Please add area, job, and materials.');
      return;
    }

    setAddingJob(true);
    setAddJobStatus(null);

    try {
      const response = await fetch('/api/public/job-club-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: newJobArea,
          job: newJobTitle,
          status: newJobStatus,
          priority: newJobPriority,
          materials: newJobMaterials,
          submittedBy: newJobSubmittedBy,
          website: '',
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setAddJobStatus(payload.error || 'Unable to add this job right now.');
        setAddingJob(false);
        return;
      }

      setNewJobArea('');
      setNewJobTitle('');
      setNewJobStatus('Not Started');
      setNewJobPriority('Medium');
      setNewJobMaterials('');
      setNewJobSubmittedBy('');
      setAddJobStatus('Job added successfully.');
      await loadData();
    } catch {
      setAddJobStatus('Unable to add this job right now.');
    }

    setAddingJob(false);
  };

  const submitTaskAssignmentForJob = async (event: React.FormEvent<HTMLFormElement>, taskLabel: string) => {
    event.preventDefault();

    const assigneeName = (taskAssignmentNamesByJob[taskLabel] || '').trim();
    const assignmentNotes = (taskAssignmentNotesByJob[taskLabel] || '').trim();
    const attachments = taskAssignmentAttachmentsByJob[taskLabel] || [];

    if (!assigneeName || !assignmentNotes) {
      setTaskAssignmentStatusByJob((current) => ({ ...current, [taskLabel]: 'Please enter your name and notes for this task.' }));
      return;
    }

    const oversizedFile = attachments.find((file) => file.size > MAX_TASK_ATTACHMENT_BYTES);
    if (oversizedFile) {
      setTaskAssignmentStatusByJob((current) => ({
        ...current,
        [taskLabel]: `Attachment too large: ${oversizedFile.name}. Max size is 10 MB per file.`,
      }));
      return;
    }

    setSubmittingTaskAssignmentByJob((current) => ({ ...current, [taskLabel]: true }));
    setTaskAssignmentStatusByJob((current) => ({ ...current, [taskLabel]: null }));

    const uploadedAttachmentLines: string[] = [];

    try {
      for (const file of attachments) {
        const base64Data = await fileToBase64(file);

        const uploadResponse = await fetch('/api/public/upload-job-club-attachment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, base64Data, website: '' }),
        });

        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadPayload.ok || !uploadPayload.url) {
          setTaskAssignmentStatusByJob((current) => ({ ...current, [taskLabel]: uploadPayload.error || `Unable to upload ${file.name}.` }));
          setSubmittingTaskAssignmentByJob((current) => ({ ...current, [taskLabel]: false }));
          return;
        }

        uploadedAttachmentLines.push(`- ${file.name}: ${uploadPayload.url}`);
      }
    } catch {
      setTaskAssignmentStatusByJob((current) => ({ ...current, [taskLabel]: 'Unable to upload one or more attachments right now.' }));
      setSubmittingTaskAssignmentByJob((current) => ({ ...current, [taskLabel]: false }));
      return;
    }

    const assignmentNote = [
      '[Task Assignment]',
      `Task: ${taskLabel}`,
      `Notes: ${assignmentNotes}`,
      uploadedAttachmentLines.length > 0 ? 'Attachments:' : null,
      ...uploadedAttachmentLines,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');

    try {
      const response = await fetch('/api/public/job-club-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: assigneeName, notes: assignmentNote, jobClubPostId: null, website: '' }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setTaskAssignmentStatusByJob((current) => ({ ...current, [taskLabel]: payload.error || 'Unable to submit your task assignment right now.' }));
        setSubmittingTaskAssignmentByJob((current) => ({ ...current, [taskLabel]: false }));
        return;
      }

      setTaskAssignmentNotesByJob((current) => ({ ...current, [taskLabel]: '' }));
      setTaskAssignmentAttachmentsByJob((current) => ({ ...current, [taskLabel]: [] }));
      setTaskAssignmentStatusByJob((current) => ({ ...current, [taskLabel]: 'Thanks, you have been assigned to this task and your notes were sent.' }));
      setTaskAssignments((current) => [{ taskLabel, assignee: assigneeName, notes: assignmentNotes, createdAt: new Date().toISOString() }, ...current]);
    } catch {
      setTaskAssignmentStatusByJob((current) => ({ ...current, [taskLabel]: 'Unable to submit your task assignment right now.' }));
    }

    setSubmittingTaskAssignmentByJob((current) => ({ ...current, [taskLabel]: false }));
  };

  const renderTaskAssignmentDropdown = (item: ClubRefreshJob, compact = false) => {
    const taskLabel = getClubRefreshTaskLabel(item);
    const taskStatus = taskAssignmentStatusByJob[taskLabel];
    const taskAttachments = taskAssignmentAttachmentsByJob[taskLabel] || [];
    const isSubmittingTask = Boolean(submittingTaskAssignmentByJob[taskLabel]);

    return (
      <details className={`mt-2 rounded-lg border border-zinc-200 bg-white ${compact ? 'p-2.5' : 'p-2'}`}>
        <summary className="cursor-pointer list-none text-xs font-semibold text-red-700">Actions</summary>
        <p className="mt-2 text-xs font-medium text-zinc-600">Assign to me</p>

        <form className="mt-3 space-y-3" onSubmit={(event) => { void submitTaskAssignmentForJob(event, taskLabel); }}>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor={`task-name-${taskLabel}`}>Your name</label>
            <input
              id={`task-name-${taskLabel}`}
              value={taskAssignmentNamesByJob[taskLabel] || ''}
              onChange={(event) => setTaskAssignmentNamesByJob((current) => ({ ...current, [taskLabel]: event.target.value }))}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor={`task-notes-${taskLabel}`}>Notes</label>
            <textarea
              id={`task-notes-${taskLabel}`}
              value={taskAssignmentNotesByJob[taskLabel] || ''}
              onChange={(event) => setTaskAssignmentNotesByJob((current) => ({ ...current, [taskLabel]: event.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="Availability, materials you can bring, or support needed"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor={`task-files-${taskLabel}`}>Upload receipts/files (optional)</label>
            <input
              id={`task-files-${taskLabel}`}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                setTaskAssignmentAttachmentsByJob((current) => ({ ...current, [taskLabel]: files }));
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none transition file:mr-2 file:rounded-full file:border-0 file:bg-red-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-red-700 hover:file:bg-red-200 focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            {taskAttachments.length > 0 && (
              <ul className="mt-1 space-y-1 text-xs text-zinc-600">
                {taskAttachments.map((file) => (
                  <li key={`${taskLabel}-${file.name}-${file.lastModified}`}>{file.name}</li>
                ))}
              </ul>
            )}
          </div>

          {taskStatus && <p className={`text-xs ${taskStatus.includes('Thanks') ? 'text-emerald-700' : 'text-rose-700'}`}>{taskStatus}</p>}

          <button
            type="submit"
            disabled={isSubmittingTask}
            className="inline-flex items-center rounded-full bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {isSubmittingTask ? 'Submitting...' : 'Assign to me'}
          </button>
        </form>
      </details>
    );
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Aldwinians</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Job Club</h1>
              <p className="mt-2 text-sm text-zinc-600">All club refresh jobs, ownership tracking, and self-assignment.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/public" className="inline-flex items-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-red-300 hover:text-red-700">
                Back to Home
              </Link>
              <a href="#add-job-form" className="inline-flex items-center rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800">
                Add Job
              </a>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">Loading Job Club...</section>
        ) : error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">Unable to load Job Club: {error}</section>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900">Open Jobs</h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">{openJobs.length}</span>
                </div>
                <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {openJobs.length === 0 ? <p className="text-xs text-zinc-500">No open jobs right now.</p> : openJobs.slice(0, 10).map((job) => (
                    <p key={`${job.area}-${job.job}-open`} className="text-xs text-zinc-700"><span className="font-medium text-zinc-900">{job.area}:</span> {job.job}</p>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900">Assigned Jobs</h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">{assignedJobs.length}</span>
                </div>
                <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {assignedJobs.length === 0 ? <p className="text-xs text-zinc-500">No assignments yet.</p> : assignedJobs.slice(0, 10).map(({ job, assignment }) => (
                    <p key={`${job.area}-${job.job}-assigned`} className="text-xs text-zinc-700"><span className="font-medium text-zinc-900">{job.area}:</span> {job.job}<span className="text-zinc-500"> - {assignment.assignee}</span></p>
                  ))}
                </div>
              </section>
            </div>

            <form id="add-job-form" className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4" onSubmit={submitNewJob}>
              <h3 className="text-base font-semibold text-zinc-900">Add Job</h3>
              <p className="mt-1 text-sm text-zinc-600">Submit a new job so it appears in the Job Club list.</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="new-job-area" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Area</label>
                  <input id="new-job-area" value={newJobArea} onChange={(event) => setNewJobArea(event.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder="e.g. External Areas" />
                </div>
                <div>
                  <label htmlFor="new-job-status" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Status</label>
                  <select id="new-job-status" value={newJobStatus} onChange={(event) => setNewJobStatus(event.target.value as ClubRefreshJob['status'])} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100">
                    <option value="Not Started">Not Started</option>
                    <option value="Ongoing">Ongoing</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="new-job-priority" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Priority</label>
                  <select id="new-job-priority" value={newJobPriority} onChange={(event) => setNewJobPriority(event.target.value as ClubRefreshJob['priority'])} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100">
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <label htmlFor="new-job-title" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Job</label>
                <input id="new-job-title" value={newJobTitle} onChange={(event) => setNewJobTitle(event.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder="Describe the job" />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="new-job-materials" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Rough Materials Required</label>
                  <textarea id="new-job-materials" value={newJobMaterials} onChange={(event) => setNewJobMaterials(event.target.value)} rows={3} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder="Materials, tools, consumables" />
                </div>
                <div>
                  <label htmlFor="new-job-submitted-by" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Submitted by (optional)</label>
                  <input id="new-job-submitted-by" value={newJobSubmittedBy} onChange={(event) => setNewJobSubmittedBy(event.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder="Your name" />
                </div>
              </div>

              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" />

              {addJobStatus && <p className={`mt-3 text-sm ${addJobStatus.includes('successfully') ? 'text-emerald-700' : 'text-rose-700'}`}>{addJobStatus}</p>}

              <button type="submit" disabled={addingJob} className="mt-3 inline-flex items-center rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300">
                {addingJob ? 'Adding...' : 'Add job'}
              </button>
            </form>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="club-refresh-area-filter" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Area</label>
                <select id="club-refresh-area-filter" value={jobAreaFilter} onChange={(event) => setJobAreaFilter(event.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100">
                  {clubRefreshAreas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="club-refresh-status-filter" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Status</label>
                <select id="club-refresh-status-filter" value={jobStatusFilter} onChange={(event) => setJobStatusFilter(event.target.value as 'All statuses' | ClubRefreshJob['status'])} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100">
                  <option value="All statuses">All statuses</option>
                  <option value="Not Started">Not Started</option>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div>
                <label htmlFor="club-refresh-priority-filter" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">Priority</label>
                <select id="club-refresh-priority-filter" value={jobPriorityFilter} onChange={(event) => setJobPriorityFilter(event.target.value as 'All priorities' | ClubRefreshJob['priority'])} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100">
                  <option value="All priorities">All priorities</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              {filteredJobs.map((item) => (
                <article key={`${item.area}-${item.job}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{item.area}</p>
                  <h3 className="mt-1 text-sm font-semibold text-zinc-900">{item.job}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClasses(item.status)}`}>{item.status}</span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getPriorityBadgeClasses(item.priority)}`}>{item.priority}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-600">Materials: {item.materials}</p>
                  {renderTaskAssignmentDropdown(item, true)}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-3 py-3 font-semibold text-zinc-900">Area</th>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-3 py-3 font-semibold text-zinc-900">Job</th>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-3 py-3 font-semibold text-zinc-900">Status</th>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-3 py-3 font-semibold text-zinc-900">Priority</th>
                    <th className="border-b border-zinc-200 bg-zinc-50 px-3 py-3 font-semibold text-zinc-900">Rough Materials Required</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((item) => (
                    <tr key={`${item.area}-${item.job}`} className="odd:bg-white even:bg-zinc-50/60">
                      <td className="border-b border-zinc-100 px-3 py-3 align-top font-medium text-zinc-900">{item.area}</td>
                      <td className="border-b border-zinc-100 px-3 py-3 align-top text-zinc-700"><p>{item.job}</p>{renderTaskAssignmentDropdown(item)}</td>
                      <td className="border-b border-zinc-100 px-3 py-3 align-top"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClasses(item.status)}`}>{item.status}</span></td>
                      <td className="border-b border-zinc-100 px-3 py-3 align-top"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getPriorityBadgeClasses(item.priority)}`}>{item.priority}</span></td>
                      <td className="border-b border-zinc-100 px-3 py-3 align-top text-zinc-700">{item.materials}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
