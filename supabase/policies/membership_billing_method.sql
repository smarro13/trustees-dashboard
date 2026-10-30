-- ClubControl billing method on each member (28 Oct 2026)
--
-- The automatic ClubControl fetch (lib/clubcontrol.ts) reads each member's
-- "Billing Method" from ClubControl's Members list, e.g. "Direct Debit:
-- Active", "Direct Debit: Pending", "Card" or "Inactive". The Still on LoveAdmin
-- card on /operations/membership uses it: only someone with an active direct
-- debit in ClubControl has really moved off LoveAdmin.
--
-- Run once in the Supabase SQL editor, then press "Fetch from ClubControl
-- now". Idempotent — safe to re-run.

alter table public.membership_members add column if not exists billing_method text;

-- Paid for by someone else's direct debit (28 Oct 2026). Only the account
-- holder shows "Direct Debit: Active"; the people their direct debit pays for
-- (e.g. the rest of the family) get the account holder's ClubControl member
-- id here, read from that account's member list by the automatic fetch.
alter table public.membership_members add column if not exists covered_by_id text;

-- GoCardless mandate status on each direct debit account (28 Oct 2026),
-- e.g. "Active". Someone has moved off LoveAdmin when they have an active
-- mandate, their own or the account paying for them (covered_by_id).
alter table public.membership_members add column if not exists mandate_status text;
