import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PUBLIC_ACTION_SOURCE = '[Public] Public website';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { title, description, name, email, website } = req.body ?? {};

  if (website) {
    return res.status(200).json({ ok: true });
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ ok: false, error: 'Title is required' });
  }

  const submitterParts = [name, email]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  const { error } = await supabaseAdmin.from('action_items').insert({
    title: title.trim(),
    description: typeof description === 'string' && description.trim() ? description.trim() : null,
    owner: null,
    due_date: null,
    meeting_id: null,
    source: PUBLIC_ACTION_SOURCE,
    status: 'Open',
    created_by: submitterParts.length > 0 ? submitterParts.join(' | ') : null,
  });

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true });
}