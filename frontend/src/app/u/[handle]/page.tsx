"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, PublicProfile, PublicTrade } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { compact, timeAgo, usd, statusEs } from "@/lib/format";

export default function PublicProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = decodeURIComponent(params.handle);
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [trades, setTrades] = useState<PublicTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    Promise.all([api.userProfile(handle), api.userTrades(handle)])
      .then(([p, t]) => { if (alive) { setProfile(p); setTrades(t); } })
      .catch((e: any) => { if (alive) setError(e?.message ?? "No se pudo cargar el perfil"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [handle]);

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;

  if (error || !profile) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="text-2xl font-semibold mb-2">Perfil no encontrado</h1>
      <p className="text-ink-500 dark:text-ink-400 mb-6 text-sm">{error ?? `No existe el usuario @${handle}.`}</p>
      <Link href="/" className="inline-block h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium">Ir a mercados</Link>
    </div>
  );

  const isMe = user?.handle?.toLowerCase() === profile.handle.toLowerCase();
  const initial = profile.handle.charAt(0).toUpperCase();

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full grid place-items-center bg-accent-500/15 text-accent-500 text-xl font-semibold">
          {initial}
        </div>
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight flex items-center gap-3">
            @{profile.handle}
            {isMe && <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400">Vos</span>}
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
            Miembro desde {new Date(profile.created_at).toLocaleDateString([], { year: "numeric", month: "long" })}
          </p>
        </div>
        {isMe && (
          <Link href="/portfolio" className="ml-auto h-10 px-4 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900 text-sm font-medium">
            Mi portafolio
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Kpi label="P&L realizado" value={`${profile.realized_pnl >= 0 ? "+" : ""}${usd(profile.realized_pnl)}`}
             accent={profile.realized_pnl >= 0 ? "yes" : "no"} sub="neto de comisiones" />
        <Kpi label="P&L no realizado" value={`${profile.unrealized_pnl >= 0 ? "+" : ""}${usd(profile.unrealized_pnl)}`}
             accent={profile.unrealized_pnl >= 0 ? "yes" : "no"} sub="posiciones abiertas a precio actual" />
        <Kpi label="Posiciones abiertas" value={profile.open_positions.toString()} sub="con contratos vigentes" />
        <Kpi label="Operaciones" value={profile.trades_count.toString()} sub="ejecutadas en total" />
        <Kpi label="Mercados operados" value={profile.markets_traded.toString()} sub="distintos" />
        <Kpi label="Volumen operado" value={compact(profile.total_volume)} sub="nocional total" />
      </div>

      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-ink-100 dark:border-ink-800">
          <h2 className="font-semibold">Operaciones {trades.length ? `(${trades.length})` : ""}</h2>
        </div>
        {trades.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">
            Este usuario todavía no tiene operaciones públicas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                <tr className="border-b border-ink-100 dark:border-ink-800">
                  <th className="px-5 sm:px-6 py-2 font-medium text-left">Mercado</th>
                  <th className="px-3 py-2 font-medium text-right">Lado</th>
                  <th className="px-3 py-2 font-medium text-right">Precio</th>
                  <th className="px-3 py-2 font-medium text-right">Contratos</th>
                  <th className="px-5 sm:px-6 py-2 font-medium text-right">Hora</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-ink-50 dark:border-ink-800/50 last:border-0 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
                    <td className="px-5 sm:px-6 py-3">
                      <Link href={`/markets/${t.market_id}`} className="font-medium hover:text-accent-500 line-clamp-2 max-w-md">
                        {t.market_short_title ?? t.market_id}
                      </Link>
                      {t.market_status && t.market_status !== "OPEN" && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400">
                          {statusEs(t.market_status)}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${t.side === "YES" ? "text-yes-500" : "text-no-500"}`}>{t.side}</td>
                    <td className="px-3 py-3 text-right num">{(t.price * 100).toFixed(1)}¢</td>
                    <td className="px-3 py-3 text-right num">{t.quantity.toLocaleString()}</td>
                    <td className="px-5 sm:px-6 py-3 text-right num text-ink-500 dark:text-ink-400">{timeAgo(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
