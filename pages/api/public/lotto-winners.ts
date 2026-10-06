import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Presidents Lotto past winners for the public website's lotto page
// (aldwinians.co.uk/presidents-lottery). Reads the draws saved from
// /agenda/presidents-lotto and returns names as first initial + surname
// ("John Smith" -> "J. Smith"); full names never leave the server.
//
// GET /api/public/lotto-winners?limit=12  (limit 1–50, default 12)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const shortName = (raw: string | null) => {
  const parts = (raw || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0].charAt(0).toUpperCase()}. ${parts[parts.length - 1]}`;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // The website is a different origin (Squarespace), and the data is public.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requested = Number.parseInt(String(req.query.limit ?? ''), 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 50) : 12;

  const { data, error } = await supabaseAdmin
    .from('presidents_lotto_draws')
    .select('first_place, second_place, third_place, drawn_at')
    .order('drawn_at', { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(500).json({ ok: false, error: 'Could not load winners' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json({
    ok: true,
    draws: (data || []).map((d) => ({
      drawn_at: d.drawn_at,
      first: shortName(d.first_place),
      second: shortName(d.second_place),
      third: shortName(d.third_place),
    })),
  });
}
