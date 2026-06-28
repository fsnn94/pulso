"use client";

import { useEffect, useState } from "react";
import { api, MarketSummary } from "@/lib/api";
import { compact, usd } from "@/lib/format";

export function MarketSummaryCard({ marketId }: { marketId: string }) {
  const [s, setS] = useState<MarketSummary | null>(null);

  useEffect(() => {
    let cancel = false;
    api.marketSummary(marketId).then((d) => { if (!cancel) setS(d); }).catch(() => {});
    return () => { cancel = true; };
  }, [marketId]);

  if (!s) return null;

  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Resumen del mercado</h3>
        {s.status === "RESOLVED" && s.resolved_outcome && (
          <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded ${
            s.resolved_outcome === "YES" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>
            Resuelto {s.resolved_outcome}
          </span>
        )}
        {s.status === "VOIDED" && (
          <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
            Anulado
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Participantes"      value={s.participants.toLocaleString()} />
        <Stat label="Movimiento total"   value={usd(s.total_volume)} />
        <Stat label="Contratos operados" value={compact(s.total_contracts)} />
        <Stat label="Payout distribuido" value={usd(s.total_payout)} />
      </div>

      {s.resolved_at && (
        <p className="text-xs text-ink-500 dark:text-ink-400 mt-4 pt-3 border-t border-ink-100 dark:border-ink-800">
          Liquidado el {new Date(s.resolved_at).toLocaleString()}.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 dark:border-ink-800 p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</div>
      <div className="num font-semibold text-lg mt-0.5">{value}</div>
    </div>
  );
}
