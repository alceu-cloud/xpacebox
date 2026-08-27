alter table public.crm_opportunities
  add column if not exists product_ficha_id text,
  add column if not exists product_reference text,
  add column if not exists product_quantity numeric(14,3),
  add column if not exists product_unit_price numeric(14,4);

create index if not exists crm_opportunities_product_idx
  on public.crm_opportunities(tenant_company_id, product_ficha_id)
  where product_ficha_id is not null;
