-- Commercial conditions belong to the sale/contract snapshot, never to the
-- catalog plan. Editing a catalog plan must affect a future renewal only.
alter table public.xpace_student_contracts
  add column if not exists first_due_on date,
  add column if not exists enrollment_fee_enabled boolean not null default false,
  add column if not exists payment_method text;

update public.xpace_student_contracts
  set first_due_on = starts_on
  where first_due_on is null;

alter table public.xpace_student_contracts
  alter column first_due_on set not null,
  add constraint xpace_student_contracts_payment_method_check
    check (payment_method is null or payment_method in ('PIX', 'CARTAO'));

alter table public.xpace_contract_sales
  add column if not exists starts_on date,
  add column if not exists first_due_on date,
  add column if not exists payment_method text,
  add column if not exists enrollment_fee_enabled boolean not null default false,
  add column if not exists discount_type text,
  add column if not exists discount_value integer not null default 0,
  add column if not exists discount_cents integer not null default 0;

update public.xpace_contract_sales sale
  set starts_on = contract.starts_on,
      first_due_on = contract.first_due_on,
      payment_method = contract.payment_method,
      enrollment_fee_enabled = contract.enrollment_fee_enabled
  from public.xpace_student_contracts contract
  where contract.id = sale.contract_id
    and (sale.starts_on is null or sale.first_due_on is null);

alter table public.xpace_contract_sales
  alter column starts_on set not null,
  alter column first_due_on set not null,
  add constraint xpace_contract_sales_payment_method_check
    check (payment_method is null or payment_method in ('PIX', 'CARTAO')),
  add constraint xpace_contract_sales_discount_check
    check (
      (discount_type is null and discount_value = 0 and discount_cents = 0)
      or (discount_type in ('PERCENTUAL', 'FIXO') and discount_value >= 0 and discount_cents >= 0)
    );

-- A contract may reserve more than one class group. The primary group kept in
-- xpace_student_contracts remains a compatibility pointer for older screens.
create table if not exists public.xpace_contract_class_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.xpace_student_contracts(id) on delete cascade,
  class_group_id uuid not null references public.xpace_class_groups(id) on delete restrict,
  modality_id uuid references public.xpace_modalities(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (contract_id, class_group_id)
);

create index if not exists xpace_contract_class_groups_contract_idx
  on public.xpace_contract_class_groups(contract_id);

create index if not exists xpace_contract_class_groups_group_idx
  on public.xpace_contract_class_groups(tenant_company_id, class_group_id);

alter table public.xpace_contract_class_groups enable row level security;
revoke all on table public.xpace_contract_class_groups from anon, authenticated;
grant select, insert, update, delete on table public.xpace_contract_class_groups to service_role;

-- Card data must come from the payment provider tokenization flow. No PAN or
-- CVV is stored here; the visible brand and final digits are safe references.
create table if not exists public.xpace_person_payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.xpace_people(id) on delete cascade,
  provider text not null default 'ASAAS',
  provider_customer_id text,
  provider_token text not null,
  brand text,
  last_four text,
  holder_name text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_company_id, provider, provider_token)
);

create index if not exists xpace_person_payment_methods_person_idx
  on public.xpace_person_payment_methods(tenant_company_id, person_id, active);

alter table public.xpace_person_payment_methods enable row level security;
revoke all on table public.xpace_person_payment_methods from anon, authenticated;
grant select, insert, update, delete on table public.xpace_person_payment_methods to service_role;
