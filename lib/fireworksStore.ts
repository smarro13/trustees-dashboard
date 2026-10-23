import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanTaskValues, isValidTaskValues, type FireworksTask, type FireworksTaskValues } from './fireworks';

// Server-side reads and writes for public.fireworks_tasks, shared by the
// volunteers' route (pages/api/public/fireworks.ts, access code) and the
// committee's route (pages/api/private/fireworks.ts, dashboard login). Both
// pass a service-role client; the table is closed to browsers.

const TABLE = 'fireworks_tasks';
const COLUMNS = 'id, area, task, status, priority, needs, assigned_to, assigned_notes, created_by, created_at, updated_at';

export type StoreResult = { ok: true; tasks?: FireworksTask[] } | { ok: false; status: number; error: string };

const text = (value: unknown, max = 2000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function listTasks(admin: SupabaseClient, includeCompleted: boolean): Promise<StoreResult> {
  let query = admin.from(TABLE).select(COLUMNS).order('created_at', { ascending: true }).limit(1000);
  if (!includeCompleted) query = query.neq('status', 'Completed');
  const { data, error } = await query;
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, tasks: (data ?? []) as FireworksTask[] };
}

export async function addTask(admin: SupabaseClient, body: any): Promise<StoreResult> {
  const values = {
    area: body?.area,
    task: body?.task,
    status: body?.status,
    priority: body?.priority,
    needs: typeof body?.needs === 'string' ? body.needs : '',
  };
  if (!isValidTaskValues(values)) return { ok: false, status: 400, error: 'Please add the area and the task.' };
  const { error } = await admin.from(TABLE).insert({ ...cleanTaskValues(values), created_by: text(body?.createdBy, 120) || null });
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

// Actions both pages can use: save, assign, close. The committee page can
// also unassign and reopen (allowCommittee).
export async function changeTask(admin: SupabaseClient, body: any, allowCommittee = false): Promise<StoreResult> {
  const { action, id } = body ?? {};
  if (!id || typeof id !== 'string') return { ok: false, status: 400, error: 'Task id is required.' };

  let update: Record<string, unknown>;
  if (action === 'save') {
    if (!isValidTaskValues(body?.values)) return { ok: false, status: 400, error: 'Please add the area and the task.' };
    update = cleanTaskValues(body.values as FireworksTaskValues);
  } else if (action === 'assign') {
    const name = text(body?.name, 120);
    if (!name) return { ok: false, status: 400, error: 'Please enter a name.' };
    update = { assigned_to: name, assigned_notes: text(body?.notes) || null };
  } else if (action === 'close') {
    update = { status: 'Completed' };
  } else if (allowCommittee && action === 'unassign') {
    update = { assigned_to: null, assigned_notes: null };
  } else if (allowCommittee && action === 'reopen') {
    update = { status: 'Not Started' };
  } else {
    return { ok: false, status: 400, error: 'Invalid action.' };
  }

  const { data, error } = await admin
    .from(TABLE)
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data || data.length === 0) return { ok: false, status: 404, error: 'Task not found.' };
  return { ok: true };
}

export async function deleteTask(admin: SupabaseClient, id: unknown): Promise<StoreResult> {
  if (!id || typeof id !== 'string') return { ok: false, status: 400, error: 'Task id is required.' };
  const { error } = await admin.from(TABLE).delete().eq('id', id);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
