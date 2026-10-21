import type { SupabaseClient } from '@supabase/supabase-js';

// Server-side helpers for Job Club jobs, shared by the trustee API
// (pages/api/private/job-club-posts.ts) and the public one
// (pages/api/public/job-club-job.ts). A job is a job_club_posts row whose
// description starts with a JOB_META:{...} line.

export type JobStatus = 'Not Started' | 'Ongoing' | 'Completed';
export type JobPriority = 'High' | 'Medium' | 'Low';

export type ParsedJobMeta = {
  area: string;
  job: string;
  status: JobStatus;
  priority: JobPriority;
  materials: string;
};

export const JOB_META_PREFIX = 'JOB_META:';
export const VALID_STATUSES: JobStatus[] = ['Not Started', 'Ongoing', 'Completed'];
export const VALID_PRIORITIES: JobPriority[] = ['High', 'Medium', 'Low'];

export const parseJobMeta = (description: string | null): ParsedJobMeta | null => {
  if (!description) return null;
  const firstLine = description.split('\n')[0]?.trim() ?? '';
  if (!firstLine.startsWith(JOB_META_PREFIX)) return null;

  try {
    const parsed = JSON.parse(firstLine.replace(JOB_META_PREFIX, '').trim()) as Partial<ParsedJobMeta>;
    if (!parsed.area || !parsed.job || !parsed.materials) return null;
    if (!parsed.status || !VALID_STATUSES.includes(parsed.status)) return null;
    if (!parsed.priority || !VALID_PRIORITIES.includes(parsed.priority)) return null;
    return parsed as ParsedJobMeta;
  } catch {
    return null;
  }
};

export const buildDescription = (meta: ParsedJobMeta): string =>
  [
    `${JOB_META_PREFIX}${JSON.stringify(meta)}`,
    '',
    `Area: ${meta.area}`,
    `Job: ${meta.job}`,
    `Status: ${meta.status}`,
    `Priority: ${meta.priority}`,
    `Materials: ${meta.materials}`,
  ].join('\n');

export const normalizeTaskKey = (meta: Pick<ParsedJobMeta, 'area' | 'job'>) =>
  `${meta.area.trim().toLowerCase()}::${meta.job.trim().toLowerCase()}`;

export const normalizeTitleKey = (title: string | null | undefined) =>
  (title || '').trim().toLowerCase();

export const isValidValues = (values: unknown): values is ParsedJobMeta => {
  if (!values || typeof values !== 'object') return false;

  const candidate = values as Partial<ParsedJobMeta>;
  if (!candidate.area || typeof candidate.area !== 'string' || !candidate.area.trim()) return false;
  if (!candidate.job || typeof candidate.job !== 'string' || !candidate.job.trim()) return false;
  if (!candidate.materials || typeof candidate.materials !== 'string' || !candidate.materials.trim()) return false;
  if (!candidate.status || !VALID_STATUSES.includes(candidate.status)) return false;
  if (!candidate.priority || !VALID_PRIORITIES.includes(candidate.priority)) return false;

  return true;
};

export const cleanValues = (values: ParsedJobMeta): ParsedJobMeta => ({
  area: values.area.trim(),
  job: values.job.trim(),
  status: values.status,
  priority: values.priority,
  materials: values.materials.trim(),
});

type JobRow = { id: string; title: string | null; description: string | null };

// The target row plus any duplicates of the same job (same area + job, or the
// same title for rows without JOB_META). The lists show duplicates once, so a
// change has to reach all of them or the old copy reappears.
export async function findMatchingJobRows(
  admin: SupabaseClient,
  id: string,
): Promise<{ ok: true; rows: JobRow[] } | { ok: false; status: number; error: string }> {
  const { data: target, error: targetError } = await admin
    .from('job_club_posts')
    .select('id, title, description')
    .eq('id', id)
    .maybeSingle();

  if (targetError) return { ok: false, status: 500, error: targetError.message };
  if (!target) return { ok: false, status: 404, error: 'Job not found' };

  const meta = parseJobMeta(target.description);
  if (!meta) return { ok: true, rows: [target as JobRow] };

  const taskKey = normalizeTaskKey(meta);
  const titleKey = normalizeTitleKey(`${meta.area} - ${meta.job}`);

  const { data: allRows, error: allRowsError } = await admin
    .from('job_club_posts')
    .select('id, title, description')
    .limit(2000);

  if (allRowsError) return { ok: false, status: 500, error: allRowsError.message };

  const rows = ((allRows || []) as JobRow[]).filter((row) => {
    const rowMeta = parseJobMeta(row.description);
    return rowMeta ? normalizeTaskKey(rowMeta) === taskKey : normalizeTitleKey(row.title) === titleKey;
  });

  return { ok: true, rows: rows.length ? rows : [target as JobRow] };
}
