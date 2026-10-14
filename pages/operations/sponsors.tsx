import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { resolveRoleFromUser } from '../../lib/roles';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  type Sponsor,
  type SponsorChange,
  FIELD_LABELS,
  WEBSITE_FIELDS,
  formatChangeValue,
  PACKAGES,
  PAYMENT_STATUSES,
  SPONSOR_CATEGORIES,
  SPONSOR_STATUSES,
  VALUE_TYPES,
  describeDaysAway,
  formatMoney,
  formatSponsorDate,
  getRenewals,
  isCurrent,
  sponsorsToCsv,
} from '../../lib/sponsors';

// Sponsors tracker: every sponsor and partner, the deal, renewal date, payment,
// contact and where they're shown. Stored in public.sponsors
// (supabase/policies/sponsors.sql). Admins, trustees, directors and the
// commercial role can edit; everyone else sees it read-only (enforced by RLS too).
// Admins also see "Website updates": every add / edit / removal, logged by a
// database trigger into public.sponsor_changes, to tick off once
// aldwinians.co.uk has been updated to match.

const EDIT_ROLES = new Set(['admin', 'trustee', 'director', 'commercial']);
const DUE_WINDOW_DAYS = 60;

type Draft = {
  [K in keyof Sponsor]?: K extends 'on_website' | 'in_footer' | 'in_programme' ? boolean : string;
};

const TEXT_FIELDS = [
  'name', 'category', 'sponsors_what', 'status', 'package', 'value', 'value_type', 'payment_status',
  'invoice_ref', 'start_date', 'renewal_date', 'contact_name', 'contact_email', 'contact_phone', 'address',
  'club_contact', 'last_contacted', 'website', 'page_url', 'member_offer', 'benefits', 'notes',
] as const;
const FLAG_FIELDS = ['on_website', 'in_footer', 'in_programme'] as const;

const emptyDraft = (): Draft => ({
  name: '',
  category: 'Club sponsor',
  status: 'Active',
  value_type: 'Cash',
  on_website: true,
  in_footer: true,
  in_programme: false,
});

const toDraft = (sponsor: Sponsor): Draft => {
  const draft: Draft = {};
  for (const field of FLAG_FIELDS) (draft as Record<string, boolean>)[field] = sponsor[field];
  for (const field of TEXT_FIELDS) {
    const value = sponsor[field];
    (draft as Record<string, string>)[field] = value == null ? '' : String(value);
  }
  return draft;
};

// Empty strings become null; the value becomes a number.
const fromDraft = (draft: Draft) => {
  const row: Record<string, unknown> = {};
  for (const field of FLAG_FIELDS) row[field] = !!draft[field];
  for (const field of TEXT_FIELDS) {
    const value = ((draft as Record<string, string | undefined>)[field] ?? '').trim();
    if (field === 'value') row[field] = value === '' ? null : Number(value.replace(/[£,]/g, ''));
    else row[field] = value === '' ? null : value;
  }
  return row;
};

const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none';
const labelClass = 'block text-xs font-medium text-zinc-600';

const STATUS_BADGE: Record<Sponsor['status'], string> = {
  Prospect: 'bg-sky-100 text-sky-800',
  Active: 'bg-emerald-100 text-emerald-800',
  'Renewal due': 'bg-amber-100 text-amber-800',
  Lapsed: 'bg-rose-100 text-rose-800',
  Ended: 'bg-zinc-100 text-zinc-500',
};

const PAYMENT_BADGE: Record<string, string> = {
  Paid: 'text-emerald-700',
  Invoiced: 'text-amber-700',
  Overdue: 'text-rose-700 font-semibold',
  'Not invoiced': 'text-zinc-500',
  'Not applicable': 'text-zinc-400',
};

const ACTION_BADGE: Record<SponsorChange['action'], string> = {
  added: 'bg-emerald-100 text-emerald-800',
  updated: 'bg-blue-100 text-blue-800',
  removed: 'bg-rose-100 text-rose-800',
};

