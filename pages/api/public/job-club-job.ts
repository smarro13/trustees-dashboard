import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const JOB_META_PREFIX = 'JOB_META:';

type JobStatus = 'Not Started' | 'Ongoing' | 'Completed';
type JobPriority = 'High' | 'Medium' | 'Low';

const isValidStatus = (value: unknown): value is JobStatus =>
  value === 'Not Started' || value === 'Ongoing' || value === 'Completed';

const isValidPriority = (value: unknown): value is JobPriority =>
  value === 'High' || value === 'Medium' || value === 'Low';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const {
    area,
    job,
    status,
    priority,
    materials,
    submittedBy,
    website,
  } = req.body ?? {};

  if (website) {
    return res.status(200).json({ ok: true });
  }

  if (!area || typeof area !== 'string' || !area.trim()) {
    return res.status(400).json({ ok: false, error: 'Area is required' });
  }

  if (!job || typeof job !== 'string' || !job.trim()) {
    return res.status(400).json({ ok: false, error: 'Job is required' });
  }

  if (!materials || typeof materials !== 'string' || !materials.trim()) {
    return res.status(400).json({ ok: false, error: 'Materials are required' });
  }

  if (!isValidStatus(status)) {
    return res.status(400).json({ ok: false, error: 'Status is invalid' });
  }

  if (!isValidPriority(priority)) {
    return res.status(400).json({ ok: false, error: 'Priority is invalid' });
  }

  const metaPayload = {
    area: area.trim(),
    job: job.trim(),
    status,
    priority,
    materials: materials.trim(),
  };

  const descriptionLines = [
    `${JOB_META_PREFIX}${JSON.stringify(metaPayload)}`,
    '',
    `Area: ${metaPayload.area}`,
    `Job: ${metaPayload.job}`,
    `Status: ${metaPayload.status}`,
    `Priority: ${metaPayload.priority}`,
    `Materials: ${metaPayload.materials}`,
  ];

  const { error } = await supabaseAdmin.from('job_club_posts').insert({
    title: `${metaPayload.area} - ${metaPayload.job}`,
    description: descriptionLines.join('\n'),
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
