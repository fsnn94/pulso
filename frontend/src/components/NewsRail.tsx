"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Headline } from "@/lib/api";
import { timeAgo } from "@/lib/format";

/** Columna compacta de noticias para el costado del contenido (solo desktop).
 *  Se apoya en el mismo endpoint /news (item #10). Si no hay key configurada o
 *  no hay titulares, muestra un placeholder discreto. */
export function NewsRail() {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.news("all")
      .then((n) => { if (alive) { setEnabled(n.enabled); setHeadlines(n.headlines.slice(0, 7)); } })
      .catch(() => { if (alive) setEnabled(false); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 overflow-hidden sticky top-20">
      <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-500 livedot" />
          Última hora
        </h2>
        <Link href="/noticias" className="text-xs text-accent-500 hover:underline">Ver todas</Link>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5 animate-pulse">
              <div className="h-3 w-20 bg-ink-100 dark:bg-ink-800 rounded" />
              <div className="h-3.5 w-full bg-ink-100 dark:bg-ink-800 rounded" />
            </div>
          ))}
        </div>
      ) : headlines.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-ink-400 dark:text-ink-500">
          {enabled ? "No hay titulares por ahora." : "Las noticias aparecerán aquí una vez configuradas."}
        </div>
      ) : (
        <ul className="divide-y divide-ink-50 dark:divide-ink-800/60">
          {headlines.map((h, i) => (
            <li key={h.url + i}>
              <a href={h.url} target="_blank" rel="noopener noreferrer"
                 className="block px-4 py-3 hover:bg-ink-50/70 dark:hover:bg-ink-800/40 group">
                <div className="flex items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400 mb-0.5">
                  <span className="truncate font-medium">{h.source || "Fuente"}</span>
                  {h.published_at && <span className="num shrink-0">· {timeAgo(h.published_at)}</span>}
                </div>
                <div className="text-sm leading-snug line-clamp-2 group-hover:text-accent-500">{h.title}</div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
