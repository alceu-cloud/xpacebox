// Preserve only the professor page/room QR after the shared login; reject external redirects.
export function teacherLoginReturn(value:string|null):string|null{
 if(!value||!value.startsWith('/')||value.startsWith('//'))return null;
 try{const target=new URL(value,'https://xpacebox.invalid');
  if(target.origin!=='https://xpacebox.invalid'||target.pathname!=='/xpace/professor')return null;
  const room=target.searchParams.get('sala');
  return '/xpace/professor'+(room&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(room)?'?sala='+encodeURIComponent(room):'');
 }catch{return null;}
}
