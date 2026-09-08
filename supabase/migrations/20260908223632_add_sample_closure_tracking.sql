alter table public.client_samples
  add column if not exists closed_at date;

create index if not exists client_samples_open_delivery_idx
  on public.client_samples (tenant_company_id, delivery_date)
  where closed_at is null and delivery_date is not null;
