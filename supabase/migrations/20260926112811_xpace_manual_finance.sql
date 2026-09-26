-- Livro financeiro manual da XPACE. Não altera cobranças de contratos/XPay.
create table public.xpace_financial_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  description text not null check (length(trim(description)) between 2 and 120),
  account_type text not null check (account_type in ('CONTA_CORRENTE', 'POUPANCA', 'CAIXA', 'CARTEIRA_DIGITAL', 'OUTRA')),
  bank_name text,
  agency_number text,
  agency_digit text,
  account_number text,
  account_digit text,
  different_holder boolean not null default false,
  holder_name text,
  holder_document text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_company_id, id),
  check (not different_holder or (nullif(trim(holder_name), '') is not null and nullif(trim(holder_document), '') is not null))
);

create index xpace_financial_accounts_company_active_idx
  on public.xpace_financial_accounts(tenant_company_id, active, description);
create index xpace_financial_accounts_created_by_idx
  on public.xpace_financial_accounts(created_by) where created_by is not null;

create table public.xpace_manual_financial_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  direction text not null check (direction in ('PAGAR', 'RECEBER')),
  description text not null check (length(trim(description)) between 2 and 180),
  counterparty_name text not null check (length(trim(counterparty_name)) between 2 and 180),
  competence_on date not null,
  due_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_company_id, id)
);

create index xpace_manual_financial_entries_company_direction_due_idx
  on public.xpace_manual_financial_entries(tenant_company_id, direction, due_on desc);
create index xpace_manual_financial_entries_company_competence_idx
  on public.xpace_manual_financial_entries(tenant_company_id, competence_on desc);
create index xpace_manual_financial_entries_created_by_idx
  on public.xpace_manual_financial_entries(created_by) where created_by is not null;

create table public.xpace_manual_financial_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  entry_id uuid not null,
  financial_account_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  settled_on date not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_company_id, entry_id)
    references public.xpace_manual_financial_entries(tenant_company_id, id) on delete restrict,
  foreign key (tenant_company_id, financial_account_id)
    references public.xpace_financial_accounts(tenant_company_id, id) on delete restrict
);

create index xpace_manual_financial_settlements_entry_idx
  on public.xpace_manual_financial_settlements(tenant_company_id, entry_id, settled_on desc);
create index xpace_manual_financial_settlements_account_idx
  on public.xpace_manual_financial_settlements(tenant_company_id, financial_account_id)
  where financial_account_id is not null;
create index xpace_manual_financial_settlements_created_by_idx
  on public.xpace_manual_financial_settlements(created_by) where created_by is not null;

-- A trava por lançamento impede duas baixas simultâneas de ultrapassarem o valor original.
create function public.xpace_guard_manual_financial_settlement()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare original_amount integer; already_settled bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.entry_id::text, 0));
  select amount_cents into original_amount
    from public.xpace_manual_financial_entries
    where id = new.entry_id and tenant_company_id = new.tenant_company_id;
  if not found then raise exception 'LANÇAMENTO FINANCEIRO NÃO ENCONTRADO NA EMPRESA'; end if;
  select coalesce(sum(amount_cents), 0) into already_settled
    from public.xpace_manual_financial_settlements
    where entry_id = new.entry_id and tenant_company_id = new.tenant_company_id;
  if already_settled + new.amount_cents > original_amount then
    raise exception 'VALOR DA BAIXA EXCEDE O SALDO DO LANÇAMENTO';
  end if;
  return new;
end $$;

create trigger xpace_guard_manual_financial_settlement
  before insert on public.xpace_manual_financial_settlements
  for each row execute function public.xpace_guard_manual_financial_settlement();

alter table public.xpace_financial_accounts enable row level security;
alter table public.xpace_manual_financial_entries enable row level security;
alter table public.xpace_manual_financial_settlements enable row level security;

revoke all on public.xpace_financial_accounts from public, anon, authenticated;
revoke all on public.xpace_manual_financial_entries from public, anon, authenticated;
revoke all on public.xpace_manual_financial_settlements from public, anon, authenticated;
revoke all on public.xpace_financial_accounts from service_role;
revoke all on public.xpace_manual_financial_entries from service_role;
revoke all on public.xpace_manual_financial_settlements from service_role;
grant select, insert on public.xpace_financial_accounts to service_role;
grant select, insert on public.xpace_manual_financial_entries to service_role;
grant select, insert on public.xpace_manual_financial_settlements to service_role;

revoke all on function public.xpace_guard_manual_financial_settlement() from public, anon, authenticated;
grant execute on function public.xpace_guard_manual_financial_settlement() to service_role;
