alter table if exists public.commercial_transformation_updates
  add column if not exists share_padel_to_public boolean not null default false;

create table if not exists public.public_padel_votes (
  id uuid primary key default gen_random_uuid(),
  voter_name text not null,
  voter_name_key text not null unique,
  vote_yes boolean not null,
  created_at timestamptz not null default now()
);

alter table public.public_padel_votes enable row level security;

drop policy if exists "public_padel_votes_authenticated_select" on public.public_padel_votes;

-- No client-side select policy: votes remain private and are read via server-side API only.

create index if not exists public_padel_votes_created_at_idx
  on public.public_padel_votes (created_at desc);
