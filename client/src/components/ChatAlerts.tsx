import {useCallback,useEffect,useRef,useState} from "react";
import {Bell} from "lucide-react";
import {trpc} from "@/lib/trpc";
import {Button} from "./ui/button";
import {Popover,PopoverTrigger,PopoverContent} from "./ui/popover";
import {CHAT_ALERT_BODY} from "@shared/chatAlerts";
import {readChatAlertPreferences,saveChatAlertPreferences,unlockChatSound,playChatSound,playNewChatSound,pushSupported,chatPushRegistration,pushKeyBytes,incomingCursor,hasNewIncoming,chatAlertStep,CHAT_ALERT_DEADLINE_MS,type IncomingThread} from "@/lib/chatAlerts";

export default function useChatAlerts({userId,group,threads,unread,onActivity,onOpen}:{
  userId:number;group:string|null|undefined;threads:IncomingThread[]|undefined;unread:number;
  onActivity:()=>void;onOpen:()=>void;
}) {
  const utils=trpc.useUtils();
  const [preferences,setPreferences]=useState(()=>readChatAlertPreferences(userId));
  const [panel,setPanel]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
  const [active,setActive]=useState(false);
  const cursor=useRef<{group:string|null|undefined;ids:Map<string,number>}|null>(null);
  const activity=useRef(onActivity),open=useRef(onOpen);activity.current=onActivity;open.current=onOpen;
  const subscribe=useCallback(async(sound:boolean,onStage?:(stage:string)=>void)=>{
    const deadline=Date.now()+CHAT_ALERT_DEADLINE_MS;
    const step=<T,>(operation:()=>Promise<T>,stage:string,maxMs?:number)=>{onStage?.(stage);return chatAlertStep(operation,stage,deadline,maxMs);};
    const registration=await chatPushRegistration(deadline,onStage);
    const {publicKey}=await step(()=>utils.client.chatAlerts.publicKey.query(),"obter a configuração dos avisos");
    let subscription=await step(()=>registration.pushManager.getSubscription(),"verificar a assinatura deste aparelho");
    const existingKey=subscription?.options.applicationServerKey;
    const key=pushKeyBytes(publicKey);
    if(subscription && existingKey && new Uint8Array(existingKey).join()!==key.join()) {
      await step(()=>subscription!.unsubscribe(),"renovar a assinatura deste aparelho");subscription=null;
    }
    subscription ??= await step(()=>registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}),"conectar ao serviço de notificações do navegador",12000);
    const value=subscription.toJSON();
    if(!value.endpoint || !value.keys)throw Error("O navegador não forneceu a assinatura dos avisos.");
    await step(()=>utils.client.chatAlerts.subscribe.mutate({endpoint:value.endpoint!,keys:{p256dh:value.keys!.p256dh,auth:value.keys!.auth},sound}),"salvar a ativação no SrougiMed");
    setActive(true);return registration;
  },[utils]);
  useEffect(()=>{
    // Unlock on an ordinary user gesture; never bypass browser autoplay rules.
    const unlock=()=>{void unlockChatSound();};
    window.addEventListener("pointerdown",unlock,{once:true});window.addEventListener("keydown",unlock,{once:true});
    return()=>{window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);};
  },[]);
  useEffect(()=>{
    if(preferences.push && pushSupported() && Notification.permission==="granted")void subscribe(preferences.sound).catch(()=>{setActive(false);setStatus("Não foi possível reconectar os avisos. Clique em ativar para tentar novamente.");});
  },[userId]);
  useEffect(()=>{
    const listener=(event:MessageEvent)=>{
      if(event.data?.type==="chatmed:new-message")activity.current();
      if(event.data?.type==="chatmed:open")open.current();
    };
    navigator.serviceWorker?.addEventListener("message",listener);
    if(new URLSearchParams(location.search).get("chatmed")==="1")open.current();
    return()=>navigator.serviceWorker?.removeEventListener("message",listener);
  },[]);
  useEffect(()=>{
    if(!threads)return;
    if(cursor.current && cursor.current.group===group && hasNewIncoming(cursor.current.ids,threads)) {
      if(preferences.sound && (!active || document.visibilityState==="visible"))void playNewChatSound(userId,Math.max(...threads.map(thread=>thread.lastIncomingId || 0)));
    }
    cursor.current={group,ids:incomingCursor(threads)};
  },[threads,group,preferences.sound,active]);
  useEffect(()=>{
    const original=document.title.replace(/^\(\d+\) /,"");
    document.title=unread?`(${unread}) ${original}`:original;
    const badge=navigator as Navigator & {setAppBadge?:(count:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};
    try {void (unread?badge.setAppBadge?.(unread):badge.clearAppBadge?.())?.catch(()=>{});}catch{}
    return()=>{document.title=original;try{void badge.clearAppBadge?.()?.catch(()=>{});}catch{}};
  },[unread]);
  async function enable() {
    setBusy(true);setStatus("");
    // Start audio while the click still counts as a user gesture. Its bounded
    // result must never prevent push registration after browser permission.
    if(preferences.sound)void unlockChatSound();
    try {
      if(!pushSupported())throw Error("Este navegador não oferece push. No iPhone/iPad, adicione o SrougiMed à Tela de Início e abra pelo ícone.");
      // Permission request happens directly from the user's click.
      const permission=Notification.permission==="granted"?"granted":await chatAlertStep(()=>Notification.requestPermission(),"aguardar a permissão do navegador",Date.now()+60000,60000);
      if(permission!=="granted")throw Error(permission==="denied"?"Notificações bloqueadas. Libere-as nas configurações do navegador para srougi.app.":"Permissão não concedida. Você pode tentar novamente.");
      await subscribe(preferences.sound,stage=>setStatus(stage+"…"));
      const next={...preferences,push:true};setPreferences(next);saveChatAlertPreferences(userId,next);
      setStatus("Avisos ativados neste aparelho. Clique em Testar aviso para conferir o som. O sistema precisa permitir notificações e estar conectado à internet.");
    }catch(error){setStatus(error instanceof Error?error.message:"Não foi possível ativar os avisos.");}
    finally{setBusy(false);}
  }
  async function disable() {
    setBusy(true);try {
      const deadline=Date.now()+CHAT_ALERT_DEADLINE_MS;
      const registration=await chatAlertStep(()=>navigator.serviceWorker?.getRegistration("/") || Promise.resolve(undefined),"localizar os avisos deste aparelho",deadline);
      const subscription=registration?await chatAlertStep(()=>registration.pushManager.getSubscription(),"localizar a assinatura deste aparelho",deadline):null;
      if(subscription){await chatAlertStep(()=>utils.client.chatAlerts.unsubscribe.mutate({endpoint:subscription.endpoint}),"desativar os avisos no SrougiMed",deadline);await chatAlertStep(()=>subscription.unsubscribe(),"desativar os avisos no navegador",deadline);}
      const next={...preferences,push:false};setPreferences(next);saveChatAlertPreferences(userId,next);setActive(false);setStatus("Avisos externos desativados neste aparelho.");
    }catch{setStatus("Não foi possível desativar. Tente novamente.");}finally{setBusy(false);}
  }
  async function toggleSound() {
    const next={...preferences,sound:!preferences.sound};
    setPreferences(next);saveChatAlertPreferences(userId,next);
    if(next.sound){const ready=await unlockChatSound();if(ready)playChatSound();else setStatus("O navegador ainda não liberou o áudio. Clique em Testar aviso. O som não depende de ativar os avisos externos.");}
    if(active)try{await subscribe(next.sound);}catch{setStatus("Som local atualizado; tente ativar novamente para atualizar o som dos avisos externos.");}
  }
  async function test() {
    const ready=await unlockChatSound();if(preferences.sound && ready)playChatSound();
    if(active)try{const registration=await chatPushRegistration();await chatAlertStep(()=>registration.showNotification("SrougiMed · Teste",{body:CHAT_ALERT_BODY,icon:"/icons/app-192.png",tag:"chatmed-test",silent:true,data:{url:"/dashboard?chatmed=1"}}),"mostrar o aviso de teste");}catch{setStatus("O sistema não permitiu mostrar o aviso. Confira as permissões.");return;}
    setStatus(ready?"Teste executado. Se não ouviu, confira o volume e a opção de som.":"Som indisponível neste navegador; os avisos visuais continuam ativos.");
  }
  return <Popover open={panel} onOpenChange={setPanel}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="icon" aria-label="Avisos do ChatMed" title="Avisos do ChatMed" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-brand"><Bell className="h-4 w-4" aria-hidden="true"/></Button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} aria-label="Configurações de avisos do ChatMed" className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto rounded-xl text-xs">
      <h3 className="text-sm font-semibold">Avisos do ChatMed</h3>
      <p>Os avisos mostram apenas “Nova mensagem”, sem conteúdo ou dados de pacientes.</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void toggleSound()} aria-pressed={preferences.sound}>Som {preferences.sound?"ligado":"desligado"}</Button>
        <Button size="sm" disabled={busy} onClick={()=>void (active?disable():enable())}>{busy?"Aguarde…":active?"Desativar avisos neste aparelho":"Ativar avisos neste aparelho"}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={()=>void test()}>Testar aviso</Button></div>
      <p className="text-muted-foreground">No iPhone/iPad, adicione à Tela de Início. Modo Foco, permissões e volume do aparelho podem silenciar os avisos. Ao sair da conta, os avisos desse login são removidos.</p>
      {status && <p role="status">{status}</p>}
    </PopoverContent>
  </Popover>;
}
