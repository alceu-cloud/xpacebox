// Explicit, replay-safe operator import. Dry run by default; no stock movements.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
require('@next/env').loadEnvConfig(process.cwd());
const manifestPath = path.resolve(process.argv[2] || 'output/stock-catalog-20261001/manifest.json');
const apply = process.argv.includes('--apply');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = result => { if (result.error) throw new Error(`Database/storage rejected operation: ${result.error.code || result.error.statusCode || 'unknown'}`); return result.data; };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
(async () => {
 const company = checked(await admin.from('companies').select('id,slug,active').eq('id',manifest.tenant).single());
 assert.equal(company.slug,'xpace'); assert.equal(company.active,true);
 const actor = checked(await admin.from('profiles').select('id,active,platform_role').eq('id',manifest.actor).single());
 assert.equal(actor.active,true); assert.equal(actor.platform_role,'platform_owner');
 const categories = checked(await admin.from('xpace_stock_categories').select('id,description').eq('tenant_company_id',manifest.tenant));
 const unit = checked(await admin.from('xpace_stock_units').select('id').eq('tenant_company_id',manifest.tenant).eq('abbreviation','UN').single());
 const all = checked(await admin.from('xpace_stock_products').select('id,description,code,stock_quantity,image_path,has_variants').eq('tenant_company_id',manifest.tenant));
 assert.equal(new Set(manifest.items.map(item=>item.id)).size,manifest.items.length);
 for (const item of manifest.items) {
  const bytes = fs.readFileSync(path.join(path.dirname(manifestPath),item.asset));
  assert.ok(bytes.length>0 && bytes.length<=3145728);
  assert.ok(Number.isInteger(item.cost) && item.cost>=0 && Number.isInteger(item.sale) && item.sale>=0);
  const sameId = all.find(row=>row.id===item.id);
  assert.ok(!all.some(row=>row.description.toLowerCase()===item.description.toLowerCase() && row.id!==item.id),`Duplicate name detected: ${item.key}`);
  if(item.existing) assert.ok(sameId,`Existing product missing: ${item.key}`);
  else if(sameId) assert.equal(sameId.code,`XP-${item.id.toUpperCase()}`);
  const categoryId = categories.find(category=>category.description===item.category)?.id;
  assert.ok(categoryId);
  if(!apply){console.log(`READY ${item.key}: ${item.existing?'preserve existing balance/QR':item.sizes?'one family, six empty sizes':'new empty SKU'}, cost=${item.cost}, sale=${item.sale}`);continue;}
  if(item.sizes){
   checked(await admin.rpc('xpace_save_stock_sizes',{p_tenant:manifest.tenant,p_actor:manifest.actor,p_product:item.id,p_description:item.description,p_cost:item.cost,p_sale:item.sale,p_category:categoryId,p_unit:unit.id,p_minimum:0,p_sizes:item.sizes}));
  } else if(!sameId){
   checked(await admin.from('xpace_stock_products').insert({id:item.id,tenant_company_id:manifest.tenant,description:item.description,cost_price_cents:item.cost,sale_price_cents:item.sale,category_id:categoryId,unit_id:unit.id,controls_stock:true,minimum_stock:0,code:`XP-${item.id.toUpperCase()}`,code_mode:'INTERNAL',created_by:manifest.actor,updated_by:manifest.actor}));
  }
  const extension=path.extname(item.asset).slice(1), mime=extension==='png'?'image/png':'image/jpeg';
  const objectPath=`${manifest.tenant}/${item.id}/catalog-20261001.${extension}`;
  const upload=await admin.storage.from('xpace-stock-images').upload(objectPath,bytes,{contentType:mime,upsert:false,cacheControl:'3600'});
  const publicUrl=admin.storage.from('xpace-stock-images').getPublicUrl(objectPath).data.publicUrl;
  if(upload.error){
   // Reuse only the identical artifact after an interrupted import; never overwrite.
   const response=await fetch(publicUrl); assert.equal(response.status,200);
   assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(bytes),`Conflicting object: ${item.key}`);
  }
  checked(await admin.from('xpace_stock_products').update({description:item.description,image_path:objectPath,updated_by:manifest.actor,updated_at:new Date().toISOString()}).eq('tenant_company_id',manifest.tenant).eq('id',item.id).select('id').single());
  const final=checked(await admin.from('xpace_stock_products').select('id,code,image_path,stock_quantity,cost_price_cents,sale_price_cents').eq('tenant_company_id',manifest.tenant).eq('id',item.id).single());
  assert.equal(final.code,sameId?.code || `XP-${item.id.toUpperCase()}`);
  assert.equal(final.image_path,objectPath);
  if(!sameId) assert.equal(Number(final.stock_quantity),0);
  if(!item.existing){assert.equal(final.cost_price_cents,item.cost);assert.equal(final.sale_price_cents,item.sale);}
  assert.equal((await fetch(publicUrl,{method:'HEAD'})).status,200);
  console.log(`SAVED ${item.key} ${item.id}`);
 }
 console.log(apply?'Catalog import verified. No ledger writes; existing photos preserved in Storage.':'Dry run only. No records or photos changed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
