"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, Market } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMarketSocket } from "@/lib/ws";
import { compact } from "@/lib/format";
import { MarketCard } from "@/components/MarketCard";
import { TrendingCarousel } from "@/components/TrendingCarousel";
import { NewsRail } from "@/components/NewsRail";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "All",       label: "Todos" },
  { value: "Economics", label: "Economía" },
  { value: "Tech & AI", label: "Tecnología e IA" },
  { value: "Crypto",    label: "Cripto" },
  { value: "Science",   label: "Ciencia" },
  { value: "Sports",    label: "Deportes" },
  { value: "Climate",   label: "Clima" },
  { value: "Space",     label: "Espacio" },
  { value: "Culture",   label: "Cultura" },
];

export default function HomePage() {
  const { user } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [category, setCategory] = useState("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"volume" | "closing" | "newest">("volume");
  const [loading, setLoading] = useState(true);

  // Track per-market price history client-side from WS feed
  const [history, setHistory] = useState<Record<string, { t: number; p: number }[]>>({});

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    api.listMarkets({ category, q, sort }).then((res) => {
      if (cancel) return;
      setMarkets(res.items);
      setHistory((h) => {
        const next = { ...h };
        for (const m of res.items) {
          if (!next[m.id]) next[m.id] = [{ t: Date.now(), p: m.current_yes_price }];
        }
        return next;
      });
    }).catch(() => {}).finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, [category, q, sort]);

  useMarketSocket((e) => {
    if (e.type === "price") {
      setMarkets((cur) => cur.map((m) => m.id === e.market_id ? { ...m, current_yes_price: e.yes } : m));
      setHistory((cur) => {
        const arr = (cur[e.market_id] ?? []).slice(-200);
        arr.push({ t: Date.now(), p: e.yes });
        return { ...cur, [e.market_id]: arr };
      });
    }
  });

  const totalVolume = useMemo(() => markets.reduce((s, m) => s + m.volume_24h, 0), [markets]);
  const totalLiq    = useMemo(() => markets.reduce((s, m) => s + m.liquidity, 0), [markets]);

  const filters = (
    <div className="flex flex-wrap items-center gap-3 justify-between">
      <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 pb-1">
        {CATEGORIES.map((c) => (
          <button key={c.value} onClick={() => setCategory(c.value)}
                  className={`px-3 h-8 whitespace-nowrap rounded-full text-sm font-medium border ${category === c.value
                    ? "bg-ink-900 text-white border-ink-900 dark:bg-white dark:text-ink-900 dark:border-white"
                    : "border-ink-200 dark:border-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-900"}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar mercados..."
               className="h-8 text-sm rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent px-3 w-48"/>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)}
                className="h-8 text-sm rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent px-2">
          <option value="volume">Volumen 24h</option>
          <option value="closing">Por cerrar</option>
          <option value="newest">Más recientes</option>
        </select>
      </div>
    </div>
  );

  const grid = (cols: string) => {
    if (loading) return (
      <div className={cols}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-ink-100 dark:border-ink-800 p-5 h-52 animate-pulse bg-ink-50/50 dark:bg-ink-900/20"/>
        ))}
      </div>
    );
    if (markets.length === 0) return (
      <div className="py-20 text-center text-ink-500 dark:text-ink-400 text-sm">Ningún mercado coincide con esos filtros.</div>
    );
    return (
      <div className={cols}>
        {markets.map((m) => {
          const hist = history[m.id] ?? [];
          const change30 = hist.length > 1 ? hist[hist.length - 1].p - hist[Math.max(0, hist.length - 30)].p : 0;
          return <MarketCard key={m.id} market={m} history={hist} change30={change30}/>;
        })}
      </div>
    );
  };

  // ---- Vista de usuario logueado: app (sin hero de marketing), con columna de noticias ----
  if (user) {
    return (
      <div className="view-enter">
        <section className="border-b border-ink-100 dark:border-ink-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Mercados</h1>
              <p className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">Explorá y operá los mercados en vivo.</p>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <Stat label="Mercados activos" value={markets.length.toString()}/>
              <Stat label="Volumen 24h"      value={compact(totalVolume)}/>
              <Stat label="Interés abierto"  value={compact(totalLiq)}/>
            </div>
          </div>
        </section>

        <TrendingCarousel />

        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-16">
          {filters}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-4">
            <div>{grid("grid sm:grid-cols-2 gap-4")}</div>
            <aside className="hidden lg:block"><NewsRail /></aside>
          </div>
        </section>
      </div>
    );
  }

  // ---- Vista anónima: landing de marketing (preview para quienes no tienen cuenta) ----
  return (
    <div className="view-enter">
      <section className="border-b border-ink-100 dark:border-ink-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 grid md:grid-cols-2 gap-8 items-end">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-accent-500 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 livedot"/>Pronósticos en vivo
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.1]">
              Las preguntas del mundo, con precio.
            </h1>
            <p className="mt-4 text-ink-500 dark:text-ink-400 max-w-prose leading-relaxed">
              Pulso agrega probabilidades sobre eventos futuros a partir de una comunidad de analistas.
              Operá posiciones YES/NO con créditos virtuales, observá cómo se mueve el consenso en tiempo real y descubrí qué mueve al mercado.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href="#markets" className="h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium text-sm hover:opacity-90">
                Explorar mercados
              </a>
              <Link href="/register" className="h-10 px-4 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-700 font-medium text-sm hover:bg-ink-50 dark:hover:bg-ink-900">
                Crear cuenta
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Stat label="Mercados activos" value={markets.length.toString()}/>
            <Stat label="Volumen 24h"      value={compact(totalVolume)}/>
            <Stat label="Interés abierto"  value={compact(totalLiq)}/>
          </div>
        </div>
      </section>

      <TrendingCarousel />

      <section id="markets" className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        {filters}
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        {grid("grid sm:grid-cols-2 lg:grid-cols-3 gap-4")}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-ink-100 dark:border-ink-800 pl-4">
      <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</div>
      <div className="text-lg sm:text-xl font-semibold num mt-0.5">{value}</div>
    </div>
  );
}
