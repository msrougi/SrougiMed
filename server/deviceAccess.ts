import { TRPCError } from "@trpc/server";
import { DESKTOP_ONLY_ERROR, isMobileRequest, requiresDesktop } from "../shared/deviceAccess";

export function assertDeviceAccess(user: { username?: string | null }, headers: Record<string,string | string[] | undefined>) {
  if (requiresDesktop(user.username) && isMobileRequest(headers)) {
    throw new TRPCError({ code: "FORBIDDEN", message: DESKTOP_ONLY_ERROR });
  }
}
