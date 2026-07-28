alter table if exists public.commercial_transformation_updates
  add column if not exists supporting_evidence_url text null;
