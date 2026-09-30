-- Clubhouse media screens
--
-- One row per screen, edited on /operations/media-screens. Each screen's
-- routes are stored as JSON: [{ "inputs": [...], "platform": "...", "outputs": [...] }].
--
--   media_screens : SELECT                 any logged-in dashboard user
--                   INSERT/UPDATE/DELETE   admin, trustee, director
--
-- The predicate reads the role straight from the JWT, the same way
-- fix_rls_role_model.sql does. Run once in the Supabase SQL editor.
-- Idempotent — safe to re-run; the starting screens are only added if the
-- table is empty.

begin;

create table if not exists public.media_screens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null default '',
  area text not null default 'function' check (area in ('lounge', 'foyer', 'function')),
  routes jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.media_screens enable row level security;

revoke all on public.media_screens from anon;

drop policy if exists "dashboard read media_screens" on public.media_screens;
drop policy if exists "governance manage media_screens" on public.media_screens;

create policy "dashboard read media_screens"
  on public.media_screens
  for select
  to authenticated
  using (true);

create policy "governance manage media_screens"
  on public.media_screens
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'))
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

-- Starting setup (from the screens table, Sep 2026).
insert into public.media_screens (name, location, area, sort_order, routes)
select v.name, v.location, v.area, v.sort_order, v.routes::jsonb
from (values
  ('Lounge TV 1', 'Eric Evans Lounge', 'lounge', 10,
   '[{"inputs":["Sky"],"platform":"Media Centre","outputs":["Sky TV"]}]'),
  ('Lounge TV 2', 'Eric Evans Lounge', 'lounge', 20,
   '[{"inputs":["Sky"],"platform":"Media Centre","outputs":["Sky TV"]}]'),
  ('Lounge TV 3 (100")', 'Eric Evans Lounge', 'lounge', 30,
   '[{"inputs":["Sky"],"platform":"Media Centre","outputs":["Sky TV"]}]'),
  ('Foyer TV', 'Foyer', 'foyer', 40,
   '[{"inputs":["Club Media","Event Media"],"platform":"CMS Signage (Firestick)","outputs":["Club Info","Private Function Media"]}]'),
  ('Function Room TV (100")', 'Function Room', 'function', 50,
   '[{"inputs":["Sky"],"platform":"Media Centre","outputs":["Sky TV"]},
     {"inputs":["Club Media","Event Media"],"platform":"CMS Signage (Firestick)","outputs":["Club Info","Private Function Media"]},
     {"inputs":["Interactive Media"],"platform":"AirPlay / Mirror / HDMI","outputs":["Presentations, media etc."]}]'),
  ('Function Room Bar TV', 'Function Room', 'function', 60,
   '[{"inputs":["Sky"],"platform":"Media Centre","outputs":["Sky TV"]},
     {"inputs":["Club Media","Event Media"],"platform":"CMS Signage (Firestick)","outputs":["Club Info","Private Function Media"]}]'),
  ('Alan Moss Room TV', 'Alan Moss Room', 'function', 70,
   '[{"inputs":["Sky"],"platform":"Media Centre","outputs":["Sky TV"]},
     {"inputs":["Club Media","Event Media"],"platform":"CMS Signage (Firestick)","outputs":["Club Info","Private Function Media"]}]')
) as v(name, location, area, sort_order, routes)
where not exists (select 1 from public.media_screens);

commit;
