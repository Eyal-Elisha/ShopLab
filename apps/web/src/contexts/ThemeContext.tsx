import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const PREFS_COOKIE = "shoplab_prefs";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  const getThemeFromCookie = () => {
    const cookies = document.cookie.split("; ");
    const prefsCookie = cookies.find((row) => row.startsWith(`${PREFS_COOKIE}=`));
    if (prefsCookie) {
      try {
        const value = decodeURIComponent(prefsCookie.split("=")[1]);
        const prefs = JSON.parse(atob(value));
        return prefs.theme === "dark" ? "dark" : "light";
      } catch (e) {
        // Not an error, might not be initialized yet
      }
    }
    return "light";
  };

  useEffect(() => {
    const initialTheme = getThemeFromCookie();
    setThemeState(initialTheme);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    try {
      // Persist to server (which updates the cookie)
      await api.callAnyApi("/api/user/me/preferences", "POST", { theme: newTheme });
      
      // Update local state AFTER successful server update to ensure cookie is set
      setThemeState(newTheme);
    } catch (error) {
      console.error("Failed to update preferences", error);
      throw error;
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
