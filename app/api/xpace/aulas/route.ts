import { NextResponse } from 'next/server';
import { AccessError, requireCompanyAccess } from '@/lib/server/company-access';
import { validUuid } from '@/lib/xpace/link-tree';
import { rosterGrades } from '@/lib/xpace/roster-grade';
import { teacherRosterDates } from '@/lib/xpace/teacher-roster';
import { withinRoomReservationHours, reservationHoursMessage } from '@/lib/xpace/room-reservation';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function monthBounds(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||Number(value.slice(0,4))<2020||Number(value.slice(0,4))>2100)throw new AccessError('MÊS INVÁLIDO.',400);
 const start=value+'-01';const next=new Date(start+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);return{start,end:next.toISOString().slice(0,10)};
}
function manager(role:string){if(!['platform_owner','company_manager'].includes(role))throw new AccessError('APENAS GESTORES PODEM ALTERAR ESTA CONFIGURAÇÃO.',403);}
export async function GET(request:Request){
 try{
  const access=await requireCompanyAccess(request,'xpace',{allowTeacher:true});const{admin,company,profile,teacherInstructorId}=access;
  const search=new URL(request.url).searchParams;
  const canManage=['platform_owner','company_manager'].includes(profile.platform_role);
  if(search.get('scope')==='grade')manager(profile.platform_role);
  if(search.get('scope')==='occupation'){
    const from=search.get('from')||day(),stamp=Date.parse(from+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==from)throw new AccessError('SEMANA INVÁLIDA.',400);
    const to=new Date(stamp+7*86400000).toISOString().slice(0,10);
    const results=await Promise.all([
      admin.from('xpace_class_schedules').select('id,class_group_id,weekday,starts_at,ends_at,room_id,room_name,teaching_enabled,teaching_from,teaching_until,color').eq('tenant_company_id',company.id).eq('active',true),
      admin.from('xpace_class_groups').select('id,name').eq('tenant_company_id',company.id).eq('active',true),
      admin.from('xpace_teaching_lessons').select('id,schedule_id,scheduled_on,starts_at,ends_at,room_id,room_name,class_name,status').eq('tenant_company_id',company.id).gte('scheduled_on',from).lt('scheduled_on',to).not('schedule_id','is',null),
      admin.from('xpace_room_rentals').select('id,room_id,room_name,starts_at,ends_at').eq('tenant_company_id',company.id).neq('status','CANCELADA').lt('starts_at',to+'T00:00:00-03:00').gt('ends_at',from+'T00:00:00-03:00')
    ]);
    for(const result of results){if(result.error)throw result.error;if((result.data?.length??0)>=1000)throw new AccessError('SEMANA COM MUITOS REGISTROS. REDUZA O PERÍODO.',422);}
    return NextResponse.json({success:true,schedules:results[0].data??[],groups:results[1].data??[],roomLessons:results[2].data??[],occupancy:results[3].data??[]});
  }
  const {start,end}=monthBounds(new URL(request.url).searchParams.get('month')||day().slice(0,7));
  let rentalFrom=start,rentalTo=end;
  if(search.has('from')){
    const from=search.get('from')??'',to=search.get('to')??'';
    const a=Date.parse(from+'T00:00:00Z'),b=Date.parse(to+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(a)||!Number.isFinite(b)||new Date(a).toISOString().slice(0,10)!==from||new Date(b).toISOString().slice(0,10)!==to||b<a||b-a>365*86400000)throw new AccessError('ESCOLHA UM PERÍODO DE ATÉ 366 DIAS.',400);
    rentalFrom=from;rentalTo=new Date(b+86400000).toISOString().slice(0,10);
  }
  const lessonQuery=admin.from('xpace_teaching_lessons').select('*').eq('tenant_company_id',company.id) .gte('scheduled_on',teacherInstructorId?day():start).lt('scheduled_on',teacherInstructorId?new Date(Date.parse(day()+'T12:00:00Z')+86400000).toISOString().slice(0,10):end).not('roster_id','is',null).order('scheduled_on').order('starts_at');
  const rentalQuery=admin.from('xpace_room_rentals').select('id,room_id,room_name,instructor_id,renter_name,starts_at,ends_at,amount_cents,hourly_rate_cents,status,cancellation_charge_cents,cancellation_reason,request_id').eq('tenant_company_id',company.id).gt('ends_at',rentalFrom+'T00:00:00-03:00').lt('starts_at',rentalTo+'T00:00:00-03:00').order('starts_at');
  const [lessons,rooms,instructors,schedules,rentals,review,groups,roomLessons]=await Promise.all([
    teacherInstructorId?lessonQuery.eq('instructor_id',teacherInstructorId).eq('scheduled_on',day()):canManage?lessonQuery:Promise.resolve({data:[],error:null}),
    admin.from('xpace_rooms').select(!canManage?'id,name,active,hourly_rate_cents':'id,name,active,hourly_rate_cents,attendance_token').eq('tenant_company_id',company.id).eq('active',true).order('name'),
    admin.from('xpace_instructors').select('id,full_name,active,lesson_rate_cents').eq('tenant_company_id',company.id).eq('active',true).order('full_name'),
    canManage?admin.from('xpace_class_schedules').select('id,class_group_id,weekday,starts_at,ends_at,room_id,room_name,class_level,age_group,age_groups').eq('tenant_company_id',company.id).eq('active',true).order('weekday').order('starts_at'):Promise.resolve({data:[],error:null}),
    rentalQuery,
    admin.from('xpace_teaching_months').select('reviewed_at').eq('tenant_company_id',company.id).eq('month',start).maybeSingle(),
    canManage?admin.from('xpace_class_groups').select('id,name,modality,class_level').eq('tenant_company_id',company.id).eq('active',true).order('name'):Promise.resolve({data:[],error:null}),
    Promise.resolve({data:[],error:null})
  ]);
  for(const result of[lessons,rooms,instructors,schedules,rentals,review,groups,roomLessons])if(result.error)throw result.error;
  if((groups.data?.length??0)>=1000||(lessons.data?.length??0)>=1000||(instructors.data?.length??0)>=1000||(roomLessons.data?.length??0)>=1000||(schedules.data?.length??0)>=1000||(rentals.data?.length??0)>=1000)throw new AccessError('PERÍODO COM MUITOS REGISTROS. O RELATÓRIO NÃO FOI EXIBIDO PARA EVITAR UM TOTAL INCOMPLETO.',422);
  // Occupancy has no identities/contacts; teachers receive only their own rental contact.
  const ownLessons=teacherInstructorId?(lessons.data??[]).map(({rate_cents,rate_override,confirmed_by,...l})=>l):canManage?lessons.data??[]:[];
  const occupancy=(rentals.data??[]).filter(r=>r.status!=='CANCELADA').map(r=>({id:r.id,room_id:r.room_id,room_name:r.room_name,starts_at:r.starts_at,ends_at:r.ends_at}));
  const visibleRentals=teacherInstructorId?(rentals.data??[]).filter(r=>r.instructor_id===teacherInstructorId):rentals.data??[];
  const renterIds=[...new Set(visibleRentals.map(r=>r.instructor_id).filter(Boolean))];
  const contacts=renterIds.length?await admin.from('xpace_instructors').select('id,full_name,mobile').eq('tenant_company_id',company.id).in('id',renterIds):{data:[],error:null};
  if(contacts.error)throw contacts.error;
  const renters=new Map((contacts.data??[]).map(i=>[i.id,i]));
  const ownRentals=visibleRentals.map(r=>({...r,renter_name:renters.get(r.instructor_id)?.full_name||r.renter_name,renter_mobile:renters.get(r.instructor_id)?.mobile||''}));
  let qrRoomId:string|null=null;
  const qr=new URL(request.url).searchParams.get('qr');
  if(qr&&teacherInstructorId&&validUuid(qr)){
    const room=await admin.from('xpace_rooms').select('id').eq('tenant_company_id',company.id).eq('attendance_token',qr).eq('active',true).maybeSingle();if(room.error)throw room.error;qrRoomId=room.data?.id??null;
  }
  return NextResponse.json({success:true,teacher:Boolean(teacherInstructorId),instructorId:teacherInstructorId,canManage:['platform_owner','company_manager'].includes(profile.platform_role),lessons:ownLessons,roomLessons:roomLessons.data??[],rooms:rooms.data??[],instructors:teacherInstructorId?[]:canManage?instructors.data??[]:(instructors.data??[]).map(({lesson_rate_cents,...i})=>i),schedules:[],groups:(groups.data??[]).map(g=>({id:g.id,name:g.name})),rosterGrades:canManage?rosterGrades(groups.data??[],schedules.data??[]):[],rentals:ownRentals,occupancy,reviewedAt:canManage||teacherInstructorId?review.data?.reviewed_at??null:null,qrRoomId});
 }catch(e){return failure(e);}
}
export async function POST(request:Request){
 try{
  const access=await requireCompanyAccess(request,'xpace',{allowTeacher:true});const{admin,company,user,profile,teacherInstructorId}=access;
  const body=await request.json() as Record<string,unknown>;const rpc=async(name:string,args:Record<string,unknown>)=>{const result=await admin.rpc(name,args);if(result.error)throw result.error;return result.data;};
  if(body.action==='PREPARE_MONTH'){
    manager(profile.platform_role);const {start}=monthBounds(body.month);const result=await admin.from('xpace_teaching_months').upsert({tenant_company_id:company.id,month:start},{onConflict:'tenant_company_id,month',ignoreDuplicates:true});if(result.error)throw result.error;
  }else if(body.action==='CREATE_ROSTER'){
    manager(profile.platform_role);
    if(!validUuid(body.classGroupId)||!validUuid(body.scheduleId))throw new AccessError('ESCOLHA UMA GRADE COMPLETA CADASTRADA.',400);
    const [groups,schedules]=await Promise.all([
      admin.from('xpace_class_groups').select('id,name,modality,class_level').eq('tenant_company_id',company.id).eq('id',body.classGroupId).eq('active',true),
      admin.from('xpace_class_schedules').select('id,class_group_id,weekday,starts_at,ends_at,room_id,room_name,class_level,age_group,age_groups').eq('tenant_company_id',company.id).eq('class_group_id',body.classGroupId).eq('active',true)
    ]);
    if(groups.error)throw groups.error;if(schedules.error)throw schedules.error;
    if((schedules.data?.length??0)>=1000)throw new AccessError('GRADE COM MUITOS HORÁRIOS.',422);
    const grade=rosterGrades(groups.data??[],schedules.data??[]).find(g=>g.id===body.scheduleId);
    if(!grade)throw new AccessError('GRADE NÃO ENCONTRADA OU ARQUIVADA. ATUALIZE A AGENDA.',400);
    const {start}=monthBounds(body.month),expected=teacherRosterDates(start.slice(0,7),grade.weekdays);
    if(!Array.isArray(body.assignments)||body.assignments.length!==expected.length)throw new AccessError('ESCOLHA OS PROFESSORES DAS DATAS DESTE MÊS.',400);
    const assignments=body.assignments as {day:unknown;instructorId:unknown}[];
    if(assignments.some(a=>!a||typeof a.day!=='string'||!expected.includes(a.day)||(a.instructorId!==null&&!validUuid(a.instructorId)))||new Set(assignments.map(a=>a.day)).size!==expected.length)throw new AccessError('CONFIRA OS PROFESSORES E AS DATAS DA TURMA.',400);
    await rpc('xpace_create_grade_teacher_roster',{p_company:company.id,p_actor:user.id,p_month:start,p_title:grade.name,p_room:grade.roomId,p_days:grade.weekdays,p_start:grade.startsAt,p_end:grade.endsAt,p_assignments:assignments.map(a=>({day:a.day,instructorId:a.instructorId})),p_details:grade,p_key:grade.scheduleIds.join(',')});
  }else if(body.action==='LESSON'){
    if(!teacherInstructorId)manager(profile.platform_role);
    if(!validUuid(body.id)||!['PREVISTA','REALIZADA','CANCELADA'].includes(String(body.status)))throw new AccessError('AULA INVÁLIDA.',400);
    if(!teacherInstructorId&&body.instructorId!=null&&!validUuid(body.instructorId))throw new AccessError('PROFESSOR INVÁLIDO.',400);
    if(!teacherInstructorId&&(!validUuid(body.roomId)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.startsAt))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.endsAt))))throw new AccessError('CONFIRA SALA E HORÁRIOS.',400);
    if(body.rateCents!=null&&(!Number.isSafeInteger(body.rateCents)||Number(body.rateCents)<0||Number(body.rateCents)>100000000))throw new AccessError('VALOR DE AULA INVÁLIDO.',400);
    if(body.qrToken!=null&&!validUuid(body.qrToken))throw new AccessError('QR DA SALA INVÁLIDO.',400);
    await rpc('xpace_update_roster_lesson',{p_company:company.id,p_actor:user.id,p_lesson:body.id,p_status:body.status,p_instructor:teacherInstructorId||body.instructorId||null,p_room:teacherInstructorId?null:body.roomId,p_start:teacherInstructorId?null:body.startsAt,p_end:teacherInstructorId?null:body.endsAt,p_rate:teacherInstructorId?null:body.rateCents??null,p_override:teacherInstructorId?false:body.rateOverride===true,p_note:typeof body.note==='string'?body.note:'',p_teacher:teacherInstructorId,p_qr:body.qrToken??null});
  }else if(body.action==='REVIEW_MONTH'){
    manager(profile.platform_role);const{start}=monthBounds(body.month);await rpc('xpace_review_teaching_month',{p_company:company.id,p_actor:user.id,p_month:start,p_reopen:body.reopen===true,p_reason:typeof body.reason==='string'?body.reason:''});
  }else if(body.action==='ROOM_RATE'){
    manager(profile.platform_role);if(!validUuid(body.id)||!Number.isSafeInteger(body.rateCents)||Number(body.rateCents)<0||Number(body.rateCents)>100000000)throw new AccessError('VALOR DE SALA INVÁLIDO.',400);
    const{error}=await admin.from('xpace_rooms').update({hourly_rate_cents:body.rateCents,updated_by:user.id}).eq('id',body.id).eq('tenant_company_id',company.id);if(error)throw error;
  }else if(body.action==='RESERVE'){
    const instructor=teacherInstructorId||body.instructorId;if(!validUuid(instructor)||!validUuid(body.roomId)||!validUuid(body.requestId))throw new AccessError('ESCOLHA SALA E PROFESSOR.',400);
    if(!withinRoomReservationHours(body.startsAt,body.endsAt))throw new AccessError(reservationHoursMessage,400);
    const id=await rpc('xpace_reserve_teacher_room',{p_company:company.id,p_actor:user.id,p_instructor:instructor,p_room:body.roomId,p_start:body.startsAt,p_end:body.endsAt,p_request:body.requestId});return NextResponse.json({success:true,id});
  }else if(body.action==='CANCEL_RESERVATION'){
    if(!validUuid(body.id))throw new AccessError('RESERVA INVÁLIDA.',400);
    await rpc('xpace_cancel_teacher_reservation',{p_company:company.id,p_actor:user.id,p_id:body.id,p_teacher:teacherInstructorId,p_charge:null,p_decision:false,p_reason:typeof body.reason==='string'?body.reason:''});
  }else throw new AccessError('AÇÃO INVÁLIDA.',400);
  return NextResponse.json({success:true});
 }catch(e){return failure(e);}
}
function failure(e:unknown){
 if(e instanceof AccessError)return NextResponse.json({success:false,message:e.message},{status:e.status});
 const message=String((e as {message?:string})?.message??'');
 const known:Record<string,string>={RESERVATION_HOURS:reservationHoursMessage,ROSTER_ASSIGNMENTS_INVALID:'CONFIRA AS DATAS E PROFESSORES DA TURMA. NENHUMA PARTE DA ESCALA FOI SALVA.',INSTRUCTOR_INVALID:'UM PROFESSOR ESCOLHIDO ESTÁ INATIVO OU NÃO PERTENCE À ESCOLA.',MONTH_CLOSED:'MÊS CONFERIDO. UM GESTOR PRECISA REABRIR PARA CORRIGIR.',MISSING_LESSON_RATE:'HÁ AULAS REALIZADAS SEM VALOR DEFINIDO.',ATTENDANCE_WINDOW_CLOSED:'CONFIRME NO DIA DA AULA, ENTRE 15 MINUTOS ANTES E 15 MINUTOS APÓS O INÍCIO.',TEACHER_FORBIDDEN:'VOCÊ SÓ PODE CONFIRMAR SUAS PRÓPRIAS AULAS.',ROOM_QR_INVALID:'ESTE QR NÃO CORRESPONDE À SALA DA SUA AULA.',REASON_REQUIRED:'INFORME O MOTIVO PARA REABRIR.',RESERVATION_INVALID:'ESCOLHA UM HORÁRIO FUTURO NO MESMO DIA, ENTRE 08:00 E 22:00, COM TÉRMINO ATÉ 22:00.',TEACHER_ROSTER_CONFLICT:'ESTE PROFESSOR JÁ ESTÁ ATRIBUÍDO A OUTRA AULA NESTE HORÁRIO.',LESSON_INVALID:'CONFIRA PROFESSOR, SALA E HORÁRIOS DA ESCALA.',ROSTER_INVALID:'CONFIRA OS DADOS DA ESCALA.',RESERVATION_REPLAY_MISMATCH:'ESTA TENTATIVA NÃO CORRESPONDE À RESERVA ORIGINAL.'};
 const mapped=Object.entries(known).find(([key])=>message.includes(key));
 if(mapped)return NextResponse.json({success:false,message:mapped[1]},{status:409});
 if((e as {code?:string})?.code==='23P01')return NextResponse.json({success:false,message:'ESTA SALA OU PROFESSOR JÁ ESTÁ OCUPADO NESTE HORÁRIO.'},{status:409});
 if((e as {code?:string})?.code==='23505')return NextResponse.json({success:false,message:'JÁ EXISTE UMA TURMA COM ESTE NOME NO MÊS.'},{status:409});
 console.error('XPACE TEACHING ERROR',e);return NextResponse.json({success:false,message:'NÃO FOI POSSÍVEL CONCLUIR. CONFIRA OS DADOS E A INSTALAÇÃO DA MIGRAÇÃO LOCAL.'},{status:500});
}
