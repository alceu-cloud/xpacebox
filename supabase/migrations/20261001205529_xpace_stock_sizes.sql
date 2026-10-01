-- One visible catalog family; its size SKUs use the existing immutable ledger.
-- Existing products, quantities, codes and movements are not changed.
alter table public.xpace_stock_products
  add column has_variants boolean not null default false,
  add column parent_product_id uuid,
  add column size_label text,
  add column size_enabled boolean not null default true,
  add constraint xpace_stock_size_parent_fk foreign key (tenant_company_id,parent_product_id)
    references public.xpace_stock_products(tenant_company_id,id) on delete restrict,
  add constraint xpace_stock_size_shape check (
    (parent_product_id is null and size_label is null and (not has_variants or (not controls_stock and stock_quantity=0)))
    or (parent_product_id is not null and parent_product_id<>id and not has_variants and controls_stock
      and size_label is not null and size_label in ('PP','P','M','G','GG','XG') and stock_quantity=trunc(stock_quantity))
  ),
  add constraint xpace_stock_size_unique unique (tenant_company_id,parent_product_id,size_label);

create function public.xpace_stock_size_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.parent_product_id is not null then
    if new.stock_quantity<>trunc(new.stock_quantity) then raise exception 'STOCK_SIZE_QUANTITY_INVALID'; end if;
    if not exists(select 1 from public.xpace_stock_products p where p.id=new.parent_product_id
      and p.tenant_company_id=new.tenant_company_id and p.has_variants and p.parent_product_id is null
      and (not new.active or (p.active and new.size_enabled))) then raise exception 'STOCK_SIZE_INVALID'; end if;
  end if;
  return new;
end;
$$;
create trigger xpace_stock_size_guard before insert or update on public.xpace_stock_products
for each row execute function public.xpace_stock_size_guard();
revoke all on function public.xpace_stock_size_guard() from public,anon,authenticated;

create function public.xpace_stock_require_manager(p_tenant uuid,p_actor uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.profiles p join public.companies c on c.id=p_tenant and c.slug='xpace' and c.active
    where p.id=p_actor and p.active and (p.platform_role='platform_owner' or (p.platform_role='company_manager'
      and exists(select 1 from public.company_members m where m.profile_id=p.id and m.company_id=p_tenant and m.active))))
  then raise exception 'STOCK_ACCESS_DENIED'; end if;
end;
$$;
revoke all on function public.xpace_stock_require_manager(uuid,uuid) from public,anon,authenticated;
grant execute on function public.xpace_stock_require_manager(uuid,uuid) to service_role;

