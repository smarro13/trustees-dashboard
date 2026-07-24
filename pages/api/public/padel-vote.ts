import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { name, vote, website } = req.body ?? {};

  if (website) {
    return res.status(200).json({ ok: true });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ ok: false, error: 'Member name is required' });
  }

  if (vote !== 'yes' && vote !== 'no') {
    return res.status(400).json({ ok: false, error: 'Vote must be yes or no' });
  }

  const cleanName = name.trim();
  const nameKey = normalizeName(cleanName);

  const { error } = await supabaseAdmin
    .from('public_padel_votes')
    .upsert(
      {
        voter_name: cleanName,
        voter_name_key: nameKey,
        vote_yes: vote === 'yes',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'voter_name_key' },
    );

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true });
}
