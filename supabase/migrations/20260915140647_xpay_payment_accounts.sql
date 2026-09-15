create table public.xpace_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'ASAAS' check (provider = 'ASAAS'),
  provider_environment text not null default 'SANDBOX' check (provider_environment in ('SANDBOX', 'PRODUCAO')),
  account_label text not null default 'XPAY',
  account_status text not null default 'RASCUNHO' check (account_status in ('RASCUNHO', 'PENDENTE_DOCUMENTOS', 'EM_ANALISE', 'ATIVA', 'REJEITADA', 'CANCELADA')),
  provider_account_id text unique,
  provider_wallet_id text,
  provider_access_token_ciphertext text,
  provider_access_token_iv text,
  provider_access_token_auth_tag text,
  provider_access_token_id text,
  legal_entity_type text not null default 'PJ' check (legal_entity_type in ('PJ', 'PF')),
  company_type text check (company_type is null or company_type in ('MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION')),
  legal_name text not null,
  trade_name text,
  document_number text not null,
  email text not null,
  phone text,
  mobile_phone text not null,
  monthly_income_cents integer not null check (monthly_income_cents >= 0),
  postal_code text not null,
  address text not null,
  address_number text not null,
  neighborhood text not null,
  complement text,
  responsible_name text,
  responsible_document text,
  responsible_birth_date date,
  onboarding_requested_at timestamptz,
  last_provider_status_at timestamptz,
  provider_status_note text,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_at is null or account_status = 'CANCELADA')
);

-- Uma escola opera somente uma conta XPay de cada vez. Contas canceladas ficam no histórico.
create unique index xpace_payment_accounts_one_current_account_idx
  on public.xpace_payment_accounts(tenant_company_id)
  where closed_at is null;

create index xpace_payment_accounts_company_history_idx
  on public.xpace_payment_accounts(tenant_company_id, created_at desc);

create table public.xpace_payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payment_account_id uuid not null references public.xpace_payment_accounts(id) on delete cascade,
  provider_event_id text not null,
  event_name text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (payment_account_id, provider_event_id)
);

create index xpace_payment_webhook_events_account_received_idx
  on public.xpace_payment_webhook_events(payment_account_id, received_at desc);

alter table public.xpace_payment_accounts enable row level security;
alter table public.xpace_payment_webhook_events enable row level security;
revoke all on table public.xpace_payment_accounts from anon, authenticated;
revoke all on table public.xpace_payment_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.xpace_payment_accounts to service_role;
grant select, insert, update, delete on table public.xpace_payment_webhook_events to service_role;
