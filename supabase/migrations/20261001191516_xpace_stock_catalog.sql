-- Additive inventory catalog. No existing customer records or message statuses are changed.
create table public.xpace_stock_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 80),
  active boolean not null default true,
  unique (tenant_company_id,id)
);
create unique index xpace_stock_category_name on public.xpace_stock_categories(tenant_company_id,lower(trim(description)));
create table public.xpace_stock_units (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 80),
  abbreviation text not null check (length(trim(abbreviation)) between 1 and 8),
  active boolean not null default true,
  unique (tenant_company_id,id)
);
create unique index xpace_stock_unit_name on public.xpace_stock_units(tenant_company_id,lower(trim(description)));
create unique index xpace_stock_unit_abbreviation on public.xpace_stock_units(tenant_company_id,upper(trim(abbreviation)));
create table public.xpace_stock_products (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 160),
  cost_price_cents integer not null check (cost_price_cents>=0),
  sale_price_cents integer not null check (sale_price_cents>=0),
  category_id uuid not null,
  unit_id uuid not null,
  controls_stock boolean not null default true,
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock between 0 and 1000000),
  stock_quantity numeric(14,3) not null default 0 check (stock_quantity between 0 and 10000000000),
  code text not null check (code ~ '^[A-Za-z0-9._-]{1,100}$'),
  code_mode text not null check (code_mode in ('EXTERNAL','INTERNAL')),
  image_path text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (controls_stock or stock_quantity=0),
  unique (tenant_company_id,id), unique (tenant_company_id,code),
  foreign key (tenant_company_id,category_id) references public.xpace_stock_categories(tenant_company_id,id) on delete restrict,
  foreign key (tenant_company_id,unit_id) references public.xpace_stock_units(tenant_company_id,id) on delete restrict
);
create index xpace_stock_products_category on public.xpace_stock_products(tenant_company_id,category_id);
create index xpace_stock_products_unit on public.xpace_stock_products(tenant_company_id,unit_id);
create index xpace_stock_products_list on public.xpace_stock_products(tenant_company_id,active,description);
create table public.xpace_stock_settings (
  tenant_company_id uuid primary key references public.companies(id) on delete cascade,
  alert_phone text check (alert_phone ~ '^[0-9]{12,15}$'),
  updated_at timestamptz not null default now()
);
create table public.xpace_stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  request_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  direction text not null check (direction in ('ENTRADA','SAIDA')),
  quantity numeric(14,3) not null check (quantity>0 and quantity<=1000000),
  stock_before numeric(14,3) not null check (stock_before>=0),
  stock_after numeric(14,3) not null check (stock_after>=0),
  note text not null default '' check (length(note)<=500),
  low_stock_crossed boolean not null default false,
  alert_message_id uuid references public.xpace_message_outbox(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_company_id,request_id),
  foreign key (tenant_company_id,product_id) references public.xpace_stock_products(tenant_company_id,id) on delete restrict,
  check (stock_after=stock_before+case when direction='ENTRADA' then quantity else -quantity end)
);
create index xpace_stock_movements_product on public.xpace_stock_movements(tenant_company_id,product_id,created_at desc);
create index xpace_stock_movements_actor on public.xpace_stock_movements(actor_id);
create index xpace_stock_movements_message on public.xpace_stock_movements(alert_message_id) where alert_message_id is not null;
create index xpace_stock_products_created_by on public.xpace_stock_products(created_by);
create index xpace_stock_products_updated_by on public.xpace_stock_products(updated_by);

-- Server-only API matches the existing XPACE access model. Explicit grants avoid
-- reliance on Supabase defaults. No direct browser/anonymous writes or RPCs.
alter table public.xpace_stock_categories enable row level security;
alter table public.xpace_stock_units enable row level security;
alter table public.xpace_stock_products enable row level security;
alter table public.xpace_stock_settings enable row level security;
alter table public.xpace_stock_movements enable row level security;
revoke all on public.xpace_stock_categories,public.xpace_stock_units,public.xpace_stock_products,public.xpace_stock_settings,public.xpace_stock_movements from public,anon,authenticated;
grant select,insert,update,delete on public.xpace_stock_categories,public.xpace_stock_units,public.xpace_stock_products,public.xpace_stock_settings to service_role;
grant select,insert on public.xpace_stock_movements to service_role;

insert into public.xpace_stock_categories(tenant_company_id,description)
select c.id,d.description from public.companies c cross join (values ('Acessórios'),('Alimentos'),('Bebidas'),('Equipamentos'),('Roupas')) d(description) where c.slug='xpace';
insert into public.xpace_stock_units(tenant_company_id,description,abbreviation)
select c.id,d.description,d.abbreviation from public.companies c cross join (values ('Caixa','CX'),('Grama','G'),('Litro','L'),('Metro','M'),('Mililitro','ML'),('Pacote','PCT'),('Peça','PC'),('Quilograma','KG'),('Unidade','UN')) d(description,abbreviation) where c.slug='xpace';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('xpace-stock-images','xpace-stock-images',true,3145728,array['image/jpeg','image/png','image/webp']);
-- Public product pictures only; uploading/removing requires the manager server route.

