-- VEO camera sign-out log
--
-- Coaches sign a camera out on the public page /public/veo-booking (no login)
-- and come back to the same page to sign it back in. Both go through
-- pages/api/public/veo-booking.ts / veo-return.ts, which write with the
-- service role key. The dashboard page /operations/veo-bookings shows the
-- full log and can sign a camera back in or cancel a mistaken entry.
--
--   veo_bookings : SELECT                 any logged-in dashboard user
--                  UPDATE/DELETE          admin, trustee, director
--                  INSERT                 nobody directly (public API only)
--                  anon                   no access
--
-- A camera can only be signed out once at a time: enforced below by a
-- unique index on camera for rows still 'out'.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run, and converts
-- the earlier advance-booking version of this table if that was run.

begin;

create table if not exists public.veo_bookings (
  id uuid primary key default gen_random_uuid(),
  camera text not null check (camera in ('VEO 1', 'VEO 2')),
  booked_by text not null,
  contact_email text,
  team_name text not null,
  purpose text not null default 'match' check (purpose in ('match', 'training', 'other')),
  fixture text,
  time_out timestamptz not null,
  time_in timestamptz,
  accessories text[] not null default '{}',
  notes text,
  status text not null default 'out',
  returned_at timestamptz,
  return_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Convert the earlier advance-booking version, if it exists.
alter table public.veo_bookings drop constraint if exists veo_bookings_no_overlap;
alter table public.veo_bookings drop constraint if exists veo_bookings_time_order;
alter table public.veo_bookings drop column if exists contact_phone;
alter table public.veo_bookings drop column if exists collected_at;
alter table public.veo_bookings alter column time_in drop not null;
alter table public.veo_bookings alter column status set default 'out';
update public.veo_bookings set status = 'cancelled' where status = 'booked';

alter table public.veo_bookings drop constraint if exists veo_bookings_status_check;
alter table public.veo_bookings
  add constraint veo_bookings_status_check check (status in ('out', 'returned', 'cancelled'));

alter table public.veo_bookings
  add constraint veo_bookings_time_order check (time_in is null or time_in >= time_out);

-- Veo links: a Veo Live stream while the camera is out, and the recording
-- once Veo has processed it. Only veo.co / veo.com links are accepted (checked
-- in the API routes).
alter table public.veo_bookings add column if not exists live_url text;
alter table public.veo_bookings add column if not exists recording_url text;

create index if not exists veo_bookings_recent_recordings_idx
  on public.veo_bookings (time_in desc) where (status = 'returned');

-- One open sign-out per camera.
create unique index if not exists veo_bookings_one_out_per_camera
  on public.veo_bookings (camera) where (status = 'out');

create index if not exists veo_bookings_time_out_idx on public.veo_bookings (time_out desc);

alter table public.veo_bookings enable row level security;

revoke all on public.veo_bookings from anon;

drop policy if exists "dashboard read veo_bookings" on public.veo_bookings;
drop policy if exists "governance update veo_bookings" on public.veo_bookings;
drop policy if exists "governance delete veo_bookings" on public.veo_bookings;

create policy "dashboard read veo_bookings"
  on public.veo_bookings
  for select
  to authenticated
  using (true);

create policy "governance update veo_bookings"
  on public.veo_bookings
  for update
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'))
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

create policy "governance delete veo_bookings"
  on public.veo_bookings
  for delete
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

commit;
