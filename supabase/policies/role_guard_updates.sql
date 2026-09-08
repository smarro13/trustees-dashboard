-- Widens the pre-existing "role_guard_*" RESTRICTIVE policies (created
-- outside this repo, discovered 2026-09-08 while debugging a save failure
-- on commercial_transformation_updates) so they match the app's actual
-- permission model instead of a single hard-coded role per table.
--
-- Why this was broken:
--   - Each role_guard_* policy is RESTRICTIVE, so it ANDs with every other
--     policy on the table — no permissive policy can override it. The only
--     way to broaden access is to alter the restrictive policy itself.
--   - Most tables only allowed has_dashboard_role('management'). The app
--     renamed that role to "director" this session (management is now only
--     a legacy input synonym) — some users already have role="director"
--     stored, which likely doesn't match an exact 'management' check.
--   - The 4 "commercial" tables (commercial_transformation_updates,
--     gym_updates, job_club_notes, job_club_posts) only allowed the
--     'commercial' role — so admin/director/trustee, who have full edit
--     rights everywhere per lib/presidentPermissions.ts, were silently
--     blocked at the database layer regardless of what the app UI allowed.
--   - safeguarding_updates already had its own role_guard_* restrictive
--     policies requiring exactly 'safeguarding' — meaning the separate
--     safeguarding_rls.sql permissive policies added earlier this session
--     (allowing admin/trustee) were being overridden by this restrictive
--     guard the whole time. This script fixes that too.
--
-- This only widens each check (adds roles via OR) — it never removes an
-- existing role's access. Uses ALTER POLICY so each policy's type
-- (permissive/restrictive) and command are left exactly as they were;
-- only the using/with check expression changes. Safe to re-run.

-- ── Tables previously gated to 'management' only ──────────────────────────
-- agm_questions, aob_items, apologies, conflicts_of_interest, correspondence,
-- events_planning, membership_reports, rugby_reports, trading_reports,
-- treasury_report_items, treasury_reports.
-- New: admin, director (+ legacy 'management' string), trustee.

alter policy "role_guard_select_agm_questions_management" on public.agm_questions
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_agm_questions" on public.agm_questions
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_agm_questions" on public.agm_questions
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_agm_questions" on public.agm_questions
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

-- aob_items also gets president + commercial: the app (PRESIDENT_EDITABLE_PATHS
-- and COMMERCIAL_EDITABLE_PATHS in lib/presidentPermissions.ts) explicitly
-- promises both roles edit rights on /agenda/aob.
alter policy "role_guard_select_aob_items" on public.aob_items
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('president') or has_dashboard_role('commercial'));
alter policy "role_guard_insert_aob_items" on public.aob_items
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('president') or has_dashboard_role('commercial'));
alter policy "role_guard_update_aob_items" on public.aob_items
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('president') or has_dashboard_role('commercial'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('president') or has_dashboard_role('commercial'));
alter policy "role_guard_delete_aob_items" on public.aob_items
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('president') or has_dashboard_role('commercial'));

alter policy "role_guard_select_apologies" on public.apologies
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_apologies" on public.apologies
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_apologies" on public.apologies
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_apologies" on public.apologies
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

alter policy "role_guard_select_conflicts_of_interest" on public.conflicts_of_interest
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_conflicts_of_interest" on public.conflicts_of_interest
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_conflicts_of_interest" on public.conflicts_of_interest
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_conflicts_of_interest" on public.conflicts_of_interest
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

alter policy "role_guard_select_correspondence" on public.correspondence
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_correspondence" on public.correspondence
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_correspondence" on public.correspondence
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_correspondence" on public.correspondence
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

alter policy "role_guard_select_events_planning" on public.events_planning
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_events_planning" on public.events_planning
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_events_planning" on public.events_planning
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_events_planning" on public.events_planning
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

