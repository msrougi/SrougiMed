export type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function installationPlatform(userAgent: string, touchPoints = 0) {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  return "desktop";
}

// Created at startup: browsers may offer installation before the dashboard loads.
export function createInstallController(target: Window) {
  const media = target.matchMedia("(display-mode: standalone)");
  let snapshot = {
    installed: media.matches || Boolean((target.navigator as Navigator & { standalone?: boolean }).standalone),
    prompt: null as InstallPromptEvent | null,
  };
  const listeners = new Set<() => void>();
  const publish = (next: typeof snapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  target.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    publish({ ...snapshot, prompt: event as InstallPromptEvent });
  });
  target.addEventListener("appinstalled", () => publish({ installed: true, prompt: null }));
  media.addEventListener("change", event => {
    publish({ ...snapshot, installed: event.matches, prompt: event.matches ? null : snapshot.prompt });
  });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async install() {
      const event = snapshot.prompt;
      if (!event || snapshot.installed) return null;
      // A browser prompt can only be used once, even if dismissed or rejected.
      publish({ ...snapshot, prompt: null });
      await event.prompt();
      return (await event.userChoice).outcome;
    },
  };
}

export const appInstall = typeof window === "undefined" ? null : createInstallController(window);
