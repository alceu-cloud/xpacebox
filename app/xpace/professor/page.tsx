'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import TeachingWorkspace,{schoolToday,teachingApi} from '@/components/xpace-dance/TeachingWorkspace';
import BuildRevision from '@/components/BuildRevision';
import {supabase} from '@/lib/supabase';
import '@/components/xpace-dance/teaching.css';
export default function ProfessorPage(){
 const router=useRouter();
 const[mode,setMode]=useState<'grade'|'reservation'|'occupation'>('grade');
 const[access,setAccess]=useState<{teacher:boolean;canManage:boolean}|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>{async function check(){try{
  const{data}=await supabase.auth.getSession();if(!data.session){router.replace('/login?next='+encodeURIComponent('/xpace/professor'+window.location.search));return;}
  const result=await teachingApi<{teacher:boolean;canManage:boolean}>('/api/xpace/aulas?month='+schoolToday().slice(0,7));
  if(!result.teacher&&!result.canManage){router.replace('/xpace');return;}setAccess(result);
 }catch(e){setNotice(e instanceof Error?e.message:'NÃO FOI POSSÍVEL VALIDAR SEU ACESSO.');}}
 void check();if('serviceWorker'in navigator)void navigator.serviceWorker.register('/xpace-professor-sw.js',{scope:'/xpace/professor'}).catch(()=>{});
 },[router]);
 async function logout(){await supabase.auth.signOut();router.replace('/login');}
 if(!access)return <main className="xd-loading" aria-busy={!notice}>{notice?<div><p role="alert">{notice}</p><button className="tw-secondary" onClick={()=>router.replace('/login')}>IR PARA O LOGIN</button></div>:'CONFERINDO SEU ACESSO…'}</main>;
 return <main className="tw-professor"><header className="tw-professor-header"><img src="/brands/xpace-logo.png" alt="XPACE"/><div>{access.canManage?<button className="tw-secondary" onClick={()=>router.push('/xpace')}>PAINEL</button>:null}<button className="tw-secondary" onClick={()=>window.location.reload()}>ATUALIZAR</button><button className="tw-secondary" onClick={()=>void logout()}>SAIR</button></div></header>{access.canManage?<nav className="tw-nav" aria-label="Áreas da equipe">{([["grade","PROFESSORES DO MÊS"],["reservation","RESERVA DE SALA"],["occupation","OCUPAÇÃO"]] as const).map(([value,label])=><button key={value} className={mode===value?"is-active":""} onClick={()=>setMode(value)}>{label}</button>)}</nav>:null}<TeachingWorkspace key={mode} teacherMode={access.teacher} mode={mode}/><BuildRevision/></main>;
}
