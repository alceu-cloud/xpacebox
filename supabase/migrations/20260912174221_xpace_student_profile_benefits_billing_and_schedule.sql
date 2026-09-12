alter table public.xpace_people
  add column if not exists photo_path text;

create table public.xpace_benefit_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('VIP', 'BOLSA', 'OUTRO')),
  discount_type text not null check (discount_type in ('PERCENTUAL', 'FIXO')),
  discount_value integer not null check (discount_value >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, name),
  check (
    (discount_type = 'PERCENTUAL' and discount_value between 0 and 10000)
    or (discount_type = 'FIXO' and discount_value <= 100000000)
  )
);

create table public.xpace_person_benefits (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.xpace_people(id) on delete cascade,
  benefit_profile_id uuid not null references public.xpace_benefit_profiles(id) on delete restrict,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'ENCERRADO')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  ended_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ends_on is null or ends_on >= starts_on)
);

create unique index xpace_person_one_active_benefit_idx
  on public.xpace_person_benefits(tenant_company_id, person_id)
  where status = 'ATIVO';

create index xpace_person_benefits_person_idx
  on public.xpace_person_benefits(tenant_company_id, person_id, starts_on desc);

alter table public.xpace_membership_plans
  add column if not exists renews_automatically boolean not null default false;

alter table public.xpace_student_contracts
  add column if not exists base_amount_cents integer,
  add column if not exists benefit_profile_id uuid references public.xpace_benefit_profiles(id) on delete set null,
  add column if not exists benefit_name_snapshot text,
  add column if not exists discount_type_snapshot text check (discount_type_snapshot in ('PERCENTUAL', 'FIXO')),
  add column if not exists discount_value_snapshot integer,
  add column if not exists renews_automatically boolean not null default false,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_effective_on date;

update public.xpace_student_contracts
set base_amount_cents = amount_cents
where base_amount_cents is null;

alter table public.xpace_student_contracts
  alter column base_amount_cents set not null;

create table public.xpace_contract_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.xpace_student_contracts(id) on delete cascade,
  student_id uuid not null references public.xpace_people(id) on delete restrict,
  competence_on date not null,
  due_on date not null,
  base_amount_cents integer not null check (base_amount_cents >= 0),
  benefit_name_snapshot text,
  discount_type_snapshot text check (discount_type_snapshot in ('PERCENTUAL', 'FIXO')),
  discount_value_snapshot integer,
  amount_cents integer not null check (amount_cents >= 0),
  paid_amount_cents integer not null default 0 check (paid_amount_cents >= 0),
  status text not null default 'ABERTO' check (status in ('ABERTO', 'RECEBIDO', 'CANCELADO')),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, contract_id, competence_on)
);

create index xpace_contract_charges_student_due_idx
  on public.xpace_contract_charges(tenant_company_id, student_id, due_on desc);

create index xpace_contract_charges_contract_competence_idx
  on public.xpace_contract_charges(contract_id, competence_on desc);

create table public.xpace_person_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.xpace_people(id) on delete cascade,
  activity_type text not null check (activity_type in ('ATIVIDADE', 'NOTA', 'WHATSAPP', 'EMAIL', 'SISTEMA')),
  subject text not null,
  content text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index xpace_person_activities_person_idx
  on public.xpace_person_activities(tenant_company_id, person_id, occurred_at desc);

create table public.xpace_rewards_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.xpace_people(id) on delete cascade,
  points_delta integer not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index xpace_rewards_ledger_person_idx
  on public.xpace_rewards_ledger(tenant_company_id, person_id, occurred_at desc);

create table public.xpace_class_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  modality text,
  color text not null default '#7435d9' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  capacity integer check (capacity is null or capacity > 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, name)
);

create table public.xpace_class_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  class_group_id uuid not null references public.xpace_class_groups(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  room_name text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index xpace_class_schedules_company_weekday_idx
  on public.xpace_class_schedules(tenant_company_id, weekday, starts_at);

create table public.xpace_class_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  class_group_id uuid not null references public.xpace_class_groups(id) on delete cascade,
  student_id uuid not null references public.xpace_people(id) on delete restrict,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'ATIVA' check (status in ('ATIVA', 'ENCERRADA')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  unique (class_group_id, student_id, starts_on)
);

create index xpace_class_enrollments_group_idx
  on public.xpace_class_enrollments(tenant_company_id, class_group_id, status);

create table public.xpace_room_rentals (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  room_name text not null,
  renter_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  status text not null default 'RESERVADA' check (status in ('RESERVADA', 'CONFIRMADA', 'CANCELADA')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index xpace_room_rentals_period_idx
  on public.xpace_room_rentals(tenant_company_id, starts_at, ends_at);

alter table public.xpace_benefit_profiles enable row level security;
alter table public.xpace_person_benefits enable row level security;
alter table public.xpace_contract_charges enable row level security;
alter table public.xpace_person_activities enable row level security;
alter table public.xpace_rewards_ledger enable row level security;
alter table public.xpace_class_groups enable row level security;
alter table public.xpace_class_schedules enable row level security;
alter table public.xpace_class_enrollments enable row level security;
alter table public.xpace_room_rentals enable row level security;

revoke all on table public.xpace_benefit_profiles from anon, authenticated;
revoke all on table public.xpace_person_benefits from anon, authenticated;
revoke all on table public.xpace_contract_charges from anon, authenticated;
revoke all on table public.xpace_person_activities from anon, authenticated;
revoke all on table public.xpace_rewards_ledger from anon, authenticated;
revoke all on table public.xpace_class_groups from anon, authenticated;
revoke all on table public.xpace_class_schedules from anon, authenticated;
revoke all on table public.xpace_class_enrollments from anon, authenticated;
revoke all on table public.xpace_room_rentals from anon, authenticated;

grant select, insert, update, delete on table public.xpace_benefit_profiles to service_role;
grant select, insert, update, delete on table public.xpace_person_benefits to service_role;
grant select, insert, update, delete on table public.xpace_contract_charges to service_role;
grant select, insert, update, delete on table public.xpace_person_activities to service_role;
grant select, insert, update, delete on table public.xpace_rewards_ledger to service_role;
grant select, insert, update, delete on table public.xpace_class_groups to service_role;
grant select, insert, update, delete on table public.xpace_class_schedules to service_role;
grant select, insert, update, delete on table public.xpace_class_enrollments to service_role;
grant select, insert, update, delete on table public.xpace_room_rentals to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('xpace-people', 'xpace-people', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
