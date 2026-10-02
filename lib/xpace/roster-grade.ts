import {trialClassLabel,trialScheduleDetails} from './trial-schedule';
export type GradeGroup={id:string;name:string;modality?:string;class_level?:string};
export type GradeSchedule={id:string;class_group_id:string;weekday:number;starts_at:string;ends_at:string;room_id:string;room_name:string;class_level?:string;age_group?:string;age_groups?:string[]};
export type RosterGrade={id:string;groupId:string;name:string;modality:string;level:string;ageGroups:string[];roomId:string;roomName:string;weekdays:number[];startsAt:string;endsAt:string;scheduleIds:string[]};
const days=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
export function gradeDescription(g:Pick<RosterGrade,'level'|'ageGroups'>){return trialClassLabel(g.level,g.ageGroups);}
export function gradeTimetable(g:Pick<RosterGrade,'weekdays'|'startsAt'|'endsAt'|'roomName'>){return g.weekdays.map(d=>days[d]).join(' / ')+' · '+g.startsAt+'–'+g.endsAt+' · '+g.roomName;}
export function rosterGrades(groups:GradeGroup[],schedules:GradeSchedule[]):RosterGrade[]{
 const variants=new Map<string,RosterGrade>();
 for(const s of schedules){
  const g=groups.find(g=>g.id===s.class_group_id);if(!g||!s.room_id||!Number.isInteger(s.weekday)||s.weekday<0||s.weekday>6)continue;
  const details=trialScheduleDetails({...s,class_level:s.class_level||g.class_level});
  const key=JSON.stringify([g.id,details.level,details.ageGroups,s.room_id,s.starts_at.slice(0,5),s.ends_at.slice(0,5)]);
  const previous=variants.get(key);if(previous){previous.weekdays=[...new Set([...previous.weekdays,s.weekday])].sort();previous.scheduleIds.push(s.id);continue;}
  variants.set(key,{id:s.id,groupId:g.id,name:g.name,modality:g.modality||g.name,level:details.level,ageGroups:details.ageGroups,roomId:s.room_id,roomName:s.room_name,weekdays:[s.weekday],startsAt:s.starts_at.slice(0,5),endsAt:s.ends_at.slice(0,5),scheduleIds:[s.id]});
 }
 return [...variants.values()].map(g=>({...g,id:[...g.scheduleIds].sort()[0],scheduleIds:g.scheduleIds.sort()})).sort((a,b)=>(a.name+gradeDescription(a)+gradeTimetable(a)).localeCompare(b.name+gradeDescription(b)+gradeTimetable(b),'pt-BR',{numeric:true}));
}
export function rosterKey(entry:{roster_id?:string;class_name:string}){return entry.roster_id||entry.class_name;}
