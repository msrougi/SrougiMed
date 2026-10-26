import {createECDH,createHash,createHmac} from "node:crypto";
import jwt from "jsonwebtoken";
import webpush from "web-push";
import {z} from "zod";
import {TRPCError} from "@trpc/server";
import {router,protectedProcedure} from "./_core/trpc";
import {ENV} from "./_core/env";
import {getDb} from "./db";
import {accountFingerprint} from "./networkAccess";
import {COOKIE_NAME} from "../shared/const";
import {chatPushSchema,pushEndpointSchema,CHAT_ALERT_BODY} from "../shared/chatAlerts";
import type {Request} from "express";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const session=(req:Pick<Request,"headers">)=>(req.headers.cookie || "").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE_NAME+"="))?.slice(COOKIE_NAME.length+1) || "";
// Domain-separated derivation keeps VAPID stable across restarts without another
// deployment secret. Only the public key is returned to the browser.
export function chatVapidKeys(secret=ENV.cookieSecret) {
  if(!secret || secret.length<16)throw Error("CHAT_PUSH_SECRET_MISSING");
  const ecdh=createECDH("prime256v1");
  for(let n=0;n<10;n++) {
    const candidate=createHmac("sha256",secret).update(`srougimed:web-push:v1:${n}`).digest();
    try {ecdh.setPrivateKey(candidate);return {privateKey:candidate.toString("base64url"),publicKey:ecdh.getPublicKey().toString("base64url")};}catch{}
  }
  throw Error("CHAT_PUSH_KEY_INVALID");
}
async function pool() {
  const db=await getDb();
  if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Avisos indisponíveis. Tente novamente."});
  return db.$client.promise();
}
export async function removeChatPushSession(req:Pick<Request,"headers">) {
  const raw=session(req);if(!raw)return;
  await (await pool()).query("DELETE FROM chatmed_push_subscriptions WHERE sessionHash=?",[hash(raw)]);
}
export const chatAlertsRouter=router({
  publicKey:protectedProcedure.query(()=>({publicKey:chatVapidKeys().publicKey})),
  subscribe:protectedProcedure.input(chatPushSchema).mutation(async({ctx,input})=>{
    const raw=session(ctx.req);
    let expiresAt:Date,trustedDeviceId:string|null=null;
    try {
      const proof=jwt.verify(decodeURIComponent(raw),ENV.cookieSecret,{algorithms:["HS256"]}) as jwt.JwtPayload;
      if(proof.userId!==ctx.user.id || !proof.exp)throw Error();
      trustedDeviceId=typeof proof.trustedDeviceId==="string"?proof.trustedDeviceId:null;
      expiresAt=new Date(Math.min(proof.exp*1000,proof.emailCodeAt && !trustedDeviceId?Number(proof.emailCodeAt)+12*60*60*1000:Infinity));
    } catch {throw new TRPCError({code:"UNAUTHORIZED",message:"Entre novamente para ativar os avisos."});}
    // Reject invalid EC points before persisting any subscription.
    try {const key=createECDH("prime256v1");key.generateKeys();key.computeSecret(Buffer.from(input.keys.p256dh,"base64url"));}
    catch {throw new TRPCError({code:"BAD_REQUEST",message:"Assinatura de notificação inválida."});}
    const db=await pool();
    await db.query("DELETE FROM chatmed_push_subscriptions WHERE expiresAt<NOW()");
    const [count]=await db.query<any[]>("SELECT COUNT(*) AS n FROM chatmed_push_subscriptions WHERE userId=? AND endpointHash<>?",[ctx.user.id,hash(input.endpoint)]);
    if(Number(count[0].n)>=8)throw new TRPCError({code:"BAD_REQUEST",message:"Limite de oito aparelhos. Desative os avisos em um aparelho antigo."});
    await db.query(`INSERT INTO chatmed_push_subscriptions(endpointHash,userId,endpoint,p256dh,auth,sound,accountHash,sessionHash,trustedDeviceId,expiresAt)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE userId=VALUES(userId),endpoint=VALUES(endpoint),p256dh=VALUES(p256dh),
      auth=VALUES(auth),sound=VALUES(sound),accountHash=VALUES(accountHash),sessionHash=VALUES(sessionHash),trustedDeviceId=VALUES(trustedDeviceId),expiresAt=VALUES(expiresAt)`,
      [hash(input.endpoint),ctx.user.id,input.endpoint,input.keys.p256dh,input.keys.auth,input.sound,accountFingerprint(ctx.user),hash(raw),trustedDeviceId,expiresAt]);
    return {success:true};
  }),
  unsubscribe:protectedProcedure.input(z.object({endpoint:pushEndpointSchema}).strict()).mutation(async({ctx,input})=>{
    await (await pool()).query("DELETE FROM chatmed_push_subscriptions WHERE endpointHash=? AND userId=?",[hash(input.endpoint),ctx.user.id]);
    return {success:true};
  }),
});

