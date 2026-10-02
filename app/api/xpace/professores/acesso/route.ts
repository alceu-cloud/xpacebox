import {NextResponse} from 'next/server';
import {AccessError,requireCompanyAccess} from '@/lib/server/company-access';
import {validUuid} from '@/lib/xpace/link-tree';
export async function GET(request:Request){try{
 const{admin,company,profile}=await requireCompanyAccess(request,'xpace');if(!['platform_owner','company_manager'].includes(profile.platform_role))throw new AccessError('APENAS GESTORES PODEM GERENCIAR ACESSO.',403);
 const id=new URL(request.url).searchParams.get('id');if(!validUuid(id))throw new AccessError('PROFESSOR INVÁLIDO.',400);
 const binding=await admin.from('xpace_teacher_access').select('profile_id,active').eq('tenant_company_id',company.id).eq('instructor_id',id).maybeSingle();if(binding.error)throw binding.error;
 if(!binding.data)return NextResponse.json({success:true,access:null});
 const account=await admin.from('profiles').select('email,active,platform_role').eq('id',binding.data.profile_id).maybeSingle();if(account.error)throw account.error;
 if(account.data?.platform_role!=='company_teacher')throw new AccessError('O PERFIL DESTA CONTA FOI ALTERADO. CONFIRA EM USUÁRIOS.',409);
 return NextResponse.json({success:true,access:{active:binding.data.active&&Boolean(account.data.active),email:account.data.email}});
}catch(e){return failure(e);}}
export async function PATCH(request:Request){try{
 const{admin,company,profile}=await requireCompanyAccess(request,'xpace');if(!['platform_owner','company_manager'].includes(profile.platform_role))throw new AccessError('APENAS GESTORES PODEM GERENCIAR ACESSO.',403);
 const body=await request.json() as {instructorId?:unknown;active?:unknown;password?:unknown};if(!validUuid(body.instructorId)||typeof body.active!=='boolean'||(body.password!=null&&(typeof body.password!=='string'||body.password.length<10||body.password.length>128)))throw new AccessError('DADOS DE ACESSO INVÁLIDOS.',400);
 const binding=await admin.from('xpace_teacher_access').select('profile_id').eq('tenant_company_id',company.id).eq('instructor_id',body.instructorId).maybeSingle();if(binding.error)throw binding.error;if(!binding.data)throw new AccessError('CONTA NÃO ENCONTRADA.',404);
 const account=await admin.from('profiles').select('platform_role').eq('id',binding.data.profile_id).maybeSingle();if(account.error)throw account.error;if(account.data?.platform_role!=='company_teacher')throw new AccessError('ESTA CONTA NÃO TEM PERFIL DE PROFESSOR.',409);
 if(body.password){const change=await admin.auth.admin.updateUserById(binding.data.profile_id,{password:body.password as string});if(change.error)throw change.error;}
 const result=await admin.from('xpace_teacher_access').update({active:body.active}).eq('tenant_company_id',company.id).eq('instructor_id',body.instructorId);if(result.error)throw result.error;
 return NextResponse.json({success:true});
}catch(e){return failure(e);}}
function failure(e:unknown){if(e instanceof AccessError)return NextResponse.json({success:false,message:e.message},{status:e.status});console.error('TEACHER ACCESS ERROR',e);return NextResponse.json({success:false,message:'NÃO FOI POSSÍVEL ATUALIZAR O ACESSO.'},{status:500});}
export async function POST(request:Request){
 try{
  const{admin,company,profile}=await requireCompanyAccess(request,'xpace');
  if(!['platform_owner','company_manager'].includes(profile.platform_role))throw new AccessError('APENAS GESTORES PODEM CRIAR ACESSO.',403);
  const body=await request.json() as {instructorId?:unknown;email?:unknown;password?:unknown};
  if(!validUuid(body.instructorId)||typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||typeof body.password!=='string'||body.password.length<10||body.password.length>128)throw new AccessError('INFORME PROFESSOR, E-MAIL E SENHA DE PELO MENOS 10 CARACTERES.',400);
  const instructor=await admin.from('xpace_instructors').select('id,full_name').eq('id',body.instructorId).eq('tenant_company_id',company.id).eq('active',true).maybeSingle();
  if(instructor.error)throw instructor.error;if(!instructor.data)throw new AccessError('PROFESSOR ATIVO NÃO ENCONTRADO.',404);
  const binding=await admin.from('xpace_teacher_access').select('profile_id').eq('tenant_company_id',company.id).eq('instructor_id',body.instructorId).maybeSingle();
  if(binding.error)throw binding.error;if(binding.data)throw new AccessError('ESTE PROFESSOR JÁ POSSUI ACESSO. GERENCIE A CONTA EM USUÁRIOS.',409);
  const created=await admin.auth.admin.createUser({email:body.email.trim().toLowerCase(),password:body.password,email_confirm:true,user_metadata:{full_name:instructor.data.full_name}});
  if(created.error||!created.data.user)throw new AccessError('NÃO FOI POSSÍVEL CRIAR A CONTA. CONFIRA SE O E-MAIL JÁ ESTÁ CADASTRADO.',409);
  const id=created.data.user.id;
  try{
   const profileResult=await admin.from('profiles').upsert({id,full_name:instructor.data.full_name,email:body.email.trim().toLowerCase(),platform_role:'company_teacher',active:true});if(profileResult.error)throw profileResult.error;
   // Teacher binding replaces membership: old company-wide RLS grants do not apply.
   const memberships=await admin.from('company_members').delete().eq('profile_id',id);if(memberships.error)throw memberships.error;
   const result=await admin.from('xpace_teacher_access').insert({profile_id:id,tenant_company_id:company.id,instructor_id:body.instructorId});if(result.error)throw result.error;
  }catch(error){await admin.auth.admin.deleteUser(id);throw error;}
  return NextResponse.json({success:true},{status:201});
 }catch(e){if(e instanceof AccessError)return NextResponse.json({success:false,message:e.message},{status:e.status});console.error('TEACHER ACCESS ERROR',e);return NextResponse.json({success:false,message:'NÃO FOI POSSÍVEL CRIAR O ACESSO.'},{status:500});}
}
