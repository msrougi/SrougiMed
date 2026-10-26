import {z} from "zod";

// Only browser-vendor push services are accepted (never arbitrary HTTP targets).
export function allowedPushEndpoint(value:string) {
  try {
    if(/[\u0000-\u0020\u007f\\]/.test(value))return false;
    const url=new URL(value);
    return url.protocol==="https:" && !url.username && !url.password && !url.port && !url.hash &&
      (url.hostname==="fcm.googleapis.com" || url.hostname==="updates.push.services.mozilla.com" ||
       url.hostname==="web.push.apple.com" || /^[a-z0-9-]+\.(?:notify|wns)\.windows\.com$/.test(url.hostname));
  } catch {return false;}
}
export const pushEndpointSchema=z.string().max(2048).refine(allowedPushEndpoint,"Serviço de notificação não reconhecido.");
export const chatPushSchema=z.object({
  endpoint:pushEndpointSchema,
  keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)}).strict(),
  sound:z.boolean(),
}).strict();
export const CHAT_ALERT_BODY="Você tem uma nova mensagem no ChatMed. Abra o SrougiMed para ler.";