// The fields worth showing for a whole added / removed row.
const SUMMARY_FIELDS = ['category', 'sponsors_what', 'status', 'website', 'page_url', 'member_offer', 'in_footer'];

function ChangeDetails({ change }: { change: SponsorChange }) {
  if (change.action === 'updated') {
    const entries = Object.entries(change.changes as Record<string, { from: unknown; to: unknown }>);
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
        {entries.map(([field, { from, to }]) => (
          <li key={field}>
            <span className="font-medium text-zinc-800">{FIELD_LABELS[field] ?? field}</span>
            {WEBSITE_FIELDS.has(field) && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-semibold uppercase text-violet-700">website</span>}
            : <span className="line-through decoration-zinc-400">{formatChangeValue(from)}</span> → <span className="text-zinc-900">{formatChangeValue(to)}</span>
          </li>
        ))}
      </ul>
    );
  }
  const row = change.changes as Record<string, unknown>;
  const parts = SUMMARY_FIELDS
    .filter((f) => row[f] != null && row[f] !== '')
    .map((f) => `${FIELD_LABELS[f] ?? f}: ${formatChangeValue(row[f])}`);
  return parts.length ? <p className="mt-1 text-xs text-zinc-600">{parts.join(' · ')}</p> : null;
}

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

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [changes, setChanges] = useState<SponsorChange[]>([]);
  const [showDoneChanges, setShowDoneChanges] = useState(false);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('current');

  // 'new' while adding, otherwise the id being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sponsor | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const loadSponsors = async () => {
    const { data, error } = await supabase.from('sponsors').select('*').order('name', { ascending: true });
    if (error) setNotice({ type: 'error', message: `Failed to load sponsors: ${error.message}` });
    else setSponsors(data as Sponsor[]);
    setLoading(false);
  };

  const loadChanges = async () => {
    const { data, error } = await supabase
      .from('sponsor_changes')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(200);
    if (!error && data) setChanges(data as SponsorChange[]);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const role = resolveRoleFromUser(data.user);
      setCanEdit(!!role && EDIT_ROLES.has(role));
      setIsAdmin(role === 'admin');
      setUserEmail(data.user?.email ?? '');
      await loadSponsors();
      if (role === 'admin') await loadChanges();
    };
    void init();
  }, []);

  const markChangesDone = async (ids: number[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('sponsor_changes')
      .update({ website_done: true, done_by: userEmail || null, done_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { setNotice({ type: 'error', message: `Failed to update: ${error.message}` }); return; }
    await loadChanges();
  };

  const pendingChanges = changes.filter((c) => !c.website_done);
  const shownChanges = showDoneChanges ? changes : pendingChanges;

  const current = useMemo(() => sponsors.filter(isCurrent), [sponsors]);
  const renewals = useMemo(() => getRenewals(sponsors), [sponsors]);
  const comingUp = renewals.filter((r) => r.daysAway <= DUE_WINDOW_DAYS);
  // Sponsors needing attention that have no renewal date to show them in "coming up".
  const followUps = current.filter((s) => !s.renewal_date && s.status === 'Renewal due')
    .concat(sponsors.filter((s) => s.status === 'Lapsed'));
  const cashValue = current.reduce((sum, s) => sum + (s.value_type !== 'In kind' ? s.value ?? 0 : 0), 0);
  const unpaid = current.filter((s) => s.payment_status === 'Invoiced' || s.payment_status === 'Overdue');
  const overdueCount = unpaid.filter((s) => s.payment_status === 'Overdue').length;
  const missingDetails = current.filter((s) => s.value == null || !s.renewal_date).length;

  const filtered = sponsors.filter((s) => {
    if (statusFilter === 'current' && !isCurrent(s)) return false;
    if (statusFilter !== 'current' && statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [s.name, s.sponsors_what, s.package, s.contact_name, s.contact_email, s.club_contact, s.member_offer, s.notes]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const startEdit = (sponsor?: Sponsor) => {
    setEditingId(sponsor?.id ?? 'new');
    setDraft(sponsor ? toDraft(sponsor) : emptyDraft());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const set = (field: keyof Sponsor, value: string | boolean) => setDraft((d) => ({ ...d, [field]: value }));
  const text = (field: keyof Sponsor) => ((draft as Record<string, string | undefined>)[field] ?? '') as string;

  const save = async () => {
    const row = fromDraft(draft);
    if (!row.name) { setNotice({ type: 'error', message: 'Give the sponsor a name.' }); return; }
    if (row.value != null && Number.isNaN(row.value as number)) {
      setNotice({ type: 'error', message: 'Value must be a number, e.g. 250.' });
      return;
    }

    setSaving(true);
    const stamp = { updated_at: new Date().toISOString(), updated_by: userEmail || null };
    const { error } = editingId === 'new'
      ? await supabase.from('sponsors').insert({ ...row, ...stamp })
      : await supabase.from('sponsors').update({ ...row, ...stamp }).eq('id', editingId!);
    setSaving(false);
    if (error) {
      const message = error.code === '23505'
        ? `${row.name} is already listed for this category and sponsorship.`
        : `Failed to save: ${error.message}`;
      setNotice({ type: 'error', message });
      return;
    }
    setEditingId(null);
    await loadSponsors();
    if (isAdmin) await loadChanges();
    setNotice({ type: 'success', message: `${row.name} saved.` });
  };

  const deleteSponsor = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('sponsors').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) { setNotice({ type: 'error', message: `Failed to delete: ${error.message}` }); return; }
    setNotice({ type: 'success', message: `${deleteTarget.name} deleted.` });
    setDeleteTarget(null);
    setEditingId(null);
    await loadSponsors();
    if (isAdmin) await loadChanges();
  };

  const exportCsv = () => {
    const blob = new Blob([sponsorsToCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sponsors-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const editingSponsor = editingId && editingId !== 'new' ? sponsors.find((s) => s.id === editingId) : null;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-extrabold text-zinc-900">🤝 Sponsors</h1>
            <p className="mt-1 text-zinc-600">Every sponsor and partner — the deal, renewal date, payment, contact and where they&rsquo;re shown.</p>
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
                + Add sponsor
              </button>
            )}
          </div>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {/* ── Add / edit form ─────────────────────────────────────── */}
        {editingId !== null && (
          <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-blue-200">
            <div className="border-b border-blue-200 bg-blue-50 px-5 py-3">
              <h2 className="text-lg font-semibold text-zinc-900">{editingSponsor ? `Edit ${editingSponsor.name}` : 'New sponsor'}</h2>
              {editingSponsor?.updated_by && (
                <p className="text-xs text-zinc-500">
                  Last updated {new Date(editingSponsor.updated_at).toLocaleDateString('en-GB')} by {editingSponsor.updated_by}
                </p>
              )}
            </div>
            <form className="space-y-6 px-5 py-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-zinc-900">Sponsor</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Name *" className="lg:col-span-2">
                    <input className={inputClass} value={text('name')} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Coolair" />
                  </Field>
                  <Field label="Category">
                    <select className={inputClass} value={text('category')} onChange={(e) => set('category', e.target.value)}>
                      {SPONSOR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label={text('category') === 'Player sponsor' ? 'Player' : 'What they sponsor'}>
                    <input className={inputClass} value={text('sponsors_what')} onChange={(e) => set('sponsors_what', e.target.value)} placeholder={text('category') === 'Player sponsor' ? 'Player name' : 'e.g. 2nd XV, Ladies Player of the Match'} />
                  </Field>
                  <Field label="Status">
                    <select className={inputClass} value={text('status')} onChange={(e) => set('status', e.target.value)}>
                      {SPONSOR_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Club contact (who looks after them)">
                    <input className={inputClass} value={text('club_contact')} onChange={(e) => set('club_contact', e.target.value)} />
                  </Field>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-zinc-900">Deal</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Package">
                    <input list="sponsor-packages" className={inputClass} value={text('package')} onChange={(e) => set('package', e.target.value)} placeholder="e.g. Kit sponsor" />
                  </Field>
                  <Field label="Value (£ a season)">
                    <input inputMode="decimal" className={inputClass} value={text('value')} onChange={(e) => set('value', e.target.value)} placeholder="0.00" />
                  </Field>
                  <Field label="Cash or in kind">
                    <select className={inputClass} value={text('value_type')} onChange={(e) => set('value_type', e.target.value)}>
                      {VALUE_TYPES.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Payment">
                    <select className={inputClass} value={text('payment_status')} onChange={(e) => set('payment_status', e.target.value)}>
                      <option value="">—</option>
                      {PAYMENT_STATUSES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Invoice ref">
                    <input className={inputClass} value={text('invoice_ref')} onChange={(e) => set('invoice_ref', e.target.value)} />
                  </Field>
                  <Field label="Start date">
                    <input type="date" className={inputClass} value={text('start_date')} onChange={(e) => set('start_date', e.target.value)} />
                  </Field>
                  <Field label="Renewal date">
                    <input type="date" className={inputClass} value={text('renewal_date')} onChange={(e) => set('renewal_date', e.target.value)} />
                  </Field>
                  <Field label="Last contacted">
                    <input type="date" className={inputClass} value={text('last_contacted')} onChange={(e) => set('last_contacted', e.target.value)} />
                  </Field>
                </div>
                <datalist id="sponsor-packages">{PACKAGES.map((p) => <option key={p} value={p} />)}</datalist>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-zinc-900">Their contact</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Contact name">
                    <input className={inputClass} value={text('contact_name')} onChange={(e) => set('contact_name', e.target.value)} />
                  </Field>
                  <Field label="Email">
                    <input type="email" className={inputClass} value={text('contact_email')} onChange={(e) => set('contact_email', e.target.value)} />
                  </Field>
                  <Field label="Phone">
                    <input className={inputClass} value={text('contact_phone')} onChange={(e) => set('contact_phone', e.target.value)} />
                  </Field>
                  <Field label="Address" className="sm:col-span-2 lg:col-span-3">
                    <input className={inputClass} value={text('address')} onChange={(e) => set('address', e.target.value)} />
                  </Field>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-zinc-900">What they get</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Their website">
                    <input type="url" className={inputClass} value={text('website')} onChange={(e) => set('website', e.target.value)} placeholder="https://…" />
                  </Field>
                  <Field label="Their page on aldwinians.co.uk">
                    <input type="url" className={inputClass} value={text('page_url')} onChange={(e) => set('page_url', e.target.value)} placeholder="https://www.aldwinians.co.uk/…" />
                  </Field>
                  <Field label="Member offer">
                    <input className={inputClass} value={text('member_offer')} onChange={(e) => set('member_offer', e.target.value)} placeholder="e.g. 10% off for members" />
                  </Field>
                  <Field label="Benefits">
                    <input className={inputClass} value={text('benefits')} onChange={(e) => set('benefits', e.target.value)} placeholder="e.g. shirt logo, 4 social posts, matchday hospitality" />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-5">
                  {([['on_website', 'Has a page on the website'], ['in_footer', 'Logo in the website footer'], ['in_programme', 'In the matchday programme']] as const).map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 text-sm text-zinc-700">
                      <input type="checkbox" checked={!!draft[field]} onChange={(e) => set(field, e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field label="Notes">
                <textarea className={inputClass} rows={3} value={text('notes')} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. agreed at the September meeting, wants a pitchside board next season" />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4">
                {editingSponsor ? (
                  <button type="button" onClick={() => setDeleteTarget(editingSponsor)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
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
              <StatTile
                label="Current sponsors"
                value={String(current.length)}
                detail={`${current.filter((s) => s.category === 'Player sponsor').length} player sponsors · ${sponsors.filter((s) => s.status === 'Prospect').length} prospects`}
              />
              <StatTile
                label="Cash value"
                value={formatMoney(cashValue)}
                detail={missingDetails ? `${missingDetails} current sponsors have no value or renewal date yet` : 'Current deals, not counting in-kind'}
              />
              <StatTile
                label={`Renewals in ${DUE_WINDOW_DAYS} days`}
                value={String(comingUp.filter((r) => r.daysAway >= 0).length)}
                detail={`${comingUp.filter((r) => r.daysAway < 0).length} past their renewal date`}
                tone={comingUp.some((r) => r.daysAway < 0) ? 'danger' : comingUp.length ? 'warning' : undefined}
              />
              <StatTile
                label="Awaiting payment"
                value={String(unpaid.length)}
                detail={overdueCount ? `${overdueCount} overdue` : 'Invoiced but not yet paid'}
                tone={overdueCount ? 'danger' : unpaid.length ? 'warning' : undefined}
              />
            </section>

            {/* ── Website updates (admins) ─────────────────────────── */}
            {isAdmin && (
              <section className="mb-8 rounded-2xl bg-white shadow-sm ring-1 ring-violet-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">
                      🌐 Website updates
                      {pendingChanges.length > 0 && (
                        <span className="ml-2 rounded-full bg-violet-600 px-2 py-0.5 text-xs font-bold text-white align-middle">{pendingChanges.length}</span>
                      )}
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Sponsors added, changed or removed here. Update aldwinians.co.uk to match, then tick them off. Only admins see this.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-zinc-700">
                      <input type="checkbox" checked={showDoneChanges} onChange={(e) => setShowDoneChanges(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                      Show done
                    </label>
                    {pendingChanges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => void markChangesDone(pendingChanges.map((c) => c.id))}
                        className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
                      >
                        Mark all done
                      </button>
                    )}
                  </div>
                </div>
                {shownChanges.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-zinc-400">
                    {changes.length === 0 ? 'No changes logged yet.' : 'The website is up to date with every change.'}
                  </p>
                ) : (
                  <ul className="max-h-[28rem] divide-y divide-zinc-100 overflow-y-auto">
                    {shownChanges.map((c) => (
                      <li key={c.id} className={`flex flex-wrap items-start justify-between gap-3 px-5 py-3 ${c.website_done ? 'opacity-60' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-zinc-900">
                            <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${ACTION_BADGE[c.action]}`}>{c.action}</span>
                            <span className="font-medium">{c.sponsor_name}</span>
                            {c.sponsors_what && <span className="text-zinc-500"> · {c.sponsors_what}</span>}
                            {c.category && <span className="text-zinc-400"> · {c.category}</span>}
                          </p>
                          <ChangeDetails change={c} />
                          <p className="mt-1 text-xs text-zinc-400">
                            {new Date(c.changed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {' · '}{c.changed_by ?? 'unknown'}
                            {c.website_done && c.done_at && ` · website updated ${new Date(c.done_at).toLocaleDateString('en-GB')}${c.done_by ? ` by ${c.done_by}` : ''}`}
                          </p>
                        </div>
                        {!c.website_done && (
                          <button
                            type="button"
                            onClick={() => void markChangesDone([c.id])}
                            className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            ✓ Done
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* ── Coming up ────────────────────────────────────────── */}
            <section className="mb-8 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-zinc-900">Renewals and follow-ups</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Renewals due in the next {DUE_WINDOW_DAYS} days or already passed, plus sponsors marked Renewal due or Lapsed</p>
              </div>
              {comingUp.length === 0 && followUps.length === 0 ? (
                <p className="px-5 py-6 text-sm text-zinc-400">Nothing to chase right now. Add renewal dates to sponsors to see them here.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {comingUp.map(({ sponsor: s, daysAway }) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">🔁 {s.name}{s.sponsors_what ? ` · ${s.sponsors_what}` : ''}</p>
                        <p className="text-xs text-zinc-500">
                          Renewal {formatSponsorDate(s.renewal_date)}
                          {s.value != null ? ` · ${formatMoney(s.value)}` : ''}
                          {s.club_contact ? ` · ${s.club_contact}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DueBadge days={daysAway} />
                        {canEdit && editingId === null && (
                          <button type="button" onClick={() => startEdit(s)} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                            Update
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                  {followUps.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">📞 {s.name}{s.sponsors_what ? ` · ${s.sponsors_what}` : ''}</p>
                        <p className="text-xs text-zinc-500">
                          {s.last_contacted ? `Last contacted ${formatSponsorDate(s.last_contacted)}` : 'No contact logged'}
                          {s.club_contact ? ` · ${s.club_contact}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status]}`}>{s.status}</span>
                        {canEdit && editingId === null && (
                          <button type="button" onClick={() => startEdit(s)} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
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
                placeholder="Search name, player, contact, notes…"
                className="min-w-0 flex-1 basis-60 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm" aria-label="Category">
                <option value="all">All categories</option>
                {SPONSOR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm" aria-label="Status">
                <option value="current">Current (active + renewal due)</option>
                <option value="all">All statuses</option>
                {SPONSOR_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* ── List ─────────────────────────────────────────────── */}
            {filtered.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                {sponsors.length === 0 ? 'No sponsors yet. Run supabase/policies/sponsors.sql to load the ones on the website.' : 'No sponsors match those filters.'}
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Sponsor</th>
                        <th className="hidden px-4 py-3 font-semibold md:table-cell">Category</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 text-right font-semibold">Value</th>
                        <th className="hidden px-4 py-3 font-semibold lg:table-cell">Payment</th>
                        <th className="px-4 py-3 font-semibold">Renewal</th>
                        {canEdit && <th className="px-4 py-3"><span className="sr-only">Edit</span></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filtered.map((s) => (
                        <tr key={s.id} className={s.status === 'Ended' ? 'text-zinc-400' : ''}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-zinc-900">{s.name}</p>
                            <p className="text-xs text-zinc-500">
                              {[s.sponsors_what, s.package, s.member_offer && `Offer: ${s.member_offer}`].filter(Boolean).join(' · ')}
                            </p>
                            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                              {s.page_url && <a href={s.page_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Club page</a>}
                              {s.website && <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Their website</a>}
                              {s.contact_email && <a href={`mailto:${s.contact_email}`} className="text-blue-600 hover:underline">Email</a>}
                              {s.contact_phone && <a href={`tel:${s.contact_phone.replace(/\s+/g, '')}`} className="text-blue-600 hover:underline">{s.contact_phone}</a>}
                            </p>
                          </td>
                          <td className="hidden px-4 py-3 text-zinc-700 md:table-cell">{s.category}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status]}`}>{s.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                            {formatMoney(s.value)}
                            {s.value != null && s.value_type !== 'Cash' && <span className="block text-xs text-zinc-400">{s.value_type}</span>}
                          </td>
                          <td className={`hidden px-4 py-3 lg:table-cell ${PAYMENT_BADGE[s.payment_status ?? ''] ?? 'text-zinc-400'}`}>{s.payment_status ?? '—'}</td>
                          <td className="px-4 py-3 text-zinc-700">{formatSponsorDate(s.renewal_date)}</td>
                          {canEdit && (
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => startEdit(s)}
                                disabled={editingId !== null}
                                className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                              >
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
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
        title={`Delete ${deleteTarget?.name ?? 'sponsor'}?`}
        description="This removes them from the tracker completely. To keep a record, set their status to Ended instead."
        confirmLabel="Delete"
        onConfirm={deleteSponsor}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </main>
  );
}
