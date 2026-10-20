import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import jwtModule from "jsonwebtoken";
import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import { COOKIE_NAME } from "../shared/const";
import { EMAIL_CODE_REQUIRED, OFFICE_ONLY_ERROR, hasNetworkRule, networkLogin } from "../shared/networkAccess";

export type NetworkUser = { id: number; username?: string | null; email?: string | null; password?: string | null };
export type EmailProof = { trustedDeviceId?: string; emailCodeAt: number; emailCodeIp: string; emailCodeAgent: string; emailCodeAccount: string };
export const networkPolicyEnabled = () => process.env.OFFICE_ACCESS_POLICY_ENABLED === "true";
export const authSecret = () => process.env.JWT_SECRET || ENV.cookieSecret;
export const fingerprint = (value: string) => createHmac("sha256",authSecret()).update(value).digest("hex");
export const agentHash = (req: Request) => createHash("sha256").update(String(req.headers["user-agent"] || "")).digest("hex");
export const accountFingerprint = (user: NetworkUser) => fingerprint(`${user.id}:${user.password || ""}:${user.email || ""}`);

export function normalizeIp(value: string | undefined | null): string | null {
  if (!value || value.includes(",") || value.includes("%")) return null;
  const ip=value.trim();
  if (isIP(ip)===4) return ip;
  if (isIP(ip)!==6) return null;
  const canonical=new URL(`http://[${ip}]/`).hostname.slice(1,-1).toLowerCase();
  const mapped=canonical.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
  if (mapped) {const n=parseInt(mapped[1],16)*65536+parseInt(mapped[2],16);return [n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join(".");}
  return canonical;
}

export function observedNetwork(req: Request) {
  return { socket:req.socket?.remoteAddress || null,
    connecting:req.headers["cf-connecting-ip"] || null,
    trueClient:req.headers["true-client-ip"] || null,
    forwarded:req.headers["x-forwarded-for"] || null };
}
export function clientIp(req: Request) {
  // No left-most X-Forwarded-For guessing. The edge-overwritten header must be
  // verified by the operator on the actual Render/Cloudflare deployment first.
  const header=process.env.OFFICE_CLIENT_IP_HEADER;
  if (process.env.OFFICE_IP_HEADER_VERIFIED!=="true" || !["true-client-ip","cf-connecting-ip"].includes(header || "")) return null;
  const value=req.headers[header!];
  return typeof value==="string" ? normalizeIp(value) : null;
}
export function networkDecision(user: NetworkUser,req: Request): "allow" | "code" | "deny" {
  if(process.env.SECOND_FACTOR_ENABLED==="true")return "code";
  if (!networkPolicyEnabled() || !hasNetworkRule(user.username)) return "allow";
  const ip=clientIp(req),office=normalizeIp(process.env.OFFICE_PUBLIC_IP);
  if (ip && office && ip===office) return "allow";
  return networkLogin(user.username)==="bia" ? "deny" : "code";
}
export function makeEmailProof(user:NetworkUser,req:Request):EmailProof {
  const ip=clientIp(req);
  if (!ip && process.env.SECOND_FACTOR_ENABLED!=="true") throw new TRPCError({code:"FORBIDDEN",message:"Não foi possível validar sua conexão. Entre em contato com o administrador."});
  return {emailCodeAt:Date.now(),emailCodeIp:ip || "",emailCodeAgent:agentHash(req),emailCodeAccount:accountFingerprint(user)};
}
export function assertNetworkAccess(user:NetworkUser,req:Request) {
  // Global second factor is enforced asynchronously by assertSecondFactorAccess.
  if(process.env.SECOND_FACTOR_ENABLED==="true")return;
  const decision=networkDecision(user,req);
  if(decision==="allow")return;
  if(decision==="deny")throw new TRPCError({code:"FORBIDDEN",message:OFFICE_ONLY_ERROR});
  let proof:Partial<EmailProof>={};
  try{
    const raw=(req.headers.cookie || "").split(";").map(piece=>piece.trim()).find(piece=>piece.startsWith(COOKIE_NAME+"="))?.slice(COOKIE_NAME.length+1);
    if(raw)proof=(jwtModule as any).verify(decodeURIComponent(raw),authSecret());
  }catch{}
  const age=Date.now()-Number(proof.emailCodeAt);
  if (!proof.emailCodeAt || age<0 || age>12*60*60*1000 || proof.emailCodeIp!==clientIp(req) || proof.emailCodeAgent!==agentHash(req) || proof.emailCodeAccount!==accountFingerprint(user)) {
    throw new TRPCError({code:"FORBIDDEN",message:EMAIL_CODE_REQUIRED});
  }
}

export function validateNetworkConfiguration() {
  if(process.env.SECOND_FACTOR_ENABLED==="true"){
    if(!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM || !authSecret())throw new Error("SECOND_FACTOR_EMAIL_NOT_CONFIGURED");
    return;
  }
  if(!networkPolicyEnabled())return;
  if(!normalizeIp(process.env.OFFICE_PUBLIC_IP) || process.env.OFFICE_IP_HEADER_VERIFIED!=="true" || !["true-client-ip","cf-connecting-ip"].includes(process.env.OFFICE_CLIENT_IP_HEADER || "")) throw new Error("OFFICE_NETWORK_NOT_VERIFIED");
  if(!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM || !authSecret())throw new Error("OFFICE_EMAIL_NOT_CONFIGURED");
}
