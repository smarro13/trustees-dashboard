-- Sponsors tracker
--
-- Every club sponsor, Minis & Juniors sponsor, Ladies XV sponsor, player
-- sponsor and partner, with the deal, renewal date, payment, contact and
-- where they're shown. Edited on /operations/sponsors.
--
--   sponsors        : SELECT                 any logged-in dashboard user
--                     INSERT/UPDATE/DELETE   admin, trustee, director, commercial
--   sponsor_changes : change log for keeping the website up to date (admin only),
--                     filled by a trigger; see the bottom of this file.
--
-- The seed at the bottom loads the 54 sponsors listed on the website on
-- 14 Oct 2026 (from the aldwinians-webpages repo). Deal values, dates and
-- payment details aren't on the website, so they start empty.
--
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run; the seed
-- skips sponsors that are already there.

begin;

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Club sponsor' check (category in (
    'Club sponsor', 'Ladies XV sponsor', 'Minis & Juniors sponsor', 'Player sponsor', 'Partner', 'Community partner'
  )),
  sponsors_what text,
  status text not null default 'Active' check (status in ('Prospect', 'Active', 'Renewal due', 'Lapsed', 'Ended')),

  package text,
  value numeric(10, 2),
  value_type text not null default 'Cash' check (value_type in ('Cash', 'In kind', 'Mixed')),
  payment_status text check (payment_status in ('Not invoiced', 'Invoiced', 'Paid', 'Overdue', 'Not applicable')),
  invoice_ref text,
  start_date date,
  renewal_date date,

  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  club_contact text,
  last_contacted date,

  website text,
  page_url text,
  member_offer text,
  benefits text,
  on_website boolean not null default true,
  in_footer boolean not null default false,
  in_programme boolean not null default false,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- One row per sponsor per thing they sponsor (a business can back two players).
create unique index if not exists sponsors_unique_deal
  on public.sponsors (lower(name), category, coalesce(sponsors_what, ''));
create index if not exists sponsors_renewal_idx on public.sponsors (renewal_date);

alter table public.sponsors enable row level security;
revoke all on public.sponsors from anon;

drop policy if exists "dashboard read sponsors" on public.sponsors;
drop policy if exists "commercial write sponsors" on public.sponsors;

create policy "dashboard read sponsors"
  on public.sponsors
  for select
  to authenticated
  using (true);

create policy "commercial write sponsors"
  on public.sponsors
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement', 'commercial', 'commerical'))
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role'))
    in ('admin', 'trustee', 'director', 'directors', 'management', 'mangement', 'commercial', 'commerical'));

-- ---------- Seed: sponsors on the website, 14 Oct 2026 ----------
insert into public.sponsors
  (name, category, sponsors_what, status, website, page_url, contact_phone, contact_email, address, member_offer, on_website, in_footer)
