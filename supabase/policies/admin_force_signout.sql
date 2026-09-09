-- Backs the "Force sign out" button in /admin/roles
-- (pages/api/admin/force-signout.ts calls this via supabaseAdmin.rpc).
--
-- Why an RPC: the admin API route uses the service-role key through
-- PostgREST, which only exposes the `public` schema — it can't delete from
-- auth.sessions directly. GoTrue also has no per-user admin-logout REST
-- route that's stable across versions (auth-js's admin.signOut() expects a
-- user access-token JWT, not a user id; POST /admin/users/{id}/logout 404s
-- on older builds). A SECURITY DEFINER function owned by a role with rights
-- on the auth schema sidesteps both problems.
--
-- Deleting a user's auth.sessions rows revokes their refresh tokens
-- (auth.refresh_tokens cascades via session_id). Any access token already
-- issued stays valid until it expires (project JWT expiry, Settings > API).
-- For an instant bounce of everyone at once, use FORCE_DASHBOARD_LOGOUT
-- (handled in proxy.ts) instead.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create or replace function public.admin_force_signout(target_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = target_user;
$$;

-- Only the service-role key (used by the admin API route, which has already
-- checked the caller is an admin) should be able to call this. Never expose
-- it to anon or logged-in users.
revoke all on function public.admin_force_signout(uuid) from public;
revoke all on function public.admin_force_signout(uuid) from anon;
revoke all on function public.admin_force_signout(uuid) from authenticated;
grant execute on function public.admin_force_signout(uuid) to service_role;
