import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { validUuid } from '@/lib/xpace/link-tree';

export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}) {
  try {
    // A same-origin beacon is sufficient; no public reads of visitor IDs/events.
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) return new NextResponse(null,{status:403});
    if(Number(request.headers.get('content-length')||0)>2048) return new NextResponse(null,{status:413});
    const body=await request.json() as {eventId?:unknown;visitorId?:unknown;linkId?:unknown};
    if(!validUuid(body.eventId)||!validUuid(body.visitorId)||(body.linkId!=null&&!validUuid(body.linkId))) return new NextResponse(null,{status:400});
    const {slug}=await params;
    if(!/^[a-z0-9-]{1,80}$/.test(slug)) return new NextResponse(null,{status:404});
    const admin=createSupabaseAdmin();
    const {data:company,error}=await admin.from('companies').select('id').eq('slug',slug).eq('active',true).maybeSingle();
    if(error) throw error;
    if(!company) return new NextResponse(null,{status:404});
    const event=await admin.rpc('xpace_record_link_event',{p_company:company.id,p_event:body.eventId,p_visitor:body.visitorId,p_link:body.linkId??null});
    if(event.error) throw event.error;
    return new NextResponse(null,{status:event.data?204:429});
  } catch(error) { console.error('LINK EVENT ERROR',error);return new NextResponse(null,{status:400}); }
}
