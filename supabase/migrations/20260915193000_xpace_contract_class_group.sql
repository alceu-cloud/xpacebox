alter table public.xpace_student_contracts
  add column if not exists class_group_id uuid references public.xpace_class_groups(id) on delete restrict,
  add column if not exists class_group_name_snapshot text,
  add column if not exists class_schedule_snapshot jsonb not null default '[]'::jsonb;

create index if not exists xpace_student_contracts_class_group_idx
  on public.xpace_student_contracts(tenant_company_id, class_group_id)
  where class_group_id is not null;
