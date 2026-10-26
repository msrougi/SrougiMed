import {readFileSync} from "node:fs";
import vm from "node:vm";
import {describe,it,expect,vi} from "vitest";

function worker(windows:any[]=[]) {
  const handlers:Record<string,(event:any)=>void>={};
  const showNotification=vi.fn(async()=>{}),openWindow=vi.fn(async()=>{});
  vm.runInNewContext(readFileSync(new URL("../client/public/chatmed-sw.js",import.meta.url),"utf8"),{
    self:{location:{origin:"https://app.example.invalid"},addEventListener:(type:string,handler:any)=>handlers[type]=handler,
      registration:{showNotification},clients:{matchAll:async()=>windows,openWindow,claim:async()=>{}},skipWaiting:async()=>{}},URL,
  });
  return {showNotification,openWindow,async fire(type:string,event:any){let work:Promise<unknown>=Promise.resolve();handlers[type]({...event,waitUntil:(promise:Promise<unknown>)=>work=promise});await work;}};
}
describe("service worker de notificações",()=>{
  it("sempre mostra aviso genérico, sem conteúdo nem URLs fornecidos no payload",async()=>{
    const sw=worker();await sw.fire("push",{data:{json:()=>({body:"DADO PRIVADO",url:"https://other.invalid",silent:false})}});
    const [title,options]=sw.showNotification.mock.calls[0] as any;
    expect(title).toBe("SrougiMed · ChatMed");expect(JSON.stringify(options)).not.toMatch(/DADO PRIVADO|other.invalid/);
    expect(options.data.url).toBe("/dashboard?chatmed=1");expect(options.silent).toBe(false);
  });
  it("silencia aviso externo se a aplicação estiver visível e avisa a página",async()=>{
    const client={visibilityState:"visible",postMessage:vi.fn()};
    const sw=worker([client]);await sw.fire("push",{data:{json:()=>({})}});
    expect((sw.showNotification.mock.calls[0] as any)[1].silent).toBe(true);
    expect(client.postMessage).toHaveBeenCalledWith({type:"chatmed:new-message"});
  });
  it("clique abre somente o próprio aplicativo e não segue URL externa",async()=>{
    const sw=worker();const close=vi.fn();await sw.fire("notificationclick",{notification:{close,data:{url:"https://other.invalid"}}});
    expect(close).toHaveBeenCalled();expect(sw.openWindow).toHaveBeenCalledWith("/dashboard?chatmed=1");
  });
});
