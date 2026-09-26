-- Cadastros de configuracao da XPACE, com separacao por empresa.
create table public.xpace_expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 100),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, id)
);

create unique index xpace_expense_categories_company_name_unique
  on public.xpace_expense_categories(tenant_company_id, lower(name));
create index xpace_expense_categories_created_by_idx
  on public.xpace_expense_categories(created_by) where created_by is not null;
create index xpace_expense_categories_updated_by_idx
  on public.xpace_expense_categories(updated_by) where updated_by is not null;

insert into public.xpace_expense_categories (tenant_company_id, name)
select company.id, category.name
from public.companies as company
cross join (values
  ('ALUGUEL'), ('CONDOMÍNIO'), ('ENERGIA ELÉTRICA'), ('ÁGUA E ESGOTO'),
  ('INTERNET E TELEFONIA'), ('SALÁRIOS'), ('ENCARGOS TRABALHISTAS'),
  ('PRÓ-LABORE'), ('PROFESSORES E PRESTADORES'), ('CONTABILIDADE'),
  ('IMPOSTOS E TAXAS'), ('MARKETING E PUBLICIDADE'),
  ('SISTEMAS E ASSINATURAS'), ('MATERIAIS DE LIMPEZA'),
  ('MANUTENÇÃO E REPAROS'), ('MATERIAIS DE ESCRITÓRIO'),
  ('TAXAS BANCÁRIAS'), ('OUTROS')
) as category(name)
where company.slug = 'xpace';

-- A categoria e o cliente nunca podem apontar para outra empresa.
create unique index xpace_people_company_id_unique
  on public.xpace_people(tenant_company_id, id);

alter table public.xpace_manual_financial_entries
  add column expense_category_id uuid,
  add column client_id uuid,
  add column recurrence_group_id uuid,
  add column recurrence_sequence integer,
  add column recurrence_total integer,
  add column recurrence_frequency text,
  add constraint xpace_manual_financial_entries_category_fk
    foreign key (tenant_company_id, expense_category_id)
    references public.xpace_expense_categories(tenant_company_id, id) on delete restrict,
  add constraint xpace_manual_financial_entries_client_fk
    foreign key (tenant_company_id, client_id)
    references public.xpace_people(tenant_company_id, id) on delete restrict,
  add constraint xpace_manual_financial_entries_direction_link_check
    check (
      (direction = 'PAGAR' and expense_category_id is not null and client_id is null)
      or (direction = 'RECEBER' and client_id is not null and expense_category_id is null)
    ) not valid,
  add constraint xpace_manual_financial_entries_recurrence_check
    check (
      (recurrence_group_id is null and recurrence_sequence is null and recurrence_total is null and recurrence_frequency is null)
      or (recurrence_group_id is not null and recurrence_sequence is not null
        and recurrence_total is not null and recurrence_frequency is not null
        and recurrence_sequence between 1 and recurrence_total
        and recurrence_total between 1 and 120
        and recurrence_frequency in ('UNICA','DIARIA','MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL'))
    );

alter table public.xpace_manual_financial_entries
  add constraint xpace_manual_financial_entries_recurrence_unique
    unique (tenant_company_id, recurrence_group_id, recurrence_sequence);

create index xpace_manual_financial_entries_category_idx
  on public.xpace_manual_financial_entries(tenant_company_id, expense_category_id)
  where expense_category_id is not null;
create index xpace_manual_financial_entries_client_idx
  on public.xpace_manual_financial_entries(tenant_company_id, client_id)
  where client_id is not null;

-- Motivos de ganho sao opcionais para manter o historico existente de leads.
create table public.xpace_lead_win_reasons (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 100),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_company_id, id)
);

create unique index xpace_lead_win_reasons_company_name_unique
  on public.xpace_lead_win_reasons(tenant_company_id, lower(name));
create index xpace_lead_win_reasons_created_by_idx
  on public.xpace_lead_win_reasons(created_by) where created_by is not null;
create index xpace_lead_win_reasons_updated_by_idx
  on public.xpace_lead_win_reasons(updated_by) where updated_by is not null;

alter table public.xpace_leads
  add column win_reason_id uuid,
  add constraint xpace_leads_win_reason_fk
    foreign key (tenant_company_id, win_reason_id)
    references public.xpace_lead_win_reasons(tenant_company_id, id) on delete restrict;
create index xpace_leads_win_reason_idx
  on public.xpace_leads(tenant_company_id, win_reason_id)
  where win_reason_id is not null;

alter table public.xpace_expense_categories enable row level security;
alter table public.xpace_lead_win_reasons enable row level security;
revoke all on public.xpace_expense_categories from public, anon, authenticated, service_role;
revoke all on public.xpace_lead_win_reasons from public, anon, authenticated, service_role;
grant select, insert, update on public.xpace_expense_categories to service_role;
grant select, insert, update on public.xpace_lead_win_reasons to service_role;
