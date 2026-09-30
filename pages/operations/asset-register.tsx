import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  type Asset,
  type AssetDueItem,
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_OWNERS,
  ASSET_STATUSES,
  RENEWAL_FREQUENCIES,
  RENEWAL_TYPES,
  SERVICE_TYPES,
  assetsToCsv,
  describeDaysAway,
  formatAssetDate,
  formatMoney,
  getDueItems,
  nextDueFor,
} from '../../lib/assets';

// Asset register: club and trading-company equipment, technology and
// subscriptions, with renewal / warranty / service dates. Stored in
// public.assets (supabase/policies/asset_register.sql). Admins, trustees and
// directors can edit; everyone else sees it read-only (enforced by RLS too).

const EDIT_ROLES = new Set(['admin', 'trustee', 'director']);
const DUE_WINDOW_DAYS = 60;

type Draft = {
  [K in keyof Asset]?: K extends 'auto_renews' ? boolean : string;
};

const TEXT_FIELDS = [
  'name', 'category', 'location', 'make_model', 'serial_number', 'asset_tag', 'owner_entity',
  'responsible_person', 'condition', 'status', 'supplier', 'purchase_date', 'purchase_cost',
  'document_url', 'renewal_type', 'renewal_date', 'renewal_cost', 'renewal_frequency',
  'warranty_expires', 'next_service_date', 'service_type', 'disposed_date', 'notes',
] as const;

const emptyDraft = (): Draft => ({
  name: '',
  category: 'IT & computers',
  owner_entity: 'Club',
  condition: 'Good',
  status: 'In use',
  auto_renews: false,
});

const toDraft = (asset: Asset): Draft => {
  const draft: Draft = { auto_renews: asset.auto_renews };
  for (const field of TEXT_FIELDS) {
    const value = asset[field];
    (draft as Record<string, string>)[field] = value == null ? '' : String(value);
  }
  return draft;
};

// Empty strings become null; costs become numbers.
const fromDraft = (draft: Draft) => {
  const row: Record<string, unknown> = { auto_renews: !!draft.auto_renews };
  for (const field of TEXT_FIELDS) {
    const value = ((draft as Record<string, string | undefined>)[field] ?? '').trim();
    if (field === 'purchase_cost' || field === 'renewal_cost') {
      row[field] = value === '' ? null : Number(value.replace(/[£,]/g, ''));
    } else {
      row[field] = value === '' ? null : value;
    }
  }
  return row;
};

const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none';
const labelClass = 'block text-xs font-medium text-zinc-600';

const DUE_KIND_ICON: Record<AssetDueItem['kind'], string> = { renewal: '🔁', warranty: '🛡️', service: '🔧' };

function StatTile({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'danger' | 'warning' }) {
  const valueClass = tone === 'danger' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : 'text-zinc-900';
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold tabular-nums ${valueClass}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

function DueBadge({ days }: { days: number }) {
  const className = days < 0
    ? 'bg-rose-100 text-rose-800'
    : days <= 30
      ? 'bg-amber-100 text-amber-800'
      : 'bg-zinc-100 text-zinc-600';
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{describeDaysAway(days)}</span>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`${labelClass} ${className}`}>
      {label}
      {children}
    </label>
  );
}

