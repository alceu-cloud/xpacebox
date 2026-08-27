alter table public.crm_opportunities
  add column if not exists quote_linked_existing boolean not null default false;
