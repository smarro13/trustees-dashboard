-- Membership access for individual users (28 Oct 2026)
--
-- Lets an admin give one person read access to /operations/membership without
-- changing their role, e.g. a coach on the commercial team. The switch is the
-- "Membership" column on /admin/roles, which sets app_metadata.membership_access
-- = true. app_metadata can only be written with the service key, so users
-- can't grant it to themselves.
--
-- Read only, like the Director of Rugby (dor_role.sql). Comments go through
-- pages/api/private/membership-note.ts, which also allows the flag; uploads,
-- fetches and hiding stay admin-only.
--
-- These are extra PERMISSIVE policies, so they only add access. The user must
-- sign in again (or use Force sign out on the Roles page) after the switch is
-- turned on or off, so their token carries the change.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

begin;

drop policy if exists "flag read membership_imports" on public.membership_imports;
create policy "flag read membership_imports"
  on public.membership_imports
  for select
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'membership_access')::boolean, false));

drop policy if exists "flag read membership_members" on public.membership_members;
create policy "flag read membership_members"
  on public.membership_members
  for select
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'membership_access')::boolean, false));

drop policy if exists "flag read membership_players" on public.membership_players;
create policy "flag read membership_players"
  on public.membership_players
  for select
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'membership_access')::boolean, false));

drop policy if exists "flag read membership_notes" on public.membership_notes;
create policy "flag read membership_notes"
  on public.membership_notes
  for select
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'membership_access')::boolean, false));

drop policy if exists "flag read membership_loveadmin" on public.membership_loveadmin;
create policy "flag read membership_loveadmin"
  on public.membership_loveadmin
  for select
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'membership_access')::boolean, false));

commit;

-- Check: should list the five policies above.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and policyname like 'flag read %'
order by tablename;
