-- Texts to members (28 Oct 2026)
--
-- The "Text about moving to ClubControl" campaign on /operations/membership
-- (Still on LoveAdmin card): one text per payer on the uploaded LoveAdmin
-- report whose family hasn't set up a ClubControl direct debit, sent a few at a time from the club's
-- phone through textbee (lib/textbee.ts, lib/smsCampaign.ts,
-- pages/api/cron/sms-drip.ts).
--
-- Privacy: a phone number and email are kept only until the text is sent,
-- then cleared; a hash of it stays so a "STOP" reply can be matched. Written only
-- by the server (service role); admins can read.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

begin;

create table if not exists public.sms_campaigns (
  id text primary key,
  -- The message, with {first} for the payer's first name and {names} for
  -- who they pay for.
  message text not null,
  -- Sending only happens while this is on (Start / Pause on the page).
  active boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.sms_campaigns (id) on delete cascade,
  -- The payer's name (nameKey), so nobody is texted twice.
  payer_key text not null,
  payer_name text not null,
  -- Who they pay for, as Thrive4 has them.
  beneficiaries text[] not null default '{}',
  -- Contact details from Thrive4 (lib/thrive4Contacts.ts). Cleared once sent.
  phone text,
  email text,
  phone_hash text not null,
  -- queued, sent, failed, skipped (moved before their turn), stopped (replied STOP)
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped', 'stopped')),
  error text,
  textbee_id text,
  queued_by text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (campaign_id, payer_key)
);
create index if not exists sms_messages_status_idx on public.sms_messages (campaign_id, status, queued_at);

-- Numbers that replied STOP: never texted again, by any campaign.
create table if not exists public.sms_opt_outs (
  phone_hash text primary key,
  created_at timestamptz not null default now()
);

alter table public.sms_campaigns enable row level security;
alter table public.sms_messages enable row level security;
alter table public.sms_opt_outs enable row level security;
revoke all on public.sms_campaigns, public.sms_messages, public.sms_opt_outs from anon;

drop policy if exists "admin read sms_campaigns" on public.sms_campaigns;
create policy "admin read sms_campaigns" on public.sms_campaigns for select to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'admin');

drop policy if exists "admin read sms_messages" on public.sms_messages;
create policy "admin read sms_messages" on public.sms_messages for select to authenticated
  using (lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')) = 'admin');

commit;
