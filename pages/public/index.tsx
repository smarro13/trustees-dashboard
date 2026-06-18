import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PublicSectionNav from '../../components/PublicSectionNav';
import { supabase } from '../../lib/supabaseClient';

type PublicAction = {
  id: string;
  title: string;
  description?: string | null;
  owner?: string | null;
  due_date?: string | null;
  status?: string | null;
  source?: string | null;
  created_at?: string | null;
};

type Minute = {
  id: string;
  title: string;
  file_url: string;
  created_at: string;
  meetings?: { meeting_date?: string | null } | { meeting_date?: string | null }[] | null;
};

export type ClubRefreshJob = {
  area: string;
  job: string;
  category?: string;
  status: 'Not Started' | 'Ongoing' | 'Completed';
  priority: 'High' | 'Medium' | 'Low';
  materials: string;
};

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

export const CLUB_REFRESH_JOBS: ClubRefreshJob[] = [
  { area: 'Eric Evans Lounge', job: 'Repair plaster around door', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Eric Evans Lounge', job: 'Improve NPI Cup display', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Eric Evans Lounge', job: 'Add display lighting', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Eric Evans Lounge', job: 'Review TV positioning', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Foyer', job: 'Repaint or wallpaper (skim if needed)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Foyer', job: 'Remove posters and frames', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Foyer', job: 'Reorganise accreditations', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Foyer', job: 'Clean/review plex displays', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Ladies Toilets', job: 'Repaint walls', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Ladies Toilets', job: 'Improve signage', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Fix tap', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Repair hand dryer', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Fix paper towel supply', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Fix lighting in toilet foyer. Brighter LED lighting in toilets', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Repair dented door', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Re-plaster damaged areas', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Remove signage and repaint', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Fix cubicle lock alignment', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Replace/reseal shelf', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gents Toilets', job: 'Remove sanitiser station', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Fix lighting issue - too bright or pitch black', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Repair flooring', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Repaint whole room - brighter', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Redesign signage', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Replace curtains for larger ones or doors', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Display shirts and memorabilia', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Remove old pictures', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Replace light switches', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Plaster and paint boxing fire exit near kitchen', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Function Room', job: 'Remove noticeboard and repaint', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Corridors', job: 'Upgrade lighting (PIR delays)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Corridors', job: 'General repaint', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Corridors', job: 'Review kit return process', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Changing Rooms', job: 'Full repaint (walls and ceilings)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Changing Rooms', job: 'New room identification signage', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Changing Rooms', job: 'Remove old boards/tape from benches', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Changing Rooms', job: 'Paint doors', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Changing Rooms', job: 'Remove heaters', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Changing Rooms', job: 'Replace whiteboards', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Changing Rooms', job: 'Improve lost property process', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Changing Rooms', job: 'Repurpose storage (Room 19). Kit return. Move brushes to kitchen store', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'New Changing Area', job: 'Remove all noticeboards', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'New Changing Area', job: 'Paint walls/ceilings', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'New Changing Area', job: 'Secure emergency exit', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'New Changing Area', job: 'Deep clean', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gym', job: 'Replace damaged tiles', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gym', job: 'Repaint walls', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gym', job: 'Fix machine belt', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gym', job: 'Install seated leg curl', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gym', job: 'Fix shoulder press handle', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Gym', job: 'Remove/update noticeboards', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Remove weeds (site-wide)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Jet wash patios', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Remove waste and scrap', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Replace decking (cabin)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Inspect gutters', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Repaint bollards/barriers', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Replace Astroturf entrance', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Clean memorial plaques and make additions', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Find out about community payback container, can we keep it? Move it to corner where Paul Lyon\'s container is', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Mike to organise HIAB to move small blue container, bike container, orange container', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Paul Lyons to get his container removed', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Empty blue container. Anything we are keeping to be stored in Changing Room 1 for now', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Remove branches and extract two old containers and tractor shed', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Secure/remove cables', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Repaint building (pitch side)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Grass cutting (including under tables)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Remove moss (smoking shelter)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'External', job: 'Treat weeds (bin store)', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Safety', job: 'Update first aid station', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Safety', job: 'Ensure emergency signage is present', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Safety', job: 'First aid room cleared and deep cleaned', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Safety', job: 'Repair emergency lighting', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Wayfinding', job: 'Install site map', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Wayfinding', job: 'Improve changing room signage', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
  { area: 'Wayfinding', job: 'Remove unnecessary signage', status: 'Not Started', priority: 'Medium', materials: 'TBC' },
];

const AGM_MINUTES_PREFIX = 'AGM - ';
const PUBLIC_ACTION_MARKER = '[Public]';
const MAX_TASK_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const JOB_META_PREFIX = 'JOB_META:';

const stripPublicMarker = (source: string | null | undefined) =>
  (source || '').replace(PUBLIC_ACTION_MARKER, '').trim();

const isPublicAction = (source: string | null | undefined) =>
  (source || '').includes(PUBLIC_ACTION_MARKER);

const formatDate = (value: string | null | undefined, fallback: string) => {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const getStatusBadgeClasses = (status: ClubRefreshJob['status']) => {
  if (status === 'Ongoing') {
    return 'bg-amber-100 text-amber-800';
  }

  if (status === 'Completed') {
    return 'bg-emerald-100 text-emerald-800';
  }

  return 'bg-zinc-200 text-zinc-700';
};

const getPriorityBadgeClasses = (priority: ClubRefreshJob['priority']) => {
  if (priority === 'High') {
    return 'bg-rose-100 text-rose-800';
  }

  if (priority === 'Medium') {
    return 'bg-amber-100 text-amber-800';
  }

  return 'bg-sky-100 text-sky-800';
};

const getClubRefreshTaskLabel = (item: ClubRefreshJob) => `${item.area} - ${item.job}`;

const getMeetingDate = (minute: Minute) => {
  if (Array.isArray(minute.meetings)) {
    return minute.meetings[0]?.meeting_date ?? null;
  }

  return minute.meetings?.meeting_date ?? null;
};

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

export default function PublicHomePage() {
  const [actions, setActions] = useState<PublicAction[]>([]);
  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [agmMinutes, setAgmMinutes] = useState<Minute[]>([]);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  const clubRefreshAreas = useMemo(
    () => ['All areas', ...Array.from(new Set(allJobClubJobs.map((item) => item.area)))],
    [allJobClubJobs],
  );

  const filteredClubRefreshJobs = useMemo(
    () =>
      allJobClubJobs.filter((item) => {
        const areaMatches = jobAreaFilter === 'All areas' || item.area === jobAreaFilter;
        const statusMatches = jobStatusFilter === 'All statuses' || item.status === jobStatusFilter;
        const priorityMatches = jobPriorityFilter === 'All priorities' || item.priority === jobPriorityFilter;

        return areaMatches && statusMatches && priorityMatches;
      }),
    [allJobClubJobs, jobAreaFilter, jobPriorityFilter, jobStatusFilter],
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
    () =>
      allJobClubJobs.filter((job) => {
        const taskLabel = getClubRefreshTaskLabel(job);
        return !latestAssignmentsByTask.has(taskLabel);
      }),
    [allJobClubJobs, latestAssignmentsByTask],
  );

  const assignedJobs = useMemo(
    () =>
      allJobClubJobs
        .map((job) => {
          const taskLabel = getClubRefreshTaskLabel(job);
          const assignment = latestAssignmentsByTask.get(taskLabel);

          return assignment
            ? {
                job,
                assignment,
              }
            : null;
        })
        .filter((value): value is { job: ClubRefreshJob; assignment: TaskAssignmentSummary } => Boolean(value)),
    [allJobClubJobs, latestAssignmentsByTask],
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [actionsResult, minutesResult, agmMinutesResult, jobsResult, notesResult] = await Promise.all([
        supabase
          .from('action_items')
          .select('id, title, description, owner, due_date, status, source, created_at')
          .neq('status', 'Completed')
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('minutes')
          .select(`
            id,
            title,
            file_url,
            created_at,
            meetings ( meeting_date )
          `)
          .not('title', 'ilike', `${AGM_MINUTES_PREFIX}%`)
          .order('created_at', { ascending: false }),
        supabase
          .from('minutes')
          .select(`
            id,
            title,
            file_url,
            created_at,
            meetings ( meeting_date )
          `)
          .ilike('title', `${AGM_MINUTES_PREFIX}%`)
          .order('created_at', { ascending: false }),
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

    const loadError = actionsResult.error || minutesResult.error || agmMinutesResult.error;
    if (loadError) {
      setError(loadError.message);
      setActions([]);
      setMinutes([]);
      setAgmMinutes([]);
      setSubmittedJobs([]);
      setTaskAssignments([]);
      setLoading(false);
      return;
    }

    setActions((actionsResult.data || []).filter((action) => isPublicAction(action.source)));
    setMinutes(minutesResult.data || []);
    setAgmMinutes(agmMinutesResult.data || []);

    if (jobsResult.error) {
      setSubmittedJobs([]);
    } else {
      const parsedJobs = ((jobsResult.data || []) as JobClubPostRow[])
        .map((row) => parsePostedJob(row))
        .filter((row): row is ClubRefreshJob => Boolean(row));
      setSubmittedJobs(parsedJobs);
    }

    if (notesResult.error) {
      setTaskAssignments([]);
    } else {
      const parsedAssignments = ((notesResult.data || []) as JobClubNoteRow[])
        .map((row) => parseTaskAssignmentNote(row))
        .filter((row): row is TaskAssignmentSummary => Boolean(row));
      setTaskAssignments(parsedAssignments);
    }

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
        headers: {
          'Content-Type': 'application/json',
        },
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

  const submitAction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formTitle.trim()) {
      setFormStatus('Please add a title for the action.');
      return;
    }

    setSubmitting(true);
    setFormStatus(null);

    try {
      const response = await fetch('/api/public/raise-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription,
          name: formName,
          email: formEmail,
          website: '',
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setFormStatus(payload.error || 'Unable to submit your action right now.');
        setSubmitting(false);
        return;
      }

      setFormTitle('');
      setFormDescription('');
      setFormName('');
      setFormEmail('');
      setFormStatus('Your action has been submitted for the club to review.');
    } catch (submitError) {
      setFormStatus('Unable to submit your action right now.');
    }

    setSubmitting(false);
  };

  const submitTaskAssignmentForJob = async (
    event: React.FormEvent<HTMLFormElement>,
    taskLabel: string,
  ) => {
    event.preventDefault();

    if (!taskLabel.trim()) {
      setTaskAssignmentStatusByJob((current) => ({
        ...current,
        [taskLabel]: 'Please choose a valid task.',
      }));
      return;
    }

    const assigneeName = (taskAssignmentNamesByJob[taskLabel] || '').trim();
    const assignmentNotes = (taskAssignmentNotesByJob[taskLabel] || '').trim();
    const attachments = taskAssignmentAttachmentsByJob[taskLabel] || [];

    if (!assigneeName || !assignmentNotes) {
      setTaskAssignmentStatusByJob((current) => ({
        ...current,
        [taskLabel]: 'Please enter your name and notes for this task.',
      }));
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

    setSubmittingTaskAssignmentByJob((current) => ({
      ...current,
      [taskLabel]: true,
    }));
    setTaskAssignmentStatusByJob((current) => ({
      ...current,
      [taskLabel]: null,
    }));

    const uploadedAttachmentLines: string[] = [];

    try {
      for (const file of attachments) {
        const base64Data = await fileToBase64(file);

        const uploadResponse = await fetch('/api/public/upload-job-club-attachment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            base64Data,
            website: '',
          }),
        });

        const uploadPayload = await uploadResponse.json();

        if (!uploadResponse.ok || !uploadPayload.ok || !uploadPayload.url) {
          setTaskAssignmentStatusByJob((current) => ({
            ...current,
            [taskLabel]: uploadPayload.error || `Unable to upload ${file.name}.`,
          }));
          setSubmittingTaskAssignmentByJob((current) => ({
            ...current,
            [taskLabel]: false,
          }));
          return;
        }

        uploadedAttachmentLines.push(`- ${file.name}: ${uploadPayload.url}`);
      }
    } catch {
      setTaskAssignmentStatusByJob((current) => ({
        ...current,
        [taskLabel]: 'Unable to upload one or more attachments right now.',
      }));
      setSubmittingTaskAssignmentByJob((current) => ({
        ...current,
        [taskLabel]: false,
      }));
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: assigneeName,
          notes: assignmentNote,
          jobClubPostId: null,
          website: '',
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setTaskAssignmentStatusByJob((current) => ({
          ...current,
          [taskLabel]: payload.error || 'Unable to submit your task assignment right now.',
        }));
        setSubmittingTaskAssignmentByJob((current) => ({
          ...current,
          [taskLabel]: false,
        }));
        return;
      }

      setTaskAssignmentNotesByJob((current) => ({
        ...current,
        [taskLabel]: '',
      }));
      setTaskAssignmentAttachmentsByJob((current) => ({
        ...current,
        [taskLabel]: [],
      }));
      setTaskAssignmentStatusByJob((current) => ({
        ...current,
        [taskLabel]: 'Thanks, you have been assigned to this task and your notes were sent to trustees.',
      }));
      setTaskAssignments((current) => [
        {
          taskLabel,
          assignee: assigneeName,
          notes: assignmentNotes,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    } catch {
      setTaskAssignmentStatusByJob((current) => ({
        ...current,
        [taskLabel]: 'Unable to submit your task assignment right now.',
      }));
    }

    setSubmittingTaskAssignmentByJob((current) => ({
      ...current,
      [taskLabel]: false,
    }));
  };

  const renderTaskAssignmentDropdown = (item: ClubRefreshJob, compact = false) => {
    const taskLabel = getClubRefreshTaskLabel(item);
    const taskStatus = taskAssignmentStatusByJob[taskLabel];
    const taskAttachments = taskAssignmentAttachmentsByJob[taskLabel] || [];
    const isSubmittingTask = Boolean(submittingTaskAssignmentByJob[taskLabel]);

    return (
      <details className={`mt-2 rounded-lg border border-zinc-200 bg-white ${compact ? 'p-2.5' : 'p-2'}`}>
        <summary className="cursor-pointer list-none text-xs font-semibold text-red-700">
          Actions
        </summary>

        <p className="mt-2 text-xs font-medium text-zinc-600">Assign to me</p>

        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            void submitTaskAssignmentForJob(event, taskLabel);
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor={`task-name-${taskLabel}`}>
              Your name
            </label>
            <input
              id={`task-name-${taskLabel}`}
              value={taskAssignmentNamesByJob[taskLabel] || ''}
              onChange={(event) => {
                setTaskAssignmentNamesByJob((current) => ({
                  ...current,
                  [taskLabel]: event.target.value,
                }));
              }}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor={`task-notes-${taskLabel}`}>
              Notes
            </label>
            <textarea
              id={`task-notes-${taskLabel}`}
              value={taskAssignmentNotesByJob[taskLabel] || ''}
              onChange={(event) => {
                setTaskAssignmentNotesByJob((current) => ({
                  ...current,
                  [taskLabel]: event.target.value,
                }));
              }}
              rows={3}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="Availability, materials you can bring, or support needed"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor={`task-files-${taskLabel}`}>
              Upload receipts/files (optional)
            </label>
            <input
              id={`task-files-${taskLabel}`}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                setTaskAssignmentAttachmentsByJob((current) => ({
                  ...current,
                  [taskLabel]: files,
                }));
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

          {taskStatus && (
            <p className={`text-xs ${taskStatus.includes('Thanks') ? 'text-emerald-700' : 'text-rose-700'}`}>
              {taskStatus}
            </p>
          )}

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

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-red-900 via-red-800 to-red-700 px-6 py-8 text-white sm:px-8">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-red-100">Aldwinians</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">Members Information Hub</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-red-50 sm:text-base">
              Shared updates from the club in one place, including live member actions, previous minutes, and AGM minutes.
            </p>

            <div className="mt-6 flex flex-col items-stretch gap-3 text-sm sm:flex-row sm:flex-wrap sm:items-start">
              <Link
                href="/public/actions"
                className="inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-2 font-medium text-red-800 transition hover:bg-red-50 sm:w-auto"
              >
                View all member actions
              </Link>
              <Link
                href="/public/minutes"
                className="inline-flex w-full items-center justify-center rounded-full border border-red-300/50 px-4 py-2 font-medium text-white transition hover:border-red-100 hover:bg-white/10 sm:w-auto"
              >
                Browse previous minutes
              </Link>
              <Link
                href="/public/agm-minutes"
                className="inline-flex w-full items-center justify-center rounded-full border border-red-300/50 px-4 py-2 font-medium text-white transition hover:border-red-100 hover:bg-white/10 sm:w-auto"
              >
                Browse AGM minutes
              </Link>
              <Link
                href="/public/job-club"
                className="inline-flex w-full items-center justify-center rounded-full border border-red-300/50 px-4 py-2 font-medium text-white transition hover:border-red-100 hover:bg-white/10 sm:w-auto"
              >
                Jump to Job Club
              </Link>
            </div>
          </div>

          <div className="grid gap-4 border-t border-red-100 bg-red-50/60 px-6 py-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Open member actions</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 sm:text-3xl">{actions.length}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Shared minutes</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 sm:text-3xl">{minutes.length}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Shared AGM minutes</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 sm:text-3xl">{agmMinutes.length}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Job Club tasks</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 sm:text-3xl">{allJobClubJobs.length}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            Loading members content...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            Unable to load members content: {error}
          </section>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.9fr]">
            <div className="grid gap-8">
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">Job Club</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      Job Club has moved to its own page for a cleaner homepage and better mobile experience.
                    </p>
                  </div>
                  <Link
                    href="/public/job-club"
                    className="inline-flex items-center rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800"
                  >
                    Open Job Club
                  </Link>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-600">Open Jobs</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-900">{openJobs.length}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-600">Assigned Jobs</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-900">{assignedJobs.length}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">Raise an Action</h2>
                    <p className="mt-1 text-sm text-zinc-600">Submit an item for the club to review and add to the action tracker.</p>
                  </div>
                </div>

                <form id="raise-action" className="mt-5 space-y-4 scroll-mt-24" onSubmit={submitAction}>
                  <div>
                    <label htmlFor="action-title" className="mb-1 block text-sm font-medium text-zinc-700">
                      Title
                    </label>
                    <input
                      id="action-title"
                      value={formTitle}
                      onChange={(event) => setFormTitle(event.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      placeholder="Brief summary of the action"
                    />
                  </div>

                  <div>
                    <label htmlFor="action-description" className="mb-1 block text-sm font-medium text-zinc-700">
                      Details
                    </label>
                    <textarea
                      id="action-description"
                      value={formDescription}
                      onChange={(event) => setFormDescription(event.target.value)}
                      rows={5}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      placeholder="Add any useful background or context"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="action-name" className="mb-1 block text-sm font-medium text-zinc-700">
                        Your name
                      </label>
                      <input
                        id="action-name"
                        value={formName}
                        onChange={(event) => setFormName(event.target.value)}
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                        placeholder="Optional"
                      />
                    </div>

                    <div>
                      <label htmlFor="action-email" className="mb-1 block text-sm font-medium text-zinc-700">
                        Email
                      </label>
                      <input
                        id="action-email"
                        type="email"
                        value={formEmail}
                        onChange={(event) => setFormEmail(event.target.value)}
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                  />

                  {formStatus && (
                    <p className={`text-sm ${formStatus.includes('submitted') ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formStatus}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                  >
                    {submitting ? 'Submitting...' : 'Submit action'}
                  </button>
                </form>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">Members Actions</h2>
                    <p className="mt-1 text-sm text-zinc-600">Current actions approved for wider member sharing.</p>
                  </div>
                  <Link href="/public/actions" className="text-sm font-medium text-red-700 hover:underline">
                    Full list
                  </Link>
                </div>

                <div className="mt-5 space-y-4">
                  {actions.length === 0 ? (
                    <p className="text-sm text-zinc-500">No member actions are available right now.</p>
                  ) : (
                    actions.slice(0, 6).map((action) => (
                      <article key={action.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-zinc-900">{action.title}</h3>
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                {action.status || 'Open'}
                              </span>
                            </div>
                            {action.description && (
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                                {action.description}
                              </p>
                            )}
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                            {stripPublicMarker(action.source) || 'Action tracker'}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                          <p>
                            <span className="font-medium text-zinc-900">Owner:</span> {action.owner || 'Not assigned'}
                          </p>
                          <p>
                            <span className="font-medium text-zinc-900">Due date:</span> {formatDate(action.due_date, 'No due date')}
                          </p>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="grid gap-8">
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">Previous Minutes</h2>
                    <p className="mt-1 text-sm text-zinc-600">Approved club minutes shared with members.</p>
                  </div>
                  <Link href="/public/minutes" className="text-sm font-medium text-red-700 hover:underline">
                    Full archive
                  </Link>
                </div>

                <div className="mt-5 space-y-4">
                  {minutes.length === 0 ? (
                    <p className="text-sm text-zinc-500">No minutes uploaded yet.</p>
                  ) : (
                    minutes.slice(0, 4).map((minute) => (
                      <article key={minute.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <h3 className="text-base font-semibold text-zinc-900">{minute.title}</h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          Meeting: {formatDate(getMeetingDate(minute), 'No meeting date')}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <a
                            href={minute.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-red-700 hover:underline"
                          >
                            Open minutes
                          </a>
                          <span className="text-zinc-500">
                            {formatDate(minute.created_at, minute.created_at)}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-900">AGM Minutes</h2>
                    <p className="mt-1 text-sm text-zinc-600">Annual general meeting records available for members.</p>
                  </div>
                  <Link href="/public/agm-minutes" className="text-sm font-medium text-red-700 hover:underline">
                    Full archive
                  </Link>
                </div>

                <div className="mt-5 space-y-4">
                  {agmMinutes.length === 0 ? (
                    <p className="text-sm text-zinc-500">No AGM minutes uploaded yet.</p>
                  ) : (
                    agmMinutes.slice(0, 4).map((minute) => (
                      <article key={minute.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <h3 className="text-base font-semibold text-zinc-900">{minute.title}</h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          Meeting: {formatDate(getMeetingDate(minute), 'No meeting date')}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <a
                            href={minute.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-red-700 hover:underline"
                          >
                            Open AGM minutes
                          </a>
                          <span className="text-zinc-500">
                            {formatDate(minute.created_at, minute.created_at)}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}