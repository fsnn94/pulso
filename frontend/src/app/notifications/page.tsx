"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Notification } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";

const KIND_META: Record<string, { label: string; tone: string }> = {
  BUY_FILLED:        { label: "Compra",     tone: "bg-yes-500/15 text-yes-600 dark:text-yes-500" },
  SELL_FILLED:       { label: "Venta",      tone: "bg-accent-500/15 text-accent-500" },
  MARKET_CLOSED:     { label: "Cierre",     tone: "bg-ink-200/60 dark:bg-ink-700 text-ink-600 dark:text-ink-300" },
  MARKET_RESOLVED:   { label: "Resolución", tone: "bg-no-500/15 text-no-600 dark:text-no-500" },
  PROPOSAL_APPROVED: { label: "Propuesta",  tone: "bg-yes-500/15 text-yes-600 dark:text-yes-500" },
};

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try { setItems(await api.notifications()); } catch {}
  };

  useEffect(() => {
    if (!user) return;
    void refresh();
    // Mark everything read shortly after opening the inbox.
    const t = setTimeout(async () => {
      try { await api.markAllRead(); await refresh(); } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [user?.id]); // eslint-disable-line

  const markAll = async () => {
    setBusy(true);
    try { await api.markAllRead(); await refresh(); } finally { setBusy(false); }
  };

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="text-2xl font-semibold mb-2">Ingresá para ver tus notificaciones</h1>
      <p className="text-ink-500 dark:text-ink-400 mb-6 text-sm">Te avisamos cuando se ejecutan tus operaciones, cierran o se resuelven tus mercados.</p>
      <Link href="/login" className="inline-block h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium">Ingresar</Link>
    </div>
  );

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="view-enter max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Notificaciones</h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
            {unread > 0 ? `${unread} sin leer` : "Todo al día"} · se conservan las últimas 50.
          </p>
        </div>
        {items.length > 0 && (
          <button onClick={markAll} disabled={busy || unread === 0}
                  className="h-10 px-4 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900 text-sm font-medium disabled:opacity-50">
            Marcar todo como leído
          </button>
        )}
      </div>

      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 overflow-hidden">
        {items.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-ink-500 dark:text-ink-400">
            Todavía no tenés notificaciones. Cuando compres, vendas o se muevan tus mercados, aparecen acá.
          </div>
        ) : (
          <ul className="divide-y divide-ink-50 dark:divide-ink-800/50">
            {items.map((n) => {
              const meta = KIND_META[n.kind] ?? { label: n.kind, tone: "bg-ink-100 dark:bg-ink-800 text-ink-500" };
              const row = (
                <div className={`flex gap-3 px-5 sm:px-6 py-4 ${n.read_at ? "" : "bg-accent-500/[0.04]"}`}>
                  {!n.read_at && <span className="mt-1.5 w-2 h-2 rounded-full bg-accent-500 shrink-0" aria-label="sin leer" />}
                  <div className={`flex-1 ${n.read_at ? "pl-5" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.tone}`}>{meta.label}</span>
                      <span className="font-medium">{n.title}</span>
                    </div>
                    <p className="text-sm text-ink-600 dark:text-ink-300 mt-1">{n.body}</p>
                    <div className="text-xs text-ink-500 dark:text-ink-400 mt-1 num">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.market_id ? (
                    <Link href={`/markets/${n.market_id}`} className="block hover:bg-ink-50/60 dark:hover:bg-ink-800/30">{row}</Link>
                  ) : row}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