export async function dispatchChatPush() {
  const db=await (await pool()).getConnection();
  let locked=false;
  try {
    const [lock]=await db.query<any[]>("SELECT GET_LOCK('srougi_chat_push_dispatch',0) AS ok");
    locked=Number(lock[0].ok)===1;if(!locked)return;
    await db.query("DELETE FROM chatmed_push_subscriptions WHERE expiresAt<NOW()");
    await db.query("DELETE FROM chatmed_push_events WHERE createdAt<DATE_SUB(NOW(),INTERVAL 15 MINUTE)");
    await db.query("DELETE FROM chatmed_push_deliveries WHERE createdAt<DATE_SUB(NOW(),INTERVAL 1 DAY)");
    const [events]=await db.query<any[]>("SELECT messageId FROM chatmed_push_events WHERE attempts<3 ORDER BY messageId LIMIT 20");
    const vapid=chatVapidKeys();
    for(const event of events) {
      const [targets]=await db.query<any[]>(`SELECT s.*,u.id,u.username,u.email,u.password,u.role FROM chatmed_push_subscriptions s
        JOIN users u ON u.id=s.userId JOIN chatmed_messages m ON m.id=? JOIN chatmed_conversations c ON c.id=m.conversationId
        LEFT JOIN chatmed_reads r ON r.conversationId=c.id AND r.userId=u.id
        LEFT JOIN srougi_trusted_devices t ON t.id=s.trustedDeviceId AND t.userId=u.id
        LEFT JOIN chatmed_push_deliveries d ON d.messageId=m.id AND d.endpointHash=s.endpointHash
        WHERE u.chatGroup=c.groupName AND u.id<>m.senderId AND m.id>COALESCE(r.lastReadId,0)
        AND (s.trustedDeviceId IS NULL OR (t.revoked=0 AND t.expiresAt>NOW() AND t.accountHash=s.accountHash))
        AND ((c.memberA=0 AND c.memberB=0) OR c.memberA=u.id OR c.memberB=u.id) AND d.messageId IS NULL`,[event.messageId]);
      let failed=false;
      await Promise.all(targets.map(async target=>{
        if(target.accountHash!==accountFingerprint(target)) {
          await db.query("DELETE FROM chatmed_push_subscriptions WHERE endpointHash=?",[target.endpointHash]);return;
        }
        try {
          await webpush.sendNotification({endpoint:target.endpoint,keys:{p256dh:target.p256dh,auth:target.auth}},
            JSON.stringify({messageId:Number(event.messageId),body:CHAT_ALERT_BODY,silent:!target.sound}),
            {TTL:300,timeout:5000,urgency:"normal",vapidDetails:{...vapid,subject:"https://srougi.app"}});
          await db.query("INSERT IGNORE INTO chatmed_push_deliveries(messageId,endpointHash) VALUES(?,?)",[event.messageId,target.endpointHash]);
        } catch(error) {
          const status=(error as {statusCode?:number}).statusCode;
          if(status===404 || status===410)await db.query("DELETE FROM chatmed_push_subscriptions WHERE endpointHash=?",[target.endpointHash]);
          else failed=true; // Do not log endpoints, keys, provider bodies or message text.
        }
      }));
      if(failed)await db.query("UPDATE chatmed_push_events SET attempts=attempts+1 WHERE messageId=?",[event.messageId]);
      else await db.query("DELETE FROM chatmed_push_events WHERE messageId=?",[event.messageId]);
    }
  } finally {
    if(locked)await db.query("SELECT RELEASE_LOCK('srougi_chat_push_dispatch')");
    db.release();
  }
}
export function startChatPushDispatcher() {
  let busy=false;
  const tick=async()=>{if(busy)return;busy=true;try{await dispatchChatPush();}catch{console.warn("[ChatMed] PUSH_DISPATCH_UNAVAILABLE");}finally{busy=false;}};
  const timer=setInterval(()=>void tick(),5000);timer.unref();void tick();
}