alter table public.xpace_message_outbox drop constraint xpace_message_outbox_kind_check;
alter table public.xpace_message_outbox add constraint xpace_message_outbox_kind_check check (kind in ('ASSINATURA','COBRANCA','TESTE','VIDEO_BOAS_VINDAS','LEMBRETE_VESPERA','CONFIRMACAO_DIA','COBRANCA_PIX_AUTOMATICA','AVISO_PROFESSOR','PESQUISA_SATISFACAO','ESTOQUE_BAIXO'));

create function public.xpace_move_stock(p_tenant uuid,p_actor uuid,p_product uuid,p_request uuid,p_direction text,p_quantity numeric,p_note text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  product public.xpace_stock_products;
  previous public.xpace_stock_movements;
  actor text;
  new_balance numeric;
  crossed boolean;
  message_id uuid;
  movement_id uuid;
  connector uuid;
  phone text;
  unit text;
begin
  if p_request is null or p_direction is null or p_direction not in ('ENTRADA','SAIDA') or p_quantity is null or p_quantity<=0 or p_quantity>1000000 or p_quantity<>round(p_quantity,3) or length(coalesce(p_note,''))>500 then raise exception 'STOCK_QUANTITY_INVALID'; end if;
  select p.full_name into actor from public.profiles p join public.companies c on c.id=p_tenant and c.slug='xpace' and c.active
  where p.id=p_actor and p.active and (p.platform_role='platform_owner' or exists(select 1 from public.company_members m where m.profile_id=p.id and m.company_id=p_tenant and m.active));
  if not found then raise exception 'STOCK_ACCESS_DENIED'; end if;
  -- Serialize identical request keys even if a caller changes the product.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text||':'||p_request::text,0));
  select * into previous from public.xpace_stock_movements where tenant_company_id=p_tenant and request_id=p_request;
  if found then
    if previous.product_id<>p_product or previous.actor_id is distinct from p_actor or previous.direction<>p_direction or previous.quantity<>p_quantity or previous.note<>coalesce(p_note,'') then raise exception 'STOCK_REQUEST_CONFLICT'; end if;
    select * into product from public.xpace_stock_products where id=p_product and tenant_company_id=p_tenant;
    return jsonb_build_object('movementId',previous.id,'stockQuantity',product.stock_quantity,'lowStock',product.stock_quantity<product.minimum_stock,'lowStockCrossed',previous.low_stock_crossed,'alertQueued',previous.alert_message_id is not null,'replayed',true);
  end if;
  select * into product from public.xpace_stock_products where id=p_product and tenant_company_id=p_tenant and active for update;
  if not found then raise exception 'STOCK_NOT_FOUND'; end if;
  if not product.controls_stock then raise exception 'STOCK_NOT_CONTROLLED'; end if;
  new_balance:=product.stock_quantity+case when p_direction='ENTRADA' then p_quantity else -p_quantity end;
  if new_balance<0 then raise exception 'STOCK_INSUFFICIENT'; end if;
  crossed:=product.stock_quantity>=product.minimum_stock and new_balance<product.minimum_stock;
  -- Queue creation and stock/ledger are one transaction. No HTTP inside the lock.
  if crossed then
    select alert_phone into phone from public.xpace_stock_settings where tenant_company_id=p_tenant;
    select id into connector from public.xpace_message_connectors where tenant_company_id=p_tenant;
    if phone is not null and connector is not null then
      select abbreviation into unit from public.xpace_stock_units where id=product.unit_id and tenant_company_id=p_tenant;
      insert into public.xpace_message_outbox(tenant_company_id,connector_id,kind,contact_name,destination_phone,body,created_by,scheduled_at)
      values(p_tenant,connector,'ESTOQUE_BAIXO','ALCEU · ESTOQUE',phone,
        E'📦 *XPACE · Estoque baixo*\n\nProduto: *'||product.description||E'*\nSaldo: *'||new_balance::text||' '||unit||E'*\nMínimo: '||product.minimum_stock::text||' '||unit||E'\n\nHora de repor para não faltar! 💜',p_actor,now()) returning id into message_id;
    end if;
  end if;
  update public.xpace_stock_products set stock_quantity=new_balance,updated_at=now(),updated_by=p_actor where id=p_product and tenant_company_id=p_tenant;
  insert into public.xpace_stock_movements(tenant_company_id,product_id,request_id,actor_id,actor_name,direction,quantity,stock_before,stock_after,note,low_stock_crossed,alert_message_id)
  values(p_tenant,p_product,p_request,p_actor,coalesce(actor,'EQUIPE'),p_direction,p_quantity,product.stock_quantity,new_balance,coalesce(p_note,''),crossed,message_id) returning id into movement_id;
  return jsonb_build_object('movementId',movement_id,'stockQuantity',new_balance,'lowStock',new_balance<product.minimum_stock,'lowStockCrossed',crossed,'alertQueued',message_id is not null,'replayed',false);
end;
$$;
revoke all on function public.xpace_move_stock(uuid,uuid,uuid,uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.xpace_move_stock(uuid,uuid,uuid,uuid,text,numeric,text) to service_role;
