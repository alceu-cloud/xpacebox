create table public.xpace_people (
  id uuid primary key default gen_random_uuid(),
  person_number bigint generated always as identity unique,
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  cpf text,
  full_name text not null,
  mobile text,
  birth_date date,
  email text,
  gender text not null default 'NAO_INFORMADO' check (gender in ('FEMININO', 'MASCULINO', 'NAO_BINARIO', 'PREFIRO_NAO_INFORMAR', 'NAO_INFORMADO')),
  is_student boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  whatsapp_opt_in_at timestamptz,
  postal_code text,
  street text,
  street_number text,
  complement text,
  district text,
  city text,
  state text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cpf is null or cpf ~ '^[0-9]{11}$')
);

create unique index xpace_people_company_cpf_unique
  on public.xpace_people(tenant_company_id, cpf)
  where cpf is not null;

create index xpace_people_company_name_idx
  on public.xpace_people(tenant_company_id, full_name);

create index xpace_people_company_mobile_idx
  on public.xpace_people(tenant_company_id, mobile);

create table public.xpace_guardianships (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.xpace_people(id) on delete cascade,
  guardian_id uuid not null references public.xpace_people(id) on delete restrict,
  relationship text not null default 'RESPONSAVEL',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, guardian_id),
  check (student_id <> guardian_id)
);

create index xpace_guardianships_company_student_idx
  on public.xpace_guardianships(tenant_company_id, student_id);

alter table public.xpace_people enable row level security;
alter table public.xpace_guardianships enable row level security;

revoke all on table public.xpace_people from anon, authenticated;
revoke all on table public.xpace_guardianships from anon, authenticated;
grant select, insert, update, delete on table public.xpace_people to service_role;
grant select, insert, update, delete on table public.xpace_guardianships to service_role;
