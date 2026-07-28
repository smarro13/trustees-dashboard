import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

const getBearerToken = (authHeader: string | undefined) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice('Bearer '.length).trim();
};

const ensureAuthorized = async (req: NextApiRequest, res: NextApiResponse) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  return user;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await ensureAuthorized(req, res);
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
