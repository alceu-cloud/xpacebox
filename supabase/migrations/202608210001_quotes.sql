create table if not exists public.quote_sequences (
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  prefix text not null check (prefix in ('OD', 'OE')),
  next_number bigint not null default 1 check (next_number > 0),
  primary key (tenant_company_id, prefix)
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  quote_number text not null,
  kind text not null check (kind in ('DIRECT', 'ENGINEERING')),
  status text not null default 'FINALIZED' check (status in ('DRAFT', 'FINALIZED')),
  recipient text not null default 'CLIENT' check (recipient in ('CLIENT', 'REPRESENTATIVE')),
  seller_company_name text not null,
  seller_company_slug text not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  client_cnpj text,
  buyer_name text,
  phone text,
  email text,
  address text,
  representative_profile_id uuid references public.profiles(id) on delete set null,
  representative_name text,
  issue_date date not null default current_date,
  delivery_date date,
  valid_until date,
  payment_terms text,
  freight text,
  observations text,
  product_total numeric(14,2) not null default 0,
  ipi_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, quote_number)
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  item_number integer not null,
  ft_number text,
  description text not null,
  length numeric(14,3) not null default 0,
  width numeric(14,3) not null default 0,
  height numeric(14,3) not null default 0,
  area numeric(14,6) not null default 0,
  quality text,
  box_type text,
  material text,
  quantity numeric(14,3) not null default 0,
  unit_price numeric(14,4) not null default 0,
  ipi_percent numeric(8,4) not null default 0,
  ipi_value numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (quote_id, item_number)
);

create index if not exists quotes_tenant_kind_idx on public.quotes(tenant_company_id, kind, created_at desc);
create index if not exists quotes_client_idx on public.quotes(tenant_company_id, client_id);
create index if not exists quote_items_quote_idx on public.quote_items(quote_id, item_number);

create or replace function public.next_quote_number(target_tenant uuid, target_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  issued_number bigint;
begin
  insert into public.quote_sequences (tenant_company_id, prefix, next_number)
  values (target_tenant, target_prefix, 2)
  on conflict (tenant_company_id, prefix) do nothing;

  update public.quote_sequences
  set next_number = next_number + 1
  where tenant_company_id = target_tenant and prefix = target_prefix
  returning next_number - 1 into issued_number;

  return target_prefix || '-' || lpad(issued_number::text, 6, '0');
end;
$$;

alter table public.quote_sequences enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

drop policy if exists quote_sequences_company_access on public.quote_sequences;
create policy quote_sequences_company_access on public.quote_sequences
for all using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));

drop policy if exists quotes_company_access on public.quotes;
create policy quotes_company_access on public.quotes
for all using (public.can_access_company(tenant_company_id))
with check (public.can_access_company(tenant_company_id));

drop policy if exists quote_items_company_access on public.quote_items;
create policy quote_items_company_access on public.quote_items
for all using (
  exists (select 1 from public.quotes q where q.id = quote_id and public.can_access_company(q.tenant_company_id))
)
with check (
  exists (select 1 from public.quotes q where q.id = quote_id and public.can_access_company(q.tenant_company_id))
);
