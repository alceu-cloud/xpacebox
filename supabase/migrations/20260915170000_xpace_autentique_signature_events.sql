alter table public.xpace_contract_sales
  add column if not exists signed_document_url text;

create table public.xpace_signature_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid references public.companies(id) on delete cascade,
  contract_sale_id uuid references public.xpace_contract_sales(id) on delete set null,
  provider text not null check (provider in ('AUTENTIQUE')),
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, external_event_id)
);

create index xpace_signature_events_company_received_idx
  on public.xpace_signature_webhook_events(tenant_company_id, received_at desc);

create index xpace_signature_events_sale_received_idx
  on public.xpace_signature_webhook_events(contract_sale_id, received_at desc);

alter table public.xpace_signature_webhook_events enable row level security;
revoke all on table public.xpace_signature_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.xpace_signature_webhook_events to service_role;

alter table public.xpace_contract_events
  drop constraint if exists xpace_contract_events_event_type_check;

alter table public.xpace_contract_events
  add constraint xpace_contract_events_event_type_check
  check (event_type in ('CRIADO', 'STATUS_ALTERADO', 'ASSINATURA_ENVIADA', 'ASSINATURA_CONCLUIDA', 'ASSINATURA_RECUSADA', 'ASSINATURA_FALHOU'));
