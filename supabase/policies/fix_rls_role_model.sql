-- Fixes the "missing permissions on the dashboard" reports: trustees (and,
-- after the management->director rename, directors) can't read or write the
-- agenda tables — e.g. Dave Taylor can't add an apology, the chairman sees
-- nothing outside the action tracker.
--
-- ROOT CAUSE — three overlapping RLS systems accumulated on these tables:
--
--   1. "<x> role manage <table>"  (PERMISSIVE, cmd ALL)
--      Predicate: coalesce(jwt app_metadata.role, jwt user_metadata.role)
--      in ('admin','management','safeguarding')  [+ 'commercial' on the
--      commercial tables, + 'commercial' on matters_arising].
--      This is the ONLY policy granting write access on most agenda tables.
--      It was written before the 'trustee' role existed and before
--      'management' was renamed to 'director', so it grants neither. Every
--      trustee and every user re-saved as 'director' is therefore locked
--      out at the database layer no matter what the app UI allows.
--
--   2. "read <table>"  ->  has_active_role(ARRAY['trustee','chairman',...])
--      (PERMISSIVE, SELECT). A separate chairman/secretary/treasurer role
--      model backed by its own table. Additive (permissive OR), so it can
--      only ever grant extra SELECT access — never blocks. Left untouched.
--
--   3. role_guard_*  (RESTRICTIVE) — rank-based via has_dashboard_role(),
--      added this session to try to fix the above. RESTRICTIVE policies
--      only ever SUBTRACT access; they cannot grant it. So they never gave
--      trustee/director anything — they only add a failure mode whenever
--      current_dashboard_role() fails to resolve. Removed here.
--
-- WHAT THIS SCRIPT DOES:
--   * drops the entire role_guard_* layer (system 3)
--   * widens every "<x> role manage <table>" policy (system 1) to the app's
--     real access model — admin, trustee, director (+ the legacy
--     'management' / 'directors' / 'mangement' spellings) — while KEEPING
--     each policy's existing 'safeguarding' / 'commercial' grant so no role
--     loses access it has today ("only widen, never remove").
--   * additionally puts 'president' + 'commercial' on the shared-edit
--     tables (actions / matters arising / AOB) to match
--     lib/presidentPermissions.ts.
--   * drops the blanket "Allow all for authenticated users" write policies
--     on action_items and matters_arising, which let ANY logged-in user
--     write those tables regardless of role.
--
-- The predicate reads the role straight from the JWT, so affected users
-- must get a fresh token after this runs (FORCE_DASHBOARD_LOGOUT=true in
-- proxy.ts, or the per-user Force sign out). A token minted before the
-- user's role was assigned won't carry the claim.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

begin;

-- 1. Remove the rank-based restrictive layer (system 3) -------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'role_guard_%'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2. Widen the "<x> role manage <table>" permissive policies (system 1) --
--    Base set for every table: admin + trustee + director (+ legacy
--    spellings). Each policy also keeps whatever extra role it already
--    named (safeguarding / commercial), detected from its current text.
do $$
declare
  r record;
  expr constant text :=
    'lower(coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', auth.jwt() -> ''user_metadata'' ->> ''role''))';
  roles text;
begin
  for r in
    select schemaname, tablename, policyname, coalesce(qual, '') as qual
    from pg_policies
    where schemaname = 'public'
      and policyname like '% role manage %'
  loop
    roles := '''admin'',''trustee'',''director'',''management'',''directors'',''mangement''';

    if r.tablename = 'safeguarding_updates' or position('''safeguarding''' in r.qual) > 0 then
      roles := roles || ',''safeguarding''';
    end if;
    if position('''commercial''' in r.qual) > 0 then
      roles := roles || ',''commercial''';
    end if;
    if position('''president''' in r.qual) > 0 then
      roles := roles || ',''president''';
    end if;

    execute format(
      'alter policy %I on %I.%I using (%s = any (array[%s])) with check (%s = any (array[%s]))',
      r.policyname, r.schemaname, r.tablename, expr, roles, expr, roles
    );
  end loop;
end $$;

-- 3. Shared-edit tables also get president + commercial -----------------
--    (/agenda/actions, /agenda/matters-arising, /agenda/aob per
--    PRESIDENT_EDITABLE_PATHS / COMMERCIAL_EDITABLE_PATHS).
do $$
declare
  r record;
  expr constant text :=
    'lower(coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', auth.jwt() -> ''user_metadata'' ->> ''role''))';
  roles constant text :=
    '''admin'',''trustee'',''director'',''management'',''directors'',''mangement'',''safeguarding'',''commercial'',''president''';
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like '% role manage %'
      and tablename in ('aob_items', 'matters_arising', 'action_items', 'action_status_updates', 'actions')
  loop
    execute format(
      'alter policy %I on %I.%I using (%s = any (array[%s])) with check (%s = any (array[%s]))',
      r.policyname, r.schemaname, r.tablename, expr, roles, expr, roles
    );
  end loop;
end $$;

-- 4. Drop the blanket "any authenticated user" write policies -----------
--    action_items and matters_arising were world-writable to anyone logged
--    in (policy USING/CHECK = true, no restrictive layer). Both already
--    have a "<x> role manage <table>" policy (widened above) plus a
--    has_active_role() "read <table>" SELECT policy and, for action_items,
--    the "anon can read public action items" policy — so reads and
--    role-based writes keep working; only the free-for-all write goes away.
--    Public submissions (pages/api/public/raise-action.ts) use the
--    service-role key and bypass RLS, so they are unaffected.
drop policy if exists "Allow all for authenticated users" on public.action_items;
drop policy if exists "Allow all for authenticated users" on public.matters_arising;

commit;

-- 5. Verify -----------------------------------------------------------------
select tablename, policyname, permissive, cmd, with_check
from pg_policies
where schemaname = 'public'
  and policyname like '% role manage %'
order by tablename;

-- Sanity: no role_guard_* policies should remain.
select count(*) as role_guard_policies_remaining
from pg_policies
where schemaname = 'public' and policyname like 'role_guard_%';
