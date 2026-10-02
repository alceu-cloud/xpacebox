// Isolated PostgreSQL, no production data or HTTP calls.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async()=>{try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table companies(id uuid primary key,active boolean default true);create table profiles(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261002140248_xpace_link_tree.sql','utf8'));
 const a=id(1),b=id(2),visitor=id(5),link=id(3),other=id(4);
 await db.query('insert into companies(id) values($1),($2)',[a,b]);
 await db.query('insert into xpace_link_pages(tenant_company_id) values($1),($2)',[a,b]);
 await db.query("insert into xpace_links(id,tenant_company_id,title,url) values($1,$2,'Agenda','https://example.test/agenda'),($3,$4,'Outro','https://example.test/outro')",[link,a,other,b]);
 const record=async(n,l=null,c=a)=>(await db.query('select xpace_record_link_event($1,$2,$3,$4) ok',[c,id(n),visitor,l])).rows[0].ok;
 assert.equal(await record(10),true);assert.equal(await record(10),true);
 assert.equal(await record(11,link),true);assert.equal(await record(12,other),false);
 await db.query('update xpace_links set active=false where id=$1',[link]);assert.equal(await record(13,link),false);
 await db.query('update xpace_links set active=true where id=$1',[link]);
 const day=(await db.query("select (now() at time zone 'America/Sao_Paulo')::date::text as calendar_day")).rows[0].calendar_day;
 const stats=(await db.query('select xpace_link_statistics($1,$2::date,$2::date) stats',[a,day])).rows[0].stats;
 assert.equal(stats.accesses,1);assert.equal(stats.visitors,1);assert.equal(stats.newVisitors,1);assert.equal(stats.links[0].clicks,1);assert.equal(stats.days.length,1);
 await db.query("update xpace_link_visitors set first_seen_at=now()-interval '10 days' where tenant_company_id=$1",[a]);
 const returning=(await db.query('select xpace_link_statistics($1,$2::date,$2::date) stats',[a,day])).rows[0].stats;assert.equal(returning.returningVisitors,1);assert.equal(returning.newVisitors,0);
 await assert.rejects(()=>db.query('select xpace_reorder_links($1,$2::uuid[])',[a,[other]]),/LINK_ORDER_CHANGED/);
 await db.query('select xpace_reorder_links($1,$2::uuid[])',[a,[link]]);
 for(let i=20;i<48;i++) assert.equal(await record(i),true);
 assert.equal(await record(99),false);
 await db.query('update xpace_link_pages set active=false where tenant_company_id=$1',[b]);assert.equal(await record(100,other,b),false);
 const rights=(await db.query("select has_function_privilege('anon','xpace_record_link_event(uuid,uuid,uuid,uuid)','execute') can_record,has_table_privilege('authenticated','xpace_link_events','select') can_read")).rows[0];assert.deepEqual(rights,{can_record:false,can_read:false});
 console.log('Link tree DB: PASS (tenant isolation, inactive pages/links, deduplication, browser limit, statistics and restricted grants).');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
