"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Proposal } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMarketSocket } from "@/lib/ws";
import { fmtDateTime, timeAgo } from "@/lib/format";

export default function AdminProposalsPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [items, setItems] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<Proposal | null>(null);
  const [note, setNote] = useState("");

  const reload = () => api.listProposals(tab).then(setItems).catch(() => {});

  useEffect(() => { if (user?.is_admin) reload(); }, [user?.id, tab]); // eslint-disable-line
  useMarketSocket((e: any) => { if (e.type === "proposal" || e.type === "proposal_reviewed") reload(); });

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user?.is_admin) return <div className="p-12 text-center text-sm text-ink-500">Solo para admins.</div>;

  const decide = async (id: string, decision: "APPROVED" | "REJECTED", reviewNote?: string) => {
    setBusy(id);
    try { await api.reviewProposal(id, { decision, review_note: reviewNote }); reload(); setPickFor(null); setNote(""); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Propuestas de mercado</h1>
          <p className="text-ink-500 dark:text-ink-400 text-sm mt-1">Revisa los mercados propuestos por los usuarios antes de publicarlos.</p>
        </div>
        <Link href="/admin" className="h-9 px-3 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-800 text-sm">← Inicio admin</Link>
      </div>

      <div className="flex bg-ink-50 dark:bg-ink-900 p-0.5 rounded-lg text-xs w-fit mb-4">
        {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
          <button key={s} onClick={() => setTab(s)}
                  className={`px-3 h-8 rounded-md font-medium ${tab === s
                    ? "bg-white dark:bg-ink-800 shadow-sm"
                    : "text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100"}`}>
            {s} {tab === s && `(${items.length})`}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-ink-100 dark:border-ink-800 px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">
          No hay propuestas en {tab.toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((p) => (
            <div key={p.id} className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded bg-ink-50 dark:bg-ink-800 text-ink-500 dark:text-ink-400 mr-2">{p.category}</span>
                  <span className="text-[11px] text-ink-500 dark:text-ink-400 mono">{p.slug}</span>
                </div>
                <span className="text-xs text-ink-500 dark:text-ink-400">{timeAgo(p.created_at)}</span>
              </div>
              <h3 className="text-lg font-medium leading-tight">{p.title}</h3>
              <p className="text-sm text-ink-600 dark:text-ink-300 mt-2 leading-relaxed">{p.description}</p>
              {p.rationale && (
                <p className="text-xs text-ink-500 dark:text-ink-400 mt-2 italic border-l-2 border-ink-200 dark:border-ink-700 pl-3">
                  Motivación: {p.rationale}
                </p>
              )}
              <div className="mt-3 grid sm:grid-cols-4 gap-3 text-xs text-ink-500 dark:text-ink-400">
                <KV k="Cierra"  v={fmtDateTime(p.closes_at)}/>
                <KV k="Inicial" v={`${(p.initial_yes_price * 100).toFixed(0)}¢ YES`}/>
                <KV k="Fuente"  v={p.resolution_source}/>
                <KV k="Autor"   v={p.submitter_id.slice(0, 8)}/>
              </div>
              {p.status === "PENDING" ? (
                <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-ink-100 dark:border-ink-800">
                  <button disabled={busy === p.id} onClick={() => decide(p.id, "APPROVED")}
                          className="h-9 px-4 rounded-lg bg-yes-500 hover:bg-yes-600 text-white text-sm font-medium disabled:opacity-50">
                    Aprobar y publicar
                  </button>
                  <button disabled={busy === p.id} onClick={() => setPickFor(p)}
                          className="h-9 px-4 rounded-lg bg-no-500/10 hover:bg-no-500/20 text-no-500 text-sm font-medium disabled:opacity-50">
                    Rechazar...
                  </button>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800 text-xs text-ink-500 dark:text-ink-400">
                  {p.status === "APPROVED" && p.approved_market_id && (
                    <Link href={`/markets/${p.approved_market_id}`} className="text-accent-500 hover:underline">Ver mercado en vivo →</Link>
                  )}
                  {p.review_note && <div className="mt-1">Nota del admin: <span className="italic">{p.review_note}</span></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pickFor && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setPickFor(null)}>
          <div className="bg-white dark:bg-ink-900 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">¿Rechazar "{pickFor.title}"?</h3>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Nota opcional para quien la envió..."
                      className="w-full px-3 py-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm"/>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setPickFor(null)} className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 text-sm">Cancelar</button>
              <button onClick={() => decide(pickFor.id, "REJECTED", note || undefined)}
                      className="h-9 px-3 rounded-lg bg-no-500 text-white text-sm font-medium">Rechazar propuesta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="uppercase tracking-wider text-[10px] text-ink-400 dark:text-ink-500">{k}</div>
      <div className="num text-ink-700 dark:text-ink-200 mt-0.5">{v}</div>
    </div>
  );
}