create function public.xpace_save_stock_sizes(p_tenant uuid,p_actor uuid,p_product uuid,p_description text,
  p_cost integer,p_sale integer,p_category uuid,p_unit uuid,p_minimum numeric,p_sizes text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare parent public.xpace_stock_products; sku uuid; size text;
begin
  perform public.xpace_stock_require_manager(p_tenant,p_actor);
  if p_product is null or p_description is null or length(trim(p_description)) not between 1 and 145
    or p_cost is null or p_cost<0 or p_sale is null or p_sale<0 or p_minimum is null
    or p_minimum<0 or p_minimum>1000000 or p_minimum<>trunc(p_minimum)
    or p_sizes is null or cardinality(p_sizes) not between 1 and 6
    or exists(select 1 from unnest(p_sizes) s where s is null or s not in ('PP','P','M','G','GG','XG'))
    or cardinality(p_sizes)<>(select count(distinct s) from unnest(p_sizes) s)
  then raise exception 'STOCK_SIZE_INVALID'; end if;
  -- Same family ID makes network retries safe; never recreates its children.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stock-family:'||p_product::text,0));
  select * into parent from public.xpace_stock_products where id=p_product for update;
  if found and (parent.tenant_company_id<>p_tenant or not parent.has_variants) then raise exception 'STOCK_SIZE_INVALID'; end if;
  if not found then
    insert into public.xpace_stock_products(id,tenant_company_id,description,cost_price_cents,sale_price_cents,
      category_id,unit_id,controls_stock,has_variants,code,code_mode,created_by,updated_by)
    values(p_product,p_tenant,trim(p_description),p_cost,p_sale,p_category,p_unit,false,true,
      'XP-'||upper(p_product::text),'INTERNAL',p_actor,p_actor) returning * into parent;
  end if;
  perform id from public.xpace_stock_products where tenant_company_id=p_tenant and parent_product_id=p_product order by id for update;
  if exists(select 1 from public.xpace_stock_products where tenant_company_id=p_tenant and parent_product_id=p_product
    and not (size_label=any(p_sizes)) and stock_quantity>0) then raise exception 'STOCK_SIZE_HAS_BALANCE'; end if;
  update public.xpace_stock_products set description=trim(p_description),cost_price_cents=p_cost,sale_price_cents=p_sale,
    category_id=p_category,unit_id=p_unit,updated_by=p_actor,updated_at=now()
    where id=p_product and tenant_company_id=p_tenant;
  update public.xpace_stock_products set size_enabled=false,active=false,updated_by=p_actor,updated_at=now()
    where tenant_company_id=p_tenant and parent_product_id=p_product and not(size_label=any(p_sizes));
  foreach size in array p_sizes loop
    sku:=gen_random_uuid();
    insert into public.xpace_stock_products(id,tenant_company_id,parent_product_id,size_label,description,
      cost_price_cents,sale_price_cents,category_id,unit_id,controls_stock,minimum_stock,code,code_mode,active,created_by,updated_by)
    values(sku,p_tenant,p_product,size,trim(p_description)||' · TAM '||size,p_cost,p_sale,p_category,p_unit,true,
      p_minimum,'XP-'||upper(sku::text),'INTERNAL',parent.active,p_actor,p_actor)
    on conflict (tenant_company_id,parent_product_id,size_label) do update set
      description=excluded.description,cost_price_cents=p_cost,sale_price_cents=p_sale,category_id=p_category,unit_id=p_unit,
      minimum_stock=p_minimum,size_enabled=true,active=parent.active,updated_by=p_actor,updated_at=now();
  end loop;
  return jsonb_build_object('id',p_product);
end;
$$;
revoke all on function public.xpace_save_stock_sizes(uuid,uuid,uuid,text,integer,integer,uuid,uuid,numeric,text[]) from public,anon,authenticated;
grant execute on function public.xpace_save_stock_sizes(uuid,uuid,uuid,text,integer,integer,uuid,uuid,numeric,text[]) to service_role;

create function public.xpace_stock_set_active(p_tenant uuid,p_actor uuid,p_product uuid,p_active boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare product public.xpace_stock_products;
begin
  perform public.xpace_stock_require_manager(p_tenant,p_actor);
  if p_active is null then raise exception 'STOCK_SIZE_INVALID'; end if;
  select * into product from public.xpace_stock_products where id=p_product and tenant_company_id=p_tenant for update;
  if not found then raise exception 'STOCK_NOT_FOUND'; end if;
  if product.parent_product_id is not null then raise exception 'STOCK_SIZE_INVALID'; end if;
  perform id from public.xpace_stock_products where tenant_company_id=p_tenant and parent_product_id=p_product order by id for update;
  update public.xpace_stock_products set active=p_active,updated_by=p_actor,updated_at=now() where id=p_product and tenant_company_id=p_tenant;
  update public.xpace_stock_products set active=p_active and size_enabled,updated_by=p_actor,updated_at=now()
    where tenant_company_id=p_tenant and parent_product_id=p_product;
  return jsonb_build_object('id',p_product);
end;
$$;
revoke all on function public.xpace_stock_set_active(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.xpace_stock_set_active(uuid,uuid,uuid,boolean) to service_role;
