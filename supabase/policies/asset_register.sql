-- Asset register
--
-- Club and trading-company equipment, technology, software subscriptions and
-- anything else with a value or a renewal / warranty / service date.
-- Edited on /operations/asset-register.
--
--   assets : SELECT                 any logged-in dashboard user
--            INSERT/UPDATE/DELETE   admin, trustee, director
--
-- The predicate reads the role straight from the JWT, the same way
-- fix_rls_role_model.sql does. Run once in the Supabase SQL editor.
-- Idempotent — safe to re-run.

begin;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Other',
  location text,
  make_model text,
  serial_number text,
  asset_tag text,
  owner_entity text not null default 'Club' check (owner_entity in ('Club', 'Trading company (Ltd)')),
  responsible_person text,
  condition text not null default 'Good' check (condition in ('New', 'Good', 'Fair', 'Poor', 'Out of service')),
  status text not null default 'In use' check (status in ('In use', 'In storage', 'On loan', 'Under repair', 'Disposed')),

  supplier text,
  purchase_date date,
  purchase_cost numeric(10, 2),
  document_url text,

  renewal_type text,
  renewal_date date,
  renewal_cost numeric(10, 2),
  renewal_frequency text check (renewal_frequency in ('One-off', 'Monthly', 'Quarterly', 'Annually', 'Every 2 years', 'Every 3 years')),
  auto_renews boolean not null default false,
  warranty_expires date,
  next_service_date date,
  service_type text,

  disposed_date date,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists assets_renewal_date_idx on public.assets (renewal_date);
create index if not exists assets_warranty_expires_idx on public.assets (warranty_expires);
create index if not exists assets_next_service_date_idx on public.assets (next_service_date);

alter table public.assets enable row level security;

revoke all on public.assets from anon;

drop policy if exists "dashboard read assets" on public.assets;
drop policy if exists "governance manage assets" on public.assets;

create policy "dashboard read assets"
  on public.assets
  for select
  to authenticated
  using (true);

create policy "governance manage assets"
  on public.assets
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'))
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement'));

commit;
