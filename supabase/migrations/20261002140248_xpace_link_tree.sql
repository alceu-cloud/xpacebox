-- Prepared locally. No migration is applied by creating this file.
create table public.xpace_link_pages (
  tenant_company_id uuid primary key references public.companies(id) on delete cascade,
  title text not null default 'XPACE' check (length(title) between 1 and 80),
  description text not null default 'ESCOLA DE DANÇA' check (length(description) <= 240),
  logo_url text not null default '/brands/xpace-logo.png',
  active boolean not null default true,
  button_style text not null default 'classic' check (button_style in ('classic','minimal')),
  appearance text not null default 'company' check (appearance in ('company','custom')),
  primary_color text not null default '#7435d9' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  theme text not null default 'light' check (theme in ('light','dark')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create table public.xpace_links (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.xpace_link_pages(tenant_company_id) on delete cascade,
  title text not null check (length(title) between 1 and 100),
  url text not null check (length(url) <= 2048 and url ~ '^https?://'),
  icon text not null default 'link' check (icon in ('link','instagram','whatsapp','calendar','ticket','store')),
  active boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (tenant_company_id,id)
);
create index xpace_links_order on public.xpace_links(tenant_company_id,position,created_at);
create table public.xpace_link_visitors (
  tenant_company_id uuid not null references public.xpace_link_pages(tenant_company_id) on delete cascade,
  visitor_id uuid not null,
  first_seen_at timestamptz not null default now(),
  primary key (tenant_company_id,visitor_id)
);
create table public.xpace_link_events (
  id uuid primary key,
  tenant_company_id uuid not null,
  visitor_id uuid not null,
  link_id uuid,
  kind text not null check (kind in ('view','click')),
  occurred_at timestamptz not null default now(),
  foreign key (tenant_company_id,visitor_id) references public.xpace_link_visitors(tenant_company_id,visitor_id) on delete cascade,
  foreign key (tenant_company_id,link_id) references public.xpace_links(tenant_company_id,id),
  check ((kind='view' and link_id is null) or (kind='click' and link_id is not null))
);
create index xpace_link_events_period on public.xpace_link_events(tenant_company_id,occurred_at);
create index xpace_link_events_browser on public.xpace_link_events(tenant_company_id,visitor_id,occurred_at);
alter table public.xpace_link_pages enable row level security;
alter table public.xpace_links enable row level security;
alter table public.xpace_link_visitors enable row level security;
alter table public.xpace_link_events enable row level security;
revoke all on public.xpace_link_pages, public.xpace_links, public.xpace_link_visitors, public.xpace_link_events from anon,authenticated;
grant all on public.xpace_link_pages, public.xpace_links, public.xpace_link_visitors, public.xpace_link_events to service_role;

-- Authenticated management is checked by the server. Public events are accepted
-- only for an active page/link; UUID deduplication and a browser burst limit are atomic.
create function public.xpace_record_link_event(p_company uuid,p_event uuid,p_visitor uuid,p_link uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||p_visitor::text,0));
  if not exists(select 1 from public.xpace_link_pages p join public.companies c on c.id=p.tenant_company_id where p.tenant_company_id=p_company and p.active and c.active)
    or (p_link is not null and not exists(select 1 from public.xpace_links where id=p_link and tenant_company_id=p_company and active)) then return false; end if;
  if exists(select 1 from public.xpace_link_events where id=p_event) then return true; end if;
  if (select count(*) from public.xpace_link_events where tenant_company_id=p_company and visitor_id=p_visitor and occurred_at>now()-interval '1 minute') >= 30 then return false; end if;
  insert into public.xpace_link_visitors(tenant_company_id,visitor_id) values(p_company,p_visitor) on conflict do nothing;
  insert into public.xpace_link_events(id,tenant_company_id,visitor_id,link_id,kind) values(p_event,p_company,p_visitor,p_link,case when p_link is null then 'view' else 'click' end) on conflict do nothing;
  return true;
end $$;
revoke all on function public.xpace_record_link_event(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.xpace_record_link_event(uuid,uuid,uuid,uuid) to service_role;

create function public.xpace_link_statistics(p_company uuid,p_from date,p_to date)
returns jsonb language sql stable security invoker set search_path='' as $$
  with events as (
    select e.*,v.first_seen_at from public.xpace_link_events e join public.xpace_link_visitors v using(tenant_company_id,visitor_id)
    where e.tenant_company_id=p_company and e.occurred_at >= p_from::timestamp at time zone 'America/Sao_Paulo'
      and e.occurred_at < (p_to+1)::timestamp at time zone 'America/Sao_Paulo'
  ), visitors as (
    select visitor_id,min(first_seen_at) first_seen_at from events where kind='view' group by visitor_id
  ), days as (
    select d::date as calendar_day, (select count(*) from events where kind='view' and (occurred_at at time zone 'America/Sao_Paulo')::date=d::date) accesses
    from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
  ), clicks as (
    select l.id,l.title,count(e.id) clicks from public.xpace_links l left join events e on e.link_id=l.id and e.kind='click'
    where l.tenant_company_id=p_company group by l.id,l.title order by count(e.id) desc,l.title
  )
  select jsonb_build_object(
    'accesses',(select count(*) from events where kind='view'),
    'visitors',(select count(*) from visitors),
    'newVisitors',(select count(*) from visitors where first_seen_at>=p_from::timestamp at time zone 'America/Sao_Paulo'),
    'returningVisitors',(select count(*) from visitors where first_seen_at<p_from::timestamp at time zone 'America/Sao_Paulo'),
    'days',coalesce((select jsonb_agg(jsonb_build_object('day',calendar_day,'accesses',accesses) order by calendar_day) from days),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'clicks',clicks) order by clicks desc,title) from clicks),'[]'::jsonb)
  )
$$;
revoke all on function public.xpace_link_statistics(uuid,date,date) from public,anon,authenticated;
grant execute on function public.xpace_link_statistics(uuid,date,date) to service_role;

create function public.xpace_reorder_links(p_company uuid,p_ids uuid[])
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('link-order:'||p_company::text,0));
  if cardinality(p_ids)>200 or cardinality(p_ids)<>(select count(distinct x.id) from unnest(p_ids) as x(id))
    or cardinality(p_ids)<>(select count(*) from public.xpace_links where tenant_company_id=p_company)
    or exists(select 1 from unnest(p_ids) as x(id) where not exists(select 1 from public.xpace_links l where l.id=x.id and l.tenant_company_id=p_company)) then
    raise exception 'LINK_ORDER_CHANGED';
  end if;
  update public.xpace_links l set position=ordered.ordinality::integer from unnest(p_ids) with ordinality as ordered(id,ordinality) where l.id=ordered.id and l.tenant_company_id=p_company;
end $$;
revoke all on function public.xpace_reorder_links(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.xpace_reorder_links(uuid,uuid[]) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('xpace-link-logos','xpace-link-logos',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
-- Uploads use the manager-only server endpoint; no anon/authenticated write policy.
