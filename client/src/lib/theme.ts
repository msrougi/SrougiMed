export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
export const THEME_STORAGE_KEY = "srougimed-theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(storage: Pick<Storage, "getItem">, fallback: ThemePreference = "light"): ThemePreference {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY) ?? storage.getItem("theme");
    return isThemePreference(value) ? value : fallback;
  } catch { return fallback; }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
