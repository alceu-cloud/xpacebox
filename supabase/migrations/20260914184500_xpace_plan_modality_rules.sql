alter table public.xpace_membership_plans
  add column if not exists modality_rules jsonb not null default '[]'::jsonb;

alter table public.xpace_membership_plans
  drop constraint if exists xpace_membership_plans_modality_rules_array_check;

alter table public.xpace_membership_plans
  add constraint xpace_membership_plans_modality_rules_array_check
  check (jsonb_typeof(modality_rules) = 'array');
