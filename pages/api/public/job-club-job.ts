import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  buildDescription,
  cleanValues,
  findMatchingJobRows,
  isValidValues,
  parseJobMeta,
  type ParsedJobMeta,
} from '../../../lib/jobClubPosts';

// Public Job Club (no login), used by /public and /public/job-club:
//   POST  { area, job, status, priority, materials, submittedBy }  add a job
//   PATCH { action: 'save', id, values }                           edit a job
//   PATCH { action: 'close', id }                                  close a job
// Closing marks the job Completed and hides it (is_active = false), the same
// as "Close" on the trustee Job Club page, which can re-open it.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function addJob(req: NextApiRequest, res: NextApiResponse) {
  const { area, job, status, priority, materials, submittedBy } = req.body ?? {};

  if (!area || typeof area !== 'string' || !area.trim()) {
    return res.status(400).json({ ok: false, error: 'Area is required' });
  }

  if (!job || typeof job !== 'string' || !job.trim()) {
    return res.status(400).json({ ok: false, error: 'Job is required' });
  }

  if (!materials || typeof materials !== 'string' || !materials.trim()) {
    return res.status(400).json({ ok: false, error: 'Materials are required' });
  }

  const values = { area, job, status, priority, materials };
  if (!isValidValues(values)) {
    return res.status(400).json({ ok: false, error: 'Status or priority is invalid' });
  }

  const meta = cleanValues(values);

  const { error } = await supabaseAdmin.from('job_club_posts').insert({
    title: `${meta.area} - ${meta.job}`,
    description: buildDescription(meta),
    contact:
      typeof submittedBy === 'string' && submittedBy.trim().length > 0
        ? submittedBy.trim()
        : null,
    link_url: null,
    is_active: true,
  });

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true });
}

async function changeJob(req: NextApiRequest, res: NextApiResponse) {
  const { action, id, values } = req.body ?? {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Job id is required' });
  }
  if (action !== 'save' && action !== 'close') {
    return res.status(400).json({ ok: false, error: 'Invalid action' });
  }
  if (action === 'save' && !isValidValues(values)) {
    return res.status(400).json({ ok: false, error: 'Please fill in area, job and materials.' });
  }

  const match = await findMatchingJobRows(supabaseAdmin, id);
  if ('error' in match) {
    return res.status(match.status).json({ ok: false, error: match.error });
  }

  // Only Job Club jobs can be changed from the public page.
  const jobRows = match.rows.filter((row) => parseJobMeta(row.description));
  if (jobRows.length === 0) {
    return res.status(404).json({ ok: false, error: 'Job not found' });
  }

  for (const row of jobRows) {
    const current = parseJobMeta(row.description) as ParsedJobMeta;
    const next: ParsedJobMeta =
      action === 'save' ? cleanValues(values as ParsedJobMeta) : { ...current, status: 'Completed' };

    const { error } = await supabaseAdmin
      .from('job_club_posts')
      .update({
        title: `${next.area} - ${next.job}`,
        description: buildDescription(next),
        // Saving as Completed closes it too; otherwise an edit keeps it open.
        is_active: next.status !== 'Completed',
      })
      .eq('id', row.id);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  return res.status(200).json({ ok: true, updatedCount: jobRows.length });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Honeypot: bots fill in the hidden "website" field.
  if (req.body?.website) {
    return res.status(200).json({ ok: true });
  }

  return req.method === 'POST' ? addJob(req, res) : changeJob(req, res);
}
