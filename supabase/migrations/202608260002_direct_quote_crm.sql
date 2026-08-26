alter table public.crm_opportunities
  alter column client_id drop not null;

create index if not exists crm_opportunities_quote_idx
  on public.crm_opportunities(tenant_company_id, quote_id);
