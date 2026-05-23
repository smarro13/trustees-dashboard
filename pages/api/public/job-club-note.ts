import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { name, notes, jobClubPostId, website } = req.body ?? {};

  if (website) {
    return res.status(200).json({ ok: true });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ ok: false, error: 'Name is required' });
  }

  if (!notes || typeof notes !== 'string' || !notes.trim()) {
    return res.status(400).json({ ok: false, error: 'Notes are required' });
  }

  const payload = {
    name: name.trim(),
    notes: notes.trim(),
    job_club_post_id:
      typeof jobClubPostId === 'string' && jobClubPostId.trim().length > 0
        ? jobClubPostId.trim()
        : null,
  };

  const { error } = await supabaseAdmin.from('job_club_notes').insert(payload);

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true });
}
