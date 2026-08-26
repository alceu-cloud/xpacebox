create table if not exists public.client_samples (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  seller_company_id uuid references public.seller_companies(id) on delete set null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  sample_number bigint generated always as identity unique,
  requested_at date not null default current_date,
  delivery_date date,
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'IN_PRODUCTION', 'SENT', 'APPROVED', 'REJECTED', 'CANCELLED')),
  product_description text not null,
  dimensions text,
  quantity integer not null default 1 check (quantity > 0),
  shipping_method text,
  tracking_code text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_samples_company_idx on public.client_samples(tenant_company_id, requested_at desc);
create index if not exists client_samples_client_idx on public.client_samples(tenant_company_id, client_id);
create index if not exists client_samples_status_idx on public.client_samples(tenant_company_id, status);

alter table public.client_samples enable row level security;

drop policy if exists client_samples_company_access on public.client_samples;
create policy client_samples_company_access
on public.client_samples
for all using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));
