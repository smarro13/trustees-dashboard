-- Membership dashboard
--
-- Shown on /operations/membership. Two uploads feed it:
--   * the ClubControl members export (.csv) -> membership_members
--     Each upload replaces the previous one (membership_imports keeps which
--     upload is current and who made it).
--   * the RFU GMS player list (.xlsx / .csv)  -> membership_players
--     New players are added and existing ones updated; uploads never remove
--     anyone. Teams aren't stored — the page works each player's team out
--     from their date of birth and gender (lib/membership.ts), so everyone
--     moves up automatically each season.
-- Both are written only by pages/api/private/membership-import.ts using the
-- service role, so there are no insert/update/delete policies here.
--
-- membership_notes holds one comment per person (keyed by their normalised
-- name, so it shows on both the players and inactive-members lists), plus
-- the admin-only "hide from report" flag. Written only by
-- pages/api/private/membership-note.ts, which enforces who can hide.
--
--   membership_imports / membership_members / membership_players / membership_notes
--     SELECT   admin, trustee, director
--
-- This is personal data, including children's dates of birth and emergency
-- contacts, so unlike most dashboard tables it is not readable by every
-- logged-in user. Only the fields the dashboard shows are stored — no
-- addresses or card numbers.
--
-- The predicate reads the role straight from the JWT, the same way
-- fix_rls_role_model.sql does. Run once in the Supabase SQL editor.
-- Idempotent — safe to re-run.

begin;

create table if not exists public.membership_imports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('members', 'players')),
  file_name text not null,
  row_count int not null default 0,
  uploaded_at timestamptz not null default now(),
  uploaded_by text
);

create table if not exists public.membership_members (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.membership_imports (id) on delete cascade,
  external_id text,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  gender text,
  date_of_birth date,
  age int,
  categories text[] not null default '{}',
  amount numeric(10, 2),
  date_joined date,
  renewal_date date,
  active boolean not null
);

create table if not exists public.membership_players (
  id uuid primary key default gen_random_uuid(),
  -- Lower-cased, accent- and space-normalised "first last", for matching
  -- against ClubControl and for spotting the same player on re-upload.
  name_key text not null,
  rfu_id text,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  gender text,
  emergency_contact text,
  emergency_phone text,
  gms_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Earlier versions of this file stored one row per player per team. Players
-- are re-uploaded from GMS anyway, so clear them out and drop the column.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'membership_players' and column_name = 'team') then
    delete from public.membership_players;
    alter table public.membership_players drop constraint if exists membership_players_unique;
    drop index if exists public.membership_players_team_idx;
    alter table public.membership_players drop column team;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'membership_imports' and column_name = 'team') then
    alter table public.membership_imports drop column team;
  end if;
end $$;

alter table public.membership_players add column if not exists rfu_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'membership_players_person') then
    alter table public.membership_players
      add constraint membership_players_person unique nulls not distinct (name_key, date_of_birth);
  end if;
end $$;

create index if not exists membership_members_import_idx on public.membership_members (import_id);

alter table public.membership_imports enable row level security;
alter table public.membership_members enable row level security;
alter table public.membership_players enable row level security;

revoke all on public.membership_imports from anon;
revoke all on public.membership_members from anon;
revoke all on public.membership_players from anon;

drop policy if exists "governance read membership_imports" on public.membership_imports;
drop policy if exists "governance read membership_members" on public.membership_members;
drop policy if exists "governance read membership_players" on public.membership_players;

create policy "governance read membership_imports"
  on public.membership_imports
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

create policy "governance read membership_members"
  on public.membership_members
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

create policy "governance read membership_players"
  on public.membership_players
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

create table if not exists public.membership_notes (
  -- nameKey() of the person's first and last name (lib/membership.ts).
  person_key text primary key,
  -- Their name as last shown, for the admins' Hidden tab.
  display_name text not null,
  note text not null default '',
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.membership_notes enable row level security;
revoke all on public.membership_notes from anon;
drop policy if exists "governance read membership_notes" on public.membership_notes;
create policy "governance read membership_notes"
  on public.membership_notes
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

commit;
