alter table public.crm_activities
  add column if not exists agenda_kind text not null default 'FOLLOW_UP'
    check (agenda_kind in ('CYCLE', 'OPPORTUNITY', 'FOLLOW_UP'));

alter table public.crm_opportunities
  add column if not exists closed_at date;

-- Existing standalone agendas are the customer's current commercial cycle.
-- An agenda already attached to a deal remains a deal follow-up, except for
-- cycles which were historically converted into a scheduled repurchase deal.
update public.crm_activities
set agenda_kind = case
  when subject = 'PROXIMO CICLO COMERCIAL AGENDADO' then 'CYCLE'
  when opportunity_id is not null then 'OPPORTUNITY'
  else 'CYCLE'
end
where agenda_kind = 'FOLLOW_UP';

-- The profile pointer is now reserved for the cycle agenda. Legacy deal
-- agendas keep their own date without being duplicated as a cycle task.
with cycle_agendas as (
  select distinct on (tenant_company_id, client_id)
    tenant_company_id,
    client_id,
    next_action_at
  from public.crm_activities
  where agenda_kind = 'CYCLE'
    and next_action_at is not null
  order by tenant_company_id, client_id, next_action_at asc, occurred_at desc
)
update public.crm_customer_profiles profile
set next_contact_at = cycle_agendas.next_action_at,
    updated_at = now()
from cycle_agendas
where profile.tenant_company_id = cycle_agendas.tenant_company_id
  and profile.client_id = cycle_agendas.client_id;

update public.crm_customer_profiles profile
set next_contact_at = null,
    updated_at = now()
where profile.next_contact_at is not null
  and exists (
    select 1
    from public.crm_activities activity
    where activity.tenant_company_id = profile.tenant_company_id
      and activity.client_id = profile.client_id
      and activity.agenda_kind = 'OPPORTUNITY'
      and activity.next_action_at = profile.next_contact_at
  )
  and not exists (
    select 1
    from public.crm_activities cycle
    where cycle.tenant_company_id = profile.tenant_company_id
      and cycle.client_id = profile.client_id
      and cycle.agenda_kind = 'CYCLE'
      and cycle.next_action_at is not null
  );

update public.crm_opportunities
set closed_at = updated_at::date
where stage in ('WON', 'LOST')
  and closed_at is null;

create index if not exists crm_activities_open_agenda_kind_idx
  on public.crm_activities(tenant_company_id, agenda_kind, next_action_at)
  where next_action_at is not null;

create index if not exists crm_opportunities_closed_at_idx
  on public.crm_opportunities(tenant_company_id, closed_at desc)
  where stage in ('WON', 'LOST');
