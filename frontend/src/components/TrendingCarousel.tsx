"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Market } from "@/lib/api";
import { compact, pct } from "@/lib/format";
import { ProbDial } from "./charts";
import { Icon } from "./Icon";

export function TrendingCarousel() {
  const [items, setItems] = useState<Market[]>([]);

  useEffect(() => {
    let cancel = false;
    api.listMarkets({ sort: "volume" })
      .then((res) => {
        if (cancel) return;
        setItems(res.items.filter((m) => m.status === "OPEN").slice(0, 5));
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  // Need a few to make a strip worth showing.
  if (items.length < 3) return null;

  // Render the set twice so the -50% translate loops seamlessly.
  const loop = [...items, ...items];

  return (
    <section className="border-b border-ink-100 dark:border-ink-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          <Icon name="arrow-up" className="w-3.5 h-3.5 text-accent-500" />
          Tendencia · más operados (24h)
        </div>
      </div>

      <div className="marquee-wrap relative py-4">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 sm:w-16 z-10 bg-gradient-to-r from-white dark:from-ink-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 sm:w-16 z-10 bg-gradient-to-l from-white dark:from-ink-950 to-transparent" />

        <div className="marquee-track flex gap-3 w-max">
          {loop.map((m, i) => (
            <TrendCard key={`${m.id}-${i}`} market={m} rank={(i % items.length) + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TrendCard({ market, rank }: { market: Market; rank: number }) {
  return (
    <Link
      href={`/markets/${market.id}`}
      className="shrink-0 w-[300px] rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/40 p-4 hover:border-ink-300 dark:hover:border-ink-700 hover:shadow-sm flex items-center gap-3 transition"
    >
      <div className="shrink-0 w-6 h-6 grid place-items-center rounded-md bg-accent-500/10 text-accent-500 text-xs font-semibold num">
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-ink-400 dark:text-ink-500 mb-0.5">{market.category}</div>
        <div className="text-sm font-medium leading-snug line-clamp-2">{market.title}</div>
        <div className="text-[11px] text-ink-400 dark:text-ink-500 mt-1 num">Vol {compact(market.volume_24h)}</div>
      </div>
      <div className="shrink-0 flex flex-col items-center">
        <ProbDial p={market.current_yes_price} size={40} stroke={4} />
        <div className="text-xs font-semibold num mt-1">{pct(market.current_yes_price, 0)}</div>
      </div>
    </Link>
  );
}
