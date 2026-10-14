import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type User } from '@supabase/supabase-js';

// proxy.ts doesn't run for /api routes (its matcher excludes them), so any
// route that isn't meant to be public has to check the caller itself.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

/**
 * Returns the signed-in user for this request, or sends a 401 and returns null.
 * Usage: `const user = await requireSignedInUser(req, res); if (!user) return;`
 */
export const requireSignedInUser = async (
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<User | null> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'You need to be logged in to do this.' });
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    return null;
  }

  return data.user;
};
