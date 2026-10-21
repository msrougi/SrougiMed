import jwt from "jsonwebtoken";
import {parse} from "cookie";
import type {Request,Response} from "express";
import {TRPCError} from "@trpc/server";
import {COOKIE_NAME} from "../shared/const";
import {accountFingerprint,agentHash,authSecret,type NetworkUser} from "./networkAccess";
import {assertAccessAccount,accessEmail} from "./cloudflareAccess";
import {assertDeviceAccess} from "./deviceAccess";
import {getSessionCookieOptions} from "./_core/cookies";

export const NATIVE_PENDING_COOKIE="__Host-srougi_email_pending";
export const nativePendingOptions={httpOnly:true,secure:true,sameSite:"strict" as const,path:"/"};
export const nativeEmailLoginEnabled=()=>process.env.NATIVE_EMAIL_LOGIN==="true" && process.env.SECOND_FACTOR_ENABLED==="true" && process.env.CF_ACCESS_ENABLED!=="true";
const denied=()=>new TRPCError({code:"UNAUTHORIZED",message:"Entre novamente com usuário e senha para solicitar um código."});

export function maskLoginEmail(email:string) {
  const [local,domain]=email.split("@");
  return local.slice(0,Math.min(2,Math.max(1,local.length-1)))+"*****@"+domain;
}
export async function assertNativeEmailAccount(user:NetworkUser) {
  const email=accessEmail(user.email);
  if(!email)throw new TRPCError({code:"FORBIDDEN",message:"Peça ao administrador para confirmar o e-mail desta conta."});
  await assertAccessAccount(user,{email,subject:"native-email-confirmation"});
}
export async function prepareNativeEmailLogin(user:NetworkUser,req:Request,res:Response) {
  if(!nativeEmailLoginEnabled())throw denied();
  await assertNativeEmailAccount(user);
  assertDeviceAccess(user,req.headers);
  const pending=jwt.sign({userId:user.id,account:accountFingerprint(user),agent:agentHash(req)},authSecret(),
    {algorithm:"HS256",issuer:"srougimed",audience:"native-email-pending",expiresIn:"5m"});
  res.clearCookie(COOKIE_NAME,{...getSessionCookieOptions(req),maxAge:-1});
  res.cookie(NATIVE_PENDING_COOKIE,pending,{...nativePendingOptions,maxAge:5*60*1000});
  return {success:false as const,requiresCode:false as const,requiresSendCode:true as const,emailHint:maskLoginEmail(accessEmail(user.email)!)};
}
export async function sendNativeEmailCode(req:Request) {
  if(!nativeEmailLoginEnabled())throw denied();
  let pending:jwt.JwtPayload;
  try {
    const raw=parse(req.headers.cookie || "")[NATIVE_PENDING_COOKIE];
    const payload=jwt.verify(raw || "",authSecret(),{algorithms:["HS256"],issuer:"srougimed",audience:"native-email-pending",maxAge:"5m"});
    if(typeof payload!=="object" || typeof payload.exp!=="number" || !Number.isSafeInteger(payload.userId) || payload.userId<=0 || payload.agent!==agentHash(req))throw denied();
    pending=payload;
  }catch{throw denied();}
  const {getUserById}=await import("./db");
  const user=await getUserById(pending.userId);
  if(!user || pending.account!==accountFingerprint(user))throw denied();
  assertDeviceAccess(user,req.headers);
  await assertNativeEmailAccount(user);
  const {emailCodeStore}=await import("./loginEmailCode");
  return (await emailCodeStore()).start(user,req);
}
