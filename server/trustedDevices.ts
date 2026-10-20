import {randomBytes,timingSafeEqual} from "node:crypto";
import type {Pool,RowDataPacket} from "mysql2/promise";
import type {Request} from "express";
import jwt from "jsonwebtoken";
import {TRPCError} from "@trpc/server";
import {COOKIE_NAME} from "../shared/const";
import {EMAIL_CODE_REQUIRED} from "../shared/networkAccess";
import {accountFingerprint,agentHash,authSecret,fingerprint,type NetworkUser,type EmailProof} from "./networkAccess";

export const TRUST_COOKIE="__Host-srougi_trusted";
export const TRUST_DAYS=30;
export const secondFactorEnabled=()=>process.env.SECOND_FACTOR_ENABLED==="true";
export const trustCookieOptions={httpOnly:true,secure:true,sameSite:"strict" as const,path:"/",maxAge:TRUST_DAYS*86400000};
function cookie(req:Request,name:string) {
  const raw=(req.headers.cookie || "").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1);
  try{return raw?decodeURIComponent(raw):null;}catch{return null;}
}
export class TrustedDeviceStore {
  constructor(private pool:Pick<Pool,"getConnection">){}
  async create(user:NetworkUser,req:Request) {
    const id=randomBytes(32).toString("hex"),secret=randomBytes(32).toString("hex");
    const db=await this.pool.getConnection();
    try{
      await db.beginTransaction();
      const [rows]=await db.query<RowDataPacket[]>("SELECT id,password,email FROM users WHERE id=? FOR UPDATE",[user.id]);
      if(!rows[0] || accountFingerprint(rows[0] as any)!==accountFingerprint(user))throw new Error("TRUST_ACCOUNT_CHANGED");
      await db.query("DELETE FROM srougi_trusted_devices WHERE expiresAt<NOW(3) LIMIT 1000");
      await db.query("INSERT INTO srougi_trusted_devices(id,userId,tokenHash,accountHash,agentHash,expiresAt) VALUES(?,?,?,?,?,DATE_ADD(NOW(3),INTERVAL 30 DAY))",[id,user.id,fingerprint("trusted:"+secret),accountFingerprint(user),agentHash(req)]);
      await db.commit();
      return {token:id+"."+secret,id};
    }catch(error){await db.rollback();throw error;}finally{db.release();}
  }
  async valid(user:NetworkUser,req:Request,id:string,secret?:string) {
    if(!/^[a-f0-9]{64}$/.test(id))return false;
    const db=await this.pool.getConnection();
    try {
      const [rows]=await db.query<RowDataPacket[]>("SELECT tokenHash,accountHash,agentHash FROM srougi_trusted_devices WHERE id=? AND userId=? AND expiresAt>NOW(3) AND revoked=0",[id,user.id]);
      const row=rows[0];
      if(!row || row.accountHash!==accountFingerprint(user) || row.agentHash!==agentHash(req))return false;
      return secret===undefined || (/^[a-f0-9]{64}$/.test(secret) && timingSafeEqual(Buffer.from(row.tokenHash,"hex"),Buffer.from(fingerprint("trusted:"+secret),"hex")));
    }finally{db.release();}
  }
  async fromCookie(user:NetworkUser,req:Request) {
    const value=cookie(req,TRUST_COOKIE);
    if(!value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value))return null;
    const [id,secret]=value.split(".");
    return await this.valid(user,req,id,secret)?id:null;
  }
  async revoke(userId:number) {
    const db=await this.pool.getConnection();
    try{
      await db.beginTransaction();
      await db.query("SELECT id FROM users WHERE id=? FOR UPDATE",[userId]);
      await db.query("UPDATE srougi_trusted_devices SET revoked=1 WHERE userId=?",[userId]);
      await db.commit();
    }catch(error){await db.rollback();throw error;}finally{db.release();}
  }
}
export async function trustedDeviceStore() {
  const {getDb}=await import("./db");const db=await getDb();
  if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Autenticação indisponível."});
  return new TrustedDeviceStore(db.$client.promise());
}
export async function assertSecondFactorAccess(user:NetworkUser,req:Request) {
  if(!secondFactorEnabled())return;
  let proof:Partial<EmailProof>={};
  try{proof=jwt.verify(cookie(req,COOKIE_NAME)||"",authSecret(),{algorithms:["HS256"]}) as any;}catch{}
  const age=Date.now()-Number(proof.emailCodeAt);
  let valid=Boolean(proof.emailCodeAt && age>=0 && proof.emailCodeAgent===agentHash(req) && proof.emailCodeAccount===accountFingerprint(user));
  if(valid)valid=proof.trustedDeviceId?await (await trustedDeviceStore()).valid(user,req,proof.trustedDeviceId):age<=12*60*60*1000;
  if(!valid)throw new TRPCError({code:"FORBIDDEN",message:EMAIL_CODE_REQUIRED});
}
