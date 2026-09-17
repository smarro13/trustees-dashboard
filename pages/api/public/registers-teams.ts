import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { data, error } = await supabaseAdmin
    .from('register_teams')
    .select('slug, name, is_protected, sort_order')
    .order('sort_order', { ascending: true });

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  // password_hash is never selected above, so there's nothing sensitive to strip.
  return res.status(200).json({ ok: true, teams: data || [] });
}
