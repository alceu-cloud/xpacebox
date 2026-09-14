create table public.xpace_instructors (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  mobile text,
  email text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, full_name)
);

create index xpace_instructors_company_active_name_idx
  on public.xpace_instructors(tenant_company_id, active, full_name);

alter table public.xpace_modalities
  add column instructor_id uuid references public.xpace_instructors(id) on delete restrict,
  add constraint xpace_modalities_instructor_required
    check (not requires_instructor or instructor_id is not null);

alter table public.xpace_class_groups
  add column modality_id uuid references public.xpace_modalities(id) on delete restrict,
  add column instructor_id uuid references public.xpace_instructors(id) on delete restrict;

alter table public.xpace_membership_plans
  add column contract_template_path text;

create index xpace_class_groups_company_modality_idx
  on public.xpace_class_groups(tenant_company_id, modality_id)
  where modality_id is not null;

alter table public.xpace_instructors enable row level security;

revoke all on table public.xpace_instructors from anon, authenticated;
grant select, insert, update, delete on table public.xpace_instructors to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'xpace-contract-templates',
  'xpace-contract-templates',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
