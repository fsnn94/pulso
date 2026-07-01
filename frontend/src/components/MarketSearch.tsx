"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Market } from "@/lib/api";
import { Icon } from "./Icon";

/** Buscador global de mercados para la barra superior. Debounced, con dropdown
 *  de coincidencias que linkean al mercado. */
export function MarketSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Market[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.listMarkets({ q: term, sort: "volume" });
        setResults(res.items.slice(0, 7));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  // cerrar al hacer click afuera
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (id: string) => {
    setOpen(false); setQ("");
    router.push(`/markets/${id}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results[0]) go(results[0].id);
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500 pointer-events-none">
          <Icon name="search" className="w-4 h-4" />
        </span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Buscar mercados..."
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
        />
      </div>

      {open && q.trim().length > 0 && (
        <div className="absolute left-0 right-0 mt-2 rounded-lg border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 shadow-lg overflow-hidden z-50">
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-ink-500 dark:text-ink-400">Buscando…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-ink-500 dark:text-ink-400">Sin coincidencias</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {results.map((m) => (
                <li key={m.id}>
                  <button onClick={() => go(m.id)}
                          className="w-full text-left px-3 py-2 hover:bg-ink-50 dark:hover:bg-ink-800 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{m.short_title}</div>
                      <div className="text-[11px] text-ink-500 dark:text-ink-400">{m.category}</div>
                    </div>
                    <span className="num text-sm text-ink-600 dark:text-ink-300 shrink-0">{(m.current_yes_price * 100).toFixed(0)}¢</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
