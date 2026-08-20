alter table public.clients
  add column if not exists purchase_limit numeric(14,2);
