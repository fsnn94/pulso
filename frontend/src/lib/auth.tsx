"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokens, User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (b: { email: string; handle: string; password: string; accepted_disclaimer: boolean }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  user: null, loading: true,
  login: async () => {}, register: async () => {}, logout: () => {}, refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokens.get()) { setUser(null); setLoading(false); return; }
    try { setUser(await api.me()); }
    catch { tokens.clear(); setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.login({ email, password });
    tokens.set(access_token);
    await refresh();
  }, [refresh]);

  const register = useCallback(async (b: { email: string; handle: string; password: string; accepted_disclaimer: boolean }) => {
    const { access_token } = await api.register(b);
    tokens.set(access_token);
    await refresh();
  }, [refresh]);

  const logout = useCallback(() => { tokens.clear(); setUser(null); }, []);

  return <Ctx.Provider value={{ user, loading, login, register, logout, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
