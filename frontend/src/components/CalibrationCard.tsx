"use client";

import { useEffect, useState } from "react";
import { api, Calibration } from "@/lib/api";

export function CalibrationCard() {
  const [cal, setCal] = useState<Calibration | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.calibration().then(setCal).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="rounded-xl border border-ink-100 dark:border-ink-800 p-5 h-40 animate-pulse bg-ink-50/50 dark:bg-ink-900/20"/>;
  if (!cal) return null;

  const has = cal.brier !== null && cal.forecasts > 0;

  return (
    <section className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Calibración</h2>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
            Qué tan buenas son tus predicciones, no solo cuánto ganaste.
          </p>
        </div>
        {has && (
          <div className="text-right">
            <div className="text-3xl font-semibold num leading-none">{cal.brier!.toFixed(3)}</div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500 mt-1">Brier score</div>
          </div>
        )}
      </div>

      {!has ? (
        <div className="mt-4 text-sm text-ink-500 dark:text-ink-400 rounded-lg border border-dashed border-ink-200 dark:border-ink-700 px-4 py-6 text-center">
          Todavía no tenés predicciones en mercados resueltos. Cuando tus mercados se resuelvan, vas a ver acá tu calibración.
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3 text-xs">
            <Verdict brier={cal.brier!} baseline={cal.baseline} />
            <span className="text-ink-500 dark:text-ink-400">
              {cal.forecasts} predicciones · {cal.markets} mercados
            </span>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row items-center gap-5">
            <CalibrationPlot bins={cal.bins} />
            <ul className="text-xs text-ink-500 dark:text-ink-400 space-y-1.5 leading-relaxed">
              <li>El eje X es lo que <strong>predijiste</strong>; el Y, lo que <strong>pasó</strong>.</li>
              <li>La línea punteada es la calibración perfecta.</li>
              <li>Puntos <strong>sobre</strong> la línea = fuiste conservador; <strong>debajo</strong> = exceso de confianza.</li>
              <li>Brier: 0 es perfecto; {cal.baseline} es predecir 50% siempre.</li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function Verdict({ brier, baseline }: { brier: number; baseline: number }) {
  const better = brier < baseline;
  return (
    <span className={`px-2 py-0.5 rounded-full font-medium ${better ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>
      {better ? "Mejor que el azar" : "Peor que predecir 50%"}
    </span>
  );
}

function CalibrationPlot({ bins }: { bins: Calibration["bins"] }) {
  const S = 200, pad = 24;
  const W = S - pad, H = S - pad;
  const x = (v: number) => pad + v * W;
  const y = (v: number) => S - pad - v * H;   // y crece hacia arriba
  const maxW = Math.max(1, ...bins.map((b) => b.weight));

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-[200px] h-[200px] shrink-0">
      {/* marco */}
      <rect x={pad} y={0} width={W} height={H} fill="none" stroke="currentColor" strokeOpacity={0.12}/>
      {/* diagonal de calibración perfecta */}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 3"/>
      {/* puntos */}
      {bins.map((b, i) => (
        <circle key={i} cx={x(b.predicted)} cy={y(b.actual)}
                r={4 + 6 * (b.weight / maxW)}
                className="fill-accent-500" fillOpacity={0.75}/>
      ))}
      {/* etiquetas ejes */}
      <text x={pad} y={S - 4} fontSize={9} fill="currentColor" fillOpacity={0.5}>0%</text>
      <text x={S - 22} y={S - 4} fontSize={9} fill="currentColor" fillOpacity={0.5}>100%</text>
      <text x={2} y={12} fontSize={9} fill="currentColor" fillOpacity={0.5}>pasó</text>
    </svg>
  );
}
