"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, CommissionRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo, usd } from "@/lib/format";

export default function AdminCommissionsPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<CommissionRow[] | null>(null);

  useEffect(() => {
    if (user?.is_admin) api.listCommissions(300).then(setRows).catch(() => {});
  }, [user?.id]); // eslint-disable-line

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user?.is_admin) return <div className="p-12 text-center text-sm text-ink-500">Solo para admins.</div>;

  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Historial de comisiones</h1>
          <p className="text-ink-500 dark:text-ink-400 text-sm mt-1">
            Cada fee cobrado sobre una ganancia realizada (cierre de posición o resolución).
          </p>
        </div>
        <Link href="/admin/cashflow" className="h-9 px-3 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-800 text-sm">← Flujo de caja</Link>
      </div>

      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
          <h2 className="font-semibold">{rows ? `${rows.length} cobros` : "Cargando..."}</h2>
          <span className="text-sm text-ink-500 dark:text-ink-400">Total mostrado: <span className="num font-medium text-ink-900 dark:text-ink-100">{usd(total)}</span></span>
        </div>

        {!rows ? (
          <div className="px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">Aún no se cobraron comisiones.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                <tr className="border-b border-ink-100 dark:border-ink-800">
                  <th className="text-left px-5 sm:px-6 py-2 font-medium">Usuario</th>
                  <th className="text-left px-3 py-2 font-medium">Mercado</th>
                  <th className="text-left px-3 py-2 font-medium">Origen</th>
                  <th className="text-right px-3 py-2 font-medium">Ganancia</th>
                  <th className="text-right px-3 py-2 font-medium">Rate</th>
                  <th className="text-right px-3 py-2 font-medium">Comisión</th>
                  <th className="text-right px-5 sm:px-6 py-2 font-medium">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-ink-50 dark:border-ink-800/50 last:border-0 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
                    <td className="px-5 sm:px-6 py-3 font-medium">{r.handle}</td>
                    <td className="px-3 py-3">
                      {r.market_id
                        ? <Link href={`/markets/${r.market_id}`} className="hover:text-accent-500 line-clamp-1 max-w-xs">{r.market_title ?? r.market_id}</Link>
                        : <span className="text-ink-500">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
                        {r.source === "RESOLVE" ? "Resolución" : "Cierre"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right num text-ink-600 dark:text-ink-300">{usd(r.gross_profit)}</td>
                    <td className="px-3 py-3 text-right num text-ink-500 dark:text-ink-400">{(r.rate * 100).toFixed(1)}%</td>
                    <td className="px-3 py-3 text-right num font-medium text-accent-500">{usd(r.amount)}</td>
                    <td className="px-5 sm:px-6 py-3 text-right num text-ink-500 dark:text-ink-400">{timeAgo(r.created_at)}</td>
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
