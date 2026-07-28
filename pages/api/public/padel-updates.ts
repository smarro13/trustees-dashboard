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
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { data, error } = await supabaseAdmin
    .from('commercial_transformation_updates')
    .select('id, reporting_period, padel_updates, supporting_evidence_url, created_at')
    .eq('share_padel_to_public', true)
    .or('padel_updates.not.is.null,supporting_evidence_url.not.is.null')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, updates: data || [] });
}
