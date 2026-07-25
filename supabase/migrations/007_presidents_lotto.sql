-- Presidents Lotto members pool
create table if not exists presidents_lotto_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Presidents Lotto draw history (optional persistence of draws)
create table if not exists presidents_lotto_draws (
  id uuid primary key default gen_random_uuid(),
  first_place text not null,
  second_place text not null,
  third_place text not null,
  drawn_at timestamptz not null default now()
);

-- RLS: authenticated users (trustees) can do everything
alter table presidents_lotto_members enable row level security;
alter table presidents_lotto_draws enable row level security;

create policy "Authenticated full access – lotto members"
  on presidents_lotto_members
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated full access – lotto draws"
  on presidents_lotto_draws
  for all
  to authenticated
  using (true)
  with check (true);

-- Seed: initial members pool
insert into presidents_lotto_members (name) values
  ('Alison Mcdaid'),
  ('Andrew Coxhill'),
  ('Andrew Macintyre'),
  ('Andrew Popoola'),
  ('Andy Dyas'),
  ('Andy Dyas'),
  ('Barbara Coxhill'),
  ('Barry Rigby'),
  ('Callum Bowater'),
  ('Christopher Byrom'),
  ('Colin Cotton'),
  ('Colin Cotton'),
  ('Connor Prendergast'),
  ('Dan Hardy'),
  ('Daniel Shaw'),
  ('David Doherty'),
  ('David Stewart'),
  ('Dawn Bradley'),
  ('Dean Young'),
  ('Eleanor Maden'),
  ('Fiona Lomas-Cecil'),
  ('Gordon Longley'),
  ('Ian Coxhill'),
  ('Jacqueline Longley'),
  ('James Cassidy'),
  ('James Sharples'),
  ('Jamie Vaughan'),
  ('Janine Conway'),
  ('Jessica Stafford'),
  ('John Garvey'),
  ('John Woodhead'),
  ('John Woodhead'),
  ('Karl Morrison'),
  ('Katy Davies'),
  ('Ken Brown'),
  ('Ken Brown'),
  ('Kieran Power'),
  ('Lee Bradley'),
  ('Lee Bradley'),
  ('Lee Bradley'),
  ('Lisa Nathaniel'),
  ('Mark Whalley'),
  ('Mattison Downs'),
  ('Mike Harris'),
  ('Mike Marrow'),
  ('Mike Marrow'),
  ('Mike Murphy'),
  ('Mike Murphy'),
  ('Mike Murphy'),
  ('Peter Hughes'),
  ('Philip Hipwood'),
  ('Rachael Marrow'),
  ('Rhys Glover'),
  ('Rhys Glover'),
  ('Richard Hyde'),
  ('Rob Taylor'),
  ('Robert Hague'),
  ('Robert Hague'),
  ('Sarah Marrow'),
  ('Sarah Marrow'),
  ('Sarah Marrow'),
  ('Sean Ward'),
  ('Sean Ward'),
  ('Ste Warner'),
  ('Stephen Marrow'),
  ('Stephen Murray'),
  ('Steven Holden'),
  ('Steven Holden'),
  ('Victor Rushworth'),
  ('Victor Rushworth'),
  ('Zoe Conway'),
  ('Lauren Coxhill'),
  ('Lauren Coxhill'),
  ('David Nolan'),
  ('David Nolan');
