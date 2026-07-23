"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, EquityHistory, EquityRange, Order, Portfolio } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ValueChart } from "@/components/charts";
import { CalibrationCard } from "@/components/CalibrationCard";
import { timeAgo, usd } from "@/lib/format";
import { isLabeledMarket, sideLabel } from "@/lib/market";

const RANGES: { key: EquityRange; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "1w",  label: "1S" },
  { key: "1m",  label: "1M" },
  { key: "1y",  label: "1A" },
  { key: "all", label: "Todo" },
];

function PnlChartCard() {
  const [range, setRange] = useState<EquityRange>("all");
  const [hist, setHist] = useState<EquityHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.equityHistory(range)
      .then((h) => { if (alive) { setHist(h); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range]);

  const points = hist?.points ?? [];
  const data = points.map((p) => ({ t: p.ts, v: p.equity }));
  const base = hist?.starting_credits ?? 10000;
  const last = points.length ? points[points.length - 1] : null;
  const pnl = last?.pnl ?? 0;
  const pnlPct = base ? (pnl / base) * 100 : 0;
  const up = pnl >= 0;

  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 mb-8 overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-ink-100 dark:border-ink-800 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold">Evolución del patrimonio</h2>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-semibold num">{usd(last?.equity ?? base)}</span>
            <span className={`num text-sm font-medium ${up ? "text-yes-500" : "text-no-500"}`}>
              {up ? "+" : ""}{usd(pnl)} ({up ? "+" : ""}{pnlPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-ink-200 dark:border-ink-700 p-0.5">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`h-7 px-2.5 text-xs font-medium rounded-md transition-colors ${
                range === r.key
                  ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900"
                  : "text-ink-500 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 sm:px-4 py-4">
        {loading && !hist ? (
          <div className="h-[260px] grid place-items-center text-xs text-ink-400 dark:text-ink-500">Cargando…</div>
        ) : (
          <ValueChart data={data} baseline={base} baseLabel="créditos iniciales"/>
        )}
        <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-2 px-2">
          El histórico se registra desde la activación de esta función y se va completando con el tiempo.
        </p>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const { user, loading } = useAuth();
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [marketsById, setMarketsById] = useState<Record<string, { short_title: string; current_yes_price: number; category: string; yes_label: string; no_label: string }>>({});
  const [closing, setClosing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = async () => {
    try {
      const [p, oo, ml] = await Promise.all([api.portfolio(), api.myOrders(true), api.listMarkets()]);
      setPf(p); setOpenOrders(oo);
      setMarketsById(Object.fromEntries(ml.items.map((m) => [m.id, { short_title: m.short_title, current_yes_price: m.current_yes_price, category: m.category, yes_label: m.yes_label, no_label: m.no_label }])));
    } catch {}
  };

  useEffect(() => { if (user) void refresh(); }, [user?.id]); // eslint-disable-line

  const closePosition = async (p: { id: string; market_id: string; side: "YES" | "NO"; shares: number }) => {
    if (!confirm(`¿Cerrar posición? Vas a vender ${p.shares.toFixed(2)} contratos ${sideLabel(marketsById[p.market_id], p.side)} a precio de mercado.`)) return;
    setClosing(p.id);
    setMsg(null);
    try {
      const o = await api.placeOrder({
        market_id: p.market_id, side: p.side, action: "SELL", type: "MARKET", quantity: p.shares,
      });
      setMsg({
        kind: "ok",
        text: o.status === "FILLED"
          ? `Cerrada: ${o.filled_quantity.toFixed(2)} contratos @ ${(((o.avg_fill_price ?? 0) * 100)).toFixed(1)}¢`
          : `Cierre parcial: ${o.filled_quantity.toFixed(2)} / ${o.quantity.toFixed(2)}`,
      });
      await refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falló al cerrar la posición" });
    } finally {
      setClosing(null);
    }
  };

  const totals = useMemo(() => {
    if (!pf) return null;
    let value = 0, cost = 0;
    for (const p of pf.positions) {
      const m = marketsById[p.market_id];
      const px = m ? (p.side === "YES" ? m.current_yes_price : 1 - m.current_yes_price) : p.avg_cost;
      value += px * p.shares;
      cost  += p.avg_cost * p.shares;
    }
    return { value, cost, pnl: value - cost, equity: pf.cash + value };
  }, [pf, marketsById]);

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="text-2xl font-semibold mb-2">Ingresa para ver tu portafolio</h1>
      <p className="text-ink-500 dark:text-ink-400 mb-6 text-sm">Las operaciones que realices aparecerán aquí cuando hayas ingresado.</p>
      <Link href="/login" className="inline-block h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium">Ingresar</Link>
    </div>
  );

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Portafolio</h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">Tus posiciones, rendimiento y actividad.</p>
        </div>
        <Link href="/" className="h-10 px-4 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900 text-sm font-medium">
          Buscar mercados
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Kpi label="Patrimonio total"   value={usd(totals?.equity ?? user.cash)} sub="saldo + posiciones"/>
        <Kpi label="Saldo"              value={usd(user.cash)} sub="créditos virtuales"/>
        <Kpi label="Posiciones abiertas" value={(pf?.positions.length ?? 0).toString()} sub={`${(pf?.positions.reduce((s, p) => s + p.shares, 0) ?? 0).toFixed(0)} contratos`}/>
        <Kpi label="P&L no realizado"   value={`${(totals?.pnl ?? 0) >= 0 ? "+" : ""}${usd(totals?.pnl ?? 0)}`}
             accent={(totals?.pnl ?? 0) >= 0 ? "yes" : "no"}
             sub={totals && totals.cost > 0 ? `${(totals.pnl / totals.cost * 100).toFixed(1)}% sobre el costo` : "—"}/>
        <Kpi label="P&L realizado"      value={`${(pf?.realized_pnl ?? 0) >= 0 ? "+" : ""}${usd(pf?.realized_pnl ?? 0)}`}
             accent={(pf?.realized_pnl ?? 0) >= 0 ? "yes" : "no"} sub="neto de comisiones"/>
        <Kpi label="Comisiones pagadas" value={usd(pf?.commissions_paid ?? 0)} sub="fee de la casa (5%)"/>
      </div>

      <PnlChartCard/>

      <div className="mt-6"><CalibrationCard/></div>

      {msg && (
        <div className={`rounded-lg px-4 py-2 mb-4 text-sm border ${msg.kind === "ok"
          ? "border-yes-500/30 bg-yes-500/5 text-yes-700 dark:text-yes-500"
          : "border-no-500/30 bg-no-500/5 text-no-700 dark:text-no-500"}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-right text-xs underline">cerrar</button>
        </div>
      )}

      <Section title={`Posiciones abiertas (${pf?.positions.length ?? 0})`}>
        {!pf || pf.positions.length === 0 ? (
          <Empty body="Comprá YES o NO en cualquier mercado para empezar tu portafolio."/>
        ) : (
          <Table head={["Mercado", "Lado", "Contratos", "Costo prom.", "Actual", "Valor", "P&L", "Cerrar"]}>
            {pf.positions.map((p) => {
              const m = marketsById[p.market_id];
              const px = m ? (p.side === "YES" ? m.current_yes_price : 1 - m.current_yes_price) : p.avg_cost;
              const value = px * p.shares;
              const pnl = value - p.avg_cost * p.shares;
              return (
                <tr key={p.id} className="border-b border-ink-50 dark:border-ink-800/50 last:border-0 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
                  <td className="px-5 sm:px-6 py-3">
                    <Link href={`/markets/${p.market_id}`} className="text-left">
                      <div className="font-medium leading-tight line-clamp-2 max-w-md hover:text-accent-500">{m?.short_title ?? p.market_id}</div>
                      <div className="text-[11px] text-ink-500 dark:text-ink-400 mt-0.5">{m?.category ?? ""}</div>
                    </Link>
                  </td>
                  <td className={`px-3 py-3 font-medium ${isLabeledMarket(m) ? "text-accent-500" : p.side === "YES" ? "text-yes-500" : "text-no-500"}`}>{sideLabel(m, p.side)}</td>
                  <td className="px-3 py-3 text-right num">{p.shares.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right num">{(p.avg_cost * 100).toFixed(1)}¢</td>
                  <td className="px-3 py-3 text-right num">{(px * 100).toFixed(1)}¢</td>
                  <td className="px-3 py-3 text-right num font-medium">{usd(value)}</td>
                  <td className={`px-3 py-3 text-right num font-medium ${pnl >= 0 ? "text-yes-500" : "text-no-500"}`}>
                    {pnl >= 0 ? "+" : ""}{usd(pnl)}
                  </td>
                  <td className="px-5 sm:px-6 py-3 text-right">
                    <button
                      onClick={() => closePosition({ id: p.id, market_id: p.market_id, side: p.side, shares: p.shares })}
                      disabled={closing === p.id}
                      className="h-8 px-3 text-xs font-medium rounded-md bg-no-500/15 text-no-700 dark:text-no-500 hover:bg-no-500/25 disabled:opacity-50">
                      {closing === p.id ? "Cerrando..." : "Cerrar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title={`Órdenes abiertas (${openOrders.length})`}>
        {openOrders.length === 0 ? (
          <Empty body="No tienes órdenes a límite en el libro."/>
        ) : (
          <Table head={["Mercado", "Tipo", "Lado", "Límite", "Ejecutado", "Cantidad", ""]}>
            {openOrders.map((o) => {
              const m = marketsById[o.market_id];
              return (
                <tr key={o.id} className="border-b border-ink-50 dark:border-ink-800/50 last:border-0">
                  <td className="px-5 sm:px-6 py-3">
                    <Link href={`/markets/${o.market_id}`} className="font-medium hover:text-accent-500">{m?.short_title ?? o.market_id}</Link>
                  </td>
                  <td className="px-3 py-3 text-ink-500 dark:text-ink-400">{o.type}</td>
                  <td className={`px-3 py-3 font-medium ${o.side === "YES" ? "text-yes-500" : "text-no-500"}`}>{o.side}</td>
                  <td className="px-3 py-3 text-right num">{o.limit_price !== null ? `${(o.limit_price * 100).toFixed(1)}¢` : "—"}</td>
                  <td className="px-3 py-3 text-right num">{o.filled_quantity.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right num">{o.quantity.toFixed(2)}</td>
                  <td className="px-5 sm:px-6 py-3 text-right">
                    <button onClick={async () => { await api.cancelOrder(o.id); await refresh(); }}
                            className="h-8 px-3 text-xs font-medium rounded-md border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800">
                      Cancelar
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title={`Actividad (${pf?.activity.length ?? 0})`}>
        {!pf || pf.activity.length === 0 ? (
          <Empty body="Tus operaciones y resoluciones aparecerán aquí."/>
        ) : (
          <div className="divide-y divide-ink-50 dark:divide-ink-800/50">
            {pf.activity.slice(0, 30).map((a) => (
              <div key={a.id} className="flex items-center gap-4 px-5 sm:px-6 py-3 text-sm">
                <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider bg-accent-500/15 text-accent-500">{a.kind}</span>
                {a.side && <span className={`font-semibold ${a.side === "YES" ? "text-yes-500" : "text-no-500"}`}>{a.side}</span>}
                {a.quantity !== null && <span className="num">{a.quantity?.toFixed(2)} ct</span>}
                {a.price !== null && <span className="num text-ink-500 dark:text-ink-400">@ {(a.price! * 100).toFixed(1)}¢</span>}
                {a.market_id && (
                  <Link href={`/markets/${a.market_id}`} className="hidden md:block flex-1 truncate text-ink-700 dark:text-ink-300 hover:text-accent-500 text-left">
                    {marketsById[a.market_id]?.short_title ?? a.market_id}
                  </Link>
                )}
                {a.total !== null && <span className="num font-medium ml-auto md:ml-0">{usd(a.total!)}</span>}
                <span className="num text-xs text-ink-500 dark:text-ink-400 hidden sm:inline">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "yes" | "no" }) {
  const c = accent === "yes" ? "text-yes-500" : accent === "no" ? "text-no-500" : "";
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4">
      <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</div>
      <div className={`text-2xl font-semibold num mt-1 ${c}`}>{value}</div>
      {sub && <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 mb-8 overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Empty({ body }: { body: string }) {
  return <div className="px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">{body}</div>;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
          <tr className="border-b border-ink-100 dark:border-ink-800">
            {head.map((h, i) => (
              <th key={h + i} className={`px-3 py-2 font-medium ${i === 0 ? "text-left px-5 sm:px-6" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
