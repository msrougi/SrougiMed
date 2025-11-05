import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function parseCookies(cookieHeader: string): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies.set(name, decodeURIComponent(value));
    }
  });
  
  return cookies;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Tentar autenticação customizada primeiro
    const { authenticateCustomToken } = await import("../db");
    const cookies = parseCookies(opts.req.headers.cookie || '');
    const token = cookies.get('app_session_id');
    
    if (token) {
      user = await authenticateCustomToken(token);
    }
    
    // Se falhar, tentar autenticação OAuth
    if (!user) {
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
