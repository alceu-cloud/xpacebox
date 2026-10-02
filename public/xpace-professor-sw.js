// This app records attendance only online. Never cache authenticated API data.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>XPACE Professor</title><body style="font-family:Arial;padding:40px;color:#7435d9"><h1>Você está sem conexão.</h1><p>Conecte-se à internet e atualize para registrar sua aula. Nenhuma presença foi enviada.</p><button onclick="location.reload()">Tentar novamente</button>',{headers:{'Content-Type':'text/html;charset=utf-8'}})));
});
