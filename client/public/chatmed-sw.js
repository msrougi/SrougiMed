// Notifications only: no page, API response or patient data is cached.
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  event.waitUntil((async()=>{
    let data={};try{data=event.data.json();}catch{}
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    await self.registration.showNotification("SrougiMed · ChatMed",{
      body:"Você tem uma nova mensagem no ChatMed. Abra o SrougiMed para ler.",
      icon:"/icons/app-192.png",badge:"/icons/app-192.png",tag:"chatmed-messages",
      silent:Boolean(data.silent) || windows.some(client=>client.visibilityState==="visible"),
      data:{url:"/dashboard?chatmed=1"},
    });
    windows.forEach(client=>client.postMessage({type:"chatmed:new-message"}));
  })());
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const app=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(app){app.postMessage({type:"chatmed:open"});await app.focus();}
    else await self.clients.openWindow("/dashboard?chatmed=1");
  })());
});
