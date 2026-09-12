create table public.xpace_membership_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  billing_interval text not null check (billing_interval in ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
  duration_months integer not null check (duration_months between 1 and 60),
  amount_cents integer not null check (amount_cents >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, name)
);

create index xpace_membership_plans_company_active_idx
  on public.xpace_membership_plans(tenant_company_id, active, name);

create table public.xpace_student_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number bigint generated always as identity unique,
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.xpace_people(id) on delete restrict,
  plan_id uuid references public.xpace_membership_plans(id) on delete set null,
  plan_name_snapshot text not null,
  billing_interval_snapshot text not null check (billing_interval_snapshot in ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
  duration_months_snapshot integer not null check (duration_months_snapshot between 1 and 60),
  amount_cents integer not null check (amount_cents >= 0),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'ATIVO' check (status in ('AGENDADO', 'ATIVO', 'PAUSADO', 'CANCELADO', 'ENCERRADO')),
  status_note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index xpace_student_contracts_company_status_idx
  on public.xpace_student_contracts(tenant_company_id, status, ends_on);

create index xpace_student_contracts_company_student_idx
  on public.xpace_student_contracts(tenant_company_id, student_id, starts_on desc);

create table public.xpace_contract_events (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.xpace_student_contracts(id) on delete cascade,
  event_type text not null check (event_type in ('CRIADO', 'STATUS_ALTERADO')),
  previous_status text,
  next_status text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index xpace_contract_events_contract_idx
  on public.xpace_contract_events(contract_id, created_at desc);

alter table public.xpace_membership_plans enable row level security;
alter table public.xpace_student_contracts enable row level security;
alter table public.xpace_contract_events enable row level security;

revoke all on table public.xpace_membership_plans from anon, authenticated;
revoke all on table public.xpace_student_contracts from anon, authenticated;
revoke all on table public.xpace_contract_events from anon, authenticated;

grant select, insert, update, delete on table public.xpace_membership_plans to service_role;
grant select, insert, update, delete on table public.xpace_student_contracts to service_role;
grant select, insert, update, delete on table public.xpace_contract_events to service_role;
