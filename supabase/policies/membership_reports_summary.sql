-- Membership agenda item from the Membership page (21 Oct 2026)
--
-- pages/agenda/membership.tsx now saves a snapshot of the /operations/membership
-- figures (counts and money only, no names) with each meeting's report, plus
-- the money received (typed in by hand into the existing money_total column
-- until the ClubControl API is connected) and optional notes. Older rows keep
-- their old columns; the agenda shows their LoveAdmin figures (Bottomline is
-- no longer used, so its figures are no longer shown).
--
-- Who can read and write membership_reports is unchanged.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.

alter table public.membership_reports add column if not exists summary jsonb;
alter table public.membership_reports add column if not exists notes text;

notify pgrst, 'reload schema';
