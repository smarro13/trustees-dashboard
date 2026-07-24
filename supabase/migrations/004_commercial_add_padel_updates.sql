alter table if exists public.commercial_transformation_updates
  add column if not exists padel_updates text null;
