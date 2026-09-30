-- Presidents Lotto winner notifications
--
-- Member email addresses live in their own table, locked to the admin role,
-- so they never reach anyone else's browser. presidents_lotto_members stays
-- readable by the lotto page as before.
--
--   presidents_lotto_member_contacts : SELECT/INSERT/UPDATE/DELETE admin only
--
-- pages/api/private/lotto-notify.ts reads it with the service role key (which
-- bypasses RLS) to email the winners of a saved draw, so any role that can
-- run the draw can trigger the emails without seeing the addresses.
--
-- Also adds presidents_lotto_draws.winners_notified_at so a draw can't be
-- announced twice.
--
-- The predicate reads the role straight from the JWT, the same way
-- fix_rls_role_model.sql does. Run once in the Supabase SQL editor.
-- Idempotent — safe to re-run.

begin;

create table if not exists public.presidents_lotto_member_contacts (
  member_id uuid primary key references public.presidents_lotto_members(id) on delete cascade,
  email text not null,
  updated_at timestamptz not null default now()
);

alter table public.presidents_lotto_member_contacts enable row level security;

-- No anonymous access at all, even if a policy is later loosened.
revoke all on public.presidents_lotto_member_contacts from anon;

drop policy if exists "admin manage presidents_lotto_member_contacts"
  on public.presidents_lotto_member_contacts;

create policy "admin manage presidents_lotto_member_contacts"
  on public.presidents_lotto_member_contacts
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'admin')
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'admin');

alter table public.presidents_lotto_draws
  add column if not exists winners_notified_at timestamptz;

commit;
