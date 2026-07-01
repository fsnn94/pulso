"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Status = "checking" | "ok" | "down";

export default function EstadoPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [env, setEnv] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const check = useCallback(async () => {
    setStatus("checking");
    const t0 = performance.now();
    try {
      const res = await fetch(`${api.base}/health`, { cache: "no-store" });
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json().catch(() => ({}));
      setEnv(data?.env ?? null);
      setLatency(ms);
      setStatus("ok");
    } catch {
      setLatency(null);
      setStatus("down");
    } finally {
      setCheckedAt(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  const ok = status === "ok";
  const checking = status === "checking";

  return (
    <div className="view-enter max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Producto</p>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-1">Estado del sistema</h1>
      <p className="text-ink-500 dark:text-ink-400 mt-3 leading-relaxed">
        Disponibilidad de los servicios de Pulso en tiempo real, medida desde tu propio navegador.
      </p>

      <div className={`mt-8 rounded-xl border p-5 flex items-center gap-4 ${
        checking ? "border-ink-200 dark:border-ink-700"
        : ok ? "border-yes-500/30 bg-yes-500/5"
        : "border-no-500/30 bg-no-500/5"}`}>
        <span className={`w-3 h-3 rounded-full ${checking ? "bg-ink-300 dark:bg-ink-600 animate-pulse" : ok ? "bg-yes-500 livedot" : "bg-no-500"}`} />
        <div className="flex-1">
          <div className="font-semibold">
            {checking ? "Verificando…" : ok ? "Todos los sistemas operativos" : "No se pudo contactar la API"}
          </div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            {checkedAt ? `Última verificación: ${checkedAt}` : "—"}
          </div>
        </div>
        <button onClick={() => void check()} disabled={checking}
                className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 text-sm font-medium hover:bg-ink-50 dark:hover:bg-ink-900 disabled:opacity-50">
          Volver a chequear
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-ink-100 dark:border-ink-800 divide-y divide-ink-100 dark:divide-ink-800">
        <Row label="API HTTP" desc="Núcleo de la plataforma"
             state={checking ? "checking" : ok ? "ok" : "down"}
             detail={ok && latency != null ? `${latency} ms` : undefined} />
        <Row label="Feed en tiempo real (WebSocket)" desc="Cinta de precios y ciclo de vida de mercados"
             state={checking ? "checking" : ok ? "ok" : "down"} />
        <Row label="Entorno" desc="Configuración del backend"
             state="info" detail={env ?? "—"} />
      </div>

      <p className="text-xs text-ink-500 dark:text-ink-400 mt-8">
        ¿Sos desarrollador? Mirá la <Link href="/api" className="text-accent-500 underline">API</Link>{" "}
        y su <a href={`${api.base}/health`} target="_blank" rel="noopener noreferrer" className="text-accent-500 underline">health check</a> crudo.
      </p>
    </div>
  );
}

function Row({ label, desc, state, detail }: {
  label: string; desc: string; state: "ok" | "down" | "checking" | "info"; detail?: string;
}) {
  const dot = state === "ok" ? "bg-yes-500" : state === "down" ? "bg-no-500" : state === "checking" ? "bg-ink-300 dark:bg-ink-600 animate-pulse" : "bg-ink-300 dark:bg-ink-600";
  const text = state === "ok" ? "Operativo" : state === "down" ? "Caído" : state === "checking" ? "Verificando" : (detail ?? "");
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-ink-500 dark:text-ink-400">{desc}</div>
      </div>
      <div className="text-xs num text-ink-600 dark:text-ink-300 text-right">
        {state !== "info" && <div className="font-medium">{text}</div>}
        {detail && state !== "info" && <div className="text-ink-400 dark:text-ink-500">{detail}</div>}
        {state === "info" && <div className="font-medium">{text}</div>}
      </div>
    </div>
  );
}
