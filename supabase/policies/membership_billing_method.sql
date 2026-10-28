-- ClubControl billing method on each member (28 Oct 2026)
--
-- The automatic ClubControl fetch (lib/clubcontrol.ts) reads each member's
-- "Billing Method" from ClubControl's Members list, e.g. "Direct Debit:
-- Active", "Direct Debit: Pending", "Card" or "Inactive". The Thrive4 billing
-- card on /operations/membership uses it: only someone with an active direct
-- debit in ClubControl has really moved off Thrive4. Empty for exports
-- uploaded by hand, which don't include it.
--
-- Run once in the Supabase SQL editor, then press "Fetch from ClubControl
-- now". Idempotent — safe to re-run.

alter table public.membership_members add column if not exists billing_method text;
