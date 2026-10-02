'use client';
import {supabase} from '@/lib/supabase';
export const schoolToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function teachingApi<T>(path:string,init?:RequestInit):Promise<T>{const{data}=await supabase.auth.getSession();if(!data.session)throw new Error('ENTRE COM SEU LOGIN PARA CONTINUAR.');const res=await fetch(path,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`,...init?.headers},cache:'no-store'});const p=await res.json();if(!res.ok||!p.success)throw new Error(p.message||'NÃO FOI POSSÍVEL CONCLUIR.');return p as T;}
