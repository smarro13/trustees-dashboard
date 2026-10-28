-- LoveAdmin migration (temporary) — remove once everyone has moved to
-- ClubControl. See LOVEADMIN_MIGRATION.md for how.
--
-- Paid invoices from LoveAdmin (the old membership system), uploaded on
-- /operations/membership. Anyone named as a beneficiary on a paid invoice
-- counts as paid and is listed under "Still on LoveAdmin", so the migration
-- can be tracked. Each upload replaces the previous one. Written only by
-- pages/api/private/membership-import.ts using the service role.
--
--   membership_loveadmin   SELECT   admin, trustee, director
--
-- Run after membership.sql, in the Supabase SQL editor. Idempotent — safe to
-- re-run.

begin;

-- Allow 'loveadmin' uploads alongside ClubControl and GMS ones.
alter table public.membership_imports drop constraint if exists membership_imports_kind_check;
alter table public.membership_imports
  add constraint membership_imports_kind_check check (kind in ('members', 'players', 'loveadmin'));

create table if not exists public.membership_loveadmin (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.membership_imports (id) on delete cascade,
  -- nameKey() of the beneficiary (lib/membership.ts), for matching.
  name_key text not null,
  beneficiary text not null,
  -- LoveAdmin's "account owner" — usually a parent.
  payer text,
  invoice text,
  invoice_date date,
  invoice_amount numeric(10, 2),
  received numeric(10, 2)
);

-- Thrive4's id for the person (28 Oct 2026), set by the automatic fetch
-- (lib/thrive4.ts), so two people with the same name stay separate. Empty for
-- rows from an uploaded report, which only has names.
alter table public.membership_loveadmin add column if not exists person_guid text;

create index if not exists membership_loveadmin_import_idx on public.membership_loveadmin (import_id);

alter table public.membership_loveadmin enable row level security;
revoke all on public.membership_loveadmin from anon;
drop policy if exists "governance read membership_loveadmin" on public.membership_loveadmin;
create policy "governance read membership_loveadmin"
  on public.membership_loveadmin
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

commit;
