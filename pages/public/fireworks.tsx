import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import PublicSectionNav from '../../components/PublicSectionNav';
import {
  FIREWORKS_CODE_HEADER,
  FIREWORKS_CODE_STORAGE_KEY,
  FIREWORKS_PRIORITIES,
  FIREWORKS_STATUSES,
  type FireworksPriority,
  type FireworksStatus,
  type FireworksTask,
  type FireworksTaskValues,
} from '../../lib/fireworks';

// Fireworks volunteer task list. Laid out like /public/job-club, but nothing is
// shown until the volunteers' access code is entered; the code is checked on
// the server for every request (pages/api/public/fireworks.ts) and remembered
// in this browser so it only has to be typed once.

const API = '/api/public/fireworks';

const field =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100';
const smallField =
  'w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100';
const label = 'mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600';
const smallLabel = 'mb-1 block text-xs font-medium text-zinc-700';
const pillButton =
  'inline-flex items-center rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:border-red-300 hover:text-red-700 disabled:opacity-50';
const redButton =
  'inline-flex items-center rounded-full bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300';

const statusBadge = (status: FireworksStatus) =>
  status === 'Ongoing' ? 'bg-amber-100 text-amber-800' : status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700';
const priorityBadge = (priority: FireworksPriority) =>
  priority === 'High' ? 'bg-rose-100 text-rose-800' : priority === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800';

