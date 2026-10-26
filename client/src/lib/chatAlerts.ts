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
export async function unlockChatSound() {
  try {
    const Audio=window.AudioContext || (window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Audio)return false;
    audio ??= new Audio();await audio.resume();return audio.state==="running";
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
export async function chatPushRegistration() {
  await navigator.serviceWorker.register("/chatmed-sw.js?v=1",{scope:"/",updateViaCache:"none"});
  return navigator.serviceWorker.ready;
}
export function pushKeyBytes(value:string) {
  const text=atob(value.replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(text,character=>character.charCodeAt(0));
}
