export const DESKTOP_ONLY_ERROR = "Esta conta permite acesso somente por computador. O acesso por celular ou tablet está bloqueado.";

// Account logins explicitly restricted by the application owner.
const desktopOnlyLogins = new Set(["bia"]);
export function requiresDesktop(username: string | null | undefined) {
  return desktopOnlyLogins.has((username ?? "").trim().toLocaleLowerCase("pt-BR"));
}

export const isMobileAgent = (agent: string) =>
  /android|iphone|ipad|ipod|mobile|windows phone|iemobile|opera mini|blackberry|silk\/|kindle/i.test(agent);

export function isMobileRequest(headers: Record<string, string | string[] | undefined>) {
  return isMobileAgent(String(headers["user-agent"] ?? "")) ||
    headers["sec-ch-ua-mobile"] === "?1" || headers["x-srougi-device"] === "mobile";
}
