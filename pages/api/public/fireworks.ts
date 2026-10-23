import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { FIREWORKS_CODE_HEADER } from '../../../lib/fireworks';
import { addTask, changeTask, listTasks, type StoreResult } from '../../../lib/fireworksStore';

// Fireworks volunteer tasks, for /public/fireworks. No login, but every
// request must carry the volunteers' access code (FIREWORKS_ACCESS_CODE) in
// the x-fireworks-code header; the table itself is closed to browsers.
//
//   GET                                                       list open tasks
//   POST  { area, task, status, priority, needs, createdBy }  add a task
//   PATCH { action: 'save', id, values }                      edit a task
//   PATCH { action: 'assign', id, name, notes }               assign it to yourself
//   PATCH { action: 'close', id }                             mark it Completed (hides it)
//
// The committee manages the same tasks at /operations/fireworks
// (pages/api/private/fireworks.ts).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const codeMatches = (given: unknown) => {
  const expected = process.env.FIREWORKS_ACCESS_CODE || '';
  if (!expected || typeof given !== 'string') return false;
  // Not case-sensitive, so a volunteer typing it in lower case still gets in.
  const a = Buffer.from(given.trim().toUpperCase());
  const b = Buffer.from(expected.trim().toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
};

const send = (res: NextApiResponse, result: StoreResult) =>
  'error' in result
    ? res.status(result.status).json({ ok: false, error: result.error })
    : res.status(200).json(result.tasks ? { ok: true, tasks: result.tasks } : { ok: true });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method ?? '')) {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!process.env.FIREWORKS_ACCESS_CODE) {
    return res.status(503).json({ ok: false, error: 'The fireworks task list is not set up yet.' });
  }
  if (!codeMatches(req.headers[FIREWORKS_CODE_HEADER])) {
    // A short pause makes guessing the code slow.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return res.status(401).json({ ok: false, error: 'That access code isn’t right.' });
  }

  if (req.method === 'GET') return send(res, await listTasks(supabaseAdmin, false));

  // Bots fill in the hidden "website" field.
  if (req.body?.website) return res.status(200).json({ ok: true });

  if (req.method === 'POST') return send(res, await addTask(supabaseAdmin, req.body));
  return send(res, await changeTask(supabaseAdmin, req.body));
}
