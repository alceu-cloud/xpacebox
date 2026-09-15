-- A manual follow-up must never be treated as a commercial cycle. Older
-- versions reused the cycle kind while recording a completed cycle, which
-- made a profile date compete with the manually scheduled agenda.
update public.crm_activities
set agenda_kind = 'FOLLOW_UP'
where agenda_kind = 'CYCLE'
  and next_action_at is not null
  and coalesce(subject, '') <> 'PROXIMO CICLO COMERCIAL AGENDADO';

-- These rows were generated automatically by the old portfolio form, not by
-- a user contact. Keep the timeline entry, but remove their obsolete agenda.
update public.crm_activities
set next_action_type = null,
    next_action_at = null
where subject = 'CONTATO PROGRAMADO'
  and notes = 'AGENDA CRIADA A PARTIR DO RESUMO DO CLIENTE.';

-- The profile mirrors only a real purchase-cycle agenda. This keeps the
-- portfolio forecast and the CRM agenda from becoming competing sources.
update public.crm_customer_profiles profile
set next_contact_at = (
      select activity.next_action_at
      from public.crm_activities activity
      where activity.tenant_company_id = profile.tenant_company_id
        and activity.client_id = profile.client_id
        and activity.agenda_kind = 'CYCLE'
        and activity.subject = 'PROXIMO CICLO COMERCIAL AGENDADO'
        and activity.next_action_at is not null
      order by activity.occurred_at desc
      limit 1
    ),
    updated_at = now()
where exists (
  select 1
  from public.crm_activities activity
  where activity.tenant_company_id = profile.tenant_company_id
    and activity.client_id = profile.client_id
    and activity.agenda_kind = 'CYCLE'
    and activity.subject = 'PROXIMO CICLO COMERCIAL AGENDADO'
    and activity.next_action_at is not null
);

update public.crm_customer_profiles profile
set next_contact_at = null,
    updated_at = now()
where next_contact_at is not null
  and not exists (
    select 1
    from public.crm_activities activity
    where activity.tenant_company_id = profile.tenant_company_id
      and activity.client_id = profile.client_id
      and activity.agenda_kind = 'CYCLE'
      and activity.subject = 'PROXIMO CICLO COMERCIAL AGENDADO'
      and activity.next_action_at is not null
  );
