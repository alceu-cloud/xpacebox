-- Detach both references before the lead/appointment cascade starts. Otherwise
-- ON DELETE SET NULL validates one reference while the other has already vanished.
-- Row locks serialize deletion with message claims; no message in flight is removed.
create function private.xpace_detach_lead_message_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.xpace_message_outbox m
  where m.tenant_company_id = old.tenant_company_id
    and (m.lead_id = old.id or m.appointment_id in (
      select a.id from public.xpace_lead_appointments a
      where a.tenant_company_id = old.tenant_company_id and a.lead_id = old.id
    ))
  order by m.id for update;

  if exists (
    select 1 from public.xpace_message_outbox m
    where m.tenant_company_id = old.tenant_company_id and m.status = 'SENDING'
      and (m.lead_id = old.id or m.appointment_id in (
        select a.id from public.xpace_lead_appointments a
        where a.tenant_company_id = old.tenant_company_id and a.lead_id = old.id
      ))
  ) then raise exception 'XPACE_LEAD_MESSAGE_SENDING'; end if;

  update public.xpace_message_outbox m
  set lead_id = null, appointment_id = null,
      status = case when m.status = 'QUEUED' then 'CANCELLED' else m.status end,
      error_message = case when m.status = 'QUEUED' then 'LEAD EXCLUÍDO.' else m.error_message end,
      updated_at = now()
  where m.tenant_company_id = old.tenant_company_id
    and (m.lead_id = old.id or m.appointment_id in (
      select a.id from public.xpace_lead_appointments a
      where a.tenant_company_id = old.tenant_company_id and a.lead_id = old.id
    ));
  return old;
end;
$$;

revoke all on function private.xpace_detach_lead_message_history() from public, anon, authenticated;
create trigger xpace_lead_detach_message_history
before delete on public.xpace_leads
for each row execute function private.xpace_detach_lead_message_history();