values
  ('Multiquip (UK) Ltd', 'Club sponsor', null, 'Active', 'https://multiquip.co.uk/', 'https://www.aldwinians.co.uk/sponsorship/multiquip-uk-ltd', null, 'sales@multiquip.co.uk', 'Unit 2, Northpoint Industrial Estate, Globe Lane, Dukinfield, Cheshire SK16 4UJ', null, true, true),
  ('Honest Burgers Manchester', 'Club sponsor', null, 'Active', 'https://www.honestburgers.co.uk/locations/manchester/', 'https://www.aldwinians.co.uk/sponsorship/honest-burgers', '0161 676 3890', null, '36 Bridge St, Manchester M3 3BT', null, true, true),
  ('OT Group', 'Club sponsor', null, 'Active', null, 'https://www.aldwinians.co.uk/ot-group', null, null, 'Unit 1 Alexandria Drive, Ashton-under-Lyne, OL7 0QN', null, true, true),
  ('New Levels Gym', 'Ladies XV sponsor', null, 'Active', 'https://www.instagram.com/new_levels_gym_/', 'https://www.aldwinians.co.uk/new-levels-gym', null, null, 'M34 3WT', null, true, true),
  ('Flawless Beauty by Lauren', 'Ladies XV sponsor', null, 'Active', 'https://www.instagram.com/flawlessbeautybylauren/', 'https://www.aldwinians.co.uk/flawless-beauty-by-lauren', null, null, 'Manchester', null, true, true),
  ('Indian Plaza', 'Club sponsor', null, 'Active', 'https://indianplaza.uk/', 'https://www.aldwinians.co.uk/indian-plaza', '0161 371 7474', null, '90 Audenshaw Road, Audenshaw, Manchester M34 5HP', null, true, true),
  ('Emily''s Legacy', 'Ladies XV sponsor', null, 'Active', 'https://www.facebook.com/Emilyslegacybabyloss', 'https://www.aldwinians.co.uk/emilys-legacy', null, null, null, null, true, true),
  ('Mark L Ryan Solicitors', 'Club sponsor', null, 'Active', 'https://www.marklryan.co.uk/', 'https://www.aldwinians.co.uk/mark-ryan-solicitors', '0161 342 1400', 'mlr@marklryan.co.uk', 'Shaw House, 1 Shaw St, Ashton-under-Lyne, Manchester OL6 6QJ', null, true, true),
  ('Compare Your Funding', 'Club sponsor', null, 'Active', 'https://compareyourfunding.com/', 'https://www.aldwinians.co.uk/compare-your-funding', null, 'info@compareyourfunding.com', 'Pama House, Stockport Road East, Bredbury, Stockport SK6 2AA', null, true, true),
  ('Hays Travel Denton', 'Club sponsor', 'Senior sides, minis & juniors', 'Active', 'https://www.haystravel.co.uk/branches/denton/', 'https://www.aldwinians.co.uk/hays-travel-denton', '0161 532 8941', 'denton@haystravel.co.uk', '30 Manchester Road, Crown Point, Denton, Manchester M34 3LE', null, true, true),
  ('R & P Printers', 'Club sponsor', null, 'Active', 'http://www.randpprinters.co.uk/', 'https://www.aldwinians.co.uk/r-and-p-printers', '0161 344 5776', 'info@randpprinters.co.uk', 'Unit 5, Cooper Street, Dukinfield SK16 4JB', null, true, true),
  ('The Hidden Kitchen', 'Ladies XV sponsor', 'Ladies Player of the Match', 'Active', 'https://thehiddenkitchenmcr.co.uk/', 'https://www.aldwinians.co.uk/hidden-kitchen-mcr', null, null, '158 Stamford Street Central, Ashton-under-Lyne, OL6 6AB', null, true, true),
  ('Chadwicks Chartered Accountants', 'Club sponsor', null, 'Active', 'https://www.chadwickandco.co.uk/', 'https://www.aldwinians.co.uk/chadwicks-chartered-accountants', '0161 370 9600', 'info@chadwickandco.co.uk', 'Capital House, 272 Manchester Road, Droylsden, Manchester M43 6PW', null, true, true),
  ('DJ RJ', 'Club sponsor', 'Club DJ (member)', 'Active', 'https://www.dj-rj.co.uk/', 'https://www.aldwinians.co.uk/dj-rj', null, 'ryan@dj-rj.co.uk', null, null, true, true),
  ('Coolair', 'Club sponsor', '2nd XV', 'Active', 'https://www.coolair.co.uk/', 'https://www.aldwinians.co.uk/coolair', '0161 343 6000', 'sales@coolair.co.uk', 'Coolair House, Globe Lane, Dukinfield, Cheshire SK16 4UJ', null, true, true),
  ('JMW Solicitors', 'Club sponsor', null, 'Active', 'https://www.jmw.co.uk/', 'https://www.aldwinians.co.uk/jmw-solicitors', '0345 872 6666', null, '125 Deansgate, Manchester M3 2BY', null, true, true),
  ('Murphy', 'Club sponsor', null, 'Active', 'https://www.murphygroup.com/', 'https://www.aldwinians.co.uk/murphy-group', null, null, null, null, true, true),
  ('Singleton''s Scrap Metal', 'Club sponsor', null, 'Active', 'https://www.singletonscrapmetal.co.uk/', 'https://www.aldwinians.co.uk/singletons-scrap-metal', '0161 220 8058', 'enquiries@singletonscrapmetal.co.uk', 'Wolverton Street, Openshaw, Manchester M11 2ET', null, true, true),
  ('Pedlars Wholesale', 'Club sponsor', null, 'Active', 'https://pedlarswholesale.co.uk/', 'https://www.aldwinians.co.uk/pedlars-wholesale', '0161 272 7785', 'sales@pedlarswholesale.co.uk', 'Unit 4A, Parkway Trading Estate, Alba Way, Trafford Park M32 0TL', null, true, true),
  ('SUEZ Recycling and Recovery UK', 'Minis & Juniors sponsor', 'Main sponsor', 'Active', 'https://www.suez.com/en/uk', 'https://www.aldwinians.co.uk/suez', null, null, null, null, true, true),
  ('Kwik Fit', 'Minis & Juniors sponsor', 'Main sponsor', 'Active', 'https://www.kwik-fit.com/', 'https://www.aldwinians.co.uk/kwik-fit', null, null, null, null, true, true),
  ('Continental Tyres', 'Minis & Juniors sponsor', null, 'Active', 'https://www.continental-tyres.co.uk/', 'https://www.aldwinians.co.uk/continental-tyres', null, null, null, null, true, true),
  ('Shakespeare Roofing', 'Minis & Juniors sponsor', null, 'Active', null, 'https://www.aldwinians.co.uk/shakespeare-roofing', null, null, null, null, true, true),
  ('Marchstream Tool Hire', 'Minis & Juniors sponsor', null, 'Active', 'https://www.marchstreamtoolhire.co.uk/', 'https://www.aldwinians.co.uk/marchstream-tool-hire', '0161 336 3344', 'hiredesk@marchstreamtoolhire.co.uk', 'Building 3 – Unit 1, Tameside Business Park, Windmill Lane, Denton, Manchester M34 3QS', null, true, true),
  ('MTech Electrical Services', 'Minis & Juniors sponsor', null, 'Active', 'https://mtechelectricalservices.co.uk/', 'https://www.aldwinians.co.uk/m-tech-electrical', '0161 682 5644', 'info@mtechelectricalservices.co.uk', '47 Boodle Street, Ashton-under-Lyne OL6 8NF', null, true, true),
  ('UIS Innovative Utility Technologies', 'Minis & Juniors sponsor', null, 'Active', 'https://uisltd.co.uk/', 'https://www.aldwinians.co.uk/uis', '0161 428 7959', 'info@uisltd.co.uk', '79 Moss Lane, Styal, Cheshire SK9 4LQ', null, true, true),
  ('River Calder Stone', 'Minis & Juniors sponsor', null, 'Active', 'https://rivercalderstone.co.uk/', 'https://www.aldwinians.co.uk/river-calder-stone', '01772 915968', null, 'Oakenclough Mill, Preston, Lancashire', null, true, true),
  ('Road Rider', 'Minis & Juniors sponsor', null, 'Active', 'http://roadrider.co.uk/', 'https://www.aldwinians.co.uk/roadrider', '0161 303 3010', null, null, null, true, true),
  ('S&M Tiling', 'Minis & Juniors sponsor', null, 'Active', 'https://www.facebook.com/p/S-M-Tiling-LTD-100063635020344/', 'https://www.aldwinians.co.uk/sm-tiling', null, null, null, null, true, true),
  ('One Million Mentors', 'Partner', null, 'Active', 'https://onemillionmentors.org.uk/', 'https://www.aldwinians.co.uk/one-in-a-million-mentors', null, 'enquiries@1MM.org.uk', 'Unit 2.E.03, 35–47 Bethnal Green Road, London E1 6LA', null, true, true),
  ('NERF Action Xperience', 'Partner', null, 'Active', 'https://nerfax.co.uk/', 'https://www.aldwinians.co.uk/nerf-experience', null, 'manchester@nerfax.co.uk', 'Unit C2 & C6, Trafford Palazzo, Trafford City, Manchester M17 8AS', '20% off for members', true, true),
  ('Trainer Trash', 'Partner', null, 'Active', 'https://trainertrash.uk/', 'https://www.aldwinians.co.uk/trainer-trash', null, null, null, '10% off with code AldWinners10', true, true),
  ('Dream XV Rugby', 'Partner', null, 'Active', 'https://dreamxvrugby.com/play', 'https://www.aldwinians.co.uk/dream-team-xv', null, null, null, null, true, true),
  ('Be Well Tameside', 'Community partner', null, 'Active', 'https://www.tameside.gov.uk/bewelltameside', 'https://www.aldwinians.co.uk/be-well-tameside', '0161 342 5050', 'bewelltameside@tameside.gov.uk', null, null, true, true),
  ('Warren Beswick Electrical Services (WBES)', 'Player sponsor', 'Callum McMahon', 'Active', 'https://wbelectricalservices.com/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Italmatch', 'Player sponsor', 'Matthew Ross', 'Active', 'https://www.italmatch.com/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Bakes by CH', 'Player sponsor', 'Alex Hughes', 'Active', 'https://www.instagram.com/Bakes.by.ch/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Influential', 'Player sponsor', 'James Summerscales', 'Active', 'https://www.thisisinfluential.com/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Emily''s Legacy', 'Player sponsor', 'Stephen Marrow', 'Active', 'https://www.gofundme.com/f/emilys-legacy', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('R&P Printers', 'Player sponsor', 'Nathan Clare', 'Active', 'http://www.randpprinters.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('A Wilson Estates', 'Player sponsor', 'Leon Wilson', 'Active', 'https://awilsonestates.com/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('The Thornton Arms, Burnley', 'Player sponsor', 'Jamie Henderson', 'Active', 'https://www.facebook.com/thornton.arms.5/?locale=en_GB', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Cheetham Jackson', 'Player sponsor', 'Sam Farrell', 'Active', 'https://www.cheethamjackson.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Emily''s Legacy', 'Player sponsor', 'Rachael Marrow', 'Active', 'https://www.gofundme.com/f/emilys-legacy', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Geoff Capes Driving School', 'Player sponsor', 'Sarah Forrest', 'Active', 'https://www.geoffcapesdriving.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('RCJ Furniture & Joinery', 'Player sponsor', 'Katy Crosby', 'Active', 'https://www.rcjjoinery.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('The Great British Cheese Company', 'Player sponsor', 'James Bradbury', 'Active', 'https://gbcheese.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Besseges', 'Player sponsor', 'Rubin Holland', 'Active', 'https://www.besseges.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Twenty The Salon', 'Player sponsor', 'Andrew Ormrod', 'Active', 'https://twentythesalon.setmore.com/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('PGT Repairs', 'Player sponsor', 'Jess Stafford', 'Active', 'https://pgtrepairs.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('Droylsden Road Dental Practice', 'Player sponsor', 'Nico Wrigley', 'Active', 'https://www.droylsdenroaddentalpractice.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false),
  ('The Doll House', 'Player sponsor', 'Ste Warner', 'Active', 'https://treatwell.co.uk/place/the-doll-house-1', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, '20% off in salon', true, false),
  ('Crown Point Glass', 'Player sponsor', 'George Pennington', 'Active', 'https://crownpointglass.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, '10% off', true, false),
  ('Leaap Solutions', 'Player sponsor', 'Josh Rowbottom', 'Active', 'https://leaapsolutions.co.uk/', 'https://www.aldwinians.co.uk/player-sponsorship', null, null, null, null, true, false)
on conflict do nothing;

-- ---------- Change log: what to update on the website ----------
-- Every add, edit and removal on public.sponsors is written here by a trigger,
-- with who did it and which fields changed (old → new). Admins see the
-- outstanding ones on /operations/sponsors and tick them off once the website
-- has been updated. Created after the seed so the initial load isn't logged.
--
--   sponsor_changes : SELECT / UPDATE (tick off)   admin only
--                     INSERT                       the trigger only

create table if not exists public.sponsor_changes (
  id bigint generated always as identity primary key,
  sponsor_id uuid,
  sponsor_name text not null,
  category text,
  sponsors_what text,
  action text not null check (action in ('added', 'updated', 'removed')),
  changes jsonb not null default '{}'::jsonb,   -- { field: { "from": old, "to": new } }
  changed_by text,
  changed_at timestamptz not null default now(),
  website_done boolean not null default false,
  done_by text,
  done_at timestamptz
);

create index if not exists sponsor_changes_pending_idx
  on public.sponsor_changes (changed_at desc) where (not website_done);

create or replace function public.log_sponsor_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ignored text[] := array['id', 'created_at', 'updated_at', 'updated_by'];
  old_row jsonb;
  new_row jsonb;
  diff jsonb := '{}'::jsonb;
  k text;
  who text := nullif(auth.jwt() ->> 'email', '');
begin
  -- Only touch the record(s) that exist for this operation.
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new);
    who := coalesce(who, new_row ->> 'updated_by');
  end if;
  who := coalesce(who, 'unknown');

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_row) loop
      if not (k = any(ignored)) and (old_row -> k) is distinct from (new_row -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_row -> k, 'to', new_row -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return new;  -- nothing that matters changed
    end if;
    insert into public.sponsor_changes (sponsor_id, sponsor_name, category, sponsors_what, action, changes, changed_by)
    values (new.id, new.name, new.category, new.sponsors_what, 'updated', diff, who);
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.sponsor_changes (sponsor_id, sponsor_name, category, sponsors_what, action, changes, changed_by)
    values (new.id, new.name, new.category, new.sponsors_what, 'added', new_row - ignored, who);
    return new;
  else
    insert into public.sponsor_changes (sponsor_id, sponsor_name, category, sponsors_what, action, changes, changed_by)
    values (old.id, old.name, old.category, old.sponsors_what, 'removed', old_row - ignored, who);
    return old;
  end if;
end;
$$;

drop trigger if exists sponsors_log_change on public.sponsors;
create trigger sponsors_log_change
  after insert or update or delete on public.sponsors
  for each row execute function public.log_sponsor_change();

alter table public.sponsor_changes enable row level security;
revoke all on public.sponsor_changes from anon;

drop policy if exists "admin read sponsor_changes" on public.sponsor_changes;
drop policy if exists "admin tick off sponsor_changes" on public.sponsor_changes;

create policy "admin read sponsor_changes"
  on public.sponsor_changes
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'admin');

create policy "admin tick off sponsor_changes"
  on public.sponsor_changes
  for update
  to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'admin')
  with check (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'admin');

commit;
