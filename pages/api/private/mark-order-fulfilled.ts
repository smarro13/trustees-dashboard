import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Shared by both Pre-Match Meals and 90th Anniversary Ties — both are plain
// Squarespace-orders read-throughs (lib/prematchMeals.ts / lib/anniversaryTies.ts)
// with no table of their own, so there's nothing product-specific to this route.
//
// Kept local (not imported from lib/roles.ts) because this is a server-side
// API route — see lib/presidentPermissions.ts note on why client-side
// Supabase helpers aren't imported into API routes.
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

// Same roles allowed to view Pre-Match Meals / 90th Anniversary Ties
// analytics (prematch-meals-orders.ts / anniversary-ties-orders.ts) — whoever
// can see the orders can check them off as collected.
const ALLOWED_ROLES: DashboardRole[] = ['admin', 'trustee', 'director', 'president', 'commercial'];

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !requestingUser) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const role = resolveRole(requestingUser);
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'orderId is required' });
  }

  const apiKey = process.env.SQUARESPACE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'SQUARESPACE_API_KEY is not configured on the server.' });
  }

  try {
    // Squarespace's fulfillment API works at the ORDER level, not per line
    // item — this marks every item on the order as fulfilled, not just the
    // meal/tie line. shouldSendNotification is deliberately false: these are
    // match-day pickup items, not shipped goods, so buyers shouldn't get
    // Squarespace's "your order has shipped" email.
    const response = await fetch(
      `https://api.squarespace.com/1.0/commerce/orders/${encodeURIComponent(orderId)}/fulfillments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Aldwinians Trustees Dashboard (order fulfillment)',
        },
        body: JSON.stringify({ shouldSendNotification: false }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return res.status(502).json({ ok: false, error: `Squarespace API error ${response.status}: ${body || response.statusText}` });
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('Mark order fulfilled error:', err);
    return res.status(502).json({ ok: false, error: err?.message || 'Failed to update the order in Squarespace.' });
  }
}
