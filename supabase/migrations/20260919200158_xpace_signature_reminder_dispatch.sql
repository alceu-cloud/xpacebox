alter table public.xpace_contract_sales
  add column if not exists signature_provider_signature_id text;

create index if not exists xpace_contract_sales_signature_reminder_idx
  on public.xpace_contract_sales(tenant_company_id, signature_due_on)
  where signature_required = true
    and signature_status = 'ENVIADA'
    and signature_provider_signature_id is not null;
