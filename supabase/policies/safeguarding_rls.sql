-- Row Level Security for public.safeguarding_updates
--
-- Mirrors the app-level access rules in lib/roles.ts / proxy.ts:
--   SELECT           : admin, trustee, safeguarding
--   INSERT/UPDATE/DEL: admin, safeguarding
--
-- Everyone else (director, president, commercial, no role) gets zero rows
-- back instead of an error, which matches what the client already hides.
-- Run this once in the Supabase SQL editor for this project.
--
-- Safe to re-run: enabling RLS on an already-RLS table is a no-op, and each
-- policy is dropped before being recreated.

-- Reads the caller's dashboard role out of their JWT app_metadata (falling
-- back to user_metadata), normalizing legacy/typo values the same way
-- lib/roles.ts's normalizeRole() does.
create or replace function public.dashboard_role()
returns text
language sql
stable
as $$
  select case lower(coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  ))
    when 'admin' then 'admin'
    when 'trustee' then 'trustee'
    when 'director' then 'director'
    when 'directors' then 'director'
    when 'management' then 'director'   -- legacy name for "director"
    when 'mangement' then 'director'    -- legacy typo
    when 'president' then 'president'
    when 'safeguarding' then 'safeguarding'
    when 'commercial' then 'commercial'
    when 'commerical' then 'commercial' -- typo accepted elsewhere in the app
    else null
  end;
$$;

alter table public.safeguarding_updates enable row level security;

drop policy if exists "safeguarding_updates_select" on public.safeguarding_updates;
create policy "safeguarding_updates_select"
  on public.safeguarding_updates
  for select
  to authenticated
  using (public.dashboard_role() in ('admin', 'trustee', 'safeguarding'));

drop policy if exists "safeguarding_updates_insert" on public.safeguarding_updates;
create policy "safeguarding_updates_insert"
  on public.safeguarding_updates
  for insert
  to authenticated
  with check (public.dashboard_role() in ('admin', 'safeguarding'));

drop policy if exists "safeguarding_updates_update" on public.safeguarding_updates;
create policy "safeguarding_updates_update"
  on public.safeguarding_updates
  for update
  to authenticated
  using (public.dashboard_role() in ('admin', 'safeguarding'))
  with check (public.dashboard_role() in ('admin', 'safeguarding'));

drop policy if exists "safeguarding_updates_delete" on public.safeguarding_updates;
create policy "safeguarding_updates_delete"
  on public.safeguarding_updates
  for delete
  to authenticated
  using (public.dashboard_role() in ('admin', 'safeguarding'));

-- Note: the /agenda/safeguarding upload form and pages/meeting/[id].tsx also
-- read/write this table using the browser (anon-key) Supabase client, so
-- these policies are what actually stops a Director from reading safeguarding
-- rows directly — the app-level menu/route guards are UX, not security.
-- Server-side admin API routes (pages/api/admin/*) use the service-role key,
-- which always bypasses RLS, so they are unaffected by this script.
