-- Persist only provider-verified PN -> LID binding hashes; no raw identifiers.
alter table public.xpace_zapi_attempts add column recipient_lid_hash text check(recipient_lid_hash is null or recipient_lid_hash ~ '^[0-9a-f]{64}$');

create or replace function public.xpace_reconcile_zapi_events(p_connector uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare m record; delivery timestamptz; reading timestamptz; failure text; accepted timestamptz; changed integer:=0;
begin
  for m in select o.* from public.xpace_message_outbox o join public.xpace_zapi_attempts a on a.message_id=o.id
    join public.xpace_zapi_connections c on c.connector_id=a.connector_id and c.tenant_company_id=o.tenant_company_id
    where a.connector_id=p_connector and o.connector_id=p_connector and o.status in ('SENT','UNKNOWN','FAILED') for update of o
  loop
    select min(e.occurred_at) filter(where e.state in ('DELIVERED','READ')),
      min(e.occurred_at) filter(where e.state='READ'), min(e.occurred_at) filter(where e.state='ACCEPTED'),
      max(e.error_code) filter(where e.state='ERROR')
    into delivery,reading,accepted,failure from public.xpace_zapi_events e join public.xpace_zapi_attempts a on a.message_id=m.id
    where e.connector_id=p_connector and e.provider_id=any(a.aliases)
      and (e.recipient_hash=public.xpace_zapi_recipient_hash(m.destination_phone)
        or (a.recipient_lid_hash is not null and e.recipient_hash=a.recipient_lid_hash)) and e.occurred_at>=a.started_at;
    if delivery is not null then
      update public.xpace_message_outbox set status='SENT',sent_at=coalesce(sent_at,accepted,delivery),delivered_at=coalesce(delivered_at,delivery),read_at=coalesce(read_at,reading),error_message=null,updated_at=now() where id=m.id
        and (status<>'SENT' or delivered_at is null or (reading is not null and read_at is null) or error_message is not null);
      if m.kind='VIDEO_BOAS_VINDAS' and m.appointment_id is not null then
        update public.xpace_lead_appointments set welcome_delivery_status='ENVIADO',welcome_delivered_at=coalesce(welcome_delivered_at,delivery) where id=m.appointment_id and tenant_company_id=m.tenant_company_id;
      end if;
      if m.kind='PESQUISA_SATISFACAO' and m.appointment_id is not null then
        update public.xpace_lead_appointments set survey_status='ENVIADA' where id=m.appointment_id and tenant_company_id=m.tenant_company_id and survey_status<>'ENVIADA';
      end if;
      changed:=changed+1;
    elsif failure is not null and m.delivered_at is null and m.read_at is null then
      update public.xpace_message_outbox set status='UNKNOWN',error_message=failure||'. VERIFIQUE A CONVERSA ANTES DE REENVIAR.',updated_at=now() where id=m.id;
      update public.xpace_zapi_attempts set error_code=failure where message_id=m.id;
      if failure='ZAPI_SHADOW_BAN' then update public.xpace_zapi_connections set paused=true,last_error=failure where connector_id=p_connector; end if;
    elsif accepted is not null and m.status='UNKNOWN' then
      update public.xpace_message_outbox set status='SENT',sent_at=coalesce(sent_at,accepted),updated_at=now() where id=m.id;
    end if;
  end loop;
  return changed;
end $$;
