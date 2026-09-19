-- Schema-only snapshot for isolated cancellation regression tests (no customer data).
create role anon;
create role authenticated;
create role service_role;
create table public.companies(id uuid primary key);
create table public.xpace_membership_plans(
id uuid primary key default gen_random_uuid(),
tenant_company_id uuid not null,
name text not null,
billing_interval text not null,
duration_months integer not null,
amount_cents integer not null,
active boolean not null default true
);
alter table public.xpace_membership_plans add constraint xpace_membership_plans_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['MENSAL'::text, 'TRIMESTRAL'::text, 'SEMESTRAL'::text, 'ANUAL'::text])));
create table public.xpace_student_contracts(
id uuid default gen_random_uuid() not null,
contract_number bigint generated always as identity not null,
tenant_company_id uuid not null,
student_id uuid not null,
plan_id uuid,
plan_name_snapshot text not null,
billing_interval_snapshot text not null,
duration_months_snapshot integer not null,
amount_cents integer not null,
starts_on date not null,
ends_on date not null,
status text default 'ATIVO'::text not null,
status_note text,
created_by uuid,
updated_by uuid,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null,
base_amount_cents integer not null,
benefit_profile_id uuid,
benefit_name_snapshot text,
discount_type_snapshot text,
discount_value_snapshot integer,
renews_automatically boolean default false not null,
cancelled_at timestamp with time zone,
cancel_effective_on date,
modality_rules_snapshot jsonb default '[]'::jsonb not null,
enrollment_service_snapshot jsonb default '{}'::jsonb not null,
class_group_id uuid,
class_group_name_snapshot text,
class_schedule_snapshot jsonb default '[]'::jsonb not null,
first_due_on date not null,
enrollment_fee_enabled boolean default false not null,
payment_method text,
payment_access_blocked boolean default false not null,
payment_access_blocked_at timestamp with time zone,
signature_access_blocked boolean default false not null,
signature_access_blocked_at timestamp with time zone
);
alter table public.xpace_student_contracts add constraint xpace_student_contracts_amount_cents_check CHECK ((amount_cents >= 0));
alter table public.xpace_student_contracts add constraint xpace_student_contracts_billing_interval_snapshot_check CHECK ((billing_interval_snapshot = ANY (ARRAY['MENSAL'::text, 'TRIMESTRAL'::text, 'SEMESTRAL'::text, 'ANUAL'::text])));
alter table public.xpace_student_contracts add constraint xpace_student_contracts_check CHECK ((ends_on >= starts_on));
alter table public.xpace_student_contracts add constraint xpace_student_contracts_contract_number_key UNIQUE (contract_number);
alter table public.xpace_student_contracts add constraint xpace_student_contracts_discount_type_snapshot_check CHECK ((discount_type_snapshot = ANY (ARRAY['PERCENTUAL'::text, 'FIXO'::text])));
alter table public.xpace_student_contracts add constraint xpace_student_contracts_duration_months_snapshot_check CHECK (((duration_months_snapshot >= 1) AND (duration_months_snapshot <= 60)));
alter table public.xpace_student_contracts add constraint xpace_student_contracts_enrollment_service_snapshot_object CHECK ((jsonb_typeof(enrollment_service_snapshot) = 'object'::text));
alter table public.xpace_student_contracts add constraint xpace_student_contracts_modality_rules_snapshot_array_check CHECK ((jsonb_typeof(modality_rules_snapshot) = 'array'::text));
alter table public.xpace_student_contracts add constraint xpace_student_contracts_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['PIX'::text, 'CARTAO'::text]))));
alter table public.xpace_student_contracts add constraint xpace_student_contracts_pkey PRIMARY KEY (id);
alter table public.xpace_student_contracts add constraint xpace_student_contracts_status_check CHECK ((status = ANY (ARRAY['AGUARDANDO_ASSINATURA'::text, 'AGENDADO'::text, 'ATIVO'::text, 'PAUSADO'::text, 'CANCELADO'::text, 'ENCERRADO'::text])));
create table public.xpace_contract_events(
id uuid default gen_random_uuid() not null,
tenant_company_id uuid not null,
contract_id uuid not null,
event_type text not null,
previous_status text,
next_status text,
note text,
created_by uuid,
created_at timestamp with time zone default now() not null
);
alter table public.xpace_contract_events add constraint xpace_contract_events_event_type_check CHECK ((event_type = ANY (ARRAY['CRIADO'::text, 'STATUS_ALTERADO'::text, 'ASSINATURA_ENVIADA'::text, 'ASSINATURA_CONCLUIDA'::text, 'ASSINATURA_RECUSADA'::text, 'ASSINATURA_FALHOU'::text, 'ACESSO_BLOQUEADO_INADIMPLENCIA'::text, 'ACESSO_LIBERADO_PAGAMENTO'::text, 'ACESSO_BLOQUEADO_ASSINATURA'::text, 'ACESSO_LIBERADO_ASSINATURA'::text, 'LEMBRETE_ASSINATURA'::text])));
alter table public.xpace_contract_events add constraint xpace_contract_events_pkey PRIMARY KEY (id);
create table public.xpace_contract_charges(
id uuid default gen_random_uuid() not null,
tenant_company_id uuid not null,
contract_id uuid not null,
student_id uuid not null,
competence_on date not null,
due_on date not null,
base_amount_cents integer not null,
benefit_name_snapshot text,
discount_type_snapshot text,
discount_value_snapshot integer,
amount_cents integer not null,
paid_amount_cents integer default 0 not null,
status text default 'ABERTO'::text not null,
paid_at timestamp with time zone,
cancelled_at timestamp with time zone,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null,
enrollment_fee_cents integer default 0 not null,
provider_payment_id text,
provider_status text,
pix_copy_paste text,
pix_qr_code_url text,
issued_at timestamp with time zone,
sent_at timestamp with time zone,
provider_error text
);
alter table public.xpace_contract_charges add constraint xpace_contract_charges_amount_cents_check CHECK ((amount_cents >= 0));
alter table public.xpace_contract_charges add constraint xpace_contract_charges_base_amount_cents_check CHECK ((base_amount_cents >= 0));
alter table public.xpace_contract_charges add constraint xpace_contract_charges_discount_type_snapshot_check CHECK ((discount_type_snapshot = ANY (ARRAY['PERCENTUAL'::text, 'FIXO'::text])));
alter table public.xpace_contract_charges add constraint xpace_contract_charges_enrollment_fee_cents_check CHECK ((enrollment_fee_cents >= 0));
alter table public.xpace_contract_charges add constraint xpace_contract_charges_paid_amount_cents_check CHECK ((paid_amount_cents >= 0));
alter table public.xpace_contract_charges add constraint xpace_contract_charges_pkey PRIMARY KEY (id);
alter table public.xpace_contract_charges add constraint xpace_contract_charges_status_check CHECK ((status = ANY (ARRAY['ABERTO'::text, 'RECEBIDO'::text, 'CANCELADO'::text])));
alter table public.xpace_contract_charges add constraint xpace_contract_charges_tenant_company_id_contract_id_compet_key UNIQUE (tenant_company_id, contract_id, competence_on);
create table public.xpace_class_enrollments(
id uuid default gen_random_uuid() not null,
tenant_company_id uuid not null,
class_group_id uuid not null,
student_id uuid not null,
starts_on date default CURRENT_DATE not null,
ends_on date,
status text default 'ATIVA'::text not null,
created_by uuid,
created_at timestamp with time zone default now() not null
);
alter table public.xpace_class_enrollments add constraint xpace_class_enrollments_check CHECK (((ends_on IS NULL) OR (ends_on >= starts_on)));
alter table public.xpace_class_enrollments add constraint xpace_class_enrollments_class_group_id_student_id_starts_on_key UNIQUE (class_group_id, student_id, starts_on);
alter table public.xpace_class_enrollments add constraint xpace_class_enrollments_pkey PRIMARY KEY (id);
alter table public.xpace_class_enrollments add constraint xpace_class_enrollments_status_check CHECK ((status = ANY (ARRAY['ATIVA'::text, 'ENCERRADA'::text])));
create table public.xpace_payment_accounts(
id uuid default gen_random_uuid() not null,
tenant_company_id uuid not null,
provider text default 'ASAAS'::text not null,
provider_environment text default 'SANDBOX'::text not null,
account_label text default 'XPAY'::text not null,
account_status text default 'RASCUNHO'::text not null,
provider_account_id text,
provider_wallet_id text,
provider_access_token_ciphertext text,
provider_access_token_iv text,
provider_access_token_auth_tag text,
provider_access_token_id text,
legal_entity_type text default 'PJ'::text not null,
company_type text,
legal_name text not null,
trade_name text,
document_number text not null,
email text not null,
phone text,
mobile_phone text not null,
monthly_income_cents integer not null,
postal_code text not null,
address text not null,
address_number text not null,
neighborhood text not null,
complement text,
responsible_name text,
responsible_document text,
responsible_birth_date date,
onboarding_requested_at timestamp with time zone,
last_provider_status_at timestamp with time zone,
provider_status_note text,
closed_at timestamp with time zone,
closed_by uuid,
created_by uuid,
updated_by uuid,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null
);
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_account_status_check CHECK ((account_status = ANY (ARRAY['RASCUNHO'::text, 'PENDENTE_DOCUMENTOS'::text, 'EM_ANALISE'::text, 'ATIVA'::text, 'REJEITADA'::text, 'CANCELADA'::text])));
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_check CHECK (((closed_at IS NULL) OR (account_status = 'CANCELADA'::text)));
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_company_type_check CHECK (((company_type IS NULL) OR (company_type = ANY (ARRAY['MEI'::text, 'LIMITED'::text, 'INDIVIDUAL'::text, 'ASSOCIATION'::text]))));
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_legal_entity_type_check CHECK ((legal_entity_type = ANY (ARRAY['PJ'::text, 'PF'::text])));
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_monthly_income_cents_check CHECK ((monthly_income_cents >= 0));
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_pkey PRIMARY KEY (id);
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_provider_account_id_key UNIQUE (provider_account_id);
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_provider_check CHECK ((provider = 'ASAAS'::text));
alter table public.xpace_payment_accounts add constraint xpace_payment_accounts_provider_environment_check CHECK ((provider_environment = ANY (ARRAY['SANDBOX'::text, 'PRODUCAO'::text])));
create table public.xpace_payment_webhook_events(
id uuid default gen_random_uuid() not null,
payment_account_id uuid not null,
provider_event_id text not null,
event_name text not null,
payload jsonb not null,
received_at timestamp with time zone default now() not null,
processed_at timestamp with time zone
);
alter table public.xpace_payment_webhook_events add constraint xpace_payment_webhook_events_payment_account_id_provider_ev_key UNIQUE (payment_account_id, provider_event_id);
alter table public.xpace_payment_webhook_events add constraint xpace_payment_webhook_events_pkey PRIMARY KEY (id);
create table public.xpace_contract_sales(
id uuid default gen_random_uuid() not null,
sale_number bigint generated always as identity not null,
tenant_company_id uuid not null,
student_id uuid not null,
contract_id uuid not null,
status text default 'CONCLUIDA'::text not null,
signature_required boolean default false not null,
signature_status text default 'NAO_SOLICITADA'::text not null,
signature_provider text,
signature_envelope_id text,
signature_url text,
signature_error text,
sent_for_signature_at timestamp with time zone,
signed_at timestamp with time zone,
cancelled_at timestamp with time zone,
cancellation_reason text,
created_by uuid,
updated_by uuid,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null,
signed_document_url text,
sold_on date default CURRENT_DATE not null,
starts_on date not null,
first_due_on date not null,
payment_method text,
enrollment_fee_enabled boolean default false not null,
discount_type text,
discount_value integer default 0 not null,
discount_cents integer default 0 not null,
signature_due_on date,
signature_reminder_day_2_at timestamp with time zone,
signature_reminder_day_5_at timestamp with time zone
);
alter table public.xpace_contract_sales add constraint xpace_contract_sales_contract_id_key UNIQUE (contract_id);
alter table public.xpace_contract_sales add constraint xpace_contract_sales_discount_check CHECK ((((discount_type IS NULL) AND (discount_value = 0) AND (discount_cents = 0)) OR ((discount_type = ANY (ARRAY['PERCENTUAL'::text, 'FIXO'::text])) AND (discount_value >= 0) AND (discount_cents >= 0))));
alter table public.xpace_contract_sales add constraint xpace_contract_sales_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['PIX'::text, 'CARTAO'::text]))));
alter table public.xpace_contract_sales add constraint xpace_contract_sales_pkey PRIMARY KEY (id);
alter table public.xpace_contract_sales add constraint xpace_contract_sales_sale_number_key UNIQUE (sale_number);
alter table public.xpace_contract_sales add constraint xpace_contract_sales_signature_status_check CHECK ((signature_status = ANY (ARRAY['NAO_SOLICITADA'::text, 'PENDENTE'::text, 'ENVIADA'::text, 'ASSINADA'::text, 'RECUSADA'::text, 'ERRO'::text])));
alter table public.xpace_contract_sales add constraint xpace_contract_sales_status_check CHECK ((status = ANY (ARRAY['EM_PREPARACAO'::text, 'PENDENTE_ASSINATURA'::text, 'ENVIADA_PARA_ASSINATURA'::text, 'CONCLUIDA'::text, 'CANCELADA'::text, 'PROCESSANDO'::text, 'ERRO'::text])));
create table public.xpace_contract_class_groups(
id uuid default gen_random_uuid() not null,
tenant_company_id uuid not null,
contract_id uuid not null,
class_group_id uuid not null,
modality_id uuid,
created_at timestamp with time zone default now() not null
);
alter table public.xpace_contract_class_groups add constraint xpace_contract_class_groups_contract_id_class_group_id_key UNIQUE (contract_id, class_group_id);
alter table public.xpace_contract_class_groups add constraint xpace_contract_class_groups_pkey PRIMARY KEY (id);
