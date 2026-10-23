import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireSignedInUser } from '../../../lib/apiAuth';
import { addTask, changeTask, deleteTask, listTasks, type StoreResult } from '../../../lib/fireworksStore';

// Fireworks tasks for the committee, at /operations/fireworks: everything the
// volunteers' page can do (pages/api/public/fireworks.ts), plus completed
// tasks, unassign, reopen and delete. Any signed-in dashboard user can view;
// the roles below can make changes.
//
//   GET                                                list all tasks, including completed
//   POST   { area, task, status, priority, needs }     add a task
//   PATCH  { action: save | assign | close | unassign | reopen, id, ... }
//   DELETE { id }                                      delete a task

// Kept local (not imported from lib/roles.ts) because this is a server-side
// API route — see pages/api/private/prematch-meals-orders.ts.
type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | 'dor' | null;

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  if (value === 'director' || value === 'directors' || value === 'management' || value === 'mangement') return 'director';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  if (value === 'dor' || value === 'director of rugby' || value === 'director-of-rugby' || value === 'director_of_rugby') return 'dor';
  return null;
};

const resolveRole = (user: any): DashboardRole =>
  normalizeRole(user?.app_metadata?.role) || normalizeRole(user?.user_metadata?.role);

// The Director of Rugby is limited to the rugby and membership pages.
const VIEW_BLOCKED: DashboardRole[] = ['dor'];
const EDIT_ROLES: DashboardRole[] = ['admin', 'trustee', 'director', 'president', 'commercial'];

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const send = (res: NextApiResponse, result: StoreResult) =>
  'error' in result
    ? res.status(result.status).json({ ok: false, error: result.error })
    : res.status(200).json(result.tasks ? { ok: true, tasks: result.tasks } : { ok: true });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method ?? '')) {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await requireSignedInUser(req, res);
  if (!user) return;
  const role = resolveRole(user);
  if (VIEW_BLOCKED.includes(role)) {
    return res.status(403).json({ ok: false, error: 'Your role cannot see the fireworks tasks.' });
  }

  if (req.method === 'GET') return send(res, await listTasks(supabaseAdmin, true));

  if (!EDIT_ROLES.includes(role)) {
    return res.status(403).json({ ok: false, error: 'Your role can view the fireworks tasks but not change them.' });
  }

  const name = (user.email || '').split('@')[0] || null;
  if (req.method === 'POST') return send(res, await addTask(supabaseAdmin, { ...req.body, createdBy: req.body?.createdBy || name }));
  if (req.method === 'PATCH') return send(res, await changeTask(supabaseAdmin, req.body, true));
  return send(res, await deleteTask(supabaseAdmin, req.body?.id));
}
