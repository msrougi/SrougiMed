import { TRPCError } from "@trpc/server";
import { DESKTOP_ONLY_ERROR, isMobileRequest, requiresDesktop } from "../shared/deviceAccess";

export function assertDeviceAccess(user: { username?: string | null }, headers: Record<string,string | string[] | undefined>) {
  // All accounts use the same native email 2FA flow. Historical Bia-only
  // device restrictions do not apply in this mode.
  if(process.env.NATIVE_EMAIL_LOGIN==="true")return;
  if (requiresDesktop(user.username) && isMobileRequest(headers)) {
    throw new TRPCError({ code: "FORBIDDEN", message: DESKTOP_ONLY_ERROR });
  }
}
