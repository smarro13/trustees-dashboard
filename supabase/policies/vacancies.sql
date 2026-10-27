-- Vacancies and applicants
--
-- Jobs the club advertises (e.g. on Indeed) and the people who apply.
-- Applicants come from Indeed's candidate export (.csv), uploaded on
-- /operations/vacancies, or are added by hand. Re-uploading the export updates
-- the Indeed details but keeps the club's own stage and notes.
--
--   vacancies, vacancy_applicants : SELECT/INSERT/UPDATE/DELETE   admin, trustee, director
--
-- Applicants' contact details are personal data, so unlike most operations
-- tables nobody else can read them. Matches the /operations/vacancies rule in
-- proxy.ts. Run once in the Supabase SQL editor. Idempotent — safe to re-run.

begin;

create table if not exists public.vacancies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text,
  indeed_url text,
  posted_date date,
  closing_date date,
  status text not null default 'Open' check (status in ('Open', 'Closed', 'Filled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.vacancy_applicants (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references public.vacancies (id) on delete cascade,
  -- Lower-cased email, or name|phone when there's no email. Lets a re-upload
  -- of the Indeed export update people instead of adding them twice.
  dedupe_key text not null,
  name text not null,
  email text,
  phone text,
  location text,
  applied_date date,
  indeed_status text,
  experience text,
  education text,
  qualifications text,
  cv_url text,
  stage text not null default 'New'
    check (stage in ('New', 'Shortlisted', 'Interview', 'Offered', 'Hired', 'Rejected', 'Withdrawn')),
  interview_at timestamptz,
  notes text,
  source text not null default 'Indeed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (vacancy_id, dedupe_key)
);

create index if not exists vacancy_applicants_vacancy_idx on public.vacancy_applicants (vacancy_id);

alter table public.vacancies enable row level security;
alter table public.vacancy_applicants enable row level security;

revoke all on public.vacancies from anon;
revoke all on public.vacancy_applicants from anon;

drop policy if exists "governance manage vacancies" on public.vacancies;
drop policy if exists "governance manage vacancy applicants" on public.vacancy_applicants;

create policy "governance manage vacancies"
  on public.vacancies
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'))
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

create policy "governance manage vacancy applicants"
  on public.vacancy_applicants
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'))
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

commit;
