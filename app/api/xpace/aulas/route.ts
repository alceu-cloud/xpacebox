import { NextResponse } from 'next/server';
import { AccessError, requireCompanyAccess } from '@/lib/server/company-access';
import { validUuid } from '@/lib/xpace/link-tree';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function monthBounds(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||Number(value.slice(0,4))<2020||Number(value.slice(0,4))>2100)throw new AccessError('MÊS INVÁLIDO.',400);
 const start=value+'-01';const next=new Date(start+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);return{start,end:next.toISOString().slice(0,10)};
}
function manager(role:string){if(!['platform_owner','company_manager'].includes(role))throw new AccessError('APENAS GESTORES PODEM ALTERAR ESTA CONFIGURAÇÃO.',403);}
export async function GET(request:Request){
 try{
  const access=await requireCompanyAccess(request,'xpace',{allowTeacher:true});const{admin,company,profile,teacherInstructorId}=access;
  const {start,end}=monthBounds(new URL(request.url).searchParams.get('month')||day().slice(0,7));
  const search=new URL(request.url).searchParams;
  let rentalFrom=start,rentalTo=end;
  if(search.has('from')){
    const from=search.get('from')??'',to=search.get('to')??'';
    const a=Date.parse(from+'T00:00:00Z'),b=Date.parse(to+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(a)||!Number.isFinite(b)||new Date(a).toISOString().slice(0,10)!==from||new Date(b).toISOString().slice(0,10)!==to||b<a||b-a>365*86400000)throw new AccessError('ESCOLHA UM PERÍODO DE ATÉ 366 DIAS.',400);
    rentalFrom=from;rentalTo=new Date(b+86400000).toISOString().slice(0,10);
  }
  const lessonQuery=admin.from('xpace_teaching_lessons').select('*').eq('tenant_company_id',company.id).gte('scheduled_on',start).lt('scheduled_on',end).order('scheduled_on').order('starts_at');
  const rentalQuery=admin.from('xpace_room_rentals').select('id,room_id,room_name,instructor_id,renter_name,starts_at,ends_at,amount_cents,hourly_rate_cents,status,cancellation_charge_cents,cancellation_reason,request_id').eq('tenant_company_id',company.id).gte('starts_at',rentalFrom+'T00:00:00-03:00').lt('starts_at',rentalTo+'T00:00:00-03:00').order('starts_at');
  const [lessons,rooms,instructors,schedules,rentals,review,groups,roomLessons]=await Promise.all([
    teacherInstructorId?lessonQuery.eq('instructor_id',teacherInstructorId):lessonQuery,
    admin.from('xpace_rooms').select(teacherInstructorId?'id,name,active,hourly_rate_cents':'id,name,active,hourly_rate_cents,attendance_token').eq('tenant_company_id',company.id).eq('active',true).order('name'),
    admin.from('xpace_instructors').select('id,full_name,active,lesson_rate_cents').eq('tenant_company_id',company.id).eq('active',true).order('full_name'),
    admin.from('xpace_class_schedules').select('id,class_group_id,weekday,starts_at,ends_at,room_id,room_name,instructor_id,teaching_enabled,teaching_from,teaching_until').eq('tenant_company_id',company.id).eq('active',true),
    rentalQuery,
    admin.from('xpace_teaching_months').select('reviewed_at').eq('tenant_company_id',company.id).eq('month',start).maybeSingle(),
    admin.from('xpace_class_groups').select('id,name').eq('tenant_company_id',company.id).eq('active',true),
    admin.from('xpace_teaching_lessons').select('id,schedule_id,scheduled_on,starts_at,ends_at,room_id,room_name,class_name,status').eq('tenant_company_id',company.id).gte('scheduled_on',start).lt('scheduled_on',end).order('starts_at')
  ]);
  for(const result of[lessons,rooms,instructors,schedules,rentals,review,groups,roomLessons])if(result.error)throw result.error;
  if((roomLessons.data?.length??0)>=1000||(schedules.data?.length??0)>=1000||(rentals.data?.length??0)>=1000)throw new AccessError('PERÍODO COM MUITOS REGISTROS. O RELATÓRIO NÃO FOI EXIBIDO PARA EVITAR UM TOTAL INCOMPLETO.',422);
  // No student/lead identity, contacts, teacher pay or another teacher's rental bill.
  const ownLessons=teacherInstructorId?(lessons.data??[]).map(({rate_cents,rate_override,confirmed_by,...l})=>l):lessons.data??[];
  const occupancy=(rentals.data??[]).filter(r=>r.status!=='CANCELADA').map(r=>({id:r.id,room_id:r.room_id,room_name:r.room_name,starts_at:r.starts_at,ends_at:r.ends_at}));
  const ownRentals=teacherInstructorId?(rentals.data??[]).filter(r=>r.instructor_id===teacherInstructorId):rentals.data??[];
  let qrRoomId:string|null=null;
  const qr=new URL(request.url).searchParams.get('qr');
  if(qr&&teacherInstructorId&&validUuid(qr)){
    const room=await admin.from('xpace_rooms').select('id').eq('tenant_company_id',company.id).eq('attendance_token',qr).eq('active',true).maybeSingle();if(room.error)throw room.error;qrRoomId=room.data?.id??null;
  }
  return NextResponse.json({success:true,teacher:Boolean(teacherInstructorId),instructorId:teacherInstructorId,canManage:['platform_owner','company_manager'].includes(profile.platform_role),lessons:ownLessons,roomLessons:roomLessons.data??[],rooms:rooms.data??[],instructors:teacherInstructorId?[]:instructors.data??[],schedules:schedules.data??[],groups:groups.data??[],rentals:ownRentals,occupancy,reviewedAt:review.data?.reviewed_at??null,qrRoomId});
 }catch(e){return failure(e);}
}
export async function POST(request:Request){
 try{
  const access=await requireCompanyAccess(request,'xpace',{allowTeacher:true});const{admin,company,user,profile,teacherInstructorId}=access;
  const body=await request.json() as Record<string,unknown>;const rpc=async(name:string,args:Record<string,unknown>)=>{const result=await admin.rpc(name,args);if(result.error)throw result.error;return result.data;};
  if(body.action==='PREPARE_MONTH'){
    const {start}=monthBounds(body.month);await rpc('xpace_prepare_teaching_month',{p_company:company.id,p_month:start});
  }else if(body.action==='CREATE_GRADE'){
    manager(profile.platform_role);
    if(!validUuid(body.instructorId)||!validUuid(body.roomId)||typeof body.title!=='string'||!Array.isArray(body.weekdays)||!body.weekdays.length||body.weekdays.some(d=>!Number.isInteger(d)||Number(d)<0||Number(d)>6)||new Set(body.weekdays).size!==body.weekdays.length||!/^\d{2}:\d{2}$/.test(String(body.startsAt))||!/^\d{2}:\d{2}$/.test(String(body.endsAt))||!/^\d{4}-\d{2}-\d{2}$/.test(String(body.from)))throw new AccessError('CONFIRA OS DADOS DA GRADE.',400);
    await rpc('xpace_create_teaching_grade',{p_company:company.id,p_actor:user.id,p_title:body.title,p_instructor:body.instructorId,p_room:body.roomId,p_days:body.weekdays,p_start:body.startsAt,p_end:body.endsAt,p_from:body.from});
  }else if(body.action==='ENABLE_SCHEDULE'){
    manager(profile.platform_role);if(!validUuid(body.id))throw new AccessError('GRADE INVÁLIDA.',400);
    const{data,error}=await admin.from('xpace_class_schedules').update({teaching_enabled:true,teaching_from:day()}).eq('id',body.id).eq('tenant_company_id',company.id).eq('active',true).eq('teaching_enabled',false).not('room_id','is',null).not('instructor_id','is',null).select('id').maybeSingle();
    if(error)throw error;if(!data)throw new AccessError('A GRADE PRECISA DE SALA E PROFESSOR ATIVOS, OU JÁ FOI INCLUÍDA.',400);
  }else if(body.action==='LESSON'){
    if(!teacherInstructorId&&body.rateOverride===true)manager(profile.platform_role);
    if(!validUuid(body.id)||!['PREVISTA','REALIZADA','CANCELADA'].includes(String(body.status)))throw new AccessError('AULA INVÁLIDA.',400);
    if(!teacherInstructorId&&!validUuid(body.instructorId))throw new AccessError('ESCOLHA O PROFESSOR QUE DEU A AULA.',400);
    if(body.rateCents!=null&&(!Number.isSafeInteger(body.rateCents)||Number(body.rateCents)<0||Number(body.rateCents)>100000000))throw new AccessError('VALOR DE AULA INVÁLIDO.',400);
    if(body.qrToken!=null&&!validUuid(body.qrToken))throw new AccessError('QR DA SALA INVÁLIDO.',400);
    await rpc('xpace_change_teaching_lesson',{p_company:company.id,p_actor:user.id,p_lesson:body.id,p_status:body.status,p_instructor:teacherInstructorId||body.instructorId,p_rate:teacherInstructorId?null:body.rateCents??null,p_override:teacherInstructorId?false:body.rateOverride===true,p_note:typeof body.note==='string'?body.note:'',p_teacher:teacherInstructorId,p_qr:body.qrToken??null});
  }else if(body.action==='REVIEW_MONTH'){
    manager(profile.platform_role);const{start}=monthBounds(body.month);await rpc('xpace_review_teaching_month',{p_company:company.id,p_actor:user.id,p_month:start,p_reopen:body.reopen===true,p_reason:typeof body.reason==='string'?body.reason:''});
  }else if(body.action==='ROOM_RATE'){
    manager(profile.platform_role);if(!validUuid(body.id)||!Number.isSafeInteger(body.rateCents)||Number(body.rateCents)<0||Number(body.rateCents)>100000000)throw new AccessError('VALOR DE SALA INVÁLIDO.',400);
    const{error}=await admin.from('xpace_rooms').update({hourly_rate_cents:body.rateCents,updated_by:user.id}).eq('id',body.id).eq('tenant_company_id',company.id);if(error)throw error;
  }else if(body.action==='RESERVE'){
    const instructor=teacherInstructorId||body.instructorId;if(!validUuid(instructor)||!validUuid(body.roomId)||!validUuid(body.requestId))throw new AccessError('ESCOLHA SALA E PROFESSOR.',400);
    const id=await rpc('xpace_reserve_teacher_room',{p_company:company.id,p_actor:user.id,p_instructor:instructor,p_room:body.roomId,p_start:body.startsAt,p_end:body.endsAt,p_request:body.requestId});return NextResponse.json({success:true,id});
  }else if(body.action==='CANCEL_RESERVATION'){
    if(!validUuid(body.id))throw new AccessError('RESERVA INVÁLIDA.',400);
    await rpc('xpace_cancel_teacher_reservation',{p_company:company.id,p_actor:user.id,p_id:body.id,p_teacher:teacherInstructorId,p_charge:null,p_decision:false,p_reason:typeof body.reason==='string'?body.reason:''});
  }else if(body.action==='CANCELLATION_CHARGE'){
    manager(profile.platform_role);if(!validUuid(body.id)||!Number.isSafeInteger(body.amountCents)||Number(body.amountCents)<0||Number(body.amountCents)>100000000||typeof body.reason!=='string'||body.reason.trim().length<3)throw new AccessError('INFORME VALOR E MOTIVO DA COBRANÇA.',400);
    await rpc('xpace_cancel_teacher_reservation',{p_company:company.id,p_actor:user.id,p_id:body.id,p_teacher:null,p_charge:body.amountCents,p_decision:true,p_reason:body.reason});
  }else throw new AccessError('AÇÃO INVÁLIDA.',400);
  return NextResponse.json({success:true});
 }catch(e){return failure(e);}
}
function failure(e:unknown){
 if(e instanceof AccessError)return NextResponse.json({success:false,message:e.message},{status:e.status});
 const message=String((e as {message?:string})?.message??'');
 const known:Record<string,string>={MONTH_CLOSED:'MÊS CONFERIDO. UM GESTOR PRECISA REABRIR PARA CORRIGIR.',MISSING_LESSON_RATE:'HÁ AULAS REALIZADAS SEM VALOR DEFINIDO.',ATTENDANCE_WINDOW_CLOSED:'CONFIRME ENTRE 15 MINUTOS ANTES E 30 MINUTOS APÓS A AULA.',TEACHER_FORBIDDEN:'VOCÊ SÓ PODE CONFIRMAR SUAS PRÓPRIAS AULAS.',ROOM_QR_INVALID:'ESTE QR NÃO CORRESPONDE À SALA DA SUA AULA.',REASON_REQUIRED:'INFORME O MOTIVO PARA REABRIR.',RESERVATION_INVALID:'ESCOLHA UM HORÁRIO FUTURO NO MESMO DIA, COM ATÉ 12 HORAS.',RESERVATION_REPLAY_MISMATCH:'ESTA TENTATIVA NÃO CORRESPONDE À RESERVA ORIGINAL.'};
 const mapped=Object.entries(known).find(([key])=>message.includes(key));
 if(mapped)return NextResponse.json({success:false,message:mapped[1]},{status:409});
 if((e as {code?:string})?.code==='23P01')return NextResponse.json({success:false,message:'ESTA SALA OU PROFESSOR JÁ ESTÁ OCUPADO NESTE HORÁRIO.'},{status:409});
 if((e as {code?:string})?.code==='23505')return NextResponse.json({success:false,message:'JÁ EXISTE UMA GRADE COM ESTE NOME.'},{status:409});
 console.error('XPACE TEACHING ERROR',e);return NextResponse.json({success:false,message:'NÃO FOI POSSÍVEL CONCLUIR. CONFIRA OS DADOS E A INSTALAÇÃO DA MIGRAÇÃO LOCAL.'},{status:500});
}
