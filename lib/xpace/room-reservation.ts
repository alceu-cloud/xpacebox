export const reservationHoursMessage = 'RESERVE ENTRE 08:00 E 22:00, COM TÉRMINO ATÉ 22:00.';
export function withinRoomReservationHours(start: unknown, end: unknown): boolean {
 if(typeof start!=='string'||typeof end!=='string'||!/(Z|[+-]\d{2}:\d{2})$/i.test(start)||!/(Z|[+-]\d{2}:\d{2})$/i.test(end))return false;
 const a=new Date(start),b=new Date(end);
 if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||b<=a)return false;
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const civil=(date:Date)=>Object.fromEntries(format.formatToParts(date).map(p=>[p.type,p.value]));
 const x=civil(a),y=civil(b),seconds=(p:Record<string,string>)=>Number(p.hour)*3600+Number(p.minute)*60+Number(p.second);
 return x.year===y.year&&x.month===y.month&&x.day===y.day&&seconds(x)>=8*3600&&seconds(y)<=22*3600&&!(seconds(y)===22*3600&&b.getMilliseconds()>0);
}
