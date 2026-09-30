-- Matchday programme opens
--
-- One row each time someone opens the matchday programme through the
-- tracking link (pages/api/public/programme.ts), which then redirects them to
-- the PDF. No IP addresses or other personal data are stored — just when,
-- which link (source) and the rough device type.
--
--   programme_opens : SELECT any logged-in dashboard user
--                     INSERT/UPDATE/DELETE nobody (the tracking route writes
--                     with the service role key, which bypasses RLS)
--
-- Read by /operations/programme-stats. Run once in the Supabase SQL editor.
-- Idempotent — safe to re-run.

begin;

create table if not exists public.programme_opens (
  id bigint generated always as identity primary key,
  opened_at timestamptz not null default now(),
  source text not null default 'direct',
  device text not null default 'unknown',
  referrer_host text
);

create index if not exists programme_opens_opened_at_idx
  on public.programme_opens (opened_at desc);

alter table public.programme_opens enable row level security;

revoke all on public.programme_opens from anon;

drop policy if exists "dashboard read programme_opens" on public.programme_opens;

create policy "dashboard read programme_opens"
  on public.programme_opens
  for select
  to authenticated
  using (true);

-- Totals for the dashboard, so it never has to page through raw rows.
-- security_invoker makes the views obey the RLS policy above.
-- Weeks run Monday–Sunday (UK time), so each week holds one Saturday matchday.
create or replace view public.programme_opens_weekly
  with (security_invoker = true) as
select
  date_trunc('week', opened_at at time zone 'Europe/London')::date as week_start,
  count(*)::int as opens,
  (count(*) filter (where device = 'mobile'))::int as mobile,
  (count(*) filter (where device = 'desktop'))::int as desktop,
  (count(*) filter (where device = 'tablet'))::int as tablet
from public.programme_opens
group by 1;

create or replace view public.programme_opens_by_source
  with (security_invoker = true) as
select
  source,
  count(*)::int as opens,
  max(opened_at) as last_opened_at
from public.programme_opens
group by source;

grant select on public.programme_opens_weekly, public.programme_opens_by_source to authenticated;
revoke all on public.programme_opens_weekly, public.programme_opens_by_source from anon;

commit;
