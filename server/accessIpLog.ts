import type { Request } from "express";
import { clientIp, normalizeIp, type NetworkUser } from "./networkAccess";

// Operational diagnostics only. Unverified proxy headers never grant access.
export function accessIpRecord(user: NetworkUser, req: Request, event: "session" | "login") {
  const headerIp = (name: string) => {
    const value = req.headers[name];
    return typeof value === "string" && value.length <= 100 ? normalizeIp(value) : null;
  };
  const forwarded = req.headers["x-forwarded-for"];
  const candidates = {
    connecting: headerIp("cf-connecting-ip"),
    trueClient: headerIp("true-client-ip"),
    forwarded: typeof forwarded === "string" && forwarded.length <= 2048
      ? forwarded.split(",").slice(0, 8).map(normalizeIp).filter((ip): ip is string => !!ip) : [],
    socket: normalizeIp(req.socket?.remoteAddress),
  };
  const verifiedIp = clientIp(req);
  return {
    event, userId: user.id, login: user.username?.slice(0, 100) || null,
    verifiedIp, candidates,
  };
}

export function createAccessIpLogger(
  emit: (line: string) => void = line => console.info("[access-ip]", line),
  now: () => number = Date.now,
) {
  const recent = new Map<string, number>();
  const interval = 5 * 60 * 1000;
  return (user: NetworkUser, req: Request, event: "session" | "login" = "session") => {
    try {
      const record = accessIpRecord(user, req, event);
      const key = JSON.stringify({ ...record, event: undefined });
      const time = now(), previous = recent.get(key);
      if (event === "session" && previous !== undefined && time - previous < interval) return;
      if (recent.size >= 2000) {
        recent.forEach((seen, entry) => { if (time - seen >= interval) recent.delete(entry); });
        if (recent.size >= 2000) recent.delete(recent.keys().next().value!);
      }
      recent.set(key, time);
      emit(JSON.stringify({ at: new Date(time).toISOString(), ...record }));
    } catch {
      // A diagnostic failure must not prevent access to the application.
    }
  };
}

const write = createAccessIpLogger();
export function recordAccessIp(user: NetworkUser, req: Request, event: "session" | "login" = "session") {
  if (process.env.NODE_ENV === "production") write(user, req, event);
}
