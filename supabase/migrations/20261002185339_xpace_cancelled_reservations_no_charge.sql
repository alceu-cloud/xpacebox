create or replace function public.xpace_cancel_teacher_reservation(p_company uuid,p_actor uuid,p_id uuid,p_teacher uuid,p_charge integer,p_decision boolean,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare rental public.xpace_room_rentals;begin
  perform pg_advisory_xact_lock(hashtextextended('rooms:'||p_company::text,0));
  select * into rental from public.xpace_room_rentals where id=p_id and tenant_company_id=p_company for update;
  if not found or (p_teacher is not null and rental.instructor_id is distinct from p_teacher) then raise exception 'RESERVATION_NOT_FOUND';end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED';end if;
  if p_decision then
    if p_teacher is not null or rental.status<>'CANCELADA' or p_charge is null or p_charge<0 then raise exception 'CANCELLATION_INVALID';end if;
    update public.xpace_room_rentals set cancellation_charge_cents=p_charge,cancellation_decided_by=p_actor,cancellation_reason=left(p_reason,500),updated_at=now() where id=p_id;
  else
    if rental.status='CANCELADA' then return;end if;
    update public.xpace_room_rentals set status='CANCELADA',cancellation_charge_cents=0,cancellation_decided_by=p_actor,cancellation_reason=left(p_reason,500),updated_at=now() where id=p_id;
  end if;
  insert into public.xpace_teaching_audit(tenant_company_id,actor_id,entity_id,action,before_value,after_value,reason)
    select p_company,p_actor,p_id,case when p_decision then 'COBRANCA_CANCELAMENTO' else 'RESERVA_CANCELADA' end,to_jsonb(rental),to_jsonb(updated),p_reason from public.xpace_room_rentals updated where id=p_id;
end $$;
revoke all on function public.xpace_cancel_teacher_reservation(uuid,uuid,uuid,uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.xpace_cancel_teacher_reservation(uuid,uuid,uuid,uuid,integer,boolean,text) to service_role;


-- Previously pending cancelled rentals are waived, without deleting their history.
with waived as (
 update public.xpace_room_rentals set cancellation_charge_cents=0,updated_at=now()
 where status='CANCELADA' and cancellation_charge_cents is null
 and tenant_company_id in (select id from public.companies where slug='xpace') returning *
)
insert into public.xpace_teaching_audit(tenant_company_id,entity_id,action,after_value,reason)
select tenant_company_id,id,'CANCELAMENTO_SEM_COBRANCA',to_jsonb(waived),'Regra autorizada: cancelamento sem cobrança.' from waived;
