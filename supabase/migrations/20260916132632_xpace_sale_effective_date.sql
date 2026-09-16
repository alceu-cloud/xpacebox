alter table public.xpace_contract_sales
  add column if not exists sold_on date;

update public.xpace_contract_sales
  set sold_on = (created_at at time zone 'America/Sao_Paulo')::date
  where sold_on is null;

alter table public.xpace_contract_sales
  alter column sold_on set not null,
  alter column sold_on set default current_date;

create index if not exists xpace_contract_sales_company_student_sold_on_idx
  on public.xpace_contract_sales(tenant_company_id, student_id, sold_on desc);
