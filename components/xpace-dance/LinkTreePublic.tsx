'use client';
import { useEffect, useRef, type CSSProperties } from 'react';
import { CalendarDays, Camera, Link2, MessageCircle, ShoppingBag, Ticket } from 'lucide-react';
import type { LinkPage, TreeLink } from '@/lib/xpace/link-tree';
import './link-tree.css';
export const linkIcons={link:Link2,instagram:Camera,whatsapp:MessageCircle,calendar:CalendarDays,ticket:Ticket,store:ShoppingBag};
export default function LinkTreePublic({page,links,slug,preview=false}:{page:LinkPage;links:TreeLink[];slug?:string;preview?:boolean}) {
  const recordedView=useRef<string|null>(null);
  function record(linkId?:string) {
    if(preview||!slug) return;
    let visitorId:string;
    try { visitorId=localStorage.getItem('xpace-link-visitor')||crypto.randomUUID();localStorage.setItem('xpace-link-visitor',visitorId); }
    catch { return; } // With storage blocked, no persistent visitor identity is invented.
    const data=JSON.stringify({eventId:crypto.randomUUID(),visitorId,linkId});
    try { if(!navigator.sendBeacon(`/api/public/links/${slug}`,new Blob([data],{type:'application/json'}))) void fetch(`/api/public/links/${slug}`,{method:'POST',body:data,headers:{'Content-Type':'application/json'},keepalive:true}).catch(()=>{}); } catch { /* navigation remains usable */ }
  }
  useEffect(()=>{if(!preview&&slug&&recordedView.current!==slug){recordedView.current=slug;record();}},[slug,preview]); // preview never emits telemetry
  const color=page.appearance==='company'?'#7435d9':page.primary_color;
  const channels=/^#[a-f0-9]{6}$/i.test(color)?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255):[.45,.2,.85];
  const luminance=channels.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
  const ink=(1.05/(luminance+.05))>((luminance+.05)/.05)?'#ffffff':'#17131d';
  return <div className={`lt-public ${preview?'lt-public--preview':''} lt-theme-${page.theme}`} style={{'--lt-color':color,'--lt-ink':ink} as CSSProperties}>
    <div className="lt-public-content"><img className="lt-logo" src={page.logo_url} alt={page.title} referrerPolicy="no-referrer"/><h1>{page.title}</h1><p>{page.description}</p>
    <nav aria-label="Links da escola" className={`lt-buttons lt-buttons--${page.button_style}`}>{links.filter(l=>l.active).map(link=>{const Icon=linkIcons[link.icon]||Link2;return preview?<span className="lt-public-link" key={link.id}><Icon size={22}/><strong>{link.title}</strong></span>:<a key={link.id} className="lt-public-link" href={link.url} target="_blank" rel="noopener noreferrer" onClick={()=>record(link.id)}><Icon size={22}/><strong>{link.title}</strong></a>;})}</nav>
    {!links.some(l=>l.active)?<p className="lt-empty">Em breve, novos links por aqui.</p>:null}<footer>XPACE · MOVIMENTO QUE CONECTA</footer></div>
  </div>;
}
