export type ChatAlertPreferences={sound:boolean;push:boolean};
export function readChatAlertPreferences(userId:number):ChatAlertPreferences {
  try {const value=JSON.parse(localStorage.getItem(`chatmed-alerts:${userId}`)||"{}");return {sound:value.sound!==false,push:value.push===true};}
  catch{return {sound:true,push:false};}
}
export function saveChatAlertPreferences(userId:number,value:ChatAlertPreferences) {
  try{localStorage.setItem(`chatmed-alerts:${userId}`,JSON.stringify(value));}catch{}
}
export type IncomingThread={peerId:number|null;lastIncomingId?:number;unread:number};
// Compare incoming IDs, not the unread total: reading another thread must not
// hide a new arrival, and sending your own message must not trigger a chime.
export function incomingCursor(threads:IncomingThread[]) {
  return new Map(threads.map(thread=>[String(thread.peerId),thread.lastIncomingId || 0]));
}
export function hasNewIncoming(previous:Map<string,number>,threads:IncomingThread[]) {
  return threads.some(thread=>thread.unread>0 && (thread.lastIncomingId||0)>(previous.get(String(thread.peerId))||0));
}
let audio:AudioContext|null=null;
export const CHAT_ALERT_DEADLINE_MS=20000;
export function chatAlertStep<T>(operation:()=>Promise<T>,stage:string,deadline=Date.now()+CHAT_ALERT_DEADLINE_MS,maxMs=8000):Promise<T> {
  const end=Math.min(deadline,Date.now()+maxMs);
  const failure=()=>new Error(`Tempo esgotado ao ${stage}. Tente novamente. O som dentro do ChatMed pode ser usado independentemente dos avisos externos.`);
  if(end<=Date.now())return Promise.reject(failure());
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(failure()),end-Date.now());
    try {
      operation().then(value=>{clearTimeout(timer);if(Date.now()>=end)reject(failure());else resolve(value);},error=>{clearTimeout(timer);reject(error);});
    }catch(error){clearTimeout(timer);reject(error);}
  });
}
export async function unlockChatSound() {
  try {
    const Audio=window.AudioContext || (window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Audio)return false;
    if(!audio || audio.state==="closed")audio=new Audio();
    if(audio.state!=="running")await chatAlertStep(()=>audio!.resume(),"liberar o áudio",Date.now()+1500,1500);
    return audio.state==="running";
  }catch{return false;}
}
export function playChatSound() {
  if(!audio || audio.state!=="running")return false;
  try {
    const start=audio.currentTime;
    [660,880].forEach((frequency,index)=>{
      const oscillator=audio!.createOscillator(),gain=audio!.createGain();
      oscillator.frequency.value=frequency;oscillator.connect(gain);gain.connect(audio!.destination);
      const at=start+index*.16;
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.1,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.15);
      oscillator.start(at);oscillator.stop(at+.16);
    });return true;
  }catch{return false;}
}
export function pushSupported() {
  return window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}
export async function playNewChatSound(userId:number,messageId:number) {
  const play=()=>{
    const key=`chatmed-last-sound:${userId}`;
    try{if(Number(localStorage.getItem(key))>=messageId)return;}catch{}
    if(playChatSound())try{localStorage.setItem(key,String(messageId));}catch{}
  };
  // Serialize across tabs so one message produces at most one local chime.
  if(navigator.locks)await navigator.locks.request(`chatmed-sound:${userId}`,play);
  else play();
}
export async function chatPushRegistration(deadline=Date.now()+CHAT_ALERT_DEADLINE_MS,onStage?:(stage:string)=>void) {
  onStage?.("Preparando o serviço de notificações");
  const registration=await chatAlertStep(()=>navigator.serviceWorker.register("/chatmed-sw.js?v=1",{scope:"/",updateViaCache:"none"}),"preparar o serviço de notificações",deadline);
  if(registration.active?.state==="activated")return registration;
  onStage?.("Aguardando a ativação do serviço de notificações");
  let cleanup=()=>{};
  try {
    // Wait for this registration, not navigator.serviceWorker.ready (which
    // never rejects and may wait forever for another registration/scope).
    await chatAlertStep(()=>new Promise<void>((resolve,reject)=>{
      const workers=new Set<ServiceWorker>();
      const changed=()=>{
        for(const worker of [registration.installing,registration.waiting,registration.active])if(worker && !workers.has(worker)){
          workers.add(worker);worker.addEventListener("statechange",changed);
        }
        if(registration.active?.state==="activated")resolve();
        else if(workers.size && Array.from(workers).every(worker=>worker.state==="redundant"))reject(new Error("O navegador não conseguiu iniciar o serviço de notificações. Atualize a página e tente novamente."));
      };
      cleanup=()=>{registration.removeEventListener("updatefound",changed);workers.forEach(worker=>worker.removeEventListener("statechange",changed));};
      registration.addEventListener("updatefound",changed);changed();
    }),"ativar o serviço de notificações",deadline);
    return registration;
  }finally{cleanup();}
}
export function pushKeyBytes(value:string) {
  const text=atob(value.replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(text,character=>character.charCodeAt(0));
}
