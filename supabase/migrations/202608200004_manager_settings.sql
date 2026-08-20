create table if not exists public.company_manager_settings (
  tenant_company_id uuid primary key references public.companies(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists company_manager_settings_updated_at_idx
  on public.company_manager_settings(updated_at);
