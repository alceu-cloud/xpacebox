-- Schedule consented trial messages and prevent cross-company references.
alter table public.xpace_lead_appointments
  add column whatsapp_opt_in boolean not null default false,
  add column whatsapp_opt_in_at timestamptz;

alter table public.xpace_contract_charges
  add column school_whatsapp_ready boolean not null default false;

alter table public.xpace_message_outbox
  add column lead_id uuid references public.xpace_leads(id) on delete set null,
  add column appointment_id uuid references public.xpace_lead_appointments(id) on delete set null,
  add column appointment_scheduled_on date,
  add column appointment_starts_at time,
  add column scheduled_at timestamptz not null default now(),
  add column expires_at timestamptz;

alter table public.xpace_message_outbox drop constraint xpace_message_outbox_kind_check;
alter table public.xpace_message_outbox add constraint xpace_message_outbox_kind_check
  check (kind in ('ASSINATURA', 'COBRANCA', 'TESTE', 'VIDEO_BOAS_VINDAS', 'LEMBRETE_VESPERA', 'CONFIRMACAO_DIA', 'COBRANCA_PIX_AUTOMATICA'));

drop index public.xpace_message_outbox_queue_idx;
create index xpace_message_outbox_queue_idx on public.xpace_message_outbox(connector_id, scheduled_at, created_at)
  where status = 'QUEUED';
create unique index xpace_message_outbox_appointment_kind_idx
  on public.xpace_message_outbox(tenant_company_id, appointment_id, kind)
  where appointment_id is not null;
create unique index xpace_message_outbox_charge_kind_idx
  on public.xpace_message_outbox(tenant_company_id, charge_id, kind)
  where charge_id is not null and kind = 'COBRANCA_PIX_AUTOMATICA';

create or replace function public.xpace_check_message_outbox_company()
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
  if new.lead_id is not null and not exists (select 1 from public.xpace_leads l where l.id = new.lead_id and l.tenant_company_id = new.tenant_company_id) then
    raise exception 'Lead de outra empresa';
  end if;
  if new.appointment_id is not null and not exists (
    select 1 from public.xpace_lead_appointments a
    where a.id = new.appointment_id and a.tenant_company_id = new.tenant_company_id
      and (new.lead_id is null or a.lead_id = new.lead_id)
  ) then
    raise exception 'Agendamento de outra empresa ou lead inconsistente';
  end if;
  return new;
end;
$$;
drop trigger xpace_message_outbox_company_guard on public.xpace_message_outbox;
create trigger xpace_message_outbox_company_guard
  before insert or update of tenant_company_id, connector_id, student_id, sale_id, charge_id, lead_id, appointment_id
  on public.xpace_message_outbox for each row execute function public.xpace_check_message_outbox_company();