export default function AssetRegisterPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [showDisposed, setShowDisposed] = useState(false);

  // 'new' while adding, otherwise the id being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const loadAssets = async () => {
    const { data, error } = await supabase.from('assets').select('*').order('name', { ascending: true });
    if (error) setNotice({ type: 'error', message: `Failed to load assets: ${error.message}` });
    else setAssets(data as Asset[]);
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const role = resolveRoleFromUser(data.user);
      setCanEdit(!!role && EDIT_ROLES.has(role));
      setUserEmail(data.user?.email ?? '');
      await loadAssets();
    };
    void init();
  }, []);

  const active = useMemo(() => assets.filter((a) => a.status !== 'Disposed'), [assets]);
  const dueItems = useMemo(() => getDueItems(assets), [assets]);
  const comingUp = dueItems.filter((d) => d.daysAway <= DUE_WINDOW_DAYS);
  const overdueCount = dueItems.filter((d) => d.daysAway < 0).length;
  const due30Count = dueItems.filter((d) => d.daysAway >= 0 && d.daysAway <= 30).length;
  const totalValue = active.reduce((sum, a) => sum + (a.purchase_cost ?? 0), 0);
  const annualRenewals = active.reduce((sum, a) => {
    if (a.renewal_cost == null) return sum;
    const perYear: Record<string, number> = { Monthly: 12, Quarterly: 4, Annually: 1, 'Every 2 years': 0.5, 'Every 3 years': 1 / 3 };
    return sum + a.renewal_cost * (perYear[a.renewal_frequency ?? ''] ?? 0);
  }, 0);

  const filtered = assets.filter((a) => {
    if (!showDisposed && a.status === 'Disposed') return false;
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    if (ownerFilter !== 'all' && a.owner_entity !== ownerFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [a.name, a.location, a.make_model, a.serial_number, a.asset_tag, a.supplier, a.responsible_person, a.notes]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const startEdit = (asset?: Asset) => {
    setEditingId(asset?.id ?? 'new');
    setDraft(asset ? toDraft(asset) : emptyDraft());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const set = (field: keyof Asset, value: string | boolean) => setDraft((d) => ({ ...d, [field]: value }));
  const text = (field: keyof Asset) => ((draft as Record<string, string | undefined>)[field] ?? '') as string;

  const save = async () => {
    const row = fromDraft(draft);
    if (!row.name) { setNotice({ type: 'error', message: 'Give the item a name.' }); return; }
    for (const field of ['purchase_cost', 'renewal_cost'] as const) {
      if (row[field] != null && Number.isNaN(row[field] as number)) {
        setNotice({ type: 'error', message: 'Costs must be numbers, e.g. 249.99.' });
        return;
      }
    }
    if (row.status === 'Disposed' && !row.disposed_date) row.disposed_date = new Date().toISOString().slice(0, 10);

    setSaving(true);
    const stamp = { updated_at: new Date().toISOString(), updated_by: userEmail || null };
    const { error } = editingId === 'new'
      ? await supabase.from('assets').insert({ ...row, ...stamp })
      : await supabase.from('assets').update({ ...row, ...stamp }).eq('id', editingId!);
    setSaving(false);
    if (error) { setNotice({ type: 'error', message: `Failed to save: ${error.message}` }); return; }
    setEditingId(null);
    await loadAssets();
    setNotice({ type: 'success', message: `${row.name} saved.` });
  };

  const deleteAsset = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('assets').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) { setNotice({ type: 'error', message: `Failed to delete: ${error.message}` }); return; }
    setNotice({ type: 'success', message: `${deleteTarget.name} deleted.` });
    setDeleteTarget(null);
    setEditingId(null);
    await loadAssets();
  };

  const exportCsv = () => {
    const blob = new Blob([assetsToCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `asset-register-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const editingAsset = editingId && editingId !== 'new' ? assets.find((a) => a.id === editingId) : null;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-extrabold text-zinc-900">📦 Asset Register</h1>
            <p className="mt-1 text-zinc-600">Club equipment, technology and subscriptions — with renewal, warranty and service dates.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Export CSV
            </button>
            {canEdit && editingId === null && (
              <button type="button" onClick={() => startEdit()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                + Add item
              </button>
            )}
          </div>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {/* ── Add / edit form ─────────────────────────────────────── */}
        {editingId !== null && (
          <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-blue-200">
            <div className="border-b border-blue-200 bg-blue-50 px-5 py-3">
              <h2 className="text-lg font-semibold text-zinc-900">{editingAsset ? `Edit ${editingAsset.name}` : 'New item'}</h2>
              {editingAsset?.updated_by && (
                <p className="text-xs text-zinc-500">
                  Last updated {new Date(editingAsset.updated_at).toLocaleDateString('en-GB')} by {editingAsset.updated_by}
                </p>
              )}
            </div>
            <form className="space-y-6 px-5 py-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-zinc-900">Details</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Name *" className="lg:col-span-2">
                    <input className={inputClass} value={text('name')} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Bar till laptop" />
                  </Field>
                  <Field label="Category">
                    <select className={inputClass} value={text('category')} onChange={(e) => set('category', e.target.value)}>
                      {ASSET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Make / model">
                    <input className={inputClass} value={text('make_model')} onChange={(e) => set('make_model', e.target.value)} />
                  </Field>
                  <Field label="Serial number">
                    <input className={inputClass} value={text('serial_number')} onChange={(e) => set('serial_number', e.target.value)} />
                  </Field>
                  <Field label="Asset tag">
                    <input className={inputClass} value={text('asset_tag')} onChange={(e) => set('asset_tag', e.target.value)} placeholder="e.g. ALD-0042" />
                  </Field>
                  <Field label="Location">
                    <input className={inputClass} value={text('location')} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Eric Evans Lounge" />
                  </Field>
                  <Field label="Owned by">
                    <select className={inputClass} value={text('owner_entity')} onChange={(e) => set('owner_entity', e.target.value)}>
                      {ASSET_OWNERS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Responsible person">
                    <input className={inputClass} value={text('responsible_person')} onChange={(e) => set('responsible_person', e.target.value)} />
                  </Field>
                  <Field label="Condition">
                    <select className={inputClass} value={text('condition')} onChange={(e) => set('condition', e.target.value)}>
                      {ASSET_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className={inputClass} value={text('status')} onChange={(e) => set('status', e.target.value)}>
                      {ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  {text('status') === 'Disposed' && (
                    <Field label="Disposed on">
                      <input type="date" className={inputClass} value={text('disposed_date')} onChange={(e) => set('disposed_date', e.target.value)} />
                    </Field>
                  )}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-zinc-900">Purchase</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Supplier">
                    <input className={inputClass} value={text('supplier')} onChange={(e) => set('supplier', e.target.value)} />
                  </Field>
                  <Field label="Purchase date">
                    <input type="date" className={inputClass} value={text('purchase_date')} onChange={(e) => set('purchase_date', e.target.value)} />
                  </Field>
                  <Field label="Cost (£)">
                    <input inputMode="decimal" className={inputClass} value={text('purchase_cost')} onChange={(e) => set('purchase_cost', e.target.value)} placeholder="0.00" />
                  </Field>
                  <Field label="Receipt / document link">
                    <input type="url" className={inputClass} value={text('document_url')} onChange={(e) => set('document_url', e.target.value)} placeholder="https://…" />
                  </Field>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-zinc-900">Renewals &amp; dates</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Renewal type">
                    <input list="renewal-types" className={inputClass} value={text('renewal_type')} onChange={(e) => set('renewal_type', e.target.value)} placeholder="e.g. Subscription" />
                  </Field>
                  <Field label="Renewal date">
                    <input type="date" className={inputClass} value={text('renewal_date')} onChange={(e) => set('renewal_date', e.target.value)} />
                  </Field>
                  <Field label="Renewal cost (£)">
                    <input inputMode="decimal" className={inputClass} value={text('renewal_cost')} onChange={(e) => set('renewal_cost', e.target.value)} placeholder="0.00" />
                  </Field>
                  <Field label="How often">
                    <select className={inputClass} value={text('renewal_frequency')} onChange={(e) => set('renewal_frequency', e.target.value)}>
                      <option value="">—</option>
                      {RENEWAL_FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-zinc-700">
                    <input type="checkbox" checked={!!draft.auto_renews} onChange={(e) => set('auto_renews', e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                    Renews automatically
                  </label>
                  <Field label="Warranty expires">
                    <input type="date" className={inputClass} value={text('warranty_expires')} onChange={(e) => set('warranty_expires', e.target.value)} />
                  </Field>
                  <Field label="Service / inspection type">
                    <input list="service-types" className={inputClass} value={text('service_type')} onChange={(e) => set('service_type', e.target.value)} placeholder="e.g. PAT test" />
                  </Field>
                  <Field label="Next service / inspection">
                    <input type="date" className={inputClass} value={text('next_service_date')} onChange={(e) => set('next_service_date', e.target.value)} />
                  </Field>
                </div>
                <datalist id="renewal-types">{RENEWAL_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
                <datalist id="service-types">{SERVICE_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
              </fieldset>

              <Field label="Notes">
                <textarea className={inputClass} rows={3} value={text('notes')} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. login held by the treasurer, cancellation notice 30 days" />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4">
                {editingAsset ? (
                  <button type="button" onClick={() => setDeleteTarget(editingAsset)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                    Delete
                  </button>
                ) : <span />}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <>
            {/* ── Summary ──────────────────────────────────────────── */}
            <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Items" value={String(active.length)} detail={`${assets.length - active.length} disposed`} />
              <StatTile label="Value" value={formatMoney(totalValue)} detail="Purchase cost of items in use" />
              <StatTile
                label="Due in 30 days"
                value={String(due30Count)}
                detail="Renewals, warranties and services"
                tone={due30Count ? 'warning' : undefined}
              />
              <StatTile
                label="Overdue"
                value={String(overdueCount)}
                detail={annualRenewals ? `Renewals ≈ ${formatMoney(annualRenewals)} a year` : 'Dates that have passed'}
                tone={overdueCount ? 'danger' : undefined}
              />
            </section>

            {/* ── Coming up ────────────────────────────────────────── */}
            <section className="mb-8 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-zinc-900">Coming up</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Overdue and due in the next {DUE_WINDOW_DAYS} days</p>
              </div>
              {comingUp.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-400">Nothing due in the next {DUE_WINDOW_DAYS} days.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {comingUp.map((d) => (
                    <li key={`${d.asset.id}-${d.kind}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">
                          <span aria-hidden>{DUE_KIND_ICON[d.kind]} </span>{d.asset.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {d.label} · {formatAssetDate(d.date)}
                          {d.kind === 'renewal' && d.asset.renewal_cost != null ? ` · ${formatMoney(d.asset.renewal_cost)}` : ''}
                          {d.kind === 'renewal' && d.asset.auto_renews ? ' · renews automatically' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DueBadge days={d.daysAway} />
                        {canEdit && editingId === null && (
                          <button type="button" onClick={() => startEdit(d.asset)} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                            Update
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Filters ──────────────────────────────────────────── */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, serial, location…"
                className="min-w-0 flex-1 basis-60 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm" aria-label="Category">
                <option value="all">All categories</option>
                {ASSET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm" aria-label="Owner">
                <option value="all">Club &amp; Ltd</option>
                {ASSET_OWNERS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={showDisposed} onChange={(e) => setShowDisposed(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                Show disposed
              </label>
            </div>

            {/* ── Register ─────────────────────────────────────────── */}
            {filtered.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                {assets.length === 0 ? 'Nothing logged yet.' : 'No items match those filters.'}
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Item</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                        <th className="hidden px-4 py-3 font-semibold md:table-cell">Location</th>
                        <th className="hidden px-4 py-3 font-semibold lg:table-cell">Condition</th>
                        <th className="px-4 py-3 text-right font-semibold">Cost</th>
                        <th className="px-4 py-3 font-semibold">Next date</th>
                        {canEdit && <th className="px-4 py-3"><span className="sr-only">Edit</span></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filtered.map((a) => {
                        const next = nextDueFor(a);
                        return (
                          <tr key={a.id} className={a.status === 'Disposed' ? 'text-zinc-400' : ''}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-zinc-900">{a.name}</p>
                              <p className="text-xs text-zinc-500">
                                {[a.make_model, a.serial_number && `SN ${a.serial_number}`, a.asset_tag, a.owner_entity !== 'Club' && 'Ltd', a.status !== 'In use' && a.status]
                                  .filter(Boolean).join(' · ')}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-zinc-700">{a.category}</td>
                            <td className="hidden px-4 py-3 text-zinc-700 md:table-cell">{a.location ?? '—'}</td>
                            <td className="hidden px-4 py-3 text-zinc-700 lg:table-cell">{a.condition}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-zinc-700">{formatMoney(a.purchase_cost)}</td>
                            <td className="px-4 py-3">
                              {next ? (
                                <div className="flex flex-col items-start gap-1">
                                  <span className="text-zinc-700">{next.label} · {formatAssetDate(next.date)}</span>
                                  {next.daysAway <= DUE_WINDOW_DAYS && <DueBadge days={next.daysAway} />}
                                </div>
                              ) : <span className="text-zinc-400">—</span>}
                            </td>
                            {canEdit && (
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => startEdit(a)}
                                  disabled={editingId !== null}
                                  className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                                >
                                  Edit
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name ?? 'item'}?`}
        description="This removes it from the register completely. To keep a record, set its status to Disposed instead."
        confirmLabel="Delete"
        onConfirm={deleteAsset}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </main>
  );
}