alter policy "role_guard_select_membership_reports" on public.membership_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_membership_reports" on public.membership_reports
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_membership_reports" on public.membership_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_membership_reports" on public.membership_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

alter policy "role_guard_select_rugby_reports" on public.rugby_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_rugby_reports" on public.rugby_reports
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_rugby_reports" on public.rugby_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_rugby_reports" on public.rugby_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

alter policy "role_guard_select_trading_reports" on public.trading_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_trading_reports" on public.trading_reports
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_trading_reports" on public.trading_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_trading_reports" on public.trading_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

alter policy "role_guard_select_treasury_report_items" on public.treasury_report_items
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_treasury_report_items" on public.treasury_report_items
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_treasury_report_items" on public.treasury_report_items
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_treasury_report_items" on public.treasury_report_items
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

alter policy "role_guard_select_treasury_reports" on public.treasury_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_insert_treasury_reports" on public.treasury_reports
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_update_treasury_reports" on public.treasury_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));
alter policy "role_guard_delete_treasury_reports" on public.treasury_reports
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee'));

-- ── Tables previously gated to 'commercial' only ───────────────────────────
-- commercial_transformation_updates (the table from the reported error),
-- gym_updates, job_club_notes, job_club_posts.
-- New: admin, director, trustee, commercial (unchanged).

alter policy "role_guard_select_commercial_transformation_updates" on public.commercial_transformation_updates
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_insert_commercial_transformation_updates" on public.commercial_transformation_updates
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_update_commercial_transformation_updates" on public.commercial_transformation_updates
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_delete_commercial_transformation_updates" on public.commercial_transformation_updates
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));

alter policy "role_guard_select_gym_updates" on public.gym_updates
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_insert_gym_updates" on public.gym_updates
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_update_gym_updates" on public.gym_updates
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_delete_gym_updates" on public.gym_updates
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));

alter policy "role_guard_select_job_club_notes" on public.job_club_notes
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_insert_job_club_notes" on public.job_club_notes
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_update_job_club_notes" on public.job_club_notes
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_delete_job_club_notes" on public.job_club_notes
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));

alter policy "role_guard_select_job_club_posts" on public.job_club_posts
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_insert_job_club_posts" on public.job_club_posts
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_update_job_club_posts" on public.job_club_posts
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'))
  with check (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));
alter policy "role_guard_delete_job_club_posts" on public.job_club_posts
  using (has_dashboard_role('admin') or has_dashboard_role('director') or has_dashboard_role('management') or has_dashboard_role('trustee') or has_dashboard_role('commercial'));

-- ── safeguarding_updates ───────────────────────────────────────────────────
-- This table already had its own role_guard_* restrictive policies requiring
-- exactly 'safeguarding' — which were silently overriding the separate
-- permissive policies added in safeguarding_rls.sql earlier this session.
-- Deliberately does NOT include 'director': directors can't view Safeguarding
-- at the app level either (lib/roles.ts, proxy.ts), so they shouldn't be able
-- to read/write it at the database level.

alter policy "role_guard_select_safeguarding_updates" on public.safeguarding_updates
  using (has_dashboard_role('admin') or has_dashboard_role('trustee') or has_dashboard_role('safeguarding'));
alter policy "role_guard_insert_safeguarding_updates" on public.safeguarding_updates
  with check (has_dashboard_role('admin') or has_dashboard_role('trustee') or has_dashboard_role('safeguarding'));
alter policy "role_guard_update_safeguarding_updates" on public.safeguarding_updates
  using (has_dashboard_role('admin') or has_dashboard_role('trustee') or has_dashboard_role('safeguarding'))
  with check (has_dashboard_role('admin') or has_dashboard_role('trustee') or has_dashboard_role('safeguarding'));
alter policy "role_guard_delete_safeguarding_updates" on public.safeguarding_updates
  using (has_dashboard_role('admin') or has_dashboard_role('trustee') or has_dashboard_role('safeguarding'));
