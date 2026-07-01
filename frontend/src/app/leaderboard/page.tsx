"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Leaderboard } from "@/lib/api";
import { compact, usd } from "@/lib/format";

type Metric = "pnl" | "volume" | "trades";
const METRICS: { key: Metric; label: string }[] = [
  { key: "pnl",    label: "P&L" },
  { key: "volume", label: "Volumen" },
  { key: "trades", label: "Operaciones" },
];

export default function LeaderboardPage() {
  const [metric, setMetric] = useState<Metric>("pnl");
  const [data, setData] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.leaderboard(metric)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [metric]);

  const rows = data?.rows ?? [];

  return (
    <div className="view-enter max-w-4xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Ranking de traders</h1>
        <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
          Los que mejor leen el mercado. P&L incluye posiciones abiertas valuadas a precio actual.
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)}
            className={`h-9 px-4 text-sm font-medium rounded-full border transition-colors ${
              metric === m.key
                ? "bg-ink-900 text-white border-ink-900 dark:bg-white dark:text-ink-900 dark:border-white"
                : "border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-900"}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
              <tr className="border-b border-ink-100 dark:border-ink-800">
                <th className="text-left px-4 sm:px-5 py-2.5 font-medium w-12">#</th>
                <th className="text-left px-3 py-2.5 font-medium">Trader</th>
                <th className={`text-right px-3 py-2.5 font-medium ${metric === "pnl" ? "text-ink-900 dark:text-ink-100" : ""}`}>P&L</th>
                <th className={`text-right px-3 py-2.5 font-medium ${metric === "volume" ? "text-ink-900 dark:text-ink-100" : ""}`}>Volumen</th>
                <th className={`text-right px-4 sm:px-5 py-2.5 font-medium ${metric === "trades" ? "text-ink-900 dark:text-ink-100" : ""}`}>Ops.</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-ink-500">Cargando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-ink-500 dark:text-ink-400">Todavía no hay traders con actividad.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.handle} className="border-b border-ink-50 dark:border-ink-800/50 last:border-0 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
                  <td className="px-4 sm:px-5 py-3 num text-ink-500 dark:text-ink-400">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/u/${encodeURIComponent(r.handle)}`} className="font-medium hover:text-accent-500">@{r.handle}</Link>
                    <div className="text-[11px] text-ink-500 dark:text-ink-400">{r.markets} mercado{r.markets !== 1 ? "s" : ""}</div>
                  </td>
                  <td className={`px-3 py-3 text-right num font-medium ${r.pnl >= 0 ? "text-yes-500" : "text-no-500"}`}>
                    {r.pnl >= 0 ? "+" : ""}{usd(r.pnl)}
                  </td>
                  <td className="px-3 py-3 text-right num text-ink-600 dark:text-ink-300">{compact(r.volume)}</td>
                  <td className="px-4 sm:px-5 py-3 text-right num text-ink-600 dark:text-ink-300">{r.trades.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
