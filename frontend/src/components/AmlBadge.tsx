"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMarketSocket } from "@/lib/ws";

export function AmlBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.is_admin) return;
    let cancel = false;
    api.amlSummary().then((s) => !cancel && setCount(s.open_count)).catch(() => {});
    const t = setInterval(() => api.amlSummary().then((s) => !cancel && setCount(s.open_count)).catch(() => {}), 30_000);
    return () => { cancel = true; clearInterval(t); };
  }, [user?.id]); // eslint-disable-line

  useMarketSocket((e: any) => {
    if (!user?.is_admin) return;
    if (e.type === "aml_alert") setCount((c) => (c ?? 0) + 1);
    if (e.type === "aml_scan_complete") api.amlSummary().then((s) => setCount(s.open_count)).catch(() => {});
  });

  if (!user?.is_admin || count == null || count === 0) return null;

  return (
    <Link href="/admin/aml"
          className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-no-500/10 text-no-500 hover:bg-no-500/20 text-sm font-medium">
      <span className="w-1.5 h-1.5 bg-no-500 rounded-full livedot"/>
      <span className="num">{count}</span>
      <span className="text-xs">AML</span>
    </Link>
  );
}
