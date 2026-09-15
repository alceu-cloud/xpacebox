create table public.xpace_services (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  description text not null,
  sale_price_cents integer not null check (sale_price_cents >= 0),
  ncm text check (ncm is null or ncm ~ '^[0-9]{8}$'),
  cest text check (cest is null or cest ~ '^[0-9]{7}$'),
  image_path text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, description)
);

create index xpace_services_company_active_name_idx
  on public.xpace_services(tenant_company_id, active, description);

alter table public.xpace_services enable row level security;
revoke all on table public.xpace_services from anon, authenticated;
grant select, insert, update, delete on table public.xpace_services to service_role;

alter table public.xpace_student_contracts
  add column if not exists enrollment_service_snapshot jsonb not null default '{}'::jsonb,
  add constraint xpace_student_contracts_enrollment_service_snapshot_object
    check (jsonb_typeof(enrollment_service_snapshot) = 'object');

alter table public.xpace_contract_charges
  add column if not exists enrollment_fee_cents integer not null default 0 check (enrollment_fee_cents >= 0);

insert into storage.buckets (id, name, public)
values ('xpace-service-images', 'xpace-service-images', true)
on conflict (id) do nothing;
