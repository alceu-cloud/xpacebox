import {NextResponse} from 'next/server';
import {AccessError,requireCompanyAccess} from '@/lib/server/company-access';
export async function POST(request:Request){try{
 const{admin,company,profile}=await requireCompanyAccess(request,'xpace');
 if(!['platform_owner','company_manager'].includes(profile.platform_role))throw new AccessError('APENAS GESTORES PODEM ALTERAR O LOGO.',403);
 if(Number(request.headers.get('content-length')||0)>2200000)throw new AccessError('USE UMA IMAGEM DE ATÉ 2 MB.',413);
 const file=(await request.formData()).get('file');if(!(file instanceof File)||file.size===0||file.size>2097152)throw new AccessError('USE UMA IMAGEM DE ATÉ 2 MB.',400);
 const bytes=new Uint8Array(await file.arrayBuffer());
 const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 const jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 const mime=png?'image/png':jpg?'image/jpeg':webp?'image/webp':null;
 if(!mime||mime!==file.type)throw new AccessError('ESCOLHA UMA IMAGEM PNG, JPEG OU WEBP.',400);
 const path=`${company.id}/${crypto.randomUUID()}.${png?'png':jpg?'jpg':'webp'}`;
 const result=await admin.storage.from('xpace-link-logos').upload(path,bytes,{contentType:mime,upsert:false});if(result.error)throw result.error;
 const{data}=admin.storage.from('xpace-link-logos').getPublicUrl(path);return NextResponse.json({success:true,url:data.publicUrl});
}catch(e){if(e instanceof AccessError)return NextResponse.json({success:false,message:e.message},{status:e.status});console.error('LINK LOGO ERROR',e);return NextResponse.json({success:false,message:'NÃO FOI POSSÍVEL ENVIAR A IMAGEM.'},{status:500});}}
