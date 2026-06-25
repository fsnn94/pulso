"use client";

import Link from "next/link";
import type { Market } from "@/lib/api";
import { compact, pct } from "@/lib/format";
import { ProbDial, Sparkline } from "./charts";

export function MarketCard({
  market, history, change30,
}: {
  market: Market;
  history?: { t: number; p: number }[];
  change30?: number;
}) {
  const trendUp = (change30 ?? 0) >= 0;
  return (
    <Link href={`/markets/${market.id}`}
          className="group rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/40 p-5 hover:border-ink-300 dark:hover:border-ink-700 hover:shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded bg-ink-50 dark:bg-ink-800 text-ink-500 dark:text-ink-400">
          {market.category}
        </span>
        {market.status !== "OPEN" && (
          <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300">
            {market.status}
          </span>
        )}
      </div>
      <h3 className="text-[15px] leading-snug font-medium mb-4 line-clamp-3 min-h-[3.6em]">{market.title}</h3>

      <div className="flex items-center gap-3 mb-3">
        <ProbDial p={market.current_yes_price} size={48} stroke={4}/>
        <div>
          <div className="text-2xl font-semibold num leading-none">{pct(market.current_yes_price, 0)}</div>
          {change30 !== undefined && (
            <div className={`text-xs num mt-1 ${trendUp ? "text-yes-500" : "text-no-500"}`}>
              {change30 >= 0 ? "+" : ""}{(change30 * 100).toFixed(1)}pp <span className="text-ink-400 dark:text-ink-500">30m</span>
            </div>
          )}
        </div>
        {history && history.length > 1 && (
          <div className="ml-auto -mr-1">
            <Sparkline data={history} w={92} h={36} accent={trendUp ? "#2D6A4F" : "#A41F13"}/>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 text-xs gap-2 pt-3 border-t border-ink-100 dark:border-ink-800 mt-auto">
        <Cell label="24h vol"   value={compact(market.volume_24h)}/>
        <Cell label="Liquidity" value={compact(market.liquidity)}/>
        <Cell label="Closes"    value={new Date(market.closes_at).toLocaleDateString([], { month: "short", day: "numeric" })}/>
      </div>
    </Link>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-ink-400 dark:text-ink-500 uppercase tracking-wider text-[10px]">{label}</div>
      <div className="num font-medium mt-0.5">{value}</div>
    </div>
  );
}
