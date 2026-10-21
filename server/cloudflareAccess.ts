import {accessLoginFlowEnabled,isBiaPasswordOnly,finishCloudflareLogin,ACCESS_CALLBACK} from "./cloudflareLoginFlow";
import {isSharedOwnerEmail} from "./accessEmailPolicy";
import jwtModule from "jsonwebtoken";
import {ENV} from "./_core/env";
import {accountFingerprint,type NetworkUser} from "./networkAccess";
import {COOKIE_NAME} from "../shared/const";
import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from "jose";
import type {Request,RequestHandler,Express} from "express";
import {TRPCError} from "@trpc/server";
import {z} from "zod";

export const cloudflareAccessEnabled=()=>process.env.CF_ACCESS_ENABLED==="true";
export type AccessConfig={issuer:string;audience:string};
export type AccessIdentity={email:string;subject:string;expiresAt?:number};
const emailSchema=z.string().trim().email().max(320);
export const accessEmail=(value:unknown)=>{const email=emailSchema.safeParse(value);return email.success?email.data.toLowerCase():null;};
const denied=()=>new TRPCError({code:"FORBIDDEN",message:"Confirme seu acesso pela Cloudflare antes de entrar no sistema."});
export function accessConfiguration():AccessConfig {
  const issuer=(process.env.CF_ACCESS_TEAM_DOMAIN || "").trim().replace(/\/$/,"");
  const audience=(process.env.CF_ACCESS_AUD || "").trim();
  if(!/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer) || !/^[a-f0-9]{64}$/i.test(audience))throw Error("CLOUDFLARE_ACCESS_NOT_CONFIGURED");
  return {issuer,audience};
}
let keyCache:{issuer:string;keys:JWTVerifyGetKey}|undefined;
function publicKeys(config:AccessConfig) {
  if(keyCache?.issuer!==config.issuer)keyCache={issuer:config.issuer,keys:createRemoteJWKSet(new URL(config.issuer+"/cdn-cgi/access/certs"),{timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:600000})};
  return keyCache!.keys;
}
export async function verifyAccessToken(token:string,config=accessConfiguration(),keys:JWTVerifyGetKey=publicKeys(config)):Promise<AccessIdentity> {
  const {payload}=await jwtVerify(token,keys,{algorithms:["RS256"],issuer:config.issuer,audience:config.audience,requiredClaims:["exp","iat","sub","email"],maxTokenAge:"31d",clockTolerance:5});
  const email=accessEmail(payload.email);
  if(!email || typeof payload.sub!=="string" || !payload.sub)throw denied();
  return {email,subject:payload.sub,expiresAt:payload.exp};
}
const identities=new WeakMap<Request,Promise<AccessIdentity>>();
export function requestAccessIdentity(req:Request) {
  let pending=identities.get(req);
  if(!pending){
    pending=(async()=>{
      const token=req.headers["cf-access-jwt-assertion"];
      if(typeof token!=="string" || !token || token.length>16384)throw denied();
      try{return await verifyAccessToken(token);}catch{throw denied();}
    })();
    identities.set(req,pending);
  }
  return pending;
}
async function accountIds(email:string) {
  const {getDb}=await import("./db");const db=await getDb();
  if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Autenticação indisponível."});
  const [rows]=await db.$client.promise().query<any[]>("SELECT id,username FROM users WHERE LOWER(TRIM(email))=? LIMIT 3",[email]);
  return rows.map(row=>({id:Number(row.id),username:row.username as string | null}));
}
export async function assertAccessAccount(user:{id:number;email?:string|null},identity:AccessIdentity,lookup:(email:string)=>Promise<(number | {id:number;username?:string|null})[]>=accountIds) {
  const email=accessEmail(user.email);
  if(!email || email!==identity.email)throw new TRPCError({code:"FORBIDDEN",message:"O e-mail confirmado na Cloudflare não corresponde a este usuário. Troque o acesso da Cloudflare para usar outra conta."});
  const matches=await lookup(email);
  const accounts=matches.map(match=>typeof match==="number"?{id:match}:match);
  const ownsAccount=accounts.some(account=>account.id===user.id);
  if(!ownsAccount || (accounts.length!==1 && !isSharedOwnerEmail(email,accounts)))throw new TRPCError({code:"FORBIDDEN",message:"Peça ao administrador para conferir o e-mail autorizado nesta conta."});
}
export async function assertAccessUser(user:{id:number;email?:string|null},req:Request) {
  if(!cloudflareAccessEnabled())return null;
  const identity=await requestAccessIdentity(req);await assertAccessAccount(user,identity);
  return identity;
}
export function assertAccessSession(user:NetworkUser,req:Request,identity:AccessIdentity) {
  try{
    const raw=(req.headers.cookie || "").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE_NAME+"="))?.slice(COOKIE_NAME.length+1);
    const session=(jwtModule as any).verify(decodeURIComponent(raw || ""),ENV.cookieSecret,{algorithms:["HS256"]});
    if(session.userId===user.id && session.accessAccount===accountFingerprint(user) && session.accessSubject===identity.subject)return;
  }catch{}
  throw new TRPCError({code:"FORBIDDEN",message:"Entre novamente com usuário e senha para confirmar sua sessão no SrougiMed."});
}
// Protect all origin routes (including direct Render URL and OAuth), not just the login form.
export const cloudflareAccessGate:RequestHandler=(req,res,next)=>{
  if(!cloudflareAccessEnabled()){next();return;}
  if(accessLoginFlowEnabled() && req.path!==ACCESS_CALLBACK){
    // Only tRPC exposes application data; its per-account middleware requires a completed session.
    // Block OAuth and any future unguarded raw API while allowing the public login shell/assets.
    if(req.path.startsWith("/api/") && !/^\/api\/trpc(?:\/|$)/.test(req.path)) {res.sendStatus(403);return;}
    next();return;
  }
  void requestAccessIdentity(req).then(()=>next(),()=>{
    res.setHeader("Cache-Control","no-store");
    res.status(403).type("text/plain").send("Acesso não autorizado. Entre pelo endereço oficial do SrougiMed e confirme o acesso pela Cloudflare.");
  });
};
export function assertAccessAccountsReady(accounts:{id?:number;username?:string|null;role?:string;email?:string|null}[]) {
  const required=accounts.filter(account=>!isBiaPasswordOnly(account as any));
  if(required.some(account=>!accessEmail(account.email)))throw Error("CLOUDFLARE_ACCESS_ACCOUNT_EMAIL_MISSING");
  const emails=accounts.map(account=>accessEmail(account.email)).filter(Boolean);
  for(const email of Array.from(new Set(emails))){
    const matches=accounts.filter(account=>accessEmail(account.email)===email);
    if(matches.length>1 && !isSharedOwnerEmail(email!,matches))throw Error("CLOUDFLARE_ACCESS_ACCOUNT_EMAIL_DUPLICATE");
  }
  if(accessLoginFlowEnabled() && process.env.CF_ACCESS_BIA_USER_ID && accounts.filter(account=>isBiaPasswordOnly(account as any)).length!==1)throw Error("CLOUDFLARE_ACCESS_BIA_ACCOUNT_NOT_READY");
}

export function mountCloudflareAccess(app:Pick<Express,"get"|"use">) {
  // The only public probe contains no account, database or application data.
  app.get("/healthz",(_req,res)=>{res.setHeader("Cache-Control","no-store");res.status(200).type("text/plain").send("ok");});
  app.use(cloudflareAccessGate);
  app.get(ACCESS_CALLBACK,finishCloudflareLogin);
}
