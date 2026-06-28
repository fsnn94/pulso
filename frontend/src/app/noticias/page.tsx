"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Headline, NewsCategory } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export default function NoticiasPage() {
  const [category, setCategory] = useState("all");
  const [cats, setCats] = useState<NewsCategory[]>([{ key: "all", label: "Todas" }]);
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api.news(category)
      .then((n) => {
        if (!alive) return;
        setEnabled(n.enabled);
        if (n.categories?.length) setCats(n.categories);
        setHeadlines(n.headlines);
      })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category]);

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Noticias de última hora</h1>
        <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
          Titulares de los principales medios, agrupados por las categorías de los mercados de Pulso.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {cats.map((c) => (
          <button key={c.key} onClick={() => setCategory(c.key)}
            className={`h-9 px-3.5 text-sm font-medium rounded-full border transition-colors ${
              category === c.key
                ? "bg-ink-900 text-white border-ink-900 dark:bg-white dark:text-ink-900 dark:border-white"
                : "border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-900"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {!enabled ? (
        <Notice
          title="Noticias no configuradas"
          body="El proveedor de noticias todavía no tiene una API key configurada. Una vez activado, los titulares aparecerán aquí."
        />
      ) : error ? (
        <Notice
          title="No se pudieron cargar las noticias"
          body="Hubo un problema al consultar el proveedor. Probá de nuevo en unos minutos."
        />
      ) : loading && headlines.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : headlines.length === 0 ? (
        <Notice title="Sin titulares" body="No hay noticias para esta categoría en este momento." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {headlines.map((h, i) => <NewsCard key={h.url + i} h={h} />)}
        </div>
      )}

      <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-8">
        Las noticias provienen de fuentes externas (NewsAPI.org) y se muestran solo con fines informativos.
        Pulso no edita ni respalda su contenido.
      </p>
    </div>
  );
}

function NewsCard({ h }: { h: Headline }) {
  return (
    <a href={h.url} target="_blank" rel="noopener noreferrer"
       className="group flex flex-col rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 overflow-hidden hover:border-ink-300 dark:hover:border-ink-600 transition-colors">
      {h.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={h.image} alt="" loading="lazy"
             className="w-full h-40 object-cover bg-ink-100 dark:bg-ink-800"
             onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="w-full h-40 bg-gradient-to-br from-ink-100 to-ink-50 dark:from-ink-800 dark:to-ink-900" />
      )}
      <div className="flex-1 flex flex-col p-4">
        <div className="flex items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400 mb-2">
          <span className="font-medium truncate">{h.source || "Fuente"}</span>
          {h.published_at && <span className="num">· {timeAgo(h.published_at)}</span>}
        </div>
        <h3 className="font-semibold leading-snug line-clamp-3 group-hover:text-accent-500">{h.title}</h3>
        {h.description && (
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-2 line-clamp-2">{h.description}</p>
        )}
        <span className="text-xs text-accent-500 mt-3 font-medium">Leer nota →</span>
      </div>
    </a>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 overflow-hidden animate-pulse">
      <div className="w-full h-40 bg-ink-100 dark:bg-ink-800" />
      <div className="p-4 space-y-2">
        <div className="h-3 w-24 bg-ink-100 dark:bg-ink-800 rounded" />
        <div className="h-4 w-full bg-ink-100 dark:bg-ink-800 rounded" />
        <div className="h-4 w-3/4 bg-ink-100 dark:bg-ink-800 rounded" />
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 px-6 py-14 text-center">
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-ink-500 dark:text-ink-400 max-w-md mx-auto">{body}</p>
      <Link href="/" className="inline-block mt-5 h-9 px-4 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-900 text-sm font-medium">
        Ver mercados
      </Link>
    </div>
  );
}
