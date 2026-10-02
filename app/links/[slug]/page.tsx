import { notFound } from 'next/navigation';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import LinkTreePublic from '@/components/xpace-dance/LinkTreePublic';
import type { LinkPage, TreeLink } from '@/lib/xpace/link-tree';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  if(!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const admin=createSupabaseAdmin();
  const company=await admin.from('companies').select('id').eq('slug',slug).eq('active',true).maybeSingle();
  if(company.error) throw company.error;
  if(!company.data) notFound();
  const [page,links]=await Promise.all([
    admin.from('xpace_link_pages').select('title,description,logo_url,active,button_style,appearance,primary_color,theme').eq('tenant_company_id',company.data.id).eq('active',true).maybeSingle(),
    admin.from('xpace_links').select('id,title,url,icon,active,position').eq('tenant_company_id',company.data.id).eq('active',true).order('position').order('created_at').limit(200)
  ]);
  if(page.error||links.error) throw page.error||links.error;
  if(!page.data) notFound();
  return <LinkTreePublic page={page.data as LinkPage} links={(links.data??[]) as TreeLink[]} slug={slug}/>;
}
