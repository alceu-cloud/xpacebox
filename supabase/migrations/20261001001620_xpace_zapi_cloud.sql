-- Additive migration: does not enable cloud, alter tokens, pairing or replay any message.
create table public.xpace_zapi_connections (
  connector_id uuid primary key references public.xpace_message_connectors(id) on delete cascade,
  tenant_company_id uuid not null unique references public.companies(id) on delete cascade,
  instance_id text not null unique,
  credential_ciphertext text not null,
  credential_iv text not null,
  credential_auth_tag text not null,
  webhook_secret_hash text not null,
  enabled boolean not null default false,
  paused boolean not null default true,
  lease_id uuid,
  lease_until timestamptz,
  last_checked_at timestamptz,
  connected boolean not null default false,
  last_error text,
  config_version uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
create table public.xpace_zapi_attempts (
  message_id uuid primary key references public.xpace_message_outbox(id) on delete cascade,
  connector_id uuid not null references public.xpace_zapi_connections(connector_id) on delete cascade,
  aliases text[] not null default '{}',
  started_at timestamptz not null default now(),
  accepted_at timestamptz,
  error_code text,
  config_version uuid not null
);
create index xpace_zapi_attempts_connector_idx on public.xpace_zapi_attempts(connector_id);
create table public.xpace_zapi_events (
  connector_id uuid not null references public.xpace_zapi_connections(connector_id) on delete cascade,
  provider_id text not null,
  recipient_hash text not null,
  state text not null check (state in ('ACCEPTED','DELIVERED','READ','ERROR')),
  occurred_at timestamptz not null,
  error_code text,
  received_at timestamptz not null default now(),
  primary key (connector_id,provider_id,state,occurred_at)
);
create index xpace_zapi_events_reconcile_idx on public.xpace_zapi_events(connector_id,provider_id);
alter table public.xpace_zapi_connections enable row level security;
alter table public.xpace_zapi_attempts enable row level security;
alter table public.xpace_zapi_events enable row level security;
revoke all on public.xpace_zapi_connections, public.xpace_zapi_attempts, public.xpace_zapi_events from anon, authenticated;
grant all on public.xpace_zapi_connections, public.xpace_zapi_attempts, public.xpace_zapi_events to service_role;

-- Human checks are auditable and separate from provider receipts; never invent a delivered_at.
alter table public.xpace_message_outbox add column manually_confirmed_at timestamptz,
  add column manual_confirmation_note text;

create function public.xpace_zapi_recipient_hash(p_phone text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select encode(extensions.digest(case when p_phone ~ '^55[0-9]{2}9[6-9][0-9]{7}$'
    then substr(p_phone,1,4)||substr(p_phone,6) else p_phone end,'sha256'),'hex');
$$;

-- CAS plus provider gate is evaluated inside the same transaction as the claim.
create function public.xpace_claim_provider_message(p_id uuid,p_tenant uuid,p_connector uuid,p_provider text)
returns table(id uuid,destination_phone text,body text)
language plpgsql security invoker set search_path = '' as $$
declare cloud public.xpace_zapi_connections;
begin
  -- Serialize a first-time SAVE / provider change even when no cloud row exists yet.
  perform 1 from public.xpace_message_connectors c where c.id=p_connector and c.tenant_company_id=p_tenant for update;
  if not found then return; end if;
  select * into cloud from public.xpace_zapi_connections where connector_id=p_connector and tenant_company_id=p_tenant for update;
  if p_provider not in ('LOCAL','ZAPI') then return; end if;
  if p_provider='LOCAL' and cloud.connector_id is not null then return; end if;
  if p_provider='ZAPI' and (not coalesce(cloud.enabled,false) or coalesce(cloud.paused,true)) then return; end if;
  return query update public.xpace_message_outbox o set status='SENDING',claimed_at=now(),updated_at=now()
    where o.id=p_id and o.tenant_company_id=p_tenant and o.connector_id=p_connector and o.status='QUEUED'
      and o.scheduled_at<=now()
    returning o.id,o.destination_phone,o.body;
end $$;

create function public.xpace_reconcile_zapi_events(p_connector uuid)
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
      and e.recipient_hash=public.xpace_zapi_recipient_hash(m.destination_phone) and e.occurred_at>=a.started_at;
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

create function public.xpace_save_zapi_config(p_connector uuid,p_tenant uuid,p_instance text,p_ciphertext text,p_iv text,p_tag text,p_webhook_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.xpace_zapi_connections;
begin
  perform 1 from public.xpace_message_connectors where id=p_connector and tenant_company_id=p_tenant for update;
  if not found then raise exception 'ZAPI_CONNECTOR_NOT_FOUND'; end if;
  select * into c from public.xpace_zapi_connections where connector_id=p_connector for update;
  if c.enabled or c.lease_until>now() then raise exception 'ZAPI_OPERATION_BUSY'; end if;
  if c.instance_id is not null and c.instance_id<>p_instance then raise exception 'ZAPI_INSTANCE_CHANGE_BLOCKED'; end if;
  insert into public.xpace_zapi_connections(connector_id,tenant_company_id,instance_id,credential_ciphertext,credential_iv,credential_auth_tag,webhook_secret_hash)
    values(p_connector,p_tenant,p_instance,p_ciphertext,p_iv,p_tag,p_webhook_hash)
    on conflict(connector_id) do update set credential_ciphertext=excluded.credential_ciphertext,credential_iv=excluded.credential_iv,
      credential_auth_tag=excluded.credential_auth_tag,config_version=gen_random_uuid(),connected=false,last_checked_at=null,last_error=null,paused=true,updated_at=now();
  return true;
end $$;

create function public.xpace_begin_zapi_test(p_connector uuid,p_tenant uuid,p_version uuid,p_id uuid,p_phone text,p_actor uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.xpace_zapi_connections;
begin
  perform 1 from public.xpace_message_connectors where id=p_connector and tenant_company_id=p_tenant for update;
  if not found then raise exception 'ZAPI_CONNECTOR_NOT_FOUND'; end if;
  select * into c from public.xpace_zapi_connections where connector_id=p_connector and tenant_company_id=p_tenant for update;
  if not found or c.config_version<>p_version or not c.paused then raise exception 'ZAPI_CONFIG_CHANGED_OR_NOT_PAUSED'; end if;
  if exists(select 1 from public.xpace_message_outbox where id=p_id) then return false; end if;
  if c.lease_until>now() or exists(select 1 from public.xpace_zapi_attempts where connector_id=p_connector and started_at>now()-interval '2 minutes') then raise exception 'ZAPI_TEST_BUSY'; end if;
  if p_phone !~ '^55[0-9]{10,11}$' then raise exception 'ZAPI_PHONE_INVALID'; end if;
  update public.xpace_zapi_connections set lease_id=p_id,lease_until=now()+interval '2 minutes' where connector_id=p_connector;
  insert into public.xpace_message_outbox(id,tenant_company_id,connector_id,kind,contact_name,destination_phone,body,status,claimed_at,created_by,expires_at)
    values(p_id,p_tenant,p_connector,'TESTE','ALCEU · TESTE Z-API',p_phone,'✅ Teste de conexão XPACEBOX pela Z-API. Alceu, confirme o recebimento para liberar os avisos da escola.','SENDING',now(),p_actor,now()+interval '30 minutes');
  insert into public.xpace_zapi_attempts(message_id,connector_id,config_version) values(p_id,p_connector,p_version);
  return true;
end $$;

create function public.xpace_activate_zapi(p_connector uuid,p_tenant uuid,p_version uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.xpace_zapi_connections;
begin
  perform 1 from public.xpace_message_connectors where id=p_connector and tenant_company_id=p_tenant for update;
  if not found then raise exception 'ZAPI_CONNECTOR_NOT_FOUND'; end if;
  select * into c from public.xpace_zapi_connections where connector_id=p_connector and tenant_company_id=p_tenant for update;
  if not found or c.config_version<>p_version or c.lease_until>now() then raise exception 'ZAPI_CONFIG_CHANGED_OR_BUSY'; end if;
  if not c.connected or c.last_checked_at<now()-interval '2 minutes' then raise exception 'ZAPI_DISCONNECTED'; end if;
  if exists(select 1 from public.xpace_message_outbox where connector_id=p_connector and tenant_company_id=p_tenant and status='SENDING') then raise exception 'ZAPI_SEND_IN_PROGRESS'; end if;
  if not exists(select 1 from public.xpace_zapi_attempts a join public.xpace_message_outbox o on o.id=a.message_id
    where a.connector_id=p_connector and a.config_version=c.config_version and a.started_at>now()-interval '30 minutes'
      and o.tenant_company_id=p_tenant and o.kind='TESTE' and (o.delivered_at is not null or o.read_at is not null)) then raise exception 'ZAPI_TEST_RECEIPT_REQUIRED'; end if;
  if exists(select 1 from public.xpace_message_connectors where id=p_connector and last_seen_at>now()-interval '90 seconds' and status<>'OFFLINE') then raise exception 'ZAPI_STOP_LOCAL_CONNECTOR'; end if;
  update public.xpace_zapi_connections set enabled=true,paused=false,updated_at=now() where connector_id=p_connector;
  return true;
end $$;
revoke all on function public.xpace_zapi_recipient_hash(text),public.xpace_claim_provider_message(uuid,uuid,uuid,text),public.xpace_reconcile_zapi_events(uuid),public.xpace_save_zapi_config(uuid,uuid,text,text,text,text,text),public.xpace_begin_zapi_test(uuid,uuid,uuid,uuid,text,uuid),public.xpace_activate_zapi(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.xpace_zapi_recipient_hash(text),public.xpace_claim_provider_message(uuid,uuid,uuid,text),public.xpace_reconcile_zapi_events(uuid),public.xpace_save_zapi_config(uuid,uuid,text,text,text,text,text),public.xpace_begin_zapi_test(uuid,uuid,uuid,uuid,text,uuid),public.xpace_activate_zapi(uuid,uuid,uuid) to service_role;
