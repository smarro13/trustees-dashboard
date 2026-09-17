-- Team Registers: tables + Row Level Security
--
-- Backs /public/registers. One register per team (Seniors is open; every
-- Mini & Junior age group is protected by a shared passcode set by that
-- team's coach/manager). Coaches don't have dashboard (trustee) accounts,
-- so access to a protected team is a shared passcode checked server-side
-- in pages/api/public/registers-unlock.ts — not the admin/trustee role
-- system in lib/roles.ts.
--
-- All reads/writes for these tables go through pages/api/public/registers-*
-- API routes using the service-role key, which always bypasses RLS (see
-- the note at the bottom of safeguarding_rls.sql for why that's fine).
-- RLS here exists as a backstop: it blocks the anon/authenticated Supabase
-- keys from reading or writing these tables directly, so the passcode
-- check in the API can't be bypassed by querying the table straight from
-- the browser with the anon key.
--
-- Run this once in the Supabase SQL editor for this project, then run
-- `node scripts/seed-register-teams.js` to create the team rows.
-- Safe to re-run: every object is dropped/replaced before being recreated.

create extension if not exists "pgcrypto";

-- ---------- register_teams ----------
create table if not exists public.register_teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_protected boolean not null default true,
  password_hash text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.register_teams is
  'One row per team register. password_hash is salt:hash from lib/registerAuth.ts (Node scrypt) — never a plain password.';

-- ---------- register_players ----------
create table if not exists public.register_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.register_teams(id) on delete cascade,
  name text not null,
  default_note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists register_players_team_id_idx on public.register_players(team_id);

-- ---------- register_attendance ----------
create table if not exists public.register_attendance (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.register_teams(id) on delete cascade,
  player_id uuid not null references public.register_players(id) on delete cascade,
  session_date date not null,
  status text check (status in ('present', 'absent')),
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (player_id, session_date)
);

create index if not exists register_attendance_team_date_idx
  on public.register_attendance(team_id, session_date);

-- ---------- register_shared_notes (single row, general club notes) ----------
create table if not exists public.register_shared_notes (
  id smallint primary key default 1 check (id = 1),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.register_shared_notes (id, notes)
values (1, '')
on conflict (id) do nothing;

-- ---------- RLS: deny direct anon/authenticated access ----------
alter table public.register_teams enable row level security;
alter table public.register_players enable row level security;
alter table public.register_attendance enable row level security;
alter table public.register_shared_notes enable row level security;

drop policy if exists "register_teams_no_direct_access" on public.register_teams;
create policy "register_teams_no_direct_access"
  on public.register_teams for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "register_players_no_direct_access" on public.register_players;
create policy "register_players_no_direct_access"
  on public.register_players for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "register_attendance_no_direct_access" on public.register_attendance;
create policy "register_attendance_no_direct_access"
  on public.register_attendance for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "register_shared_notes_no_direct_access" on public.register_shared_notes;
create policy "register_shared_notes_no_direct_access"
  on public.register_shared_notes for all
  to anon, authenticated
  using (false)
  with check (false);
