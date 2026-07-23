"use client";

import { useCallback, useEffect, useState } from "react";
import { api, PriceAlert } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function PriceAlerts({ marketId, currentYes }: { marketId: string; currentYes: number }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [dir, setDir] = useState<"ABOVE" | "BELOW">("ABOVE");
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!user) return;
    api.myAlerts(marketId).then(setAlerts).catch(() => {});
  }, [user?.id, marketId]); // eslint-disable-line

  useEffect(() => { reload(); }, [reload]);

  if (!user) return null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const n = Number(pct);
    if (!Number.isFinite(n) || n <= 0 || n >= 100) { setErr("Ingresá un porcentaje entre 1 y 99."); return; }
    setBusy(true);
    try {
      await api.createAlert({ market_id: marketId, direction: dir, threshold: n / 100 });
      setPct("");
      reload();
    } catch (e: any) { setErr(e?.message ?? "No se pudo crear la alerta"); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setAlerts((cur) => cur.filter((a) => a.id !== id));   // optimista
    api.deleteAlert(id).catch(() => reload());
  };

  return (
    <div className="mt-6 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 sm:p-5">
      <h3 className="font-semibold text-sm">Alertas de precio</h3>
      <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 mb-3">
        Te avisamos por notificación cuando la probabilidad cruce tu umbral. Ahora: {Math.round(currentYes * 100)}%.
      </p>

      <form onSubmit={create} className="flex flex-wrap items-center gap-2">
        <select value={dir} onChange={(e) => setDir(e.target.value as "ABOVE" | "BELOW")}
                className="h-9 px-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm">
          <option value="ABOVE">Sube por encima de</option>
          <option value="BELOW">Baja por debajo de</option>
        </select>
        <div className="flex items-center gap-1">
          <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" placeholder="70"
                 className="h-9 w-16 px-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm text-center"/>
          <span className="text-sm text-ink-500">%</span>
        </div>
        <button disabled={busy || !pct} className="h-9 px-3 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium disabled:opacity-50">
          {busy ? "..." : "Crear alerta"}
        </button>
      </form>
      {err && <div className="text-xs text-no-500 mt-2">{err}</div>}

      {alerts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm rounded-lg border border-ink-100 dark:border-ink-800 px-3 py-2">
              <span>
                {a.direction === "ABOVE" ? "▲ sube por encima de" : "▼ baja por debajo de"} <span className="num font-medium">{Math.round(a.threshold * 100)}%</span>
                {!a.active && <span className="ml-2 text-xs text-ink-500">· disparada</span>}
              </span>
              <button onClick={() => remove(a.id)} className="text-xs text-ink-500 hover:text-no-500">Quitar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
