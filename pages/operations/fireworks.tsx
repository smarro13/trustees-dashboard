import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { authJsonHeaders } from '../../lib/authHeaders';
import { resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import {
  FIREWORKS_PRIORITIES,
  FIREWORKS_STATUSES,
  type FireworksPriority,
  type FireworksStatus,
  type FireworksTask,
  type FireworksTaskValues,
} from '../../lib/fireworks';

// Committee view of the fireworks volunteers' tasks: the same list volunteers
// see at /public/fireworks (with the access code), plus completed tasks and
// unassign / reopen / delete. Saved through pages/api/private/fireworks.ts.

const API = '/api/private/fireworks';
const EDIT_ROLES = new Set(['admin', 'trustee', 'director', 'president', 'commercial']);

const input = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none';
const smallButton = 'rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50';

const statusBadge = (status: FireworksStatus) =>
  status === 'Ongoing' ? 'bg-amber-100 text-amber-800' : status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700';
const priorityBadge = (priority: FireworksPriority) =>
  priority === 'High' ? 'bg-rose-100 text-rose-800' : priority === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800';

const blankValues = (): FireworksTaskValues => ({ area: '', task: '', status: 'Not Started', priority: 'Medium', needs: '' });

function TaskFields({ values, onChange, idPrefix }: { values: FireworksTaskValues; onChange: (v: FireworksTaskValues) => void; idPrefix: string }) {
  const set = (patch: Partial<FireworksTaskValues>) => onChange({ ...values, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label htmlFor={`${idPrefix}-area`} className="mb-1 block text-xs font-medium text-zinc-600">Area</label>
        <input id={`${idPrefix}-area`} value={values.area} onChange={(e) => set({ area: e.target.value })} className={input} placeholder="e.g. Bar, Gates, Safety" />
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor={`${idPrefix}-task`} className="mb-1 block text-xs font-medium text-zinc-600">Task</label>
        <input id={`${idPrefix}-task`} value={values.task} onChange={(e) => set({ task: e.target.value })} className={input} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-status`} className="mb-1 block text-xs font-medium text-zinc-600">Status</label>
        <select id={`${idPrefix}-status`} value={values.status} onChange={(e) => set({ status: e.target.value as FireworksStatus })} className={input}>
          {FIREWORKS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-priority`} className="mb-1 block text-xs font-medium text-zinc-600">Priority</label>
        <select id={`${idPrefix}-priority`} value={values.priority} onChange={(e) => set({ priority: e.target.value as FireworksPriority })} className={input}>
          {FIREWORKS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <label htmlFor={`${idPrefix}-needs`} className="mb-1 block text-xs font-medium text-zinc-600">What&rsquo;s needed (optional)</label>
        <input id={`${idPrefix}-needs`} value={values.needs} onChange={(e) => set({ needs: e.target.value })} className={input} placeholder="Equipment, materials, how many people" />
      </div>
    </div>
  );
}

export default function FireworksOperationsPage() {
  const [tasks, setTasks] = useState<FireworksTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const [newValues, setNewValues] = useState<FireworksTaskValues>(blankValues());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<FireworksTaskValues>(blankValues());
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignName, setAssignName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const request = async (method: string, body?: unknown) => {
    const response = await fetch(API, { method, headers: await authJsonHeaders(), body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Something went wrong.');
    return payload;
  };

  const load = async () => {
    try {
      const payload = await request('GET');
      setTasks(payload.tasks ?? []);
    } catch (error: any) {
      setNotice({ type: 'error', message: error.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const role = resolveRoleFromUser(data.user);
      setCanEdit(!!role && EDIT_ROLES.has(role));
      await load();
    })();
  }, []);

  const act = async (id: string, method: string, body: unknown, done: string) => {
    setBusyId(id);
    try {
      await request(method, body);
      setNotice({ type: 'success', message: done });
      setEditingId(null);
      setAssigningId(null);
      await load();
    } catch (error: any) {
      setNotice({ type: 'error', message: error.message });
    }
    setBusyId(null);
  };

  const addTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newValues.area.trim() || !newValues.task.trim()) {
      setNotice({ type: 'error', message: 'Please add the area and the task.' });
      return;
    }
    setAdding(true);
    try {
      await request('POST', newValues);
      setNewValues((v) => ({ ...blankValues(), area: v.area }));
      setNotice({ type: 'success', message: 'Task added.' });
      await load();
    } catch (error: any) {
      setNotice({ type: 'error', message: error.message });
    }
    setAdding(false);
  };

  const visible = useMemo(() => tasks.filter((t) => showCompleted || t.status !== 'Completed'), [tasks, showCompleted]);
  const byArea = useMemo(() => {
    const groups = new Map<string, FireworksTask[]>();
    for (const t of visible) groups.set(t.area, [...(groups.get(t.area) ?? []), t]);
    const rank = (p: FireworksPriority) => FIREWORKS_PRIORITIES.indexOf(p);
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([area, list]) => [area, list.sort((a, b) => rank(a.priority) - rank(b.priority))] as const);
  }, [visible]);

  const open = tasks.filter((t) => t.status !== 'Completed');
  const counts = {
    open: open.length,
    unassigned: open.filter((t) => !t.assigned_to).length,
    high: open.filter((t) => t.priority === 'High').length,
    done: tasks.length - open.length,
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">← Back to Dashboard</Link>
            <h1 className="text-3xl font-extrabold text-zinc-900">🎆 Fireworks tasks</h1>
            <p className="mt-1 text-zinc-600">
              Everything to do for fireworks night. Volunteers see the open tasks at{' '}
              <a href="/public/fireworks" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">/public/fireworks</a>{' '}
              with the access code.
            </p>
          </div>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Open tasks', counts.open],
            ['Unassigned', counts.unassigned],
            ['High priority open', counts.high],
            ['Completed', counts.done],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
            </div>
          ))}
        </section>

        {canEdit && (
          <form onSubmit={addTask} className="mb-8 space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <h2 className="text-lg font-semibold text-zinc-900">Add a task</h2>
            <TaskFields values={newValues} onChange={setNewValues} idPrefix="new" />
            <div className="flex justify-end">
              <button type="submit" disabled={adding} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {adding ? 'Adding…' : 'Add task'}
              </button>
            </div>
          </form>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">Tasks by area</h2>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            Show completed
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : byArea.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">No tasks yet.</p>
        ) : (
          <div className="space-y-6">
            {byArea.map(([area, list]) => (
              <section key={area} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
                <h3 className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">{area}</h3>
                <ul className="divide-y divide-zinc-100">
                  {list.map((t) => (
                    <li key={t.id} className="px-5 py-4">
                      {editingId === t.id ? (
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void act(t.id, 'PATCH', { action: 'save', id: t.id, values: editValues }, 'Task updated.');
                          }}
                        >
                          <TaskFields values={editValues} onChange={setEditValues} idPrefix={`edit-${t.id}`} />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingId(null)} className={smallButton}>Cancel</button>
                            <button type="submit" disabled={busyId === t.id} className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                              {busyId === t.id ? 'Saving…' : 'Save changes'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium ${t.status === 'Completed' ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{t.task}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                              <span className={`rounded-full px-2 py-0.5 font-medium ${statusBadge(t.status)}`}>{t.status}</span>
                              <span className={`rounded-full px-2 py-0.5 font-medium ${priorityBadge(t.priority)}`}>{t.priority}</span>
                              <span className={t.assigned_to ? 'font-semibold text-emerald-700' : 'text-zinc-500'}>
                                {t.assigned_to ? `Assigned to ${t.assigned_to}` : 'Unassigned'}
                              </span>
                            </div>
                            {t.needs && <p className="mt-1.5 text-xs text-zinc-600">Needs: {t.needs}</p>}
                            {t.assigned_notes && <p className="mt-1 text-xs text-zinc-600">Notes: {t.assigned_notes}</p>}
                            {assigningId === t.id && (
                              <form
                                className="mt-2 flex flex-wrap gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void act(t.id, 'PATCH', { action: 'assign', id: t.id, name: assignName }, `Assigned to ${assignName.trim()}.`);
                                }}
                              >
                                <input value={assignName} onChange={(e) => setAssignName(e.target.value)} placeholder="Volunteer's name" className={`${input} max-w-xs py-1.5`} autoFocus />
                                <button type="submit" disabled={busyId === t.id || !assignName.trim()} className={smallButton}>Assign</button>
                                <button type="button" onClick={() => setAssigningId(null)} className={smallButton}>Cancel</button>
                              </form>
                            )}
                          </div>
                          {canEdit && (
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                className={smallButton}
                                onClick={() => {
                                  setEditingId(t.id);
                                  setEditValues({ area: t.area, task: t.task, status: t.status, priority: t.priority, needs: t.needs });
                                }}
                              >
                                Edit
                              </button>
                              {t.assigned_to ? (
                                <button type="button" disabled={busyId === t.id} className={smallButton} onClick={() => act(t.id, 'PATCH', { action: 'unassign', id: t.id }, 'Unassigned.')}>
                                  Unassign
                                </button>
                              ) : (
                                <button type="button" className={smallButton} onClick={() => { setAssigningId(t.id); setAssignName(''); }}>
                                  Assign
                                </button>
                              )}
                              {t.status === 'Completed' ? (
                                <button type="button" disabled={busyId === t.id} className={smallButton} onClick={() => act(t.id, 'PATCH', { action: 'reopen', id: t.id }, 'Task reopened.')}>
                                  Reopen
                                </button>
                              ) : (
                                <button type="button" disabled={busyId === t.id} className={smallButton} onClick={() => act(t.id, 'PATCH', { action: 'close', id: t.id }, 'Task closed.')}>
                                  Close
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busyId === t.id}
                                className={`${smallButton} text-rose-700`}
                                onClick={() => {
                                  if (window.confirm(`Delete "${t.task}"? This can't be undone.`)) void act(t.id, 'DELETE', { id: t.id }, 'Task deleted.');
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
