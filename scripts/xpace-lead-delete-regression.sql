-- Run only inside an explicit transaction and ROLLBACK. Test records never commit.
-- Uses the real triggers/foreign keys, not a mocked deletion.
begin;
do $$
#variable_conflict use_variable
declare
  company_id uuid; connector_id uuid; teacher_id uuid; other_company_id uuid;
  lead_id uuid := gen_random_uuid(); other_lead_id uuid := gen_random_uuid();
  foreign_lead_id uuid := gen_random_uuid(); appointment_id uuid := gen_random_uuid();
  blocked boolean := false; first_number bigint;
begin
  select c.id, mc.id into company_id, connector_id from public.companies c
    join public.xpace_message_connectors mc on mc.tenant_company_id=c.id where c.slug='xpace';
  select id into teacher_id from public.xpace_instructors where tenant_company_id=company_id limit 1;
  select id into other_company_id from public.companies where id<>company_id limit 1;
  if connector_id is null or teacher_id is null or other_company_id is null then raise exception 'Missing test fixture context'; end if;
  select least(coalesce(min(lead_number),0),0)-1 into first_number from public.xpace_leads;
  insert into public.xpace_leads(id,lead_number,tenant_company_id,full_name) overriding system value values
    (lead_id,first_number,company_id,'TESTE TRANSACIONAL EXCLUSÃO'),
    (other_lead_id,first_number-1,company_id,'TESTE TRANSACIONAL PRESERVADO'),
    (foreign_lead_id,first_number-2,other_company_id,'TESTE TRANSACIONAL OUTRA EMPRESA');
  insert into public.xpace_lead_appointments(id,tenant_company_id,lead_id,scheduled_on,booking_kind)
    values (appointment_id,company_id,lead_id,current_date,'RECUPERACAO');
  insert into public.xpace_message_outbox(tenant_company_id,connector_id,lead_id,appointment_id,instructor_id,kind,contact_name,destination_phone,body,status)
    values (company_id,connector_id,lead_id,appointment_id,null,'VIDEO_BOAS_VINDAS','TESTE','5599999999999','TESTE NÃO ENVIAR','SENT'),
    (company_id,connector_id,lead_id,appointment_id,teacher_id,'AVISO_PROFESSOR','TESTE','5599999999999','TESTE NÃO ENVIAR','SENT'),
    (company_id,connector_id,lead_id,appointment_id,null,'CONFIRMACAO_DIA','TESTE','5599999999999','TESTE NÃO ENVIAR','QUEUED'),
    (company_id,connector_id,lead_id,appointment_id,null,'TESTE','TESTE','5599999999999','TESTE NÃO ENVIAR','SENDING'),
    (company_id,connector_id,other_lead_id,null,null,'TESTE','TESTE PRESERVADO','5599999999999','TESTE PRESERVADO','SENT');
  begin
    insert into public.xpace_message_outbox(tenant_company_id,connector_id,lead_id,kind,contact_name,destination_phone,body,status)
      values(company_id,connector_id,foreign_lead_id,'TESTE','TESTE','5599999999999','TESTE NÃO ENVIAR','SENT');
  exception when others then
    if sqlerrm <> 'Lead de outra empresa' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Cross-company guard failed'; end if;
  blocked := false;
  begin delete from public.xpace_leads where id=lead_id;
  exception when others then
    if sqlerrm <> 'XPACE_LEAD_MESSAGE_SENDING' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'In-flight deletion was not blocked'; end if;
  if not exists(select 1 from public.xpace_message_outbox m where m.lead_id=lead_id and m.kind='CONFIRMACAO_DIA' and m.status='QUEUED') then
    raise exception 'Failed delete changed the queue';
  end if;
  update public.xpace_message_outbox m set status='UNKNOWN' where m.appointment_id=appointment_id and m.kind='TESTE';
  delete from public.xpace_leads l where l.id=lead_id;
  if exists(select 1 from public.xpace_lead_appointments a where a.id=appointment_id) then raise exception 'Appointment cascade failed'; end if;
  if (select count(*) from public.xpace_message_outbox m where m.contact_name='TESTE' and m.body='TESTE NÃO ENVIAR' and m.lead_id is null and m.appointment_id is null)<>4 then raise exception 'Message audit history lost'; end if;
  if not exists(select 1 from public.xpace_message_outbox m where m.contact_name='TESTE' and m.kind='CONFIRMACAO_DIA' and m.status='CANCELLED') then raise exception 'Pending notice not cancelled'; end if;
  if not exists(select 1 from public.xpace_message_outbox m where m.lead_id=other_lead_id and m.body='TESTE PRESERVADO' and m.status='SENT') then raise exception 'Unrelated message changed'; end if;
end;
$$;
rollback;
