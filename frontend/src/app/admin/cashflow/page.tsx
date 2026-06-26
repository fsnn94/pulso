"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, CashflowKpi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMarketSocket } from "@/lib/ws";
import { compact, timeAgo, usd } from "@/lib/format";
import { LineChart } from "@/components/charts";

type LiveTrade = {
  id: string; market_id: string; side: "YES" | "NO";
  price: number; quantity: number; ts: number;
};

export default function AdminCashflowPage() {
  const { user, loading } = useAuth();
  const [kpi, setKpi] = useState<CashflowKpi | null>(null);
  const [days, setDays] = useState(7);
  const tape = useRef<LiveTrade[]>([]);
  const [, force] = useState(0);

  const reload = () => api.cashflow(days).then(setKpi).catch(() => {});
  useEffect(() => { if (user?.is_admin) reload(); }, [user?.id, days]); // eslint-disable-line
  useEffect(() => {
    if (!user?.is_admin) return;
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [user?.id, days]); // eslint-disable-line

  useMarketSocket((e: any) => {
    if (e.type === "trade") {
      tape.current.unshift({
        id: `${e.market_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        market_id: e.market_id, side: e.side, price: e.price, quantity: e.quantity, ts: Date.now(),
      });
      tape.current = tape.current.slice(0, 100);
      force((x) => x + 1);
    }
  });

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user?.is_admin) return <div className="p-12 text-center text-sm text-ink-500">Solo para admins.</div>;

  const series = useMemo(() => {
    if (!kpi) return [];
    const maxV = Math.max(1, ...kpi.series.map((p) => p.volume));
    return kpi.series.map((p, i) => ({ t: new Date(p.day).getTime(), p: p.volume / maxV }));
  }, [kpi]);

  const exportFor = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    window.location.href = api.auditExportUrl(from.toISOString(), to.toISOString());
  };

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Flujo de caja</h1>
          <p className="text-ink-500 dark:text-ink-400 text-sm mt-1">
            Stream de transacciones en vivo + agregados históricos de todos los mercados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}
                  className="h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent">
            <option value={1}>Últimas 24h</option>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
          <button onClick={() => exportFor(days)}
                  className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-800 text-sm font-medium hover:bg-ink-50 dark:hover:bg-ink-900">
            Exportar CSV de auditoría
          </button>
          <Link href="/admin" className="h-9 px-3 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-800 text-sm">← Inicio admin</Link>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Kpi label="Volumen 24h"          value={kpi ? compact(kpi.volume_24h) : "—"}/>
        <Kpi label="Operaciones 24h"      value={kpi ? kpi.trades_24h.toLocaleString() : "—"}/>
        <Kpi label="Usuarios activos"     value={kpi ? kpi.active_users_24h.toLocaleString() : "—"}/>
        <Kpi label="Mercados abiertos"    value={kpi ? kpi.open_markets.toString() : "—"}/>
        <Kpi label="Propuestas pendientes" value={kpi ? kpi.pending_proposals.toString() : "—"} link="/admin/proposals"/>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Historical + categories */}
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Volumen diario — últimos {days} día{days !== 1 ? "s" : ""}</h2>
              <span className="text-xs text-ink-500 dark:text-ink-400">Se actualiza cada 30s</span>
            </div>
            <LineChart data={series.length >= 2 ? series : [{t: Date.now()-1, p: 0},{t: Date.now(), p: 0}]} accent="#A41F13"/>
            {series.length === 0 && (
              <div className="text-center text-sm text-ink-500 dark:text-ink-400 py-2">Aún no hay datos de operaciones en este rango.</div>
            )}
          </div>

          <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5">
            <h2 className="font-semibold mb-3">Por categoría — últimas 24h</h2>
            {kpi?.by_category.length ? (
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  <tr className="border-b border-ink-100 dark:border-ink-800">
                    <th className="text-left py-2 font-medium">Categoría</th>
                    <th className="text-right py-2 font-medium">Volumen</th>
                    <th className="text-right py-2 font-medium">Operaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.by_category.map((c) => (
                    <tr key={c.category} className="border-b border-ink-50 dark:border-ink-800/50 last:border-0">
                      <td className="py-2">{c.category}</td>
                      <td className="py-2 text-right num">{compact(c.volume)}</td>
                      <td className="py-2 text-right num">{c.trades.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-ink-500 dark:text-ink-400 py-2">Aún no hay actividad por categoría.</div>
            )}
          </div>
        </div>

        {/* Live tape */}
        <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 lg:max-h-[640px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Cinta de transacciones en vivo</h2>
            <span className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
              <span className="w-1.5 h-1.5 rounded-full bg-yes-500 livedot"/>En vivo
            </span>
          </div>
          <div className="grid grid-cols-4 text-[11px] uppercase tracking-wider text-ink-400 dark:text-ink-500 pb-1.5 border-b border-ink-100 dark:border-ink-800">
            <span>Lado</span><span>Precio</span><span>Tamaño</span><span className="text-right">Hora</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tape.current.length === 0 ? (
              <div className="text-sm text-ink-500 dark:text-ink-400 py-6 text-center">Esperando operaciones en vivo...</div>
            ) : tape.current.map((t) => (
              <div key={t.id} className="grid grid-cols-4 py-1.5 text-sm num border-b border-ink-50 dark:border-ink-800/60 last:border-0">
                <span className={t.side === "YES" ? "text-yes-500 font-medium" : "text-no-500 font-medium"}>{t.side}</span>
                <span>{(t.price * 100).toFixed(1)}¢</span>
                <span>{t.quantity.toFixed(2)}</span>
                <span className="text-right text-ink-500 dark:text-ink-400">{timeAgo(t.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, link }: { label: string; value: string; link?: string }) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</div>
      <div className="text-2xl font-semibold num mt-1">{value}</div>
    </>
  );
  const cls = "rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 block";
  return link
    ? <Link href={link} className={`${cls} hover:border-accent-500 transition`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}
