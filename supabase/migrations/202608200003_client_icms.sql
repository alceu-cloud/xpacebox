alter table public.clients
  add column if not exists icms numeric(8,4);
