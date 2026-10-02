'use client';
import {rosterKey,gradeDescription,gradeTimetable,type RosterGrade} from '@/lib/xpace/roster-grade';
type Entry={roster_id?:string;grade_details?:RosterGrade|null;scheduled_on:string;starts_at:string;ends_at:string;class_name:string;room_name:string;instructor_name:string;status:string};
export function printTeacherMonth(entries:Entry[],month:string){
 const popup=window.open('','_blank');if(!popup)throw new Error('HABILITE A JANELA DE IMPRESSÃO PARA GERAR O PDF.');
 const doc=popup.document;doc.title='XPACE · Professores do mês · '+month;
 const style=doc.createElement('style');style.textContent='@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#342146;font-size:12px;print-color-adjust:exact;-webkit-print-color-adjust:exact}h1{font-size:24px}h2{font-size:20px;color:#7435d9;margin-top:28px}table{width:100%;border-collapse:collapse;margin-bottom:25px}th{text-align:left;background:#7435d9;color:white}td,th{padding:10px 8px;border-bottom:1px solid #ded4e8}tr:nth-child(even){background:#f5effa}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid;overflow-wrap:anywhere}section{break-inside:auto}.grade-details{line-height:1.5;break-after:avoid}table{table-layout:fixed}td,th{overflow-wrap:anywhere}td:first-child,th:first-child{width:30%}footer{font-size:10px;color:#877393;margin-top:24px}';doc.head.append(style);
 const h=doc.createElement('h1');h.textContent='Professores do mês · '+month.slice(5,7)+'/'+month.slice(0,4);doc.body.append(h);
 const note=doc.createElement('p');note.textContent='XPACE Escola de Dança · Escala de professores';doc.body.append(note);
 const keys=[...new Set(entries.map(rosterKey))];
 for(const key of keys){
  const items=entries.filter(e=>rosterKey(e)===key),title=items[0].class_name,details=items[0].grade_details;
  const section=doc.createElement('section'),heading=doc.createElement('h2');heading.textContent=title;section.append(heading);
  if(details){const subtitle=doc.createElement('p');subtitle.className='grade-details';subtitle.textContent=[details.modality,gradeDescription(details),gradeTimetable(details)].filter(Boolean).join(' · ');section.append(subtitle);}
  const table=doc.createElement('table'),thead=doc.createElement('thead'),row=doc.createElement('tr');
  for(const text of ['Professor','Horário','Dia','Sala','Check']){const cell=doc.createElement('th');cell.textContent=text;row.append(cell);}thead.append(row);table.append(thead);
  const tbody=doc.createElement('tbody');for(const entry of items.sort((a,b)=>a.scheduled_on.localeCompare(b.scheduled_on)||a.starts_at.localeCompare(b.starts_at))){
   const tr=doc.createElement('tr'),weekday=new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'}).format(new Date(entry.scheduled_on+'T12:00:00Z'));
   for(const text of [entry.instructor_name||'A definir',entry.starts_at.slice(0,5)+'–'+entry.ends_at.slice(0,5),entry.scheduled_on.slice(8,10)+'/'+entry.scheduled_on.slice(5,7)+' ('+weekday+')',entry.room_name,entry.status==='REALIZADA'?'OK':entry.status==='FALTOU'?'Faltou':entry.status==='CANCELADA'?'Não teve aula':'']){const cell=doc.createElement('td');cell.textContent=text;tr.append(cell);}tbody.append(tr);
  }table.append(tbody);section.append(table);doc.body.append(section);
 }
 const footer=doc.createElement('footer');footer.textContent='Escala mensal · Salve como PDF na janela de impressão.';doc.body.append(footer);popup.focus();popup.print();
}
