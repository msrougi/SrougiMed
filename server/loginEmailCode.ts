import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { accountFingerprint, agentHash, clientIp, fingerprint, makeEmailProof, networkDecision, observedNetwork, type NetworkUser } from "./networkAccess";
import { assertDeviceAccess } from "./deviceAccess";
import { OFFICE_ONLY_ERROR, hasNetworkRule } from "../shared/networkAccess";

import {secondFactorEnabled,trustedDeviceStore} from "./trustedDevices";

export type CodeMail = {to:string;code:string;challengeId:string};
export async function sendLoginCode(mail:CodeMail) {
  if(!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM)throw new Error("AUTH_EMAIL_NOT_CONFIGURED");
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":`srougi-login-${mail.challengeId}`},
    body:JSON.stringify({from:process.env.AUTH_EMAIL_FROM,to:[mail.to],subject:"Seu código de acesso ao SrougiMed",text:`Seu código de acesso ao SrougiMed é: ${mail.code}\n\nEle expira em 5 minutos e só pode ser usado uma vez. Nunca compartilhe este código. Se não foi você, ignore este e-mail e avise o administrador.`}),
  });
  if(!response.ok)throw new Error("AUTH_EMAIL_DELIVERY_FAILED");
}
const invalid=()=>new TRPCError({code:"BAD_REQUEST",message:"Código inválido ou expirado. Confira o código ou entre novamente para solicitar outro."});
const digest=(id:string,code:string)=>fingerprint(`email-code:${id}:${code}`);
export class LoginEmailCodeStore {
  constructor(private pool:Pick<Pool,"getConnection">,private deliver:(mail:CodeMail)=>Promise<void>=sendLoginCode){}

  async start(user:NetworkUser,req:Request) {
    const email=z.string().email().safeParse(user.email);
    const ip=clientIp(req);
    if(!email.success)throw new TRPCError({code:"FORBIDDEN",message:"Peça ao administrador para confirmar seu e-mail no cadastro antes de acessar o sistema."});
    if(!ip && !secondFactorEnabled())throw new TRPCError({code:"FORBIDDEN",message:"Não foi possível validar sua conexão. Entre em contato com o administrador."});
    const id=randomBytes(32).toString("hex"),code=String(randomInt(0,1_000_000)).padStart(6,"0");
    const db=await this.pool.getConnection();
    try{
      await db.query("DELETE FROM srougi_login_codes WHERE expiresAt < DATE_SUB(NOW(3),INTERVAL 1 DAY) LIMIT 1000");
      await db.beginTransaction();
      const [current]=await db.query<RowDataPacket[]>("SELECT id,password,email FROM users WHERE id=? FOR UPDATE",[user.id]);
      if(!current[0] || accountFingerprint(current[0] as any)!==accountFingerprint(user))throw invalid();
      const [recent]=await db.query<RowDataPacket[]>("SELECT COUNT(*) AS total,TIMESTAMPDIFF(SECOND,MAX(createdAt),NOW(3)) AS secondsSinceLatest FROM srougi_login_codes WHERE userId=? AND createdAt>DATE_SUB(NOW(3),INTERVAL 15 MINUTE)",[user.id]);
      if(Number(recent[0].total)>=5 || (recent[0].secondsSinceLatest!==null && Number(recent[0].secondsSinceLatest)<60))throw new TRPCError({code:"TOO_MANY_REQUESTS",message:"Aguarde antes de solicitar outro código. Você pode pedir até 5 códigos em 15 minutos."});
      await db.query("UPDATE srougi_login_codes SET consumed=1 WHERE userId=? AND consumed=0",[user.id]);
      await db.query("INSERT INTO srougi_login_codes(id,userId,codeHash,sourceIp,agentHash,accountHash,expiresAt) VALUES(?,?,?,?,?,?,DATE_ADD(NOW(3),INTERVAL 5 MINUTE))",[id,user.id,digest(id,code),ip || "",agentHash(req),accountFingerprint(user)]);
      await db.commit();
      try {await this.deliver({to:email.data,code,challengeId:id});await db.query("UPDATE srougi_login_codes SET ready=1 WHERE id=? AND consumed=0",[id]);}
      catch {await db.query("UPDATE srougi_login_codes SET consumed=1 WHERE id=?",[id]);throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Não foi possível enviar o código. Aguarde um minuto e tente novamente ou fale com o administrador."});}
      const [local,domain]=email.data.split("@");
      return {success:false as const,requiresCode:true as const,challengeId:id,emailHint:`${local.slice(0,1)}***@${domain}`,expiresIn:300,trustAvailable:secondFactorEnabled()};
    }catch(error){try{await db.rollback();}catch{}throw error;}finally{db.release();}
  }

  async verify(id:string,code:string,req:Request) {
    const db=await this.pool.getConnection();
    try{
      const [who]=await db.query<RowDataPacket[]>("SELECT userId FROM srougi_login_codes WHERE id=?",[id]);
      if(!who.length)throw invalid();
      await db.beginTransaction();
      const [users]=await db.query<RowDataPacket[]>("SELECT * FROM users WHERE id=? FOR UPDATE",[who[0].userId]);
      const user=users[0];
      const [rows]=await db.query<RowDataPacket[]>("SELECT *,expiresAt>NOW(3) AS alive FROM srougi_login_codes WHERE id=? FOR UPDATE",[id]);
      const row=rows[0];
      const valid=row && user && row.alive && row.ready && !row.consumed && row.attempts<5 &&
        (secondFactorEnabled() || row.sourceIp===clientIp(req)) && row.agentHash===agentHash(req) && row.accountHash===accountFingerprint(user as any) &&
        timingSafeEqual(Buffer.from(row.codeHash,"hex"),Buffer.from(digest(id,code),"hex"));
      if(!valid){
        if(row && !row.consumed)await db.query("UPDATE srougi_login_codes SET attempts=attempts+1,consumed=IF(attempts>=5,1,consumed) WHERE id=?",[id]);
        // Invalid attempts must commit rather than roll back the attempt counter.
        await db.commit();throw invalid();
      }
      assertDeviceAccess(user as NetworkUser,req.headers);
      if(networkDecision(user as any,req)==="deny")throw new TRPCError({code:"FORBIDDEN",message:OFFICE_ONLY_ERROR});
      await db.query("UPDATE srougi_login_codes SET consumed=1 WHERE id=?",[id]);
      const proof=makeEmailProof(user as any,req);
      await db.commit();return {user,proof};
    }catch(error){try{await db.rollback();}catch{}throw error;}finally{db.release();}
  }
}
export async function emailCodeStore() {
  const db=await getDb();
  if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Autenticação indisponível. Tente novamente."});
  return new LoginEmailCodeStore(db.$client.promise());
}
export async function beginNetworkLogin(user:NetworkUser,req:Request) {
  if(process.env.NODE_ENV==="production" && hasNetworkRule(user.username))console.info("[access-network]",JSON.stringify({login:user.username,at:new Date().toISOString(),candidates:observedNetwork(req)}));
  const decision=networkDecision(user,req);
  if(decision==="deny")throw new TRPCError({code:"FORBIDDEN",message:OFFICE_ONLY_ERROR});
  if(decision==="code"){
    if(secondFactorEnabled()){
      const id=await (await trustedDeviceStore()).fromCookie(user,req);
      if(id)return {trustedProof:{...makeEmailProof(user,req),trustedDeviceId:id}};
    }
    return (await emailCodeStore()).start(user,req);
  }
  return null;
}
