import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { FIRESTICKS, isYouTubeUrl } from '../../../lib/firesticks';

// Plays a YouTube link on one of the clubhouse Firesticks by calling the Club
// Automation API. Called by /operations/media-screens. The automation key
// stays here on the server — the browser only ever sends the user's Supabase
// token.

// Kept local (not imported from lib/roles.ts) because this is a server-side
// API route — see pages/api/private/prematch-meals-orders.ts.
type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  if (value === 'director' || value === 'directors' || value === 'management' || value === 'mangement') return 'director';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  return null;
};

const resolveRole = (user: any): DashboardRole =>
  normalizeRole(user?.app_metadata?.role) || normalizeRole(user?.user_metadata?.role);

// Same roles that can edit the media screens page.
const LAUNCH_ROLES: DashboardRole[] = ['admin', 'trustee', 'director'];

// What to tell the user for each automation API status; anything else gets a
// generic message. The upstream response body is never passed on.
const UPSTREAM_ERRORS: Record<number, string> = {
  302: 'Cloudflare Access rejected the dashboard. Check the CLUB_AUTOMATION_ACCESS_ settings.',
  401: 'The dashboard’s automation key was rejected. Check CLUB_AUTOMATION_API_KEY.',
  403: 'Cloudflare Access rejected the dashboard. Check the CLUB_AUTOMATION_ACCESS_ settings.',
  422: 'The Firestick service rejected that link.',
  502: 'The playback service rejected the request.',
  503: 'The playback service is unavailable.',
  504: 'The playback service timed out. It may still have started — check the screen before trying again.',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!LAUNCH_ROLES.includes(resolveRole(user))) {
    return res.status(403).json({ ok: false, error: 'Your role cannot launch media on the screens.' });
  }

  const device = typeof req.body?.device === 'string' ? req.body.device : '';
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!FIRESTICKS.some((f) => f.id === device)) {
    return res.status(400).json({ ok: false, error: 'Choose a Firestick.' });
  }
  if (!isYouTubeUrl(url)) {
    return res.status(400).json({ ok: false, error: 'Enter a YouTube link (youtube.com or youtu.be).' });
  }

  const apiUrl = (process.env.CLUB_AUTOMATION_API_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.CLUB_AUTOMATION_API_KEY || '';
  if (!apiUrl || !apiKey) {
    return res.status(500).json({ ok: false, error: 'Firestick playback is not configured on the dashboard.' });
  }

  // The API sits behind Cloudflare Access, which only lets requests carrying
  // this service token through. Unset when calling the API directly in dev.
  const accessId = process.env.CLUB_AUTOMATION_ACCESS_CLIENT_ID || '';
  const accessSecret = process.env.CLUB_AUTOMATION_ACCESS_CLIENT_SECRET || '';
  const accessHeaders: Record<string, string> = accessId && accessSecret
    ? { 'CF-Access-Client-Id': accessId, 'CF-Access-Client-Secret': accessSecret }
    : {};

  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/api/v1/firesticks/play`, {
      method: 'POST',
      // Don't follow a redirect to the Access login page if the token is rejected.
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, ...accessHeaders },
      body: JSON.stringify({ device, url }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return res.status(502).json({ ok: false, error: 'Could not reach the Firestick playback service.' });
  }

  if (!upstream.ok) {
    console.error(`Firestick playback failed: automation API returned ${upstream.status}`);
    return res.status(502).json({
      ok: false,
      error: UPSTREAM_ERRORS[upstream.status] ?? 'The Firestick playback service returned an error.',
    });
  }

  return res.status(200).json({ ok: true });
}
