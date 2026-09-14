create table public.xpace_modalities (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  uses_schedule boolean not null default false,
  requires_instructor boolean not null default false,
  wellhub_mappings jsonb not null default '[]'::jsonb,
  totalpass_mappings jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, name)
);

create index xpace_modalities_company_active_idx
  on public.xpace_modalities(tenant_company_id, active, name);

alter table public.xpace_modalities enable row level security;

revoke all on table public.xpace_modalities from anon, authenticated;
grant select, insert, update, delete on table public.xpace_modalities to service_role;
