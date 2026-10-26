// @vitest-environment jsdom
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {incomingCursor,hasNewIncoming,readChatAlertPreferences,saveChatAlertPreferences} from "./chatAlerts";
const api=vi.hoisted(()=>({key:vi.fn(),subscribe:vi.fn(),unsubscribe:vi.fn(),register:vi.fn(),permission:vi.fn()}));
const utils={client:{chatAlerts:{publicKey:{query:api.key},subscribe:{mutate:api.subscribe},unsubscribe:{mutate:api.unsubscribe}}}};
vi.mock("@/lib/trpc",()=>({trpc:{useUtils:()=>utils}}));
import useChatAlerts from "../components/ChatAlerts";
function Fixture({unread=2}:{unread?:number}) {
  return useChatAlerts({userId:1,group:"fixture",threads:[{peerId:null,unread,lastIncomingId:unread}],unread,onActivity:()=>{},onOpen:()=>{}});
}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();document.title="SrougiMed";});
afterEach(()=>{cleanup();delete (navigator as any).serviceWorker;vi.unstubAllGlobals();});
describe("alertas do ChatMed",()=>{
  it("detecta mensagem nova mesmo sem aumento do total e não alerta histórico ou envio próprio",()=>{
    const previous=incomingCursor([{peerId:null,lastIncomingId:10,unread:3}]);
    expect(hasNewIncoming(previous,[{peerId:null,lastIncomingId:10,unread:5}])).toBe(false);
    expect(hasNewIncoming(previous,[{peerId:null,lastIncomingId:11,unread:1}])).toBe(true);
    expect(hasNewIncoming(previous,[{peerId:null,lastIncomingId:11,unread:0}])).toBe(false);
  });
  it("isola preferências por conta e tolera armazenamento inválido",()=>{
    saveChatAlertPreferences(1,{sound:false,push:true});
    expect(readChatAlertPreferences(1)).toEqual({sound:false,push:true});
    expect(readChatAlertPreferences(2)).toEqual({sound:true,push:false});
    localStorage.setItem("chatmed-alerts:1","invalid");
    expect(readChatAlertPreferences(1)).toEqual({sound:true,push:false});
  });
  it("atualiza título, limpa contador e permite silenciar sem pedir permissão",()=>{
    const view=render(<Fixture/>);expect(document.title).toBe("(2) SrougiMed");
    fireEvent.click(screen.getByRole("button",{name:/Avisos do ChatMed/}));
    fireEvent.click(screen.getByRole("button",{name:"Som ligado"}));
    expect(screen.getByRole("button",{name:"Som desligado"})).toBeTruthy();
    expect(readChatAlertPreferences(1).sound).toBe(false);
    expect(api.permission).not.toHaveBeenCalled();
    view.rerender(<Fixture unread={0}/>);expect(document.title).toBe("SrougiMed");
  });
  it("explica o bloqueio de permissão sem cadastrar notificações",async()=>{
    vi.stubGlobal("isSecureContext",true);vi.stubGlobal("PushManager",function(){});
    vi.stubGlobal("Notification",{permission:"default",requestPermission:api.permission.mockResolvedValue("denied")});
    Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:{register:api.register,addEventListener:vi.fn(),removeEventListener:vi.fn()}});
    render(<Fixture/>);fireEvent.click(screen.getByRole("button",{name:/Avisos do ChatMed/}));
    fireEvent.click(screen.getByRole("button",{name:"Ativar avisos neste aparelho"}));
    await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("Notificações bloqueadas"));
    expect(api.register).not.toHaveBeenCalled();expect(api.subscribe).not.toHaveBeenCalled();
  });
  it("não solicita permissão automaticamente",()=>{
    vi.stubGlobal("Notification",{permission:"default",requestPermission:api.permission});
    render(<Fixture/>);expect(api.permission).not.toHaveBeenCalled();expect(api.subscribe).not.toHaveBeenCalled();
  });
  it("ativa só após clique, cadastra assinatura e permite desativar",async()=>{
    vi.stubGlobal("isSecureContext",true);vi.stubGlobal("PushManager",function(){});
    vi.stubGlobal("Notification",{permission:"default",requestPermission:api.permission.mockResolvedValue("granted")});
    const value={endpoint:"https://fcm.googleapis.com/wp/fixture",keys:{p256dh:"A".repeat(87),auth:"B".repeat(22)}};
    const subscription={endpoint:value.endpoint,toJSON:()=>value,unsubscribe:vi.fn(async()=>true)};
    const manager={getSubscription:vi.fn(async()=>null as any),subscribe:vi.fn(async()=>subscription)};
    const registration={pushManager:manager};
    Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:{register:api.register.mockResolvedValue(registration),ready:Promise.resolve(registration),getRegistration:async()=>registration,addEventListener:vi.fn(),removeEventListener:vi.fn()}});
    api.key.mockResolvedValue({publicKey:btoa("a".repeat(65))});api.subscribe.mockResolvedValue({success:true});api.unsubscribe.mockResolvedValue({success:true});
    render(<Fixture/>);expect(api.register).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:/Avisos do ChatMed/}));
    fireEvent.click(screen.getByRole("button",{name:"Ativar avisos neste aparelho"}));
    await screen.findByRole("button",{name:"Desativar avisos neste aparelho"});
    expect(api.subscribe).toHaveBeenCalledWith({...value,sound:true});
    expect(readChatAlertPreferences(1).push).toBe(true);
    manager.getSubscription.mockResolvedValue(subscription);
    fireEvent.click(screen.getByRole("button",{name:"Desativar avisos neste aparelho"}));
    await screen.findByRole("button",{name:"Ativar avisos neste aparelho"});
    expect(api.unsubscribe).toHaveBeenCalledWith({endpoint:value.endpoint});
    expect(subscription.unsubscribe).toHaveBeenCalled();expect(readChatAlertPreferences(1).push).toBe(false);
  });
});
