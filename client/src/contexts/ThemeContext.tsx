import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";
import { isThemePreference, readThemePreference, resolveTheme, THEME_STORAGE_KEY, type Theme, type ThemePreference } from "@/lib/theme";

interface ThemeContextType {
  theme: Theme;
  preference: ThemePreference;
  setTheme: (preference: ThemePreference) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children, defaultTheme = "light", switchable = false }: {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
  switchable?: boolean;
}) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (!switchable || typeof window === "undefined") return defaultTheme;
    try { return readThemePreference(window.localStorage, defaultTheme); }
    catch { return defaultTheme; }
  });
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = resolveTheme(preference, systemDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!switchable) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      try { setPreference(readThemePreference(window.localStorage, defaultTheme)); }
      catch { setPreference(defaultTheme); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [defaultTheme, switchable]);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b1519" : "#087e78");
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    if (!switchable || !isThemePreference(next)) return;
    setPreference(next);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); }
    catch { /* Keep the choice for this session when storage is unavailable. */ }
  }, [switchable]);

  return <ThemeContext.Provider value={{ theme, preference, setTheme, switchable,
    toggleTheme: switchable ? () => setTheme(theme === "dark" ? "light" : "dark") : undefined,
  }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
