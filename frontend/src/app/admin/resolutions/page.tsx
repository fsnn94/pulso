"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ResolutionOutcome, ResolutionProposal } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMarketSocket } from "@/lib/ws";
import { timeAgo } from "@/lib/format";

function untilFinalize(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AdminResolutionsPage() {
  const { user, loading } = useAuth();
  const [queue, setQueue] = useState<ResolutionProposal[]>([]);
  const [tab, setTab] = useState<"QUEUE" | "ALL">("QUEUE");
  const [all, setAll] = useState<ResolutionProposal[]>([]);
  const [picked, setPicked] = useState<ResolutionProposal | null>(null);
  const [outcome, setOutcome] = useState<ResolutionOutcome>("YES");
  const [note, setNote] = useState("");
  const [, force] = useState(0);

  const reload = async () => {
    try {
      const [q, a] = await Promise.all([api.resolutionQueue(), api.listResolutions()]);
      setQueue(q); setAll(a);
    } catch {}
  };
  useEffect(() => { if (user?.is_admin) reload(); }, [user?.id]); // eslint-disable-line
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useMarketSocket((e: any) => {
    if (["resolution_proposed", "resolution_finalized", "resolution_disputed", "market_closed"].includes(e.type)) {
      reload();
    }
  });

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Loading…</div>;
  if (!user?.is_admin) return <div className="p-12 text-center text-sm text-ink-500">Admins only.</div>;

  const confirm = async (p: ResolutionProposal, chosen: ResolutionOutcome) => {
    const overriding = p.proposed_outcome !== null && p.proposed_outcome !== chosen;
    if (overriding && !note.trim()) {
      alert("An override requires a note explaining your decision.");
      return;
    }
    try {
      await api.confirmResolution(p.id, { outcome: chosen, note: note.trim() || undefined });
      setPicked(null); setNote(""); setOutcome("YES");
      reload();
    } catch (e: any) { alert(e?.message ?? "Failed"); }
  };

  const items = tab === "QUEUE" ? queue : all;

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Resolutions</h1>
          <p className="text-ink-500 dark:text-ink-400 text-sm mt-1">
            Pending: {queue.length}. Auto-finalize is 24h unless disputed or overridden.
          </p>
        </div>
        <Link href="/admin" className="h-9 px-3 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-800 text-sm">← Admin home</Link>
      </div>

      <div className="flex bg-ink-50 dark:bg-ink-900 p-0.5 rounded-lg text-xs w-fit mb-4">
        {(["QUEUE", "ALL"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
                  className={`px-3 h-8 rounded-md font-medium ${tab === t
                    ? "bg-white dark:bg-ink-800 shadow-sm"
                    : "text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100"}`}>
            {t} ({t === "QUEUE" ? queue.length : all.length})
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-ink-100 dark:border-ink-800 px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">
          Nothing here. Markets land in the queue automatically when their close date passes.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => {
            const isDisputed = p.status === "DISPUTED";
            const overriding = picked?.id === p.id && p.proposed_outcome !== null && p.proposed_outcome !== outcome;
            return (
              <div key={p.id} className={`rounded-xl border bg-white dark:bg-ink-900/30 p-5 ${isDisputed ? "border-no-500/40" : "border-ink-100 dark:border-ink-800"}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded ${
                      isDisputed ? "bg-no-500/15 text-no-500" :
                      p.status === "CONFIRMED" || p.status === "OVERRIDDEN" ? "bg-yes-500/15 text-yes-500" :
                      "bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300"
                    }`}>{p.status}</span>
                    <Link href={`/markets/${p.market_id}`} className="text-sm font-medium hover:text-accent-500 mono">{p.market_id}</Link>
                    <span className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400">{p.resolver_code}</span>
                  </div>
                  <span className="text-xs text-ink-500 dark:text-ink-400">{timeAgo(p.proposed_at)}</span>
                </div>
                <div className="text-sm mt-2">
                  {p.proposed_outcome ? (
                    <>
                      Resolver says{" "}
                      <span className={`font-semibold ${
                        p.proposed_outcome === "YES" ? "text-yes-500"
                        : p.proposed_outcome === "NO" ? "text-no-500"
                        : "text-ink-700 dark:text-ink-300"
                      }`}>{p.proposed_outcome}</span>{" "}
                      <span className="text-ink-500 dark:text-ink-400">— from {p.source_name}</span>
                      {p.source_url && (<>
                        {" · "}
                        <a href={p.source_url} target="_blank" rel="noreferrer" className="text-accent-500 hover:underline mono text-xs">source</a>
                      </>)}
                    </>
                  ) : (
                    <span className="text-ink-500 dark:text-ink-400">No automatic decision — admin must choose YES/NO.</span>
                  )}
                </div>
                <div className="text-xs text-ink-500 dark:text-ink-400 mt-2 flex gap-3 flex-wrap">
                  <span>Confidence: <span className="num">{(p.confidence * 100).toFixed(0)}%</span></span>
                  <span>Auto-finalize in: <span className="num">{untilFinalize(p.finalizes_at)}</span></span>
                  {p.dispute_count > 0 && <span className="text-no-500 font-medium">{p.dispute_count} dispute{p.dispute_count !== 1 ? "s" : ""}</span>}
                </div>
                {p.evidence && Object.keys(p.evidence).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-ink-500 dark:text-ink-400 cursor-pointer">Evidence</summary>
                    <pre className="text-[11px] mono mt-1 p-3 rounded bg-ink-50 dark:bg-ink-900 overflow-x-auto">{JSON.stringify(p.evidence, null, 2)}</pre>
                  </details>
                )}
                {(p.status === "PENDING" || p.status === "DISPUTED") ? (
                  <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-ink-100 dark:border-ink-800">
                    {p.proposed_outcome && (
                      <button onClick={() => confirm(p, p.proposed_outcome!)}
                              className="h-9 px-3 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium">
                        Confirm {p.proposed_outcome}
                      </button>
                    )}
                    <button onClick={() => { setPicked(p); setOutcome(p.proposed_outcome === "NO" ? "YES" : "NO"); }}
                            className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 text-sm font-medium hover:bg-ink-50 dark:hover:bg-ink-800">
                      Override / decide…
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800 text-xs text-ink-500 dark:text-ink-400">
                    Confirmed {p.confirmed_outcome} {p.confirmed_at && `· ${timeAgo(p.confirmed_at)}`}
                    {p.confirm_note && <div className="italic mt-1">"{p.confirm_note}"</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {picked && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => { setPicked(null); setNote(""); }}>
          <div className="bg-white dark:bg-ink-900 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Decide market <span className="mono">{picked.market_id}</span></h3>
            <p className="text-xs text-ink-500 dark:text-ink-400 mb-3">
              Resolver said {picked.proposed_outcome ?? "(no decision)"}. Picking the other side counts as an override and requires a note.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button onClick={() => setOutcome("YES")}
                      className={`h-12 rounded-lg border font-semibold ${outcome === "YES"
                        ? "bg-yes-500 border-yes-500 text-white"
                        : "border-ink-200 dark:border-ink-700 text-yes-500"}`}>YES</button>
              <button onClick={() => setOutcome("NO")}
                      className={`h-12 rounded-lg border font-semibold ${outcome === "NO"
                        ? "bg-no-500 border-no-500 text-white"
                        : "border-ink-200 dark:border-ink-700 text-no-500"}`}>NO</button>
              <button onClick={() => setOutcome("VOID")}
                      className={`h-12 rounded-lg border font-semibold ${outcome === "VOID"
                        ? "bg-ink-700 border-ink-700 text-white dark:bg-ink-300 dark:border-ink-300 dark:text-ink-900"
                        : "border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300"}`}>VOID</button>
            </div>
            {outcome === "VOID" && (
              <p className="text-xs text-ink-500 dark:text-ink-400 mb-2 italic">
                VOID refunds every open position at its avg cost. Use when the event was canceled or rules are ambiguous.
              </p>
            )}
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder={(picked.proposed_outcome && picked.proposed_outcome !== outcome) ? "Required: why are you overriding?" : "Optional note…"}
                      className="w-full px-3 py-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm mb-3"/>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPicked(null); setNote(""); }} className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 text-sm">Cancel</button>
              <button onClick={() => confirm(picked, outcome)}
                      className="h-9 px-3 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium">
                Resolve {outcome}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
