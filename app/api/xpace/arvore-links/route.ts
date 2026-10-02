import { NextResponse } from 'next/server';
import { AccessError, requireCompanyAccess } from '@/lib/server/company-access';
import { defaultLinkPage, normalizeLink, normalizePage, validUuid } from '@/lib/xpace/link-tree';

const pageFields = 'title,description,logo_url,active,button_style,appearance,primary_color,theme';
const linkFields = 'id,title,url,icon,active,position';
export async function GET(request: Request) {
  try {
    const { admin, company, profile } = await requireCompanyAccess(request, 'xpace');
    const period = new URL(request.url).searchParams;
    if (period.has('from')) {
      const from = period.get('from') ?? '', to = period.get('to') ?? '';
      const start = Date.parse(from+'T00:00:00Z'), end = Date.parse(to+'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0,10)!==from || new Date(end).toISOString().slice(0,10)!==to || end<start || end-start>365*86400000) throw new AccessError('ESCOLHA UM PERÍODO DE ATÉ 366 DIAS.',400);
      const { data, error } = await admin.rpc('xpace_link_statistics',{p_company:company.id,p_from:from,p_to:to});
      if(error) throw error;
      return NextResponse.json({success:true,statistics:data});
    }
    const [page, links] = await Promise.all([
      admin.from('xpace_link_pages').select(pageFields).eq('tenant_company_id',company.id).maybeSingle(),
      admin.from('xpace_links').select(linkFields).eq('tenant_company_id',company.id).order('position').order('created_at').limit(200)
    ]);
    if(page.error || links.error) throw page.error || links.error;
    return NextResponse.json({success:true,page:page.data ?? defaultLinkPage,links:links.data ?? [],canEdit:['platform_owner','company_manager'].includes(profile.platform_role),publicPath:'/links/xpace'});
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) { return mutate(request); }
export async function PATCH(request: Request) { return mutate(request); }
async function mutate(request: Request) {
  try {
    const {admin,company,profile,user}=await requireCompanyAccess(request,'xpace');
    if(!['platform_owner','company_manager'].includes(profile.platform_role)) throw new AccessError('APENAS GESTORES PODEM EDITAR A ÁRVORE DE LINKS.',403);
    const body=await request.json() as {action?:string;page?:unknown;link?:unknown;id?:unknown;active?:unknown;position?:unknown;ids?:unknown};
    if(body.action==='SAVE_PAGE') {
      const page=normalizePage(body.page);
      const {error}=await admin.from('xpace_link_pages').upsert({...page,tenant_company_id:company.id,updated_by:user.id,updated_at:new Date().toISOString()});
      if(error) throw error;
    } else {
      // Initialize once without changing an existing page's appearance or status.
      const {error:pageError}=await admin.from('xpace_link_pages').upsert({tenant_company_id:company.id},{onConflict:'tenant_company_id',ignoreDuplicates:true});
      if(pageError) throw pageError;
      if(body.action==='REORDER_LINKS') {
        if(!Array.isArray(body.ids)||body.ids.length>200||!body.ids.every(validUuid)||new Set(body.ids).size!==body.ids.length) throw new AccessError('ORDEM INVÁLIDA.',400);
        const {error}=await admin.rpc('xpace_reorder_links',{p_company:company.id,p_ids:body.ids});
        if(error) throw error;
      } else if(body.action==='CREATE_LINK') {
        const link=normalizeLink(body.link);
        const count=await admin.from('xpace_links').select('id',{count:'exact',head:true}).eq('tenant_company_id',company.id);
        if(count.error) throw count.error;
        if((count.count ?? 0)>=200) throw new AccessError('LIMITE DE 200 LINKS POR ÁRVORE.',400);
        const last=await admin.from('xpace_links').select('position').eq('tenant_company_id',company.id).order('position',{ascending:false}).limit(1);
        if(last.error) throw last.error;
        const {error}=await admin.from('xpace_links').insert({...link,tenant_company_id:company.id,position:(last.data?.[0]?.position??0)+1,updated_by:user.id});
        if(error) throw error;
      } else {
        if(!validUuid(body.id)) throw new AccessError('LINK INVÁLIDO.',400);
        const patch=body.action==='UPDATE_LINK'?normalizeLink(body.link):body.action==='TOGGLE_LINK'&&typeof body.active==='boolean'?{active:body.active}:body.action==='MOVE_LINK'&&Number.isInteger(body.position)&&Number(body.position)>=0&&Number(body.position)<=2147483647?{position:body.position}:null;
        if(!patch) throw new AccessError('AÇÃO INVÁLIDA.',400);
        const {data,error}=await admin.from('xpace_links').update({...patch,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',body.id).eq('tenant_company_id',company.id).select('id').maybeSingle();
        if(error) throw error;
        if(!data) throw new AccessError('LINK NÃO ENCONTRADO.',404);
      }
    }
    return NextResponse.json({success:true});
  } catch(error) { return failure(error); }
}
function failure(error:unknown) {
  if(error instanceof AccessError) return NextResponse.json({success:false,message:error.message},{status:error.status});
  if(String((error as {message?:string})?.message).includes('LINK_ORDER_CHANGED')) return NextResponse.json({success:false,message:'A LISTA MUDOU. ATUALIZE ANTES DE REORDENAR.'},{status:409});
  if(error instanceof Error && !('code' in error)) return NextResponse.json({success:false,message:error.message},{status:400});
  console.error('XPACE LINK TREE ERROR',error);
  return NextResponse.json({success:false,message:'NÃO FOI POSSÍVEL CONCLUIR. VERIFIQUE SE A MIGRAÇÃO LOCAL FOI INSTALADA.'},{status:500});
}
