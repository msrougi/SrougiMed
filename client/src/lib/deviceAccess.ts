import { isMobileAgent } from "@shared/deviceAccess";

export function deviceAccessHint() {
  const info = navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } };
  // iPadOS can identify itself as a Mac in desktop browsing mode.
  const iPadDesktop = info.platform === "MacIntel" && info.maxTouchPoints > 1;
  return isMobileAgent(info.userAgent) || info.userAgentData?.mobile ||
    info.userAgentData?.platform === "Android" || iPadDesktop ? "mobile" : "desktop";
}
