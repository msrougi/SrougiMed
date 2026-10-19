import { describe, expect, it } from "vitest";
import { readThemePreference, resolveTheme, THEME_STORAGE_KEY } from "./theme";

describe("theme preference", () => {
  it("keeps explicit choices regardless of the device theme", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("reads saved choices and supports the previous storage key", () => {
    const read = (values: Record<string,string>) => readThemePreference({getItem: key => values[key] ?? null});
    expect(read({[THEME_STORAGE_KEY]:"system",theme:"light"})).toBe("system");
    expect(read({theme:"dark"})).toBe("dark");
  });
  it("does not break login when storage is blocked or corrupted", () => {
    expect(readThemePreference({getItem: () => {throw new Error("denied");}})).toBe("light");
    expect(readThemePreference({getItem: () => "invalid"})).toBe("light");
    expect(readThemePreference({getItem: () => null})).toBe("light");
  });
});
