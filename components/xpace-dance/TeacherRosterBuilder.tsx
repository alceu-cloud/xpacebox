'use client';
import {useState, type FormEvent} from 'react';
import {CalendarDays, X} from 'lucide-react';
import {teacherRosterDates} from '@/lib/xpace/teacher-roster';
type Assignment={day:string;instructorId:string|null};
type Draft={action:'CREATE_ROSTER';month:string;classGroupId:string;roomId:string;weekdays:number[];startsAt:string;endsAt:string;assignments:Assignment[]};
type Props={month:string;rooms:{id:string;name:string}[];instructors:{id:string;full_name:string}[];groups:{id:string;name:string}[];busy:boolean;saveError:string;onClose:()=>void;onSave:(draft:Draft)=>Promise<boolean>};
const days=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
export default function TeacherRosterBuilder({month,rooms,instructors,groups,busy,saveError,onClose,onSave}:Props){
 const[form,setForm]=useState({classGroupId:'',room:'',weekdays:[1,3],starts:'19:00',duration:'60'});
 const[assignments,setAssignments]=useState<Assignment[]>([]),[choosing,setChoosing]=useState(false),[error,setError]=useState('');
 const endMinutes=Number(form.starts.slice(0,2))*60+Number(form.starts.slice(3,5))+Number(form.duration);
 const end=`${String(Math.floor(endMinutes/60)).padStart(2,'0')}:${String(endMinutes%60).padStart(2,'0')}`;
 const group=groups.find(g=>g.id===form.classGroupId);
 const room=rooms.find(r=>r.id===form.room);
 async function submit(event:FormEvent){
  event.preventDefault();setError('');
  if(!group){setError('Escolha uma turma das grades de aulas cadastradas.');setChoosing(false);return;}
  if(!choosing){
   const dates=teacherRosterDates(month,form.weekdays);
   if(!dates.length){setError('Escolha pelo menos um dia da semana.');return;}
   if(!Number.isFinite(endMinutes)||endMinutes>=1440||Number(form.duration)<=0){setError('A aula precisa terminar no mesmo dia.');return;}
   setAssignments(dates.map(day=>({day,instructorId:assignments.find(a=>a.day===day)?.instructorId??null})));setChoosing(true);return;
  }
  await onSave({action:'CREATE_ROSTER',month,classGroupId:group.id,roomId:form.room,weekdays:form.weekdays,startsAt:form.starts,endsAt:end,assignments});
 }
 const filled=assignments.filter(a=>a.instructorId).length;
 return <div className="tw-modal" role="dialog" aria-modal="true" aria-labelledby="tw-roster-builder-title"><form className="tw-roster-builder" onSubmit={submit}>
  <header><div><span className="tw-small">{choosing?'2 · PROFESSORES POR DATA':'1 · TURMA E HORÁRIOS'} · {month.slice(5,7)}/{month.slice(0,4)}</span><h3 id="tw-roster-builder-title">{choosing?group?.name:'Montar turma do mês'}</h3></div><button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={18}/></button></header>
  {!choosing?<><label>TURMA<select aria-label="TURMA" required disabled={busy||!groups.length} value={form.classGroupId} onChange={e=>setForm({...form,classGroupId:e.target.value})}><option value="">Escolha uma turma da grade de aulas</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{!groups.length?<p role="status" className="tw-small">Cadastre uma turma nas grades de aulas da Agenda para montar os professores do mês.</p>:null}
   <label>SALA<select required value={form.room} onChange={e=>setForm({...form,room:e.target.value})}><option value="">Escolha a sala</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   <fieldset className="tw-weekdays"><legend>DIAS DA SEMANA</legend>{days.map((label,index)=><label key={label}><input type="checkbox" checked={form.weekdays.includes(index)} onChange={()=>setForm({...form,weekdays:form.weekdays.includes(index)?form.weekdays.filter(d=>d!==index):[...form.weekdays,index]})}/><span>{label}</span></label>)}</fieldset>
   <div className="tw-two"><label>HORÁRIO<input required type="time" value={form.starts} onChange={e=>setForm({...form,starts:e.target.value})}/></label><label>DURAÇÃO · MINUTOS<input required type="number" min={15} max={300} value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})}/></label></div>
   <p className="tw-small">Vamos abrir todas as datas desses dias no mês para você escolher quem dará cada aula.</p>
  </>:<><div className="tw-builder-summary"><CalendarDays size={19}/><strong>{room?.name} · {form.starts}–{end}</strong><span>{filled} de {assignments.length} professores escolhidos</span></div>
   <p className="tw-small">Escolha um professor em cada linha. Você pode deixar uma data a definir e completar depois.</p>
   <div className="tw-builder-dates">{assignments.map((entry,index)=><div className="tw-builder-date" key={entry.day}><time dateTime={entry.day}><strong>{entry.day.slice(8,10)}/{entry.day.slice(5,7)}</strong><span>{new Intl.DateTimeFormat('pt-BR',{weekday:'long',timeZone:'UTC'}).format(new Date(entry.day+'T12:00:00Z'))}</span></time><label><span>PROFESSOR</span><select aria-label={'Professor de '+entry.day.slice(8,10)+'/'+entry.day.slice(5,7)} disabled={busy} value={entry.instructorId??''} onChange={e=>setAssignments(assignments.map((a,i)=>i===index?{...a,instructorId:e.target.value||null}:a))}><option value="">A definir</option>{instructors.map(i=><option key={i.id} value={i.id}>{i.full_name}</option>)}</select></label></div>)}</div>
  </>}
  {error||saveError?<p role="alert" className="tw-notice">{error||saveError}</p>:null}
  <footer>{choosing?<button type="button" className="tw-secondary" disabled={busy} onClick={()=>setChoosing(false)}>ALTERAR TURMA / HORÁRIOS</button>:<button type="button" className="tw-secondary" disabled={busy} onClick={onClose}>CANCELAR</button>}<button className="tw-primary" disabled={busy||!group}>{busy?'SALVANDO…':choosing?'SALVAR E GERAR QUADRO':'ESCOLHER PROFESSORES'}</button></footer>
 </form></div>;
}
