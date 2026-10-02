export type OccupancyRoom={id:string;name:string;attendance_token?:string};
export type OccupancyPayload={
 schedules:{id:string;class_group_id:string;weekday:number;starts_at:string;ends_at:string;room_id:string;room_name:string;teaching_enabled:boolean;teaching_from:string|null;teaching_until:string|null;color?:string}[];
 groups:{id:string;name:string}[];
 roomLessons:{id:string;schedule_id:string;scheduled_on:string;starts_at:string;ends_at:string;room_id:string;room_name:string;class_name:string;status:string}[];
 occupancy:{id:string;room_id:string|null;room_name:string;starts_at:string;ends_at:string}[];
};
export type OccupancyEvent={id:string;day:string;start:number;end:number;title:string;kind:'class'|'rental';color:string};
export function shiftDay(day:string,offset:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
export function mondayOf(day:string){return shiftDay(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));}
export const timeMinutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
export const formatMinutes=(value:number)=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
export function occupancyEvents(data:OccupancyPayload,room:OccupancyRoom,week:string):OccupancyEvent[]{
 const result:OccupancyEvent[]=[];
 const matching=(id:string|null,name:string)=>id?room.id===id:room.name.trim().toLocaleLowerCase('pt-BR')===name.trim().toLocaleLowerCase('pt-BR');
 for(let n=0;n<7;n++){
  const day=shiftDay(week,n),weekday=new Date(day+'T12:00:00Z').getUTCDay();
  for(const s of data.schedules){
   const group=data.groups.find(g=>g.id===s.class_group_id);
   if(!group||!matching(s.room_id,s.room_name)||s.weekday!==weekday||data.roomLessons.some(l=>l.schedule_id===s.id&&l.scheduled_on===day))continue;
   if(s.teaching_enabled&&(!s.teaching_from||day<s.teaching_from||(s.teaching_until&&day>s.teaching_until)))continue;
   result.push({id:s.id+day,day,start:timeMinutes(s.starts_at),end:timeMinutes(s.ends_at),title:group.name,kind:'class',color:/^#[0-9a-f]{6}$/i.test(s.color||'')?s.color!:'#7435d9'});
  }
  for(const l of data.roomLessons)if(l.scheduled_on===day&&l.status!=='CANCELADA'&&matching(l.room_id,l.room_name))result.push({id:l.id,day,start:timeMinutes(l.starts_at),end:timeMinutes(l.ends_at),title:l.class_name,kind:'class',color:'#7435d9'});
  const begin=Date.parse(day+'T00:00:00-03:00'),end=begin+86400000;
  for(const r of data.occupancy){
   const a=Date.parse(r.starts_at),b=Date.parse(r.ends_at);
   if(matching(r.room_id,r.room_name)&&a<end&&b>begin)result.push({id:r.id+day,day,start:Math.max(0,(a-begin)/60000),end:Math.min(1440,(b-begin)/60000),title:'Reserva de sala',kind:'rental',color:'#d44886'});
  }
 }
 return result.sort((a,b)=>a.day.localeCompare(b.day)||a.start-b.start);
}
export function eventLanes(events:OccupancyEvent[]){
 const sorted=[...events].sort((a,b)=>a.start-b.start||a.end-b.end),clusters:OccupancyEvent[][]=[];
 for(const event of sorted){const cluster=clusters.at(-1);if(cluster&&event.start<Math.max(...cluster.map(e=>e.end)))cluster.push(event);else clusters.push([event]);}
 return clusters.flatMap(cluster=>{const ends:number[]=[];const placed=cluster.map(event=>{const vacant=ends.findIndex(end=>end<=event.start),lane=vacant<0?ends.length:vacant;ends[lane]=event.end;return{event,lane};});return placed.map(e=>({...e,lanes:ends.length}));});
}
