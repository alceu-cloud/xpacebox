-- A linked-device connector is scoped to one company. Its bearer secret is never stored in plaintext.
create table public.xpace_message_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null unique references public.companies(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'OFFLINE' check (status in ('OFFLINE', 'WAITING_QR', 'CONNECTED', 'ERROR')),
  phone text,
  qr_data_url text,
  qr_updated_at timestamptz,
  last_seen_at timestamptz,
  last_error text,
  disconnect_requested boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.xpace_message_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  connector_id uuid not null references public.xpace_message_connectors(id) on delete restrict,
  student_id uuid references public.xpace_people(id) on delete set null,
  sale_id uuid references public.xpace_contract_sales(id) on delete set null,
  charge_id uuid references public.xpace_contract_charges(id) on delete set null,
  kind text not null check (kind in ('ASSINATURA', 'COBRANCA', 'TESTE')),
  contact_name text not null,
  destination_phone text not null,
  body text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN', 'CANCELLED')),
  provider_message_id text,
  error_message text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(destination_phone) between 12 and 15),
  check (length(body) between 1 and 2000)
);

create index xpace_message_outbox_queue_idx on public.xpace_message_outbox(connector_id, created_at)
  where status = 'QUEUED';
create index xpace_message_outbox_company_idx on public.xpace_message_outbox(tenant_company_id, created_at desc);
create unique index xpace_message_outbox_one_active_link_idx
  on public.xpace_message_outbox(tenant_company_id, sale_id, kind)
  where sale_id is not null and status in ('QUEUED', 'SENDING');

-- Service-role callers still cannot link a message to records from another company.
create function public.xpace_check_message_outbox_company()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.xpace_message_connectors c where c.id = new.connector_id and c.tenant_company_id = new.tenant_company_id) then
    raise exception 'Conector de outra empresa';
  end if;
  if new.student_id is not null and not exists (select 1 from public.xpace_people p where p.id = new.student_id and p.tenant_company_id = new.tenant_company_id) then
    raise exception 'Aluno de outra empresa';
  end if;
  if new.sale_id is not null and not exists (select 1 from public.xpace_contract_sales s where s.id = new.sale_id and s.tenant_company_id = new.tenant_company_id) then
    raise exception 'Venda de outra empresa';
  end if;
  if new.charge_id is not null and not exists (select 1 from public.xpace_contract_charges ch where ch.id = new.charge_id and ch.tenant_company_id = new.tenant_company_id) then
    raise exception 'Cobrança de outra empresa';
  end if;
  return new;
end;
$$;
create trigger xpace_message_outbox_company_guard
  before insert or update of tenant_company_id, connector_id, student_id, sale_id, charge_id
  on public.xpace_message_outbox for each row execute function public.xpace_check_message_outbox_company();
revoke all on function public.xpace_check_message_outbox_company() from public, anon, authenticated;

alter table public.xpace_message_connectors enable row level security;
alter table public.xpace_message_outbox enable row level security;
revoke all on table public.xpace_message_connectors from anon, authenticated;
revoke all on table public.xpace_message_outbox from anon, authenticated;
grant select, insert, update, delete on table public.xpace_message_connectors to service_role;
grant select, insert, update, delete on table public.xpace_message_outbox to service_role;
