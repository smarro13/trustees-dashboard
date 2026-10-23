-- Fireworks volunteer task list (/public/fireworks)
--
-- Like Job Club, but only for volunteers with the access code. Only two
-- server routes read or write this table, using the service role:
--   pages/api/public/fireworks.ts   volunteers, checks FIREWORKS_ACCESS_CODE
--   pages/api/private/fireworks.ts  committee at /operations/fireworks, checks the dashboard login
-- Row level security is on with NO policies, so browsers (anonymous or
-- logged in) can't read or change it directly.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

begin;

create table if not exists public.fireworks_tasks (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  task text not null,
  status text not null default 'Not Started' check (status in ('Not Started', 'Ongoing', 'Completed')),
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  needs text not null default '',
  assigned_to text,
  assigned_notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fireworks_tasks_status_idx on public.fireworks_tasks (status, created_at);

alter table public.fireworks_tasks enable row level security;
revoke all on public.fireworks_tasks from anon, authenticated;

-- Starting list (23 Oct 2026). Each is only added if a task with the same
-- name isn't already there, so re-running this file doesn't duplicate them.
insert into public.fireworks_tasks (area, task, priority, created_by)
select v.area, v.task, v.priority, 'Committee'
from (values
  ('Bar', 'Outdoor bar', 'Medium'),
  ('Food', 'Indoor food', 'Medium'),
  ('Food', 'Outdoor food', 'Medium'),
  ('Entertainment', 'Fairground rides arranged', 'Medium'),
  ('Entertainment', 'Pictures arranged', 'Low'),
  ('Safety', 'First aid requirements', 'High'),
  ('Car park', 'Signage notification regarding car parking', 'Medium'),
  ('Stock', 'Consumable ordering (beer, food, etc.)', 'High'),
  ('Tickets', 'Ticketing and scanning', 'High'),
  ('Gates', 'Crowd barriers for gates', 'High'),
  ('Gates', 'Lighting for entrance', 'Medium'),
  ('Safety', 'Perimeter patrols', 'High'),
  ('Safety', 'Risk assessment sign-offs', 'High'),
  ('Setup', 'Gazebo erecting', 'Medium')
) as v(area, task, priority)
where not exists (select 1 from public.fireworks_tasks f where lower(f.task) = lower(v.task));

commit;
