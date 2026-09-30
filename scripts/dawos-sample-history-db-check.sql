-- Run ONLY in a transaction ending in ROLLBACK, after the migration SQL.
-- Explicit negative identity avoids consuming the production sample sequence.
do $$
declare
  source public.client_samples%rowtype;
  actor_id uuid;
  test_id uuid := gen_random_uuid();
  day date := (now() at time zone 'America/Sao_Paulo')::date;
  total integer;
begin
  select s.* into source from public.client_samples s join public.companies c on c.id=s.tenant_company_id where c.slug='dawos' limit 1;
  select id into actor_id from public.profiles where active and platform_role='platform_owner' limit 1;
  if source.id is null or actor_id is null then raise exception 'FIXTURE SOURCE NOT FOUND'; end if;
  if has_function_privilege('authenticated','public.change_sample_deadline(uuid,uuid,uuid,text,text,date,date,date,text)','execute') then raise exception 'RPC EXPOSED'; end if;
  if has_table_privilege('authenticated','public.client_samples','update') then raise exception 'DIRECT WRITES EXPOSED'; end if;
  insert into public.client_samples(id,tenant_company_id,client_id,product_description,requested_at,production_due_date,delivery_date,responsible_profile_id,sample_number,status)
    overriding system value values(test_id,source.tenant_company_id,source.client_id,'ROLLBACK ONLY',day,day,day,actor_id,-93020261350,'IN_PRODUCTION');
  begin
    update public.client_samples set production_due_date=day+1 where id=test_id;
    raise exception 'UNAUDITED DEADLINE ACCEPTED';
  exception when check_violation then null; end;
  begin
    perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'REPROGRAM','IN_PRODUCTION',day,day+1,null,'');
    raise exception 'EMPTY REASON ACCEPTED';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.change_sample_deadline(gen_random_uuid(),test_id,actor_id,'REPROGRAM','IN_PRODUCTION',day,day+1,null,'VALID');
    raise exception 'FOREIGN COMPANY ACCEPTED';
  exception when no_data_found then null; end;
  perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'REPROGRAM','IN_PRODUCTION',day,day+1,null,'MATERIAL');
  begin
    perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'REPROGRAM','IN_PRODUCTION',day,day+2,null,'STALE');
    raise exception 'STALE CHANGE ACCEPTED';
  exception when serialization_failure then null; end;
  begin
    update public.client_samples set original_production_due_date=day+5 where id=test_id;
    raise exception 'ORIGINAL CHANGED';
  exception when check_violation then null; end;
  begin
    perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'MARK_READY','IN_PRODUCTION',day+1,day+2,day+1,null);
    raise exception 'FUTURE ACTUAL DATE ACCEPTED';
  exception when invalid_parameter_value then null; end;
  perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'MARK_READY','IN_PRODUCTION',day+1,day+2,day,null);
  perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'REPROGRAM','READY',day+2,day+3,null,'CLIENTE');
  perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'MARK_DELIVERED','READY',day+3,day+4,day,null);
  perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'REPROGRAM','SENT',day+4,day+5,null,'APROVACAO');
  perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'APPROVE','SENT',day+5,null,day,null);
  select count(*) into total from public.sample_deadline_events where sample_id=test_id;
  if total <> 6 then raise exception 'EVENTS NOT ATOMIC: %',total; end if;
  if not exists (select 1 from public.client_samples where id=test_id and original_production_due_date=day and original_customer_delivery_date=day+2 and original_approval_due_date=day+4 and closed_at=day and status='APPROVED') then raise exception 'ORIGINAL OR ACTUAL DATES LOST'; end if;
  begin
    perform public.change_sample_deadline(source.tenant_company_id,test_id,actor_id,'REPROGRAM','APPROVED',null,day+6,null,'CLOSED');
    raise exception 'CLOSED AMPLE CHANGED';
  exception when check_violation then null; end;
end $$;
