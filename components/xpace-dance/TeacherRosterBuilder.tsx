'use client';
import {useState, type FormEvent} from 'react';
import {CalendarDays, X} from 'lucide-react';
import {gradeDescription,gradeTimetable,type RosterGrade} from '@/lib/xpace/roster-grade';
import {teacherRosterDates} from '@/lib/xpace/teacher-roster';
type Assignment={day:string;instructorId:string|null};
type Draft={action:'CREATE_ROSTER';month:string;classGroupId:string;scheduleId:string;assignments:Assignment[]};
type Props={month:string;rooms:{id:string;name:string}[];instructors:{id:string;full_name:string}[];grades:RosterGrade[];busy:boolean;saveError:string;onClose:()=>void;onSave:(draft:Draft)=>Promise<boolean>};
export default function TeacherRosterBuilder({month,instructors,grades,busy,saveError,onClose,onSave}:Props){
 const[gradeId,setGradeId]=useState('');
 const[assignments,setAssignments]=useState<Assignment[]>([]),[choosing,setChoosing]=useState(false),[error,setError]=useState('');
 const group=grades.find(g=>g.id===gradeId);
 async function submit(event:FormEvent){
  event.preventDefault();setError('');
  if(!group){setError('Escolha uma turma das grades de aulas cadastradas.');setChoosing(false);return;}
  if(!choosing){
   const dates=teacherRosterDates(month,group.weekdays);
   if(!dates.length){setError('Escolha pelo menos um dia da semana.');return;}
   setAssignments(dates.map(day=>({day,instructorId:assignments.find(a=>a.day===day)?.instructorId??null})));setChoosing(true);return;
  }
  await onSave({action:'CREATE_ROSTER',month,classGroupId:group.groupId,scheduleId:group.id,assignments});
 }
 const filled=assignments.filter(a=>a.instructorId).length;
 return <div className="tw-modal" role="dialog" aria-modal="true" aria-labelledby="tw-roster-builder-title"><form className="tw-roster-builder" onSubmit={submit}>
  <header><div><span className="tw-small">{choosing?'2 · PROFESSORES POR DATA':'1 · TURMA E HORÁRIOS'} · {month.slice(5,7)}/{month.slice(0,4)}</span><h3 id="tw-roster-builder-title">{choosing?group?.name:'Montar turma do mês'}</h3></div><button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={18}/></button></header>
  {!choosing?<><label>TURMA<select aria-label="TURMA" required disabled={busy||!grades.length} value={gradeId} onChange={e=>{setGradeId(e.target.value);setAssignments([]);}}><option value="">Escolha uma turma da grade de aulas</option>{grades.map(g=><option key={g.id} value={g.id}>{g.name} · {gradeDescription(g)} · {gradeTimetable(g)}</option>)}</select></label>{!grades.length?<p role="status" className="tw-small">Cadastre os horários completos de uma turma na Agenda para montar os professores do mês.</p>:null}
   {group?<section className="tw-grade-summary"><strong>{group.modality}</strong><p>{gradeDescription(group)||'Nível e público não informados'}</p><p>{gradeTimetable(group)}</p></section>:null}
   <p className="tw-small">Sala, dias e horários vêm da grade escolhida. Vamos abrir todas as datas do mês para você escolher quem dará cada aula.</p>
  </>:<><div className="tw-builder-summary"><CalendarDays size={19}/><strong>{group&&gradeTimetable(group)}</strong><span>{filled} de {assignments.length} professores escolhidos</span></div><p className="tw-small">{group&&gradeDescription(group)}</p>
   <p className="tw-small">Escolha um professor em cada linha. Você pode deixar uma data a definir e completar depois.</p>
   <div className="tw-builder-dates">{assignments.map((entry,index)=><div className="tw-builder-date" key={entry.day}><time dateTime={entry.day}><strong>{entry.day.slice(8,10)}/{entry.day.slice(5,7)}</strong><span>{new Intl.DateTimeFormat('pt-BR',{weekday:'long',timeZone:'UTC'}).format(new Date(entry.day+'T12:00:00Z'))}</span></time><label><span>PROFESSOR</span><select aria-label={'Professor de '+entry.day.slice(8,10)+'/'+entry.day.slice(5,7)} disabled={busy} value={entry.instructorId??''} onChange={e=>setAssignments(assignments.map((a,i)=>i===index?{...a,instructorId:e.target.value||null}:a))}><option value="">A definir</option>{instructors.map(i=><option key={i.id} value={i.id}>{i.full_name}</option>)}</select></label></div>)}</div>
  </>}
  {error||saveError?<p role="alert" className="tw-notice">{error||saveError}</p>:null}
  <footer>{choosing?<button type="button" className="tw-secondary" disabled={busy} onClick={()=>setChoosing(false)}>ALTERAR TURMA / HORÁRIOS</button>:<button type="button" className="tw-secondary" disabled={busy} onClick={onClose}>CANCELAR</button>}<button className="tw-primary" disabled={busy||!group}>{busy?'SALVANDO…':choosing?'SALVAR E GERAR QUADRO':'ESCOLHER PROFESSORES'}</button></footer>
 </form></div>;
}
