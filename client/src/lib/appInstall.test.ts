import { describe, expect, it, vi } from "vitest";
import { createInstallController, installationPlatform, type InstallPromptEvent } from "./appInstall";

function browser(standalone = false) {
  const target = new EventTarget();
  const media = Object.assign(new EventTarget(), { matches: standalone });
  Object.assign(target, { navigator: {}, matchMedia: () => media });
  return { target, media, controller: createInstallController(target as Window) };
}
function offer(target: EventTarget, outcome: "accepted" | "dismissed" = "accepted") {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }),
  }) as InstallPromptEvent;
  target.dispatchEvent(event);
  return event;
}

describe("installation invitation", () => {
  it.each([
    ["iPhone", 0, "ios"], ["iPad", 0, "ios"], ["Macintosh", 5, "ios"],
    ["Macintosh", 0, "mac"], ["Android", 5, "android"], ["Windows NT 10.0", 0, "desktop"],
  ])("chooses guidance for %s with %s touch points", (ua, touch, expected) => {
    expect(installationPlatform(ua, touch)).toBe(expected);
  });
  it("retains an early browser offer, but only prompts after a user action", async () => {
    const { target, controller } = browser();
    const event = offer(target);
    expect(event.defaultPrevented).toBe(true);
    expect(controller.getSnapshot().prompt).toBe(event);
    expect(event.prompt).not.toHaveBeenCalled();
    expect(await controller.install()).toBe("accepted");
    expect(await controller.install()).toBeNull();
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });
  it("consumes dismissed and failed prompts so they cannot be reused", async () => {
    const { target, controller } = browser();
    offer(target, "dismissed");
    expect(await controller.install()).toBe("dismissed");
    const event = offer(target);
    vi.mocked(event.prompt).mockRejectedValueOnce(new Error("blocked"));
    await expect(controller.install()).rejects.toThrow("blocked");
    expect(await controller.install()).toBeNull();
  });
  it("hides installation in standalone mode and after appinstalled", () => {
    expect(browser(true).controller.getSnapshot().installed).toBe(true);
    const { target, controller } = browser();
    offer(target);
    const changed = vi.fn();
    const unsubscribe = controller.subscribe(changed);
    target.dispatchEvent(new Event("appinstalled"));
    expect(controller.getSnapshot()).toEqual({ installed: true, prompt: null });
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
  it("observes switching to a standalone window", () => {
    const { target, media, controller } = browser();
    offer(target);
    media.dispatchEvent(Object.assign(new Event("change"), { matches: true }));
    expect(controller.getSnapshot()).toEqual({ installed: true, prompt: null });
  });
});
