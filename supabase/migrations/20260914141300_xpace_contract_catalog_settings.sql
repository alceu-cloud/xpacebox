alter table public.xpace_membership_plans
  add column if not exists modalities text[] not null default '{}'::text[],
  add column if not exists catalog_settings jsonb not null default '{}'::jsonb;
