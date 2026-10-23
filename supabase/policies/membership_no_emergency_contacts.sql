-- Stop keeping emergency contacts (25 Oct 2026)
--
-- The Membership page no longer shows emergency contacts, and neither the
-- GMS upload nor the automatic GMS fetch reads them any more. This deletes
-- the ones already stored by removing the two columns.
--
-- Run AFTER the dashboard update is deployed (the old page still asks for
-- these columns). Idempotent — safe to re-run.

alter table public.membership_players drop column if exists emergency_contact;
alter table public.membership_players drop column if exists emergency_phone;

notify pgrst, 'reload schema';
