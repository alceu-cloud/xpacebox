alter table public.xpace_student_contracts
  add column if not exists modality_rules_snapshot jsonb not null default '[]'::jsonb;

alter table public.xpace_student_contracts
  drop constraint if exists xpace_student_contracts_modality_rules_snapshot_array_check;

alter table public.xpace_student_contracts
  add constraint xpace_student_contracts_modality_rules_snapshot_array_check
  check (jsonb_typeof(modality_rules_snapshot) = 'array');
