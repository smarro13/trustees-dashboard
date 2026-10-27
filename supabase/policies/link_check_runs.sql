-- Website broken link checks
--
-- One row per run of the link checker (lib/linkChecker.ts): weekly from
-- pages/api/cron/link-check.ts, or "Check now" on /admin/link-checker.
-- `problems` holds every broken or blocked link with the pages it's on.
--
--   link_check_runs : no access for anon or authenticated users. Admins read
--                     it through /api/admin/link-check, which checks the
--                     caller's role and uses the service role key (bypasses RLS).
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

begin;

create table if not exists public.link_check_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  triggered_by text not null default 'weekly check',
  site_url text not null,
  pages_checked int not null default 0,
  links_checked int not null default 0,
  broken_count int not null default 0,
  blocked_count int not null default 0,
  truncated boolean not null default false,
  problems jsonb not null default '[]'::jsonb
);

create index if not exists link_check_runs_started_at_idx
  on public.link_check_runs (started_at desc);

alter table public.link_check_runs enable row level security;

-- RLS on with no policies: only the service role can read or write.
revoke all on public.link_check_runs from anon, authenticated;

commit;
