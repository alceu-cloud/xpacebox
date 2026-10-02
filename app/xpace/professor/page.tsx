'use client';
import {useEffect,useState,type FormEvent} from 'react';
import TeachingWorkspace,{schoolToday,teachingApi} from '@/components/xpace-dance/TeachingWorkspace';
import BuildRevision from '@/components/BuildRevision';
import {supabase} from '@/lib/supabase';
import '@/components/xpace-dance/teaching.css';
export default function ProfessorPage(){
 const[authorized,setAuthorized]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 async function check(){setLoading(true);try{const{data}=await supabase.auth.getSession();if(!data.session)return;const access=await teachingApi<{teacher:boolean}>('/api/xpace/aulas?month='+schoolToday().slice(0,7));if(!access.teacher){setNotice('USE UMA CONTA DE PROFESSOR VINCULADA À ESCOLA.');return;}setAuthorized(true);}catch(e){setNotice(e instanceof Error?e.message:'NÃO FOI POSSÍVEL VALIDAR SEU ACESSO.');}finally{setLoading(false);}}
 useEffect(()=>{void check();if('serviceWorker'in navigator)void navigator.serviceWorker.register('/xpace-professor-sw.js',{scope:'/xpace/professor'}).catch(()=>{});},[]);
 async function login(e:FormEvent){e.preventDefault();setBusy(true);setNotice('');const{error}=await supabase.auth.signInWithPassword({email,password});setPassword('');if(error)setNotice('E-MAIL OU SENHA INVÁLIDOS.');else await check();setBusy(false);}
 async function logout(){await supabase.auth.signOut();setAuthorized(false);setNotice('');}
 if(loading)return <main className="xd-loading">CONFERINDO SEU ACESSO…</main>;
 if(!authorized)return <main className="tw-professor-login"><form onSubmit={login}><img src="/brands/xpace-logo.png" alt="XPACE"/><h1>Espaço do professor.</h1><p>Entre para confirmar suas aulas, consultar a ocupação e reservar uma sala.</p>{notice?<p role="alert">{notice}</p>:null}<label>E-MAIL<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>SENHA<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="tw-primary" disabled={busy}>{busy?'ENTRANDO…':'ENTRAR'}</button><p>O acesso é criado pela equipe da escola.</p><BuildRevision/></form></main>;
 return <main className="tw-professor"><header className="tw-professor-header"><img src="/brands/xpace-logo.png" alt="XPACE"/><div><button className="tw-secondary" onClick={()=>window.location.reload()}>ATUALIZAR</button><button className="tw-secondary" onClick={()=>void logout()}>SAIR</button></div></header><TeachingWorkspace teacherMode/><BuildRevision/></main>;
}
