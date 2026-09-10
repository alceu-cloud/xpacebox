alter table public.client_samples
  add column if not exists product_ficha_id text;

create index if not exists client_samples_product_ficha_idx
  on public.client_samples (tenant_company_id, product_ficha_id)
  where product_ficha_id is not null;
