create table if not exists public.xpace_school_profiles (
  tenant_company_id uuid primary key references public.companies(id) on delete cascade,
  legal_name text,
  trade_name text,
  cnpj text,
  postal_code text,
  street text,
  street_number text,
  complement text,
  district text,
  city text,
  state text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  check (state is null or state ~ '^[A-Z]{2}$')
);

alter table public.xpace_school_profiles enable row level security;
revoke all on table public.xpace_school_profiles from anon, authenticated;
grant select, insert, update, delete on table public.xpace_school_profiles to service_role;
