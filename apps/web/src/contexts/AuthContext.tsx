import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, extractApiError, type AuthUser } from "@/lib/api";

interface AuthContextType {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface LoginResult {
  success: boolean;
  message: string;
  challengeLogin?: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    api.getProfile()
      .then((response) => {
        setUser(response.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setIsReady(true));
  }, []);

  const login = async (username: string, password: string, rememberMe = false) => {
    try {
      const payload = { username, password, rememberMe };
      const response = await api.login(payload);
      if (!response.user) {
        return {
          success: false,
          challengeLogin: true,
          message: response.message || "",
        };
      }
      setUser(response.user);
      return { success: true, message: "Login successful" };
    } catch (error) {
      return { success: false, message: extractApiError(error) };
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      const response = await api.register({ username, email, password });
      setUser(response.user);
      return { success: true, message: "Registration successful" };
    } catch (error) {
      return { success: false, message: extractApiError(error) };
    }
  };

  const logout = async () => {
    setUser(null);
    await api.logout().catch(() => undefined);
  };

  const value = useMemo(() => ({
    user,
    setUser,
    login,
    register,
    logout,
    isAdmin: user?.role === "admin",
    isReady,
  }), [user, isReady]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
