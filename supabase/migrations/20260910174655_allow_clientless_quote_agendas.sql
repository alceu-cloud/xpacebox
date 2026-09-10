-- Direct quotes can open a commercial follow-up before their buyer becomes a client.
-- The activity remains linked to the opportunity and receives client_id when linked later.
alter table public.crm_activities
  alter column client_id drop not null;
