import {NextResponse} from 'next/server';
import {AccessError,requireCompanyAccess} from '@/lib/server/company-access';
import {validUuid} from '@/lib/xpace/link-tree';
export async function GET(request:Request){try{
 const {admin,company,profile}=await requireCompanyAccess(request,'xpace');
 if(profile.platform_role!=='platform_owner')throw new AccessError('APENAS ADMINISTRADORES PODEM GERENCIAR USUÁRIOS.',403);
 const search=new URL(request.url).searchParams,profileId=search.get('profileId');
 if(profileId&&!validUuid(profileId))throw new AccessError('USUÁRIO INVÁLIDO.',400);
 const binding=profileId?await admin.from('xpace_teacher_access').select('tenant_company_id,instructor_id,active').eq('profile_id',profileId).maybeSingle():{data:null,error:null};
 if(binding.error)throw binding.error;
 const instructors=await admin.from('xpace_instructors').select('id,full_name,active').eq('tenant_company_id',company.id).order('full_name');
 if(instructors.error)throw instructors.error;
 if((instructors.data?.length??0)>=1000)throw new AccessError('MUITOS PROFESSORES. REFINAR O CADASTRO ANTES DE VINCULAR.',422);
 return NextResponse.json({success:true,companyId:company.id,binding:binding.data?.tenant_company_id===company.id?binding.data:null,instructors:(instructors.data??[]).filter(i=>i.active||i.id===binding.data?.instructor_id)});
}catch(e){if(e instanceof AccessError)return NextResponse.json({success:false,message:e.message},{status:e.status});console.error('USER TEACHER LIST ERROR',e);return NextResponse.json({success:false,message:'NÃO FOI POSSÍVEL CARREGAR OS PROFESSORES.'},{status:500});}}
