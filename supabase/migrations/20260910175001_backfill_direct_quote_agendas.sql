with next_business_day as (
  select case extract(isodow from (now() at time zone 'America/Sao_Paulo')::date)
    when 5 then (now() at time zone 'America/Sao_Paulo')::date + 3
    when 6 then (now() at time zone 'America/Sao_Paulo')::date + 2
    else (now() at time zone 'America/Sao_Paulo')::date + 1
  end as value
)
insert into public.crm_activities (
  tenant_company_id,
  client_id,
  opportunity_id,
  representative_profile_id,
  activity_type,
  outcome,
  subject,
  notes,
  occurred_at,
  next_action_type,
  next_action_at,
  agenda_kind,
  created_by
)
select
  opportunity.tenant_company_id,
  null,
  opportunity.id,
  opportunity.representative_profile_id,
  'QUOTE',
  'FOLLOW_UP',
  'ORCAMENTO DIRETO ' || quote.quote_number || ' ENVIADO',
  'AGENDA CRIADA PARA ACOMPANHAR ORCAMENTO DIRETO ENVIADO PARA ' || quote.client_name || '.',
  now(),
  'FOLLOW_UP',
  (next_business_day.value::timestamp at time zone 'America/Sao_Paulo'),
  'OPPORTUNITY',
  opportunity.created_by
from public.crm_opportunities opportunity
join public.quotes quote on quote.id = opportunity.quote_id
cross join next_business_day
where opportunity.client_id is null
  and opportunity.quote_id is not null
  and opportunity.stage not in ('WON', 'LOST')
  and not exists (
    select 1
    from public.crm_activities activity
    where activity.tenant_company_id = opportunity.tenant_company_id
      and activity.opportunity_id = opportunity.id
      and activity.next_action_at is not null
  );
