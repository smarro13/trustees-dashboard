-- Director of Rugby role ('dor')
--
-- A role limited to two pages (proxy.ts DOR_PATHS):
--   /agenda/rugby           rugby_reports  read + write; meetings  read
--   /operations/membership  membership_*   read (comments go through
--                           pages/api/private/membership-note.ts, which
--                           allows 'dor'; uploads and hiding stay admin-only)
--
-- These are extra PERMISSIVE policies, so they only add access for 'dor' and
-- change nothing for any other role. They assume fix_rls_role_model.sql has
-- been run (it removed the RESTRICTIVE role_guard_* policies, which would
-- otherwise still block this role on rugby_reports).
--
-- The predicate reads the role straight from the JWT, the same way
-- fix_rls_role_model.sql and membership.sql do. A user given the role must
-- sign in again (or use Force sign out on the Roles page) to pick it up.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

begin;

-- Rugby reports: read and write
drop policy if exists "dor manage rugby_reports" on public.rugby_reports;
create policy "dor manage rugby_reports"
  on public.rugby_reports
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'dor')
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'dor');

-- Meetings: read, for the Rugby page's meeting picker
drop policy if exists "dor read meetings" on public.meetings;
create policy "dor read meetings"
  on public.meetings
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'dor');

-- Membership: read
drop policy if exists "dor read membership_imports" on public.membership_imports;
create policy "dor read membership_imports"
  on public.membership_imports
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'dor');

drop policy if exists "dor read membership_members" on public.membership_members;
create policy "dor read membership_members"
  on public.membership_members
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'dor');

drop policy if exists "dor read membership_players" on public.membership_players;
create policy "dor read membership_players"
  on public.membership_players
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'dor');

drop policy if exists "dor read membership_notes" on public.membership_notes;
create policy "dor read membership_notes"
  on public.membership_notes
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'dor');

commit;

-- Check: should list the six policies above.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and policyname like 'dor %'
order by tablename;
