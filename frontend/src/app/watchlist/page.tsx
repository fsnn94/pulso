"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, Market } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { MarketCard } from "@/components/MarketCard";

export default function WatchlistPage() {
  const { user, loading } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [busy, setBusy] = useState(true);

  const reload = useCallback(() => {
    if (!user) return;
    setBusy(true);
    api.watchlist().then(setMarkets).catch(() => {}).finally(() => setBusy(false));
  }, [user?.id]); // eslint-disable-line

  useEffect(() => { reload(); }, [reload]);

  const unwatch = useCallback((id: string) => {
    setMarkets((cur) => cur.filter((m) => m.id !== id));   // optimista
    api.removeWatch(id).catch(() => reload());
  }, [reload]);

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="text-2xl font-semibold mb-2">Ingresá para ver tus favoritos</h1>
      <Link href="/login" className="inline-block h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium mt-4">Ingresar</Link>
    </div>
  );

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Siguiendo</h1>
      <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">Los mercados que marcaste con ★.</p>

      {busy ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-ink-100 dark:border-ink-800 p-5 h-52 animate-pulse bg-ink-50/50 dark:bg-ink-900/20"/>
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="py-20 text-center text-sm text-ink-500 dark:text-ink-400">
          Todavía no seguís ningún mercado. Tocá la ★ en cualquier mercado para agregarlo.
          <div className="mt-4"><Link href="/" className="text-accent-500 hover:underline">Explorar mercados</Link></div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} watched onToggleWatch={unwatch}/>
          ))}
        </div>
      )}
    </div>
  );
}
