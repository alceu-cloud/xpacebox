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
  updated_at timestamptz not null default now()
);
create table public.xpace_zapi_attempts (
  message_id uuid primary key references public.xpace_message_outbox(id) on delete cascade,
  connector_id uuid not null references public.xpace_zapi_connections(connector_id) on delete cascade,
  aliases text[] not null default '{}',
  started_at timestamptz not null default now(),
  accepted_at timestamptz,
  error_code text
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

-- CAS plus provider gate is evaluated inside the same transaction as the claim.
create function public.xpace_claim_provider_message(p_id uuid,p_tenant uuid,p_connector uuid,p_provider text)
returns table(id uuid,destination_phone text,body text)
language plpgsql security invoker set search_path = '' as $$
declare cloud public.xpace_zapi_connections;
begin
  select * into cloud from public.xpace_zapi_connections where connector_id=p_connector and tenant_company_id=p_tenant for update;
  if p_provider not in ('LOCAL','ZAPI') then return; end if;
  if p_provider='LOCAL' and coalesce(cloud.enabled,false) then return; end if;
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
      and e.recipient_hash=encode(extensions.digest(m.destination_phone,'sha256'),'hex') and e.occurred_at>=a.started_at-interval '5 minutes';
    if delivery is not null then
      update public.xpace_message_outbox set status='SENT',delivered_at=coalesce(delivered_at,delivery),read_at=coalesce(read_at,reading),error_message=null,updated_at=now() where id=m.id;
      if m.kind='VIDEO_BOAS_VINDAS' and m.appointment_id is not null then
        update public.xpace_lead_appointments set welcome_delivery_status='ENVIADO',welcome_delivered_at=coalesce(welcome_delivered_at,delivery) where id=m.appointment_id and tenant_company_id=m.tenant_company_id;
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
revoke all on function public.xpace_claim_provider_message(uuid,uuid,uuid,text), public.xpace_reconcile_zapi_events(uuid) from public,anon,authenticated;
grant execute on function public.xpace_claim_provider_message(uuid,uuid,uuid,text), public.xpace_reconcile_zapi_events(uuid) to service_role;
