import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser, supabaseAdmin } from '../../../lib/serverAuth';

type JobStatus = 'Not Started' | 'Ongoing' | 'Completed';
type JobPriority = 'High' | 'Medium' | 'Low';

type ParsedJobMeta = {
  area: string;
  job: string;
  status: JobStatus;
  priority: JobPriority;
  materials: string;
};

type SavePayload = {
  action: 'save';
  id: string;
  values: ParsedJobMeta;
};

type TogglePayload = {
  action: 'toggle-active';
  id: string;
  nextIsActive: boolean;
};

const JOB_META_PREFIX = 'JOB_META:';

const VALID_STATUSES: JobStatus[] = ['Not Started', 'Ongoing', 'Completed'];
const VALID_PRIORITIES: JobPriority[] = ['High', 'Medium', 'Low'];

const parseJobMeta = (description: string | null): ParsedJobMeta | null => {
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

const buildDescription = (meta: ParsedJobMeta): string =>
  [
    `${JOB_META_PREFIX}${JSON.stringify(meta)}`,
    '',
    `Area: ${meta.area}`,
    `Job: ${meta.job}`,
    `Status: ${meta.status}`,
    `Priority: ${meta.priority}`,
    `Materials: ${meta.materials}`,
  ].join('\n');

const normalizeTaskKey = (meta: Pick<ParsedJobMeta, 'area' | 'job'>) =>
  `${meta.area.trim().toLowerCase()}::${meta.job.trim().toLowerCase()}`;

const normalizeTitleKey = (title: string | null | undefined) =>
  (title || '').trim().toLowerCase();

const isValidValues = (values: unknown): values is ParsedJobMeta => {
  if (!values || typeof values !== 'object') return false;

  const candidate = values as Partial<ParsedJobMeta>;
  if (!candidate.area || typeof candidate.area !== 'string') return false;
  if (!candidate.job || typeof candidate.job !== 'string') return false;
  if (!candidate.materials || typeof candidate.materials !== 'string') return false;
  if (!candidate.status || !VALID_STATUSES.includes(candidate.status)) return false;
  if (!candidate.priority || !VALID_PRIORITIES.includes(candidate.priority)) return false;

  return true;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'PATCH') {
    const payload = req.body as SavePayload | TogglePayload;

    if (!payload?.id || typeof payload.id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Post id is required' });
    }

    if (payload.action === 'save') {
      if (!isValidValues(payload.values)) {
        return res.status(400).json({ ok: false, error: 'Invalid job values' });
      }

      const values = payload.values;
      const cleaned: ParsedJobMeta = {
        area: values.area.trim(),
        job: values.job.trim(),
        status: values.status,
        priority: values.priority,
        materials: values.materials.trim(),
      };

      const { error } = await supabaseAdmin
        .from('job_club_posts')
        .update({
          title: `${cleaned.area} - ${cleaned.job}`,
          description: buildDescription(cleaned),
        })
        .eq('id', payload.id);

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(200).json({ ok: true });
    }

    if (payload.action === 'toggle-active') {
      const { data: targetPost, error: targetError } = await supabaseAdmin
        .from('job_club_posts')
        .select('id, title, description')
        .eq('id', payload.id)
        .maybeSingle();

      if (targetError) {
        return res.status(500).json({ ok: false, error: targetError.message });
      }

      if (!targetPost) {
        return res.status(404).json({ ok: false, error: 'Job not found' });
      }

      const meta = parseJobMeta(targetPost.description);
      if (!meta) {
        const { error } = await supabaseAdmin
          .from('job_club_posts')
          .update({ is_active: payload.nextIsActive })
          .eq('id', payload.id);

        if (error) {
          return res.status(500).json({ ok: false, error: error.message });
        }

        return res.status(200).json({ ok: true, updatedCount: 1 });
      }

      const taskKey = normalizeTaskKey(meta);
      const titleKey = normalizeTitleKey(`${meta.area} - ${meta.job}`);

      const { data: allRows, error: allRowsError } = await supabaseAdmin
        .from('job_club_posts')
        .select('id, title, description')
        .limit(2000);

      if (allRowsError) {
        return res.status(500).json({ ok: false, error: allRowsError.message });
      }

      const matchingRows = (allRows || []).filter((row) => {
        const rowMeta = parseJobMeta(row.description);
        if (rowMeta) {
          return normalizeTaskKey(rowMeta) === taskKey;
        }

        return normalizeTitleKey(row.title) === titleKey;
      });

      if (matchingRows.length === 0) {
        return res.status(404).json({ ok: false, error: 'No matching jobs found to update' });
      }

      for (const row of matchingRows) {
        const rowMeta = parseJobMeta(row.description);
        if (!rowMeta) {
          const { error } = await supabaseAdmin
            .from('job_club_posts')
            .update({ is_active: payload.nextIsActive })
            .eq('id', row.id);
          if (error) {
            return res.status(500).json({ ok: false, error: error.message });
          }
          continue;
        }

        const nextMeta: ParsedJobMeta = {
          ...rowMeta,
          status: payload.nextIsActive
            ? (rowMeta.status === 'Completed' ? 'Ongoing' : rowMeta.status)
            : 'Completed',
        };

        const { error } = await supabaseAdmin
          .from('job_club_posts')
          .update({
            is_active: payload.nextIsActive,
            title: `${nextMeta.area} - ${nextMeta.job}`,
            description: buildDescription(nextMeta),
          })
          .eq('id', row.id);

        if (error) {
          return res.status(500).json({ ok: false, error: error.message });
        }
      }

      return res.status(200).json({ ok: true, updatedCount: matchingRows.length });
    }

    return res.status(400).json({ ok: false, error: 'Invalid action' });
  }

  const { id } = (req.body || {}) as { id?: unknown };

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Post id is required' });
  }

  const { error } = await supabaseAdmin.from('job_club_posts').delete().eq('id', id);
  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true });
}
