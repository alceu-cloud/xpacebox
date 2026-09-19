-- The contract itself remains active. These flags represent temporary access
-- restrictions with independent causes, so receiving a payment never clears a
-- pending signature restriction (and vice versa).
alter table public.xpace_student_contracts
  add column if not exists payment_access_blocked boolean not null default false,
  add column if not exists payment_access_blocked_at timestamptz,
  add column if not exists signature_access_blocked boolean not null default false,
  add column if not exists signature_access_blocked_at timestamptz;

alter table public.xpace_contract_sales
  add column if not exists signature_due_on date,
  add column if not exists signature_reminder_day_2_at timestamptz,
  add column if not exists signature_reminder_day_5_at timestamptz;

alter table public.xpace_membership_plans
  add column if not exists contract_template_name text;

create index if not exists xpace_contract_sales_signature_deadline_idx
  on public.xpace_contract_sales(tenant_company_id, signature_due_on)
  where signature_required = true and signature_status <> 'ASSINADA';

create index if not exists xpace_contract_charges_open_due_idx
  on public.xpace_contract_charges(tenant_company_id, contract_id, due_on)
  where status = 'ABERTO';

alter table public.xpace_contract_events
  drop constraint if exists xpace_contract_events_event_type_check;

alter table public.xpace_contract_events
  add constraint xpace_contract_events_event_type_check
  check (event_type in (
    'CRIADO',
    'STATUS_ALTERADO',
    'ASSINATURA_ENVIADA',
    'ASSINATURA_CONCLUIDA',
    'ASSINATURA_RECUSADA',
    'ASSINATURA_FALHOU',
    'ACESSO_BLOQUEADO_INADIMPLENCIA',
    'ACESSO_LIBERADO_PAGAMENTO',
    'ACESSO_BLOQUEADO_ASSINATURA',
    'ACESSO_LIBERADO_ASSINATURA',
    'LEMBRETE_ASSINATURA'
  ));
