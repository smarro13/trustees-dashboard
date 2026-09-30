
-- VEO camera bookings
--
-- Coaches book VEO 1 / VEO 2 on the public page /public/veo-booking (no login),
-- through pages/api/public/veo-booking(s).ts, which write with the service
-- role key. The dashboard page /operations/veo-bookings shows the full list
-- and records collection / return / cancellation.
--
--   veo_bookings : SELECT                 any logged-in dashboard user
--                  UPDATE/DELETE          admin, trustee, director
--                  INSERT                 nobody directly (public API only)
--                  anon                   no access (contact details stay private)
--
-- The same camera can't be booked for overlapping times: enforced below by an
-- exclusion constraint, ignoring cancelled bookings.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

begin;

create extension if not exists btree_gist with schema extensions;

create table if not exists public.veo_bookings (
  id uuid primary key default gen_random_uuid(),
  camera text not null check (camera in ('VEO 1', 'VEO 2')),
  booked_by text not null,
  contact_phone text not null,
  contact_email text,
  team_name text not null,
  purpose text not null default 'match' check (purpose in ('match', 'training', 'other')),
  fixture text,
  time_out timestamptz not null,
  time_in timestamptz not null,
  accessories text[] not null default '{}',
  notes text,
  status text not null default 'booked' check (status in ('booked', 'out', 'returned', 'cancelled')),
  collected_at timestamptz,
  returned_at timestamptz,
  return_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint veo_bookings_time_order check (time_in > time_out)
);

-- No double bookings of the same camera (cancelled bookings don't count).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'veo_bookings_no_overlap') then
    alter table public.veo_bookings
      add constraint veo_bookings_no_overlap
      exclude using gist (
        camera with =,
        tstzrange(time_out, time_in, '[)') with &&
      ) where (status <> 'cancelled');
  end if;
end $$;

create index if not exists veo_bookings_time_out_idx on public.veo_bookings (time_out);

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
