create table if not exists public.gym_updates (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid null references public.meetings(id) on delete set null,
  reporting_period text not null,
  issues text null,
  updates text not null,
  equipment text null,
  other text null,
  attachments jsonb not null default '[]'::jsonb,
  selected_job_club_ideas jsonb not null default '[]'::jsonb,
  user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gym_updates_meeting_id_idx
  on public.gym_updates (meeting_id);

create index if not exists gym_updates_created_at_idx
  on public.gym_updates (created_at desc);

alter table public.gym_updates enable row level security;

drop policy if exists "gym_updates_authenticated_select" on public.gym_updates;
create policy "gym_updates_authenticated_select"
  on public.gym_updates
  for select
  to authenticated
  using (true);

drop policy if exists "gym_updates_authenticated_insert" on public.gym_updates;
create policy "gym_updates_authenticated_insert"
  on public.gym_updates
  for insert
  to authenticated
  with check (true);

drop policy if exists "gym_updates_authenticated_update" on public.gym_updates;
create policy "gym_updates_authenticated_update"
  on public.gym_updates
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "gym_updates_authenticated_delete" on public.gym_updates;
create policy "gym_updates_authenticated_delete"
  on public.gym_updates
  for delete
  to authenticated
  using (true);
