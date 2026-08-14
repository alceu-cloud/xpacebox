create extension if not exists pgcrypto;

create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.platform_role = 'platform_owner'
  ) or exists (
    select 1
    from public.company_members cm
    where cm.profile_id = auth.uid()
      and cm.company_id = target_company_id
      and cm.active = true
  );
$$;

create table if not exists public.seller_companies (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  slug text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, slug)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_number bigint generated always as identity unique,
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  seller_company_id uuid references public.seller_companies(id) on delete set null,
  representative_profile_id uuid references public.profiles(id) on delete set null,
  legal_name text not null,
  trade_name text,
  buyer_name text,
  whatsapp text,
  cnpj text not null,
  state_registration text,
  phone text,
  purchase_email text,
  invoice_email text,
  street text,
  street_number text,
  complement text,
  postal_code text,
  district text,
  city text,
  state text,
  payment_terms text,
  cfop text,
  freight_terms text,
  cnpj_source text,
  cnpj_lookup_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, cnpj)
);

create index if not exists clients_tenant_company_id_idx on public.clients(tenant_company_id);
create index if not exists clients_representative_profile_id_idx on public.clients(representative_profile_id);
create index if not exists clients_legal_name_idx on public.clients(legal_name);

alter table public.seller_companies enable row level security;
alter table public.clients enable row level security;

drop policy if exists seller_companies_company_access on public.seller_companies;
create policy seller_companies_company_access
on public.seller_companies
for select
using (public.can_access_company(tenant_company_id));

drop policy if exists clients_company_select on public.clients;
create policy clients_company_select
on public.clients
for select
using (public.can_access_company(tenant_company_id));

drop policy if exists clients_company_insert on public.clients;
create policy clients_company_insert
on public.clients
for insert
with check (public.can_access_company(tenant_company_id));

drop policy if exists clients_company_update on public.clients;
create policy clients_company_update
on public.clients
for update
using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));
