"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { usd } from "@/lib/format";
import { AmlBadge } from "./AmlBadge";
import { Icon } from "./Icon";

export function Header() {
  const { user, loading, logout, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menu, setMenu] = useState(false);

  // refresh user on mount so cash stays fresh after trades
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <header className="sticky top-0 z-40 bg-white/85 dark:bg-ink-950/85 backdrop-blur border-b border-ink-100 dark:border-ink-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Inicio de Pulso">
            <span className="text-accent-500"><Icon name="logo" className="w-6 h-6"/></span>
            <span className="font-semibold tracking-tight">Pulso</span>
            <span className="hidden sm:inline-block text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400">
              Vista previa
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-2">
            <NavLink href="/">Mercados</NavLink>
            <NavLink href="/portfolio">Portafolio</NavLink>
            {user && <NavLink href="/markets/new">Proponer</NavLink>}
            {user?.is_admin && <NavLink href="/admin">Admin</NavLink>}
            <NavLink href="/compliance">Cumplimiento</NavLink>
          </nav>

          <div className="flex-1" />

          {user && (
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-ink-50 dark:bg-ink-900 border border-ink-100 dark:border-ink-800">
              <Icon name="wallet" className="w-4 h-4 text-ink-500 dark:text-ink-400"/>
              <div className="text-sm">
                <span className="text-ink-500 dark:text-ink-400">Saldo</span>{" "}
                <span className="num font-medium">{usd(user.cash)}</span>
              </div>
            </div>
          )}

          <AmlBadge />

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-9 h-9 grid place-items-center rounded-lg hover:bg-ink-50 dark:hover:bg-ink-900"
            aria-label="Cambiar tema"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} className="w-4 h-4"/>
          </button>

          {loading ? (
            <div className="h-9 w-20 rounded-lg bg-ink-50 dark:bg-ink-900 animate-pulse" />
          ) : user ? (
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)}
                      className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900 text-sm font-medium flex items-center gap-2">
                <Icon name="user" className="w-4 h-4"/>
                <span className="hidden sm:inline">{user.handle}</span>
                <Icon name="chevron-down" className="w-3.5 h-3.5"/>
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 shadow-lg overflow-hidden">
                  <Link href="/portfolio" onClick={() => setMenu(false)}
                        className="block px-3 py-2 text-sm hover:bg-ink-50 dark:hover:bg-ink-800">Mi portafolio</Link>
                  {user.is_admin && (
                    <Link href="/admin" onClick={() => setMenu(false)}
                          className="block px-3 py-2 text-sm hover:bg-ink-50 dark:hover:bg-ink-800">Admin</Link>
                  )}
                  <button onClick={() => { setMenu(false); logout(); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-ink-50 dark:hover:bg-ink-800 flex items-center gap-2 border-t border-ink-100 dark:border-ink-800">
                    <Icon name="logout" className="w-3.5 h-3.5"/> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="h-9 px-3 grid place-items-center rounded-lg text-sm font-medium hover:bg-ink-50 dark:hover:bg-ink-900">Ingresar</Link>
              <Link href="/register" className="h-9 px-3 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium hover:opacity-90">Crear cuenta</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}
          className="px-3 h-9 rounded-lg text-sm font-medium text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 hover:bg-ink-50 dark:hover:bg-ink-900 grid place-items-center">
      {children}
    </Link>
  );
}
