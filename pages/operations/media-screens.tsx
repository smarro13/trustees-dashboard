import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';

// Clubhouse screen setup: for each screen, which inputs feed which platform,
// and what that shows on the screen. Stored in public.media_screens — see
// supabase/policies/media_screens.sql. Admins, trustees and directors can edit;
// everyone else sees it read-only (enforced by RLS as well as here).

type Area = 'lounge' | 'foyer' | 'function';

type Route = {
  inputs: string[];
  platform: string;
  outputs: string[];
};

type Screen = {
  id: string;
  name: string;
  location: string;
  area: Area;
  routes: Route[];
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
};

// While editing, inputs/outputs are one-per-line text so entries can contain commas.
type RouteDraft = { inputs: string; platform: string; outputs: string };
type ScreenDraft = { name: string; location: string; area: Area; routes: RouteDraft[] };

const EDIT_ROLES = new Set(['admin', 'trustee', 'director']);

const AREA_STYLES: Record<Area, { card: string; header: string; label: string }> = {
  lounge: { card: 'ring-sky-200', header: 'bg-sky-50 border-sky-200', label: 'Lounge' },
  foyer: { card: 'ring-orange-200', header: 'bg-orange-50 border-orange-200', label: 'Foyer' },
  function: { card: 'ring-emerald-200', header: 'bg-emerald-50 border-emerald-200', label: 'Function rooms' },
};

const PLATFORMS = [
  { name: 'Media Centre', description: 'Sky TV — live sport and channels.' },
  { name: 'CMS Signage (Firestick)', description: 'Club info slides, event media and private function content.' },
  { name: 'AirPlay / Mirror / HDMI', description: 'Guests show their own presentations or media.' },
];

const toLines = (items: string[]) => items.join('\n');
const fromLines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);

const toDraft = (screen?: Screen): ScreenDraft => ({
  name: screen?.name ?? '',
  location: screen?.location ?? '',
  area: screen?.area ?? 'function',
  routes: (screen?.routes ?? [{ inputs: [], platform: '', outputs: [] }]).map((r) => ({
    inputs: toLines(r.inputs),
    platform: r.platform,
    outputs: toLines(r.outputs),
  })),
});

const fromDraft = (draft: ScreenDraft) => ({
  name: draft.name.trim(),
  location: draft.location.trim(),
  area: draft.area,
  routes: draft.routes
    .map((r) => ({ inputs: fromLines(r.inputs), platform: r.platform.trim(), outputs: fromLines(r.outputs) }))
    .filter((r) => r.platform || r.inputs.length || r.outputs.length),
});

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none';

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-md bg-white px-2 py-1 text-sm text-zinc-800 ring-1 ring-zinc-200">
      {children}
    </span>
  );
}

function Arrow() {
  return <span aria-hidden className="hidden text-zinc-400 sm:block">→</span>;
}

