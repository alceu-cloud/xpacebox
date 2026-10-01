-- Scoped endpoint preserves the legacy function for older clients.
create function public.xpace_message_control_scoped_page(p_tenant uuid,p_search text default '',p_status text default 'TODOS',p_page integer default 0,p_scope text default 'LEADS')
returns jsonb language sql stable security invoker set search_path='' as $$
with params as (
  select translate(lower(left(trim(coalesce(p_search,'')),100)), 'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') as q
), base as materialized (
  select o.*, case when o.appointment_id is null then 'M:'||o.id else 'A:'||o.appointment_id end as bundle,
    translate(lower(coalesce(o.contact_name,'')||' '||coalesce(l.full_name,'')||' '||case when p_scope='NOTIFICATIONS' then o.body else '' end), 'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') as names,
    a.started_at as cloud_started_at
  from public.xpace_message_outbox o
  left join public.xpace_leads l on l.id=o.lead_id and l.tenant_company_id=o.tenant_company_id
  left join public.xpace_zapi_attempts a on a.message_id=o.id and a.connector_id=o.connector_id
  where o.tenant_company_id=p_tenant and o.kind<>'TESTE'
    and ((p_scope='LEADS' and o.kind in ('VIDEO_BOAS_VINDAS','LEMBRETE_VESPERA','CONFIRMACAO_DIA','AVISO_PROFESSOR','PESQUISA_SATISFACAO'))
      or (p_scope='NOTIFICATIONS' and o.kind not in ('VIDEO_BOAS_VINDAS','LEMBRETE_VESPERA','CONFIRMACAO_DIA','AVISO_PROFESSOR','PESQUISA_SATISFACAO')))
), groups as (
  select bundle,max(created_at) as latest from base cross join params group by bundle
  having bool_or(params.q='' or strpos(names,params.q)>0) and bool_or(p_status='TODOS' or status=p_status)
), paging as (
  select count(*) as total,least(greatest(coalesce(p_page,0),0),greatest((count(*)-1)/5,0)) as page from groups
), selected as (
  select bundle,latest from groups order by latest desc,bundle limit 5 offset (select page*5 from paging)
)
select jsonb_build_object(
  'messageIds',coalesce((select jsonb_agg(b.id order by s.latest desc,s.bundle,b.created_at desc,b.id) from selected s join base b using(bundle)),'[]'::jsonb),
  'page',(select page from paging),'pageSize',5,'total',(select total from paging),
  'summary',jsonb_build_object(
    'registered',(select count(*) from base),
    'sent',(select count(*) from base where status='SENT'),
    'queued',(select count(*) from base where status in ('QUEUED','SENDING')),
    'confirmed',(select count(*) from base where delivered_at is not null or read_at is not null or manually_confirmed_at is not null),
    'failures',(select count(*) from base where status in ('FAILED','UNKNOWN') and manually_confirmed_at is null and delivered_at is null and read_at is null),
    'oldQueue',(select count(*) from base where status='QUEUED' and scheduled_at<now()-interval '24 hours'),
    'receiptPending',(select count(*) from base where status='SENT' and cloud_started_at<now()-interval '15 minutes' and delivered_at is null and read_at is null and manually_confirmed_at is null),
    'lateQueue',(select count(*) from base where status='QUEUED' and scheduled_at<now()-interval '10 minutes' and (expires_at is null or expires_at>now())),
    'monitoringSince',(select min(cloud_started_at) from base)
  )
);
$$;
revoke all on function public.xpace_message_control_scoped_page(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.xpace_message_control_scoped_page(uuid,text,text,integer,text) to service_role;
