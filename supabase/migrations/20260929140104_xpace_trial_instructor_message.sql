-- A teacher notification must reference an instructor and appointment in the same company.
alter table public.xpace_message_outbox
  add column instructor_id uuid references public.xpace_instructors(id) on delete set null;

alter table public.xpace_message_outbox drop constraint xpace_message_outbox_kind_check;
alter table public.xpace_message_outbox add constraint xpace_message_outbox_kind_check
  check (kind in ('ASSINATURA', 'COBRANCA', 'TESTE', 'VIDEO_BOAS_VINDAS', 'LEMBRETE_VESPERA', 'CONFIRMACAO_DIA', 'COBRANCA_PIX_AUTOMATICA', 'AVISO_PROFESSOR'));
alter table public.xpace_message_outbox add constraint xpace_message_outbox_teacher_context_check
  check (kind <> 'AVISO_PROFESSOR' or (appointment_id is not null and instructor_id is not null));

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
  if new.instructor_id is not null and not exists (select 1 from public.xpace_instructors i where i.id = new.instructor_id and i.tenant_company_id = new.tenant_company_id) then
    raise exception 'Professor de outra empresa';
  end if;
  return new;
end;
$$;
drop trigger xpace_message_outbox_company_guard on public.xpace_message_outbox;
create trigger xpace_message_outbox_company_guard
  before insert or update of tenant_company_id, connector_id, student_id, sale_id, charge_id, lead_id, appointment_id, instructor_id
  on public.xpace_message_outbox for each row execute function public.xpace_check_message_outbox_company();