const readStoredCode = () => {
  try {
    return localStorage.getItem(FIREWORKS_CODE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};
const storeCode = (code: string | null) => {
  try {
    if (code) localStorage.setItem(FIREWORKS_CODE_STORAGE_KEY, code);
    else localStorage.removeItem(FIREWORKS_CODE_STORAGE_KEY);
  } catch {
    // Private window etc.: they'll just type it again next time.
  }
};

const blankValues = (): FireworksTaskValues => ({ area: '', task: '', status: 'Not Started', priority: 'Medium', needs: '' });

type Message = { id: string; ok: boolean; text: string } | null;

export default function PublicFireworksPage() {
  const [code, setCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<FireworksTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [areaFilter, setAreaFilter] = useState('All areas');
  const [statusFilter, setStatusFilter] = useState<'All statuses' | FireworksStatus>('All statuses');
  const [priorityFilter, setPriorityFilter] = useState<'All priorities' | FireworksPriority>('All priorities');

  const [newTask, setNewTask] = useState<FireworksTaskValues>(blankValues());
  const [newTaskBy, setNewTaskBy] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMessage, setAddMessage] = useState<Message>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<FireworksTaskValues | null>(null);
  const [assignName, setAssignName] = useState<Record<string, string>>({});
  const [assignNotes, setAssignNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState<Message>(null);

  const call = async (accessCode: string, method: string, body?: unknown) => {
    const response = await fetch(API, {
      method,
      headers: { [FIREWORKS_CODE_HEADER]: accessCode, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify({ ...(body as object), website: '' }) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok && payload.ok, payload };
  };

  const loadTasks = async (accessCode: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await call(accessCode, 'GET');
      if (result.status === 401) {
        // The code has changed since it was saved here.
        storeCode(null);
        setCode(null);
        setCodeError('The access code has changed. Please enter the new one.');
      } else if (!result.ok) {
        setLoadError(result.payload.error || 'Unable to load the tasks right now.');
      } else {
        setTasks(result.payload.tasks ?? []);
      }
    } catch {
      setLoadError('Unable to load the tasks right now.');
    }
    setLoading(false);
  };

  useEffect(() => {
    const saved = readStoredCode();
    if (saved) {
      setCode(saved);
      void loadTasks(saved);
    }
  }, []);

  const submitCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entered = codeInput.trim();
    if (!entered) return;
    setCheckingCode(true);
    setCodeError(null);
    try {
      const result = await call(entered, 'GET');
      if (!result.ok) {
        setCodeError(result.payload.error || 'That access code isn’t right.');
      } else {
        storeCode(entered);
        setCode(entered);
        setTasks(result.payload.tasks ?? []);
        setCodeInput('');
      }
    } catch {
      setCodeError('Unable to check the code right now.');
    }
    setCheckingCode(false);
  };

  const forgetCode = () => {
    storeCode(null);
    setCode(null);
    setTasks([]);
  };

  const areas = useMemo(() => ['All areas', ...Array.from(new Set(tasks.map((t) => t.area))).sort()], [tasks]);
  const matches = (t: FireworksTask) =>
    (areaFilter === 'All areas' || t.area === areaFilter) &&
    (statusFilter === 'All statuses' || t.status === statusFilter) &&
    (priorityFilter === 'All priorities' || t.priority === priorityFilter);
  const priorityRank = (p: FireworksPriority) => FIREWORKS_PRIORITIES.indexOf(p);
  const sorted = useMemo(() => [...tasks].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)), [tasks]);
  const unassigned = sorted.filter((t) => !t.assigned_to && matches(t));
  const assigned = sorted.filter((t) => t.assigned_to && matches(t));

  const changeTask = async (task: FireworksTask, body: Record<string, unknown>, done: string) => {
    if (!code) return;
    setBusyId(task.id);
    setTaskMessage(null);
    try {
      const result = await call(code, 'PATCH', { ...body, id: task.id });
      if (!result.ok) {
        setTaskMessage({ id: task.id, ok: false, text: result.payload.error || 'Unable to update this task right now.' });
      } else {
        setEditingId(null);
        setEditValues(null);
        setTaskMessage({ id: task.id, ok: true, text: done });
        await loadTasks(code);
      }
    } catch {
      setTaskMessage({ id: task.id, ok: false, text: 'Unable to update this task right now.' });
    }
    setBusyId(null);
  };

  const saveEdit = (event: React.FormEvent<HTMLFormElement>, task: FireworksTask) => {
    event.preventDefault();
    if (!editValues?.area.trim() || !editValues.task.trim()) {
      setTaskMessage({ id: task.id, ok: false, text: 'Please add the area and the task.' });
      return;
    }
    void changeTask(task, { action: 'save', values: editValues }, 'Task updated.');
  };

  const assign = (event: React.FormEvent<HTMLFormElement>, task: FireworksTask) => {
    event.preventDefault();
    const name = (assignName[task.id] ?? '').trim();
    if (!name) {
      setTaskMessage({ id: task.id, ok: false, text: 'Please enter your name.' });
      return;
    }
    void changeTask(task, { action: 'assign', name, notes: assignNotes[task.id] ?? '' }, `Thanks ${name}, this task is yours.`);
  };

  const close = (task: FireworksTask) => {
    if (!window.confirm(`Close "${task.task}"? It will be marked Completed and removed from the list.`)) return;
    void changeTask(task, { action: 'close' }, 'Task closed.');
  };

  const addTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code) return;
    if (!newTask.area.trim() || !newTask.task.trim()) {
      setAddMessage({ id: 'add', ok: false, text: 'Please add the area and the task.' });
      return;
    }
    setAdding(true);
    setAddMessage(null);
    try {
      const result = await call(code, 'POST', { ...newTask, createdBy: newTaskBy });
      if (!result.ok) {
        setAddMessage({ id: 'add', ok: false, text: result.payload.error || 'Unable to add this task right now.' });
      } else {
        setNewTask(blankValues());
        setNewTaskBy('');
        setAddMessage({ id: 'add', ok: true, text: 'Task added.' });
        await loadTasks(code);
      }
    } catch {
      setAddMessage({ id: 'add', ok: false, text: 'Unable to add this task right now.' });
    }
    setAdding(false);
  };

  const renderEditForm = (task: FireworksTask) => {
    if (!editValues) return null;
    const set = (patch: Partial<FireworksTaskValues>) => setEditValues((v) => (v ? { ...v, ...patch } : v));
    return (
      <form className="mt-3 space-y-3" onSubmit={(e) => saveEdit(e, task)}>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={smallLabel} htmlFor={`edit-area-${task.id}`}>Area</label>
            <input id={`edit-area-${task.id}`} value={editValues.area} onChange={(e) => set({ area: e.target.value })} className={smallField} />
          </div>
          <div>
            <label className={smallLabel} htmlFor={`edit-status-${task.id}`}>Status</label>
            <select id={`edit-status-${task.id}`} value={editValues.status} onChange={(e) => set({ status: e.target.value as FireworksStatus })} className={smallField}>
              {FIREWORKS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={smallLabel} htmlFor={`edit-task-${task.id}`}>Task</label>
          <input id={`edit-task-${task.id}`} value={editValues.task} onChange={(e) => set({ task: e.target.value })} className={smallField} />
        </div>
        <div>
          <label className={smallLabel} htmlFor={`edit-priority-${task.id}`}>Priority</label>
          <select id={`edit-priority-${task.id}`} value={editValues.priority} onChange={(e) => set({ priority: e.target.value as FireworksPriority })} className={smallField}>
            {FIREWORKS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={smallLabel} htmlFor={`edit-needs-${task.id}`}>What&rsquo;s needed</label>
          <textarea id={`edit-needs-${task.id}`} rows={3} value={editValues.needs} onChange={(e) => set({ needs: e.target.value })} className={smallField} />
        </div>
        {editValues.status === 'Completed' && (
          <p className="text-xs text-zinc-600">Saving as Completed closes the task and removes it from the list.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busyId === task.id} className={redButton}>
            {busyId === task.id ? 'Saving...' : 'Save changes'}
          </button>
          <button type="button" onClick={() => { setEditingId(null); setEditValues(null); }} className={pillButton}>
            Cancel
          </button>
        </div>
      </form>
    );
  };

  const renderCard = (task: FireworksTask) => {
    const editing = editingId === task.id;
    const busy = busyId === task.id;
    const message = taskMessage?.id === task.id ? taskMessage : null;
    return (
      <article key={task.id} className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{task.area}</p>
        <h3 className="mt-1 text-sm font-semibold text-zinc-900">{task.task}</h3>
        {task.assigned_to && <p className="mt-2 text-xs font-semibold text-emerald-700">Assigned to: {task.assigned_to}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(task.status)}`}>{task.status}</span>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${priorityBadge(task.priority)}`}>{task.priority}</span>
        </div>
        {task.needs && <p className="mt-2 text-xs text-zinc-600">Needs: {task.needs}</p>}
        {task.assigned_notes && <p className="mt-1 text-xs text-zinc-600">Notes: {task.assigned_notes}</p>}

        <details open={editing || undefined} className="mt-2 rounded-lg border border-zinc-200 bg-white p-2.5">
          <summary className="cursor-pointer list-none text-xs font-semibold text-red-700">Actions</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {!editing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditingId(task.id);
                  setEditValues({ area: task.area, task: task.task, status: task.status, priority: task.priority, needs: task.needs });
                  setTaskMessage(null);
                }}
                className={pillButton}
              >
                Edit task
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => close(task)} className={pillButton}>
              {busy && !editing ? 'Closing...' : 'Close task'}
            </button>
          </div>
          {message && <p className={`mt-2 text-xs ${message.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</p>}

          {editing ? renderEditForm(task) : (
            <form className="mt-3 space-y-3" onSubmit={(e) => assign(e, task)}>
              <p className="text-xs font-medium text-zinc-600">{task.assigned_to ? 'Take over this task' : 'Assign to me'}</p>
              <div>
                <label className={smallLabel} htmlFor={`assign-name-${task.id}`}>Your name</label>
                <input
                  id={`assign-name-${task.id}`}
                  value={assignName[task.id] ?? ''}
                  onChange={(e) => setAssignName((c) => ({ ...c, [task.id]: e.target.value }))}
                  className={smallField}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className={smallLabel} htmlFor={`assign-notes-${task.id}`}>Notes (optional)</label>
                <textarea
                  id={`assign-notes-${task.id}`}
                  rows={2}
                  value={assignNotes[task.id] ?? ''}
                  onChange={(e) => setAssignNotes((c) => ({ ...c, [task.id]: e.target.value }))}
                  className={smallField}
                  placeholder="When you're available, what you can bring"
                />
              </div>
              <button type="submit" disabled={busy} className={redButton}>
                {busy ? 'Saving...' : task.assigned_to ? 'Take it over' : 'Assign to me'}
              </button>
            </form>
          )}
        </details>
      </article>
    );
  };

  const taskGroup = (title: string, list: FireworksTask[], emptyText: string, first = false) => (
    <section className={`${first ? '' : 'mt-5 '}rounded-2xl border border-zinc-200 bg-zinc-50 p-4`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">{list.length}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-500 md:col-span-2 xl:col-span-3">{emptyText}</p>
        ) : (
          list.map(renderCard)
        )}
      </div>
    </section>
  );

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <Head>
        <title>Fireworks volunteers — Aldwinians</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Aldwinians</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">🎆 Fireworks volunteers</h1>
              <p className="mt-2 text-sm text-zinc-600">Tasks for the fireworks night: pick one up, add new ones, and close them when they&rsquo;re done.</p>
            </div>
            {code && (
              <div className="flex flex-wrap gap-2">
                <a href="#add-task-form" className="inline-flex items-center rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800">
                  Add task
                </a>
                <button type="button" onClick={forgetCode} className="inline-flex items-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-red-300 hover:text-red-700">
                  Lock
                </button>
              </div>
            )}
          </div>
        </section>

        {!code ? (
          <section className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Volunteers only</h2>
            <p className="mt-1 text-sm text-zinc-600">Enter the access code you were given to see the fireworks tasks.</p>
            <form className="mt-4 space-y-3" onSubmit={submitCode}>
              <label htmlFor="fireworks-code" className={label}>Access code</label>
              <input
                id="fireworks-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className={field}
              />
              {codeError && <p className="text-sm text-rose-700">{codeError}</p>}
              <button
                type="submit"
                disabled={checkingCode || !codeInput.trim()}
                className="inline-flex items-center rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {checkingCode ? 'Checking...' : 'Open task list'}
              </button>
            </form>
          </section>
        ) : loading && tasks.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">Loading tasks...</section>
        ) : loadError ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">{loadError}</section>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="fw-area-filter" className={label}>Area</label>
                <select id="fw-area-filter" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className={field}>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fw-status-filter" className={label}>Status</label>
                <select id="fw-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All statuses' | FireworksStatus)} className={field}>
                  <option value="All statuses">All statuses</option>
                  <option value="Not Started">Not Started</option>
                  <option value="Ongoing">Ongoing</option>
                </select>
              </div>
              <div>
                <label htmlFor="fw-priority-filter" className={label}>Priority</label>
                <select id="fw-priority-filter" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'All priorities' | FireworksPriority)} className={field}>
                  <option value="All priorities">All priorities</option>
                  {FIREWORKS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {taskGroup('Unassigned tasks', unassigned, tasks.length ? 'No unassigned tasks match the current filters.' : 'No tasks yet. Add the first one below.', true)}
            {taskGroup('Assigned tasks', assigned, 'No assigned tasks match the current filters.')}

            <form id="add-task-form" className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4" onSubmit={addTask}>
              <h3 className="text-base font-semibold text-zinc-900">Add task</h3>
              <p className="mt-1 text-sm text-zinc-600">Add something that needs doing for the fireworks night.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="new-area" className={label}>Area</label>
                  <input id="new-area" value={newTask.area} onChange={(e) => setNewTask((v) => ({ ...v, area: e.target.value }))} className={field} placeholder="e.g. Car park, Bar, Gates" />
                </div>
                <div>
                  <label htmlFor="new-status" className={label}>Status</label>
                  <select id="new-status" value={newTask.status} onChange={(e) => setNewTask((v) => ({ ...v, status: e.target.value as FireworksStatus }))} className={field}>
                    {FIREWORKS_STATUSES.filter((s) => s !== 'Completed').map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-priority" className={label}>Priority</label>
                  <select id="new-priority" value={newTask.priority} onChange={(e) => setNewTask((v) => ({ ...v, priority: e.target.value as FireworksPriority }))} className={field}>
                    {FIREWORKS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label htmlFor="new-task" className={label}>Task</label>
                <input id="new-task" value={newTask.task} onChange={(e) => setNewTask((v) => ({ ...v, task: e.target.value }))} className={field} placeholder="Describe the task" />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="new-needs" className={label}>What&rsquo;s needed (optional)</label>
                  <textarea id="new-needs" rows={3} value={newTask.needs} onChange={(e) => setNewTask((v) => ({ ...v, needs: e.target.value }))} className={field} placeholder="Equipment, materials, how many people" />
                </div>
                <div>
                  <label htmlFor="new-by" className={label}>Added by (optional)</label>
                  <input id="new-by" value={newTaskBy} onChange={(e) => setNewTaskBy(e.target.value)} className={field} placeholder="Your name" />
                </div>
              </div>
              {addMessage && <p className={`mt-3 text-sm ${addMessage.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{addMessage.text}</p>}
              <button type="submit" disabled={adding} className="mt-3 inline-flex items-center rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300">
                {adding ? 'Adding...' : 'Add task'}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