function RoutesView({ routes }: { routes: Route[] }) {
  if (routes.length === 0) {
    return <p className="px-5 py-4 text-sm text-zinc-400">No inputs set up yet.</p>;
  }
  return (
    <>
      <div className="hidden grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 sm:grid">
        <span>Input</span><span /><span>Platform</span><span /><span>Shows</span>
      </div>
      <ul className="divide-y divide-zinc-100">
        {routes.map((route, i) => (
          <li
            key={`${route.platform}-${i}`}
            className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:gap-3"
          >
            <div className="flex flex-wrap gap-1.5">
              <span className="w-16 text-xs text-zinc-400 sm:hidden">Input</span>
              {route.inputs.map((item) => <Chip key={item}>{item}</Chip>)}
            </div>
            <Arrow />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-xs text-zinc-400 sm:hidden">Platform</span>
              <span className="rounded-md bg-zinc-900 px-2 py-1 text-sm font-medium text-white">{route.platform}</span>
            </div>
            <Arrow />
            <div className="flex flex-wrap gap-1.5">
              <span className="w-16 text-xs text-zinc-400 sm:hidden">Shows</span>
              {route.outputs.map((item) => <Chip key={item}>{item}</Chip>)}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ScreenForm({
  draft, setDraft, saving, onSave, onCancel, onDelete,
}: {
  draft: ScreenDraft;
  setDraft: (d: ScreenDraft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const setRoute = (i: number, patch: Partial<RouteDraft>) =>
    setDraft({ ...draft, routes: draft.routes.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <form
      className="space-y-4 px-5 py-4"
      onSubmit={(e) => { e.preventDefault(); onSave(); }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-zinc-600">
          Screen name
          <input className={`${inputClass} mt-1`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
        </label>
        <label className="block text-xs font-medium text-zinc-600">
          Location
          <input className={`${inputClass} mt-1`} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
        </label>
        <label className="block text-xs font-medium text-zinc-600">
          Area (colour)
          <select className={`${inputClass} mt-1`} value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value as Area })}>
            <option value="lounge">Lounge (blue)</option>
            <option value="foyer">Foyer (peach)</option>
            <option value="function">Function rooms (green)</option>
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-zinc-600">Inputs → platform → what it shows (one item per line)</p>
        {draft.routes.map((route, i) => (
          <div key={i} className="grid gap-2 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
            <textarea
              aria-label="Inputs"
              placeholder={'Inputs\ne.g. Club Media'}
              rows={2}
              className={inputClass}
              value={route.inputs}
              onChange={(e) => setRoute(i, { inputs: e.target.value })}
            />
            <input
              aria-label="Platform"
              placeholder="Platform"
              list="media-platforms"
              className={inputClass}
              value={route.platform}
              onChange={(e) => setRoute(i, { platform: e.target.value })}
            />
            <textarea
              aria-label="Shows"
              placeholder={'Shows\ne.g. Club Info'}
              rows={2}
              className={inputClass}
              value={route.outputs}
              onChange={(e) => setRoute(i, { outputs: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setDraft({ ...draft, routes: draft.routes.filter((_, j) => j !== i) })}
              className="rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft({ ...draft, routes: [...draft.routes, { inputs: '', platform: '', outputs: '' }] })}
          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          + Add input
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            Delete screen
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function MediaScreensPage() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  // 'new' while adding a screen, otherwise the id of the screen being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScreenDraft>(toDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Screen | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const loadScreens = async () => {
    const { data, error } = await supabase
      .from('media_screens')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) setNotice({ type: 'error', message: `Failed to load screens: ${error.message}` });
    else setScreens(data as Screen[]);
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const role = resolveRoleFromUser(data.user);
      setCanEdit(!!role && EDIT_ROLES.has(role));
      setUserEmail(data.user?.email ?? '');
      await loadScreens();
    };
    void init();
  }, []);

  const startEdit = (screen?: Screen) => {
    setEditingId(screen?.id ?? 'new');
    setDraft(toDraft(screen));
  };

  const save = async () => {
    const values = fromDraft(draft);
    if (!values.name) { setNotice({ type: 'error', message: 'Give the screen a name.' }); return; }
    setSaving(true);
    const stamp = { updated_at: new Date().toISOString(), updated_by: userEmail || null };
    const { error } = editingId === 'new'
      ? await supabase.from('media_screens').insert({
          ...values,
          ...stamp,
          sort_order: (screens[screens.length - 1]?.sort_order ?? 0) + 10,
        })
      : await supabase.from('media_screens').update({ ...values, ...stamp }).eq('id', editingId!);
    setSaving(false);
    if (error) { setNotice({ type: 'error', message: `Failed to save: ${error.message}` }); return; }
    setEditingId(null);
    await loadScreens();
    setNotice({ type: 'success', message: `${values.name} saved.` });
  };

  const move = async (index: number, direction: -1 | 1) => {
    const a = screens[index];
    const b = screens[index + direction];
    if (!a || !b) return;
    // Swap positions; if two screens share a sort_order, space them apart.
    const aOrder = b.sort_order === a.sort_order ? a.sort_order + direction : b.sort_order;
    const [r1, r2] = await Promise.all([
      supabase.from('media_screens').update({ sort_order: aOrder }).eq('id', a.id),
      supabase.from('media_screens').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    if (r1.error || r2.error) setNotice({ type: 'error', message: 'Failed to reorder screens.' });
    await loadScreens();
  };

  const deleteScreen = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('media_screens').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) { setNotice({ type: 'error', message: `Failed to delete: ${error.message}` }); return; }
    setNotice({ type: 'success', message: `${deleteTarget.name} deleted.` });
    setDeleteTarget(null);
    setEditingId(null);
    await loadScreens();
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-extrabold text-zinc-900">📺 Media Screens</h1>
            <p className="mt-1 text-zinc-600">
              What each clubhouse screen can show, and where its content comes from.
            </p>
          </div>
          {canEdit && editingId === null && (
            <button
              type="button"
              onClick={() => startEdit()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add screen
            </button>
          )}
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          {PLATFORMS.map((p) => (
            <div key={p.name} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm font-semibold text-zinc-900">{p.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{p.description}</p>
            </div>
          ))}
        </section>

        <datalist id="media-platforms">
          {PLATFORMS.map((p) => <option key={p.name} value={p.name} />)}
        </datalist>

        {editingId === 'new' && (
          <section className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-blue-200">
            <div className="border-b border-blue-200 bg-blue-50 px-5 py-3">
              <h2 className="text-lg font-semibold text-zinc-900">New screen</h2>
            </div>
            <ScreenForm draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={() => setEditingId(null)} />
          </section>
        )}

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : screens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            No screens set up yet.
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {screens.map((screen, index) => {
              const style = AREA_STYLES[screen.area] ?? AREA_STYLES.function;
              const isEditing = editingId === screen.id;
              return (
                <section
                  key={screen.id}
                  className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${style.card} ${isEditing ? 'lg:col-span-2' : ''}`}
                >
                  <div className={`flex items-center justify-between gap-3 border-b px-5 py-3 ${style.header}`}>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-zinc-900">{screen.name}</h2>
                      <p className="text-xs text-zinc-600">{screen.location}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
                        {style.label}
                      </span>
                      {canEdit && !isEditing && editingId === null && (
                        <>
                          <button
                            type="button"
                            onClick={() => move(index, -1)}
                            disabled={index === 0}
                            aria-label={`Move ${screen.name} earlier`}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => move(index, 1)}
                            disabled={index === screens.length - 1}
                            aria-label={`Move ${screen.name} later`}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(screen)}
                            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <ScreenForm
                      draft={draft}
                      setDraft={setDraft}
                      saving={saving}
                      onSave={save}
                      onCancel={() => setEditingId(null)}
                      onDelete={() => setDeleteTarget(screen)}
                    />
                  ) : (
                    <>
                      <RoutesView routes={screen.routes} />
                      {screen.updated_by && (
                        <p className="border-t border-zinc-100 px-5 py-2 text-[11px] text-zinc-400">
                          Last updated {new Date(screen.updated_at).toLocaleDateString('en-GB')} by {screen.updated_by}
                        </p>
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name ?? 'screen'}?`}
        description="This removes the screen and its setup from this page."
        confirmLabel="Delete"
        onConfirm={deleteScreen}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </main>
  );
}
