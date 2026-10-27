import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  type Applicant,
  type ApplicantStage,
  type ImportedApplicant,
  type Vacancy,
  APPLICANT_STAGES,
  STAGE_STYLES,
  VACANCY_STATUSES,
  applicantKey,
  formatUkDate,
  parseIndeedCsv,
} from '../../lib/vacancies';

// Jobs the club advertises on Indeed, and who has applied. Indeed has no API
// for small employers, so applicants come from its candidate export (.csv):
// uploading it adds new applicants and refreshes existing ones, keeping the
// club's own stage and notes. Admins, trustees and directors only (proxy.ts
// and supabase/policies/vacancies.sql) — applicants' details are personal data.

const EMPTY_VACANCY = { title: '', location: '', indeed_url: '', posted_date: '', closing_date: '', notes: '' };
const EMPTY_APPLICANT = { name: '', email: '', phone: '', notes: '' };
const ACTIVE_STAGES = new Set<ApplicantStage>(['New', 'Shortlisted', 'Interview', 'Offered']);

const inputClass = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none';

export default function VacanciesPage() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const [vacancyForm, setVacancyForm] = useState<typeof EMPTY_VACANCY | null>(null);
  const [editingVacancyId, setEditingVacancyId] = useState<string | null>(null);
  const [applicantForm, setApplicantForm] = useState<typeof EMPTY_APPLICANT | null>(null);
  const [stageFilter, setStageFilter] = useState<'active' | 'all' | ApplicantStage>('active');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ fileName: string; rows: ImportedApplicant[]; newCount: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'vacancy'; item: Vacancy } | { kind: 'applicant'; item: Applicant } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const load = async () => {
    const [v, a] = await Promise.all([
      supabase.from('vacancies').select('*').order('created_at', { ascending: false }),
      supabase.from('vacancy_applicants').select('*').order('applied_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    ]);
    if (v.error || a.error) {
      setNotice({ type: 'error', message: `Failed to load: ${(v.error ?? a.error)!.message}` });
    } else {
      const list = v.data as Vacancy[];
      setVacancies(list);
      setApplicants(a.data as Applicant[]);
      setSelectedId((current) => (current && list.some((x) => x.id === current) ? current : list.find((x) => x.status === 'Open')?.id ?? list[0]?.id ?? null));
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? '');
      await load();
    };
    void init();
  }, []);

  const selected = vacancies.find((v) => v.id === selectedId) ?? null;
  const forSelected = useMemo(() => applicants.filter((a) => a.vacancy_id === selectedId), [applicants, selectedId]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(APPLICANT_STAGES.map((s) => [s, 0])) as Record<ApplicantStage, number>;
    for (const a of forSelected) c[a.stage] = (c[a.stage] ?? 0) + 1;
    return c;
  }, [forSelected]);
  const shown = forSelected.filter((a) => {
    if (stageFilter === 'active' && !ACTIVE_STAGES.has(a.stage)) return false;
    if (stageFilter !== 'active' && stageFilter !== 'all' && a.stage !== stageFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || [a.name, a.email, a.location, a.experience].some((f) => f?.toLowerCase().includes(q));
  });

  // ── Vacancies ──────────────────────────────────────────────────────────
  const saveVacancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vacancyForm) return;
    setBusy(true);
    const row = {
      title: vacancyForm.title.trim(),
      location: vacancyForm.location.trim() || null,
      indeed_url: vacancyForm.indeed_url.trim() || null,
      posted_date: vacancyForm.posted_date || null,
      closing_date: vacancyForm.closing_date || null,
      notes: vacancyForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: userEmail,
    };
    const { data, error } = editingVacancyId
      ? await supabase.from('vacancies').update(row).eq('id', editingVacancyId).select().single()
      : await supabase.from('vacancies').insert(row).select().single();
    setBusy(false);
    if (error) {
      setNotice({ type: 'error', message: `Failed to save the vacancy: ${error.message}` });
      return;
    }
    setNotice({ type: 'success', message: editingVacancyId ? 'Vacancy updated.' : 'Vacancy added. Now upload the applicants from Indeed.' });
    setVacancyForm(null);
    setEditingVacancyId(null);
    setSelectedId((data as Vacancy).id);
    await load();
  };

  const setVacancyStatus = async (vacancy: Vacancy, status: Vacancy['status']) => {
    const { error } = await supabase.from('vacancies').update({ status, updated_at: new Date().toISOString(), updated_by: userEmail }).eq('id', vacancy.id);
    if (error) setNotice({ type: 'error', message: `Failed to update: ${error.message}` });
    else await load();
  };

  // ── Indeed upload ──────────────────────────────────────────────────────
  const readFile = async (file: File) => {
    try {
      const rows = parseIndeedCsv(await file.text());
      if (rows.length === 0) {
        setNotice({ type: 'error', message: 'No applicants found in that file.' });
        return;
      }
      const existing = new Set(forSelected.map((a) => a.dedupe_key));
      setPreview({ fileName: file.name, rows, newCount: rows.filter((r) => !existing.has(r.dedupe_key)).length });
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Could not read that file.' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const applyImport = async () => {
    if (!preview || !selectedId) return;
    setBusy(true);
    // Only Indeed's own fields are sent, so on conflict the club's stage and
    // notes are left as they are.
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('vacancy_applicants')
      .upsert(preview.rows.map((r) => ({ ...r, vacancy_id: selectedId, updated_at: now, updated_by: userEmail })), { onConflict: 'vacancy_id,dedupe_key' });
    setBusy(false);
    if (error) {
      setNotice({ type: 'error', message: `Upload failed: ${error.message}` });
      return;
    }
    setNotice({ type: 'success', message: `${preview.newCount} new applicant${preview.newCount === 1 ? '' : 's'} added, ${preview.rows.length - preview.newCount} updated.` });
    setPreview(null);
    await load();
  };

  // ── Applicants ─────────────────────────────────────────────────────────
  const addApplicant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicantForm || !selectedId) return;
    const base = { name: applicantForm.name.trim(), email: applicantForm.email.trim() || null, phone: applicantForm.phone.trim() || null };
    setBusy(true);
    const { error } = await supabase.from('vacancy_applicants').insert({
      ...base,
      vacancy_id: selectedId,
      dedupe_key: applicantKey(base),
      notes: applicantForm.notes.trim() || null,
      applied_date: new Date().toISOString().slice(0, 10),
      source: 'Added by hand',
      updated_by: userEmail,
    });
    setBusy(false);
    if (error) {
      setNotice({ type: 'error', message: error.code === '23505' ? 'That person is already listed for this vacancy.' : `Failed to add: ${error.message}` });
      return;
    }
    setApplicantForm(null);
    setNotice({ type: 'success', message: `${base.name} added.` });
    await load();
  };

  const updateApplicant = async (applicant: Applicant, changes: Partial<Applicant>, message?: string) => {
    setApplicants((list) => list.map((a) => (a.id === applicant.id ? { ...a, ...changes } : a)));
    const { error } = await supabase
      .from('vacancy_applicants')
      .update({ ...changes, updated_at: new Date().toISOString(), updated_by: userEmail })
      .eq('id', applicant.id);
    if (error) {
      setNotice({ type: 'error', message: `Failed to save: ${error.message}` });
      await load();
    } else if (message) {
      setNotice({ type: 'success', message });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const table = deleteTarget.kind === 'vacancy' ? 'vacancies' : 'vacancy_applicants';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.item.id);
    setBusy(false);
    if (error) {
      setNotice({ type: 'error', message: `Failed to delete: ${error.message}` });
      return;
    }
    setDeleteTarget(null);
    setNotice({ type: 'success', message: 'Deleted.' });
    await load();
  };

  const applicantCount = (vacancyId: string) => applicants.filter((a) => a.vacancy_id === vacancyId).length;
  const newCount = (vacancyId: string) => applicants.filter((a) => a.vacancy_id === vacancyId && a.stage === 'New').length;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">💼 Vacancies &amp; Applicants</h1>
          <p className="mt-1 text-zinc-600">Jobs advertised on Indeed and who has applied. Visible to admins, trustees and directors only.</p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        {/* Vacancy list */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">Vacancies</h2>
            <button
              type="button"
              onClick={() => { setVacancyForm(EMPTY_VACANCY); setEditingVacancyId(null); }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add vacancy
            </button>
          </div>

          {vacancyForm && (
            <form onSubmit={saveVacancy} className="mb-4 grid gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-zinc-700">Job title</span>
                <input required value={vacancyForm.title} onChange={(e) => setVacancyForm({ ...vacancyForm, title: e.target.value })} className={inputClass} placeholder="e.g. Bar Manager" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Location</span>
                <input value={vacancyForm.location} onChange={(e) => setVacancyForm({ ...vacancyForm, location: e.target.value })} className={inputClass} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Indeed job link</span>
                <input type="url" value={vacancyForm.indeed_url} onChange={(e) => setVacancyForm({ ...vacancyForm, indeed_url: e.target.value })} className={inputClass} placeholder="https://uk.indeed.com/…" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Posted</span>
                <input type="date" value={vacancyForm.posted_date} onChange={(e) => setVacancyForm({ ...vacancyForm, posted_date: e.target.value })} className={inputClass} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Closing date</span>
                <input type="date" value={vacancyForm.closing_date} onChange={(e) => setVacancyForm({ ...vacancyForm, closing_date: e.target.value })} className={inputClass} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-zinc-700">Notes</span>
                <textarea rows={2} value={vacancyForm.notes} onChange={(e) => setVacancyForm({ ...vacancyForm, notes: e.target.value })} className={inputClass} />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {editingVacancyId ? 'Save changes' : 'Add vacancy'}
                </button>
                <button type="button" onClick={() => { setVacancyForm(null); setEditingVacancyId(null); }} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : vacancies.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
              No vacancies yet. Add the job you’ve posted on Indeed to start.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {vacancies.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={`rounded-2xl bg-white p-4 text-left shadow-sm ring-1 transition ${v.id === selectedId ? 'ring-2 ring-blue-500' : 'ring-zinc-200 hover:ring-blue-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-zinc-900">{v.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${v.status === 'Open' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>{v.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">
                    {applicantCount(v.id)} applicant{applicantCount(v.id) === 1 ? '' : 's'}
                    {newCount(v.id) > 0 && <span className="font-medium text-blue-700"> · {newCount(v.id)} new</span>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {v.location ? `${v.location} · ` : ''}{v.closing_date ? `Closes ${formatUkDate(v.closing_date)}` : 'No closing date'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <section>
            <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-zinc-900">{selected.title}</h2>
                  <p className="text-sm text-zinc-600">
                    {selected.posted_date && `Posted ${formatUkDate(selected.posted_date)}`}
                    {selected.posted_date && selected.closing_date && ' · '}
                    {selected.closing_date && `Closes ${formatUkDate(selected.closing_date)}`}
                  </p>
                  {selected.indeed_url && (
                    <a href={selected.indeed_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline">View on Indeed ↗</a>
                  )}
                  {selected.notes && <p className="mt-2 whitespace-pre-line text-sm text-zinc-600">{selected.notes}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Vacancy status"
                    value={selected.status}
                    onChange={(e) => void setVacancyStatus(selected, e.target.value as Vacancy['status'])}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                  >
                    {VACANCY_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingVacancyId(selected.id);
                      setVacancyForm({
                        title: selected.title,
                        location: selected.location ?? '',
                        indeed_url: selected.indeed_url ?? '',
                        posted_date: selected.posted_date ?? '',
                        closing_date: selected.closing_date ?? '',
                        notes: selected.notes ?? '',
                      });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => setDeleteTarget({ kind: 'vacancy', item: selected })} className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50">
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-7">
                {APPLICANT_STAGES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStageFilter(stageFilter === s ? 'all' : s)}
                    className={`rounded-lg p-2 text-center ring-1 ${stageFilter === s ? 'ring-blue-500' : 'ring-zinc-100'} ${STAGE_STYLES[s]}`}
                  >
                    <p className="text-lg font-bold">{counts[s]}</p>
                    <p className="text-xs">{s}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Upload / add */}
            <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
                <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                  Upload Indeed export (.csv)
                </button>
                <button type="button" onClick={() => setApplicantForm(EMPTY_APPLICANT)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  + Add applicant by hand
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                In Indeed: Employer dashboard → Candidates → filter to this job → tick all → Export. Upload it again any time — new applicants are
                added and existing ones updated; stages and notes here are kept.
              </p>

              {preview && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-medium">
                    {preview.fileName}: {preview.rows.length} applicant{preview.rows.length === 1 ? '' : 's'} — {preview.newCount} new, {preview.rows.length - preview.newCount} already listed.
                  </p>
                  <p className="mt-1 text-xs">Adding to <strong>{selected.title}</strong>.</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void applyImport()} className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      Save
                    </button>
                    <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-medium text-blue-800 hover:bg-blue-100">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {applicantForm && (
                <form onSubmit={addApplicant} className="mt-4 grid gap-2 sm:grid-cols-3">
                  <input required placeholder="Name" value={applicantForm.name} onChange={(e) => setApplicantForm({ ...applicantForm, name: e.target.value })} className={inputClass} />
                  <input type="email" placeholder="Email" value={applicantForm.email} onChange={(e) => setApplicantForm({ ...applicantForm, email: e.target.value })} className={inputClass} />
                  <input placeholder="Phone" value={applicantForm.phone} onChange={(e) => setApplicantForm({ ...applicantForm, phone: e.target.value })} className={inputClass} />
                  <input placeholder="Notes (optional)" value={applicantForm.notes} onChange={(e) => setApplicantForm({ ...applicantForm, notes: e.target.value })} className={`${inputClass} sm:col-span-3`} />
                  <div className="flex gap-2 sm:col-span-3">
                    <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Add</button>
                    <button type="button" onClick={() => setApplicantForm(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">Cancel</button>
                  </div>
                </form>
              )}
            </div>

            {/* Applicant list */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-zinc-900">Applicants</h3>
              <div className="flex flex-wrap gap-2">
                <input type="search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm" />
                <select
                  aria-label="Filter by stage"
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                >
                  <option value="active">Still in the running</option>
                  <option value="all">Everyone</option>
                  {APPLICANT_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                {forSelected.length === 0 ? 'No applicants yet. Upload the Indeed export to see them here.' : 'Nobody matches this filter.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {shown.map((a) => {
                  const open = openId === a.id;
                  const note = noteDrafts[a.id] ?? a.notes ?? '';
                  return (
                    <li key={a.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <button type="button" onClick={() => setOpenId(open ? null : a.id)} className="min-w-0 text-left">
                          <p className="font-semibold text-zinc-900">
                            {a.name}
                            {a.source !== 'Indeed' && <span className="ml-2 text-xs font-normal text-zinc-500">({a.source.toLowerCase()})</span>}
                          </p>
                          <p className="text-sm text-zinc-600">
                            Applied {formatUkDate(a.applied_date)}{a.location ? ` · ${a.location}` : ''}
                          </p>
                          {a.experience && <p className="truncate text-sm text-zinc-500">{a.experience}</p>}
                        </button>
                        <select
                          aria-label={`Stage for ${a.name}`}
                          value={a.stage}
                          onChange={(e) => void updateApplicant(a, { stage: e.target.value as ApplicantStage }, `${a.name} moved to ${e.target.value}.`)}
                          className={`rounded-full border-0 px-3 py-1 text-sm font-medium ${STAGE_STYLES[a.stage]}`}
                        >
                          {APPLICANT_STAGES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </div>

                      {open && (
                        <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3 text-sm">
                          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                            {a.email && (<><dt className="text-zinc-500">Email</dt><dd><a href={`mailto:${a.email}`} className="text-blue-600 hover:underline">{a.email}</a></dd></>)}
                            {a.phone && (<><dt className="text-zinc-500">Phone</dt><dd><a href={`tel:${a.phone}`} className="text-blue-600 hover:underline">{a.phone}</a></dd></>)}
                            {a.education && (<><dt className="text-zinc-500">Education</dt><dd className="text-zinc-800">{a.education}</dd></>)}
                            {a.qualifications && (<><dt className="text-zinc-500">Qualifications</dt><dd className="whitespace-pre-line text-zinc-800">{a.qualifications}</dd></>)}
                            {a.indeed_status && (<><dt className="text-zinc-500">Indeed status</dt><dd className="text-zinc-800">{a.indeed_status}</dd></>)}
                            {a.cv_url && (<><dt className="text-zinc-500">CV</dt><dd><a href={a.cv_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Open CV ↗</a></dd></>)}
                          </dl>

                          <label className="block">
                            <span className="mb-1 block font-medium text-zinc-700">Interview</span>
                            <input
                              type="datetime-local"
                              value={a.interview_at ? toLocalInput(a.interview_at) : ''}
                              onChange={(e) => void updateApplicant(a, { interview_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block font-medium text-zinc-700">Notes</span>
                            <textarea rows={3} value={note} onChange={(e) => setNoteDrafts({ ...noteDrafts, [a.id]: e.target.value })} className={inputClass} />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={note === (a.notes ?? '')}
                              onClick={() => void updateApplicant(a, { notes: note.trim() || null }, 'Notes saved.')}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                            >
                              Save notes
                            </button>
                            <button type="button" onClick={() => setDeleteTarget({ kind: 'applicant', item: a })} className="rounded-lg border border-rose-200 px-3 py-1.5 font-medium text-rose-600 hover:bg-rose-50">
                              Remove applicant
                            </button>
                          </div>
                        </div>
                      )}
                      {!open && a.interview_at && (
                        <p className="mt-2 text-sm font-medium text-amber-700">
                          Interview {new Date(a.interview_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.kind === 'vacancy' ? 'Delete this vacancy?' : 'Remove this applicant?'}
        description={
          deleteTarget?.kind === 'vacancy'
            ? `${deleteTarget.item.title} and all ${applicantCount(deleteTarget.item.id)} of its applicants will be deleted.`
            : deleteTarget
              ? `${deleteTarget.item.name} will be removed from this vacancy. Uploading the Indeed export again would add them back.`
              : ''
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        loading={busy}
      />
    </main>
  );
}

// ISO timestamp → the value a datetime-local input expects, in local time.
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
