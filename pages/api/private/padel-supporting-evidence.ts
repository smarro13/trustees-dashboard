import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser, supabaseAdmin } from '../../../lib/serverAuth';

type EvidencePayload = {
  urls: string[];
};

const normalizeUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('public_padel_supporting_evidence')
      .select('urls')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, urls: normalizeUrls(data?.urls) });
  }

  const payload = req.body as EvidencePayload | null;
  const urls = normalizeUrls(payload?.urls);

  const { error } = await supabaseAdmin
    .from('public_padel_supporting_evidence')
    .upsert(
      {
        id: 1,
        urls,
        updated_by: user.email || user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, urls });
}
