create table public.xpace_contract_sales (
  id uuid primary key default gen_random_uuid(),
  sale_number bigint generated always as identity unique,
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.xpace_people(id) on delete restrict,
  contract_id uuid not null unique references public.xpace_student_contracts(id) on delete restrict,
  status text not null default 'CONCLUIDA' check (status in ('EM_PREPARACAO', 'PENDENTE_ASSINATURA', 'ENVIADA_PARA_ASSINATURA', 'CONCLUIDA', 'CANCELADA', 'PROCESSANDO', 'ERRO')),
  signature_required boolean not null default false,
  signature_status text not null default 'NAO_SOLICITADA' check (signature_status in ('NAO_SOLICITADA', 'PENDENTE', 'ENVIADA', 'ASSINADA', 'RECUSADA', 'ERRO')),
  signature_provider text,
  signature_envelope_id text,
  signature_url text,
  signature_error text,
  sent_for_signature_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index xpace_contract_sales_company_student_created_idx
  on public.xpace_contract_sales(tenant_company_id, student_id, created_at desc);

create index xpace_contract_sales_company_status_created_idx
  on public.xpace_contract_sales(tenant_company_id, status, created_at desc);

alter table public.xpace_student_contracts
  drop constraint if exists xpace_student_contracts_status_check;

alter table public.xpace_student_contracts
  add constraint xpace_student_contracts_status_check
  check (status in ('AGUARDANDO_ASSINATURA', 'AGENDADO', 'ATIVO', 'PAUSADO', 'CANCELADO', 'ENCERRADO'));

alter table public.xpace_contract_charges
  add column if not exists provider_payment_id text,
  add column if not exists provider_status text,
  add column if not exists pix_copy_paste text,
  add column if not exists pix_qr_code_url text,
  add column if not exists issued_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists provider_error text;

create unique index xpace_contract_charges_provider_payment_idx
  on public.xpace_contract_charges(provider_payment_id)
  where provider_payment_id is not null;

alter table public.xpace_contract_sales enable row level security;
revoke all on table public.xpace_contract_sales from anon, authenticated;
grant select, insert, update, delete on table public.xpace_contract_sales to service_role;
