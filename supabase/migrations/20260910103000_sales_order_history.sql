create table if not exists public.sales_order_sequences (
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  prefix text not null default 'PV' check (prefix = 'PV'),
  next_number bigint not null default 1 check (next_number > 0),
  primary key (tenant_company_id, prefix)
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  sale_number text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  representative_profile_id uuid references public.profiles(id) on delete set null,
  crm_opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  seller_company_name text not null,
  seller_company_slug text not null,
  ordered_at date not null default current_date,
  notes text,
  product_total numeric(14,2) not null default 0,
  ipi_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  contribution_total numeric(14,2),
  mc_percent numeric(10,4),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_company_id, sale_number)
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  item_number integer not null check (item_number > 0),
  product_ficha_id text not null,
  ft_number text,
  revision text,
  description text not null,
  material_code text,
  base_quantity numeric(14,3) not null check (base_quantity > 0),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,4) not null default 0,
  ipi_percent numeric(8,4) not null default 0,
  ipi_value numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  net_unit_price numeric(14,4),
  material_cost_unit numeric(14,4),
  contribution_unit numeric(14,4),
  mc_percent numeric(10,4),
  margin_source text not null check (margin_source in ('SNAPSHOT', 'LEGACY_REFERENCE')),
  pricing_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (sales_order_id, item_number)
);

create index if not exists sales_orders_tenant_ordered_idx on public.sales_orders(tenant_company_id, ordered_at desc);
create index if not exists sales_orders_client_ordered_idx on public.sales_orders(tenant_company_id, client_id, ordered_at desc);
create index if not exists sales_order_items_order_idx on public.sales_order_items(sales_order_id, item_number);

create or replace function public.next_sales_order_number(target_tenant uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  issued_number bigint;
begin
  insert into public.sales_order_sequences (tenant_company_id, prefix, next_number)
  values (target_tenant, 'PV', 2)
  on conflict (tenant_company_id, prefix) do nothing;

  update public.sales_order_sequences
  set next_number = next_number + 1
  where tenant_company_id = target_tenant and prefix = 'PV'
  returning next_number - 1 into issued_number;

  return 'PV-' || lpad(issued_number::text, 6, '0');
end;
$$;

alter table public.sales_order_sequences enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;

revoke all on table public.sales_order_sequences, public.sales_orders, public.sales_order_items from public, anon, authenticated;
grant all on table public.sales_order_sequences, public.sales_orders, public.sales_order_items to service_role;
revoke execute on function public.next_sales_order_number(uuid) from public, anon, authenticated;
grant execute on function public.next_sales_order_number(uuid) to service_role;
