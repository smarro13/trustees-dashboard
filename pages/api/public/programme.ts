import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Matchday programme tracking link. The website's "Read it now" button points
// here (…/api/public/programme?src=home); each open is counted in
// programme_opens and the reader is redirected straight to the PDF.
//
// Env: PROGRAMME_PDF_URL (optional) — where to send readers. Defaults to the
// file the website uploads each week.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEFAULT_PDF_URL = 'https://www.aldwinians.co.uk/s/Match-Day-Programme.pdf';

// Link previews (WhatsApp, Facebook, iMessage…) and crawlers fetch the link
// without a person opening it — don't count those.
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|embedly|quora|pinterest|vkshare|headless|lighthouse|curl|wget|python|go-http/i;

const cleanSource = (value: unknown) => {
  const raw = typeof value === 'string' ? value : '';
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  return cleaned || 'direct';
};

const deviceFrom = (ua: string) => {
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'mobile';
  return ua ? 'desktop' : 'unknown';
};

const hostFrom = (referrer: string | undefined) => {
  if (!referrer) return null;
  try { return new URL(referrer).host.slice(0, 100); } catch { return null; }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ua = req.headers['user-agent'] || '';
  const isPrefetch = req.headers['purpose'] === 'prefetch' || req.headers['sec-purpose']?.includes('prefetch');

  if (req.method === 'GET' && !isPrefetch && !BOT_RE.test(ua)) {
    // Never let a logging failure stop someone reading the programme.
    try {
      await supabaseAdmin.from('programme_opens').insert({
        source: cleanSource(req.query.src),
        device: deviceFrom(ua),
        referrer_host: hostFrom(req.headers.referer),
      });
    } catch {
      // ignore
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, process.env.PROGRAMME_PDF_URL || DEFAULT_PDF_URL);
}
