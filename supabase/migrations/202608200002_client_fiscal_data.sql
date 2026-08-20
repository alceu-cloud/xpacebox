alter table public.clients
  add column if not exists tax_regime text,
  add column if not exists fiscal_profile text,
  add column if not exists fiscal_benefit text;
