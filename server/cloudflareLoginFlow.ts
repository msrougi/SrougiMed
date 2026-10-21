import jwt from "jsonwebtoken";
import { parse } from "cookie";
import type { Request, Response, RequestHandler } from "express";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";
import { EMAIL_CODE_REQUIRED, networkLogin } from "../shared/networkAccess";
import { accountFingerprint, agentHash, type NetworkUser } from "./networkAccess";
import { assertDeviceAccess } from "./deviceAccess";
import { accessEmail, assertAccessAccount, requestAccessIdentity, cloudflareAccessEnabled } from "./cloudflareAccess";
import { recordAccessIp } from "./accessIpLog";

export const ACCESS_CALLBACK = "/auth/cloudflare";
export const ACCESS_PENDING_COOKIE = "__Host-srougi_access_pending";
export const accessLoginFlowEnabled = () => cloudflareAccessEnabled() && process.env.CF_ACCESS_LOGIN_FLOW === "true";
type LoginUser = NetworkUser & { name?: string | null; role?: string };
const pendingOptions = { httpOnly:true, secure:true, sameSite:"lax" as const, path:"/" };
const denied = () => new TRPCError({code:"FORBIDDEN",message:EMAIL_CODE_REQUIRED});

export function validateAccessLoginFlow() {
  if (!accessLoginFlowEnabled()) return;
  const origin = process.env.SROUGI_PUBLIC_ORIGIN || "";
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw Error("CLOUDFLARE_ACCESS_PUBLIC_ORIGIN_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password) throw Error("CLOUDFLARE_ACCESS_PUBLIC_ORIGIN_INVALID");
  const id = process.env.CF_ACCESS_BIA_USER_ID;
  if (id && !/^[1-9][0-9]*$/.test(id)) throw Error("CLOUDFLARE_ACCESS_BIA_ID_INVALID");
}

// An exemption is tied to the existing account ID, login AND ordinary role.
// Renaming another account to "bia" or promoting Bia never grants this exception.
export function isBiaPasswordOnly(user: LoginUser) {
  return accessLoginFlowEnabled() && String(user.id) === process.env.CF_ACCESS_BIA_USER_ID && networkLogin(user.username) === "bia" && user.role === "user";
}

function readToken(req: Request, name: string, purpose: string) {
  try {
    const token = parse(req.headers.cookie || "")[name];
    const payload = jwt.verify(token || "", ENV.cookieSecret, {algorithms:["HS256"],audience:purpose,issuer:"srougimed",maxAge:purpose==="access-pending"?"5m":"7d"});
    if (typeof payload !== "object" || typeof payload.exp !== "number") throw denied();
    return payload;
  } catch { throw denied(); }
}

export function startCloudflareLogin(user: LoginUser, req: Request, res: Response) {
  validateAccessLoginFlow();
  if (!accessEmail(user.email)) throw new TRPCError({code:"FORBIDDEN",message:"Peça ao administrador para configurar o e-mail desta conta."});
  // Password has already been checked. This short-lived token cannot authenticate API calls.
  res.clearCookie(COOKIE_NAME, {...getSessionCookieOptions(req),maxAge:-1});
  const token = jwt.sign({userId:user.id,account:accountFingerprint(user),agent:agentHash(req)}, ENV.cookieSecret,
    {algorithm:"HS256",issuer:"srougimed",audience:"access-pending",expiresIn:"5m"});
  res.cookie(ACCESS_PENDING_COOKIE,token,{...pendingOptions,maxAge:5*60*1000});
  return {success:false as const,requiresCode:false as const,requiresAccess:true as const,redirectUrl:process.env.SROUGI_PUBLIC_ORIGIN!+ACCESS_CALLBACK};
}

export function issueSelectiveSession(user: LoginUser, req: Request, res: Response, identity?: {email:string;subject:string;expiresAt?:number}) {
  const now = Math.floor(Date.now()/1000);
  const expiresAt = identity ? Math.min(identity.expiresAt || 0,now+7*86400) : now+7*86400;
  if (expiresAt <= now || (!identity && !isBiaPasswordOnly(user))) throw denied();
  assertDeviceAccess(user,req.headers);
  const token = jwt.sign({userId:user.id,username:user.username,role:user.role,accessAccount:accountFingerprint(user),
    accessMethod:identity?"cloudflare-login":"password-only-bia",accessSubject:identity?.subject,accessEmail:identity?.email,accessAgent:agentHash(req)},ENV.cookieSecret,
    {algorithm:"HS256",issuer:"srougimed",audience:"access-session",expiresIn:expiresAt-now});
  res.clearCookie(ACCESS_PENDING_COOKIE,pendingOptions);
  res.cookie(COOKIE_NAME,token,{...getSessionCookieOptions(req),maxAge:(expiresAt-now)*1000});
  recordAccessIp(user,req,"login");
  return {success:true as const,requiresCode:false as const,user:{id:user.id,username:user.username,name:user.name,role:user.role}};
}

export async function assertSelectiveSession(user: LoginUser, req: Request) {
  const payload = readToken(req,COOKIE_NAME,"access-session");
  if (payload.userId !== user.id || payload.accessAccount !== accountFingerprint(user) || payload.accessAgent !== agentHash(req)) throw denied();
  assertDeviceAccess(user,req.headers);
  if (payload.accessMethod === "password-only-bia") {
    if (!isBiaPasswordOnly(user)) throw denied();
    return;
  }
  if (payload.accessMethod !== "cloudflare-login" || typeof payload.accessEmail !== "string" || typeof payload.accessSubject !== "string" || !payload.accessSubject) throw denied();
  await assertAccessAccount(user,{email:payload.accessEmail,subject:payload.accessSubject});
}

export const finishCloudflareLogin: RequestHandler = (req,res) => {
  res.setHeader("Cache-Control","no-store");
  if (!accessLoginFlowEnabled()) { res.sendStatus(404); return; }
  void (async()=>{
    const pending = readToken(req,ACCESS_PENDING_COOKIE,"access-pending");
    if (!Number.isSafeInteger(pending.userId) || pending.agent !== agentHash(req)) throw denied();
    const {getUserById} = await import("./db");
    const user = await getUserById(pending.userId);
    if (!user || pending.account !== accountFingerprint(user) || isBiaPasswordOnly(user)) throw denied();
    const identity = await requestAccessIdentity(req);
    await assertAccessAccount(user,identity);
    issueSelectiveSession(user,req,res,identity);
    res.redirect(303,"/dashboard");
  })().catch(()=>{
    res.clearCookie(ACCESS_PENDING_COOKIE,pendingOptions);
    res.status(403).type("text/plain").send("Não foi possível confirmar o acesso. Volte ao login do SrougiMed e use na Cloudflare o e-mail cadastrado para o seu usuário.");
  });
};
