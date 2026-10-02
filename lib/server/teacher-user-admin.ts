import {AccessError} from './company-access';
import {validUuid} from '@/lib/xpace/link-tree';
import type {createSupabaseAdmin} from './supabase-admin';
type Admin=ReturnType<typeof createSupabaseAdmin>;
export const userRoles=['platform_owner','company_manager','company_user','company_staff','company_teacher'];
export async function validateTeacherUser(admin:Admin,company:unknown,instructor:unknown,profileId?:string){
 if(!validUuid(company)||!validUuid(instructor))throw new AccessError('ESCOLHA A EMPRESA E O PROFESSOR CADASTRADO.',400);
 const school=await admin.from('companies').select('id').eq('id',company).eq('slug','xpace').eq('active',true).maybeSingle();
 if(school.error)throw school.error;if(!school.data)throw new AccessError('O PERFIL PROFESSOR ESTÁ DISPONÍVEL PARA A XPACE.',400);
 const person=await admin.from('xpace_instructors').select('id').eq('id',instructor).eq('tenant_company_id',company).eq('active',true).maybeSingle();
 if(person.error)throw person.error;if(!person.data)throw new AccessError('ESCOLHA UM PROFESSOR ATIVO DESTA ESCOLA.',400);
 const binding=await admin.from('xpace_teacher_access').select('profile_id').eq('tenant_company_id',company).eq('instructor_id',instructor).maybeSingle();
 if(binding.error)throw binding.error;if(binding.data&&binding.data.profile_id!==profileId)throw new AccessError('ESTE PROFESSOR JÁ ESTÁ VINCULADO A OUTRO USUÁRIO.',409);
}
export async function saveTeacherUser(admin:Admin,input:{actor:string;id:string;name:string;email:string;role:string;company:string|null;instructor:string|null;teacherActive:boolean}){
 const result=await admin.rpc('xpace_save_teacher_user',{p_actor:input.actor,p_profile:input.id,p_name:input.name,p_email:input.email,p_role:input.role,p_company:input.company,p_instructor:input.instructor,p_teacher_active:input.teacherActive});
 if(result.error){const message=result.error.message||'';
  if(message.includes('TEACHER_ALREADY_LINKED')||result.error.code==='23505')throw new AccessError('ESTE PROFESSOR JÁ ESTÁ VINCULADO A OUTRO USUÁRIO.',409);
  if(message.includes('INSTRUCTOR_INVALID'))throw new AccessError('ESCOLHA UM PROFESSOR ATIVO DESTA ESCOLA.',400);
  if(message.includes('USER_SELF_ROLE_CHANGE'))throw new AccessError('VOCÊ NÃO PODE RETIRAR SEU PRÓPRIO PERFIL DE ADMINISTRADOR.',400);
  throw result.error;
 }
}
