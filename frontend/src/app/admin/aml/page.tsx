"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, AmlAlert, AmlAlertStatus, AmlMute, AmlSeverity, AmlSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMarketSocket } from "@/lib/ws";
import { fmtDateTime, timeAgo } from "@/lib/format";

const RULE_LABELS: Record<string, string> = {
  WASH_TRADE:       "Operación ficticia — ambos lados del mismo mercado",
  VELOCITY:         "Velocidad de operaciones / pico de nocional",
  NEW_ACCOUNT_RUSH: "Operaciones rápidas en cuenta nueva",
  CONCENTRATION:    "Participación dominante del volumen 24h de un mercado",
  STRUCTURING:      "Muchas operaciones en una banda estrecha de nocional",
  RAPID_OPEN_CLOSE: "Apertura y cierre repetidos en minutos",
  RECIPROCAL_PAIR:  "Operaciones cruzadas repetidas con la misma contraparte",
};

const SEV_BG: Record<AmlSeverity, string> = {
  INFO:     "bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300",
  LOW:      "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500",
  MEDIUM:   "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  HIGH:     "bg-no-500/15 text-no-500",
  CRITICAL: "bg-no-500 text-white",
};

export default function AdminAmlPage() {
  const { user, loading } = useAuth();
  const [summary, setSummary] = useState<AmlSummary | null>(null);
  const [tab, setTab] = useState<AmlAlertStatus | "MUTES">("OPEN");
  const [mutes, setMutes] = useState<AmlMute[]>([]);
  const [muteFor, setMuteFor] = useState<{ user_id: string; rule_code: string } | null>(null);
  const [muteScope, setMuteScope] = useState<"rule" | "all">("rule");
  const [muteDuration, setMuteDuration] = useState<"24" | "168" | "720" | "forever">("24");
  const [muteReason, setMuteReason] = useState("");
  const [sev, setSev] = useState<AmlSeverity | "ALL">("ALL");
  const [rule, setRule] = useState<string | "ALL">("ALL");
  const [items, setItems] = useState<AmlAlert[]>([]);
  const [picked, setPicked] = useState<AmlAlert | null>(null);
  const [note, setNote] = useState("");
  const [scanBusy, setScanBusy] = useState(false);

  const reload = async () => {
    try {
      if (tab === "MUTES") {
        const [s, m] = await Promise.all([api.amlSummary(), api.listAmlMutes(true)]);
        setSummary(s); setMutes(m);
      } else {
        const [s, list] = await Promise.all([
          api.amlSummary(),
          api.amlAlerts({
            status: tab,
            severity: sev === "ALL" ? undefined : sev,
            rule:     rule === "ALL" ? undefined : rule,
          }),
        ]);
        setSummary(s);
        setItems(list);
      }
    } catch {}
  };

  useEffect(() => { if (user?.is_admin) reload(); }, [user?.id, tab, sev, rule]); // eslint-disable-line
  useMarketSocket((e: any) => {
    if (["aml_alert", "aml_scan_complete", "aml_mute_created", "aml_mute_revoked"].includes(e.type)) {
      reload();
    }
  });

  const submitMute = async () => {
    if (!muteFor) return;
    if (muteReason.trim().length < 5) { alert("El motivo debe tener al menos 5 caracteres."); return; }
    try {
      await api.createAmlMute({
        user_id: muteFor.user_id,
        rule_code: muteScope === "rule" ? muteFor.rule_code : null,
        duration_hours: muteDuration === "forever" ? null : parseInt(muteDuration, 10),
        reason: muteReason.trim(),
      });
      setMuteFor(null); setMuteReason(""); setMuteScope("rule"); setMuteDuration("24");
      reload();
    } catch (e: any) { alert(e?.message ?? "Falló"); }
  };

  const revokeMute = async (id: string) => {
    if (!confirm("¿Revocar este silenciamiento? Las alertas de esta regla volverán a dispararse.")) return;
    try { await api.revokeAmlMute(id); reload(); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
  };

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user?.is_admin) return <div className="p-12 text-center text-sm text-ink-500">Solo para admins.</div>;

  const decide = async (id: string, action: "ACK" | "DISMISS" | "ESCALATE") => {
    try {
      await api.reviewAmlAlert(id, { action, note: note || undefined });
      setPicked(null); setNote("");
      reload();
    } catch (e: any) { alert(e?.message ?? "Falló"); }
  };

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Alertas AML</h1>
          <p className="text-ink-500 dark:text-ink-400 text-sm mt-1">
            Hallazgos del motor de reglas. Acusa recibo para marcarlas como revisadas; escala para flaggear al usuario.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={async () => { setScanBusy(true); try { await api.triggerAmlScan(); reload(); } finally { setScanBusy(false); } }}
                  disabled={scanBusy}
                  className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-800 text-sm font-medium hover:bg-ink-50 dark:hover:bg-ink-900 disabled:opacity-50">
            {scanBusy ? "Escaneando..." : "Escanear ahora"}
          </button>
          <Link href="/admin" className="h-9 px-3 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-800 text-sm">← Inicio admin</Link>
        </div>
      </div>

      {/* Top tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Kpi label="Alertas abiertas" value={summary?.open_count.toString() ?? "—"}/>
        <Kpi label="Críticas"         value={(summary?.by_severity.CRITICAL ?? 0).toString()} accent="no"/>
        <Kpi label="Altas"            value={(summary?.by_severity.HIGH ?? 0).toString()} accent="no"/>
        <Kpi label="Medias"           value={(summary?.by_severity.MEDIUM ?? 0).toString()}/>
        <Kpi label="Bajas / Info"     value={(((summary?.by_severity.LOW ?? 0) + (summary?.by_severity.INFO ?? 0))).toString()}/>
      </div>

      {/* By-rule chips */}
      {summary && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setRule("ALL")}
                  className={`px-3 h-8 rounded-full text-xs font-medium border ${rule === "ALL"
                    ? "bg-ink-900 text-white border-ink-900 dark:bg-white dark:text-ink-900 dark:border-white"
                    : "border-ink-200 dark:border-ink-800 text-ink-600 dark:text-ink-300"}`}>
            Todas las reglas
          </button>
          {Object.entries(summary.by_rule).map(([r, n]) => (
            <button key={r} onClick={() => setRule(r)}
                    className={`px-3 h-8 rounded-full text-xs font-medium border ${rule === r
                      ? "bg-ink-900 text-white border-ink-900 dark:bg-white dark:text-ink-900 dark:border-white"
                      : "border-ink-200 dark:border-ink-800 text-ink-600 dark:text-ink-300"}`}>
              {r} <span className="num opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex bg-ink-50 dark:bg-ink-900 p-0.5 rounded-lg text-xs">
          {(["OPEN", "ACKED", "DISMISSED", "ESCALATED", "MUTES"] as const).map((s) => (
            <button key={s} onClick={() => setTab(s)}
                    className={`px-3 h-8 rounded-md font-medium ${tab === s
                      ? "bg-white dark:bg-ink-800 shadow-sm"
                      : "text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100"}`}>
              {s}
            </button>
          ))}
        </div>
        <select value={sev} onChange={(e) => setSev(e.target.value as AmlSeverity | "ALL")}
                className="h-8 text-sm rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent px-2">
          <option value="ALL">Todas las severidades</option>
          <option value="CRITICAL">Crítica</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Media</option>
          <option value="LOW">Baja</option>
          <option value="INFO">Info</option>
        </select>
      </div>

      {/* List */}
      {tab === "MUTES" ? (
        mutes.length === 0 ? (
          <div className="rounded-xl border border-ink-100 dark:border-ink-800 px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">
            No hay silenciamientos activos.
          </div>
        ) : (
          <div className="space-y-3">
            {mutes.map((m) => (
              <div key={m.id} className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
                      {m.rule_code ?? "TODAS LAS REGLAS"}
                    </span>
                    <span className="text-[11px] mono break-all text-ink-500 dark:text-ink-400">{m.user_id.slice(0, 8)}…</span>
                  </div>
                  <div className="text-sm mt-1 italic">"{m.reason}"</div>
                  <div className="text-[11px] text-ink-500 dark:text-ink-400 mt-1">
                    Activado {timeAgo(m.created_at)} · vence {m.expires_at ? fmtDateTime(m.expires_at) : "al revocarse"}
                  </div>
                </div>
                <button onClick={() => revokeMute(m.id)}
                        className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 text-sm font-medium hover:bg-no-500/10 hover:text-no-500 hover:border-no-500/30">
                  Revocar
                </button>
              </div>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-ink-100 dark:border-ink-800 px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">
          No hay alertas en {tab.toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded ${SEV_BG[a.severity]}`}>
                    {a.severity}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">{a.rule_code}</span>
                  {a.market_id && (
                    <Link href={`/markets/${a.market_id}`} className="text-[11px] text-accent-500 hover:underline mono">{a.market_id}</Link>
                  )}
                </div>
                <span className="text-xs text-ink-500 dark:text-ink-400">{timeAgo(a.updated_at)}</span>
              </div>
              <div className="text-xs text-ink-500 dark:text-ink-400 mb-1">{RULE_LABELS[a.rule_code] ?? a.rule_code}</div>
              <div className="text-sm leading-relaxed">{a.message}</div>
              <div className="text-[11px] text-ink-500 dark:text-ink-400 mt-2 mono break-all">
                usuario: {a.user_id}
              </div>
              {a.evidence && Object.keys(a.evidence).length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-ink-500 dark:text-ink-400 cursor-pointer">Evidencia</summary>
                  <pre className="text-[11px] mono mt-1 p-3 rounded bg-ink-50 dark:bg-ink-900 overflow-x-auto">{JSON.stringify(a.evidence, null, 2)}</pre>
                </details>
              )}
              {a.status === "OPEN" ? (
                <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-ink-100 dark:border-ink-800">
                  <button onClick={() => setPicked({ ...a })}
                          className="h-8 px-3 rounded-md border border-ink-200 dark:border-ink-700 text-xs font-medium hover:bg-ink-50 dark:hover:bg-ink-800">
                    Revisar con nota...
                  </button>
                  <button onClick={() => decide(a.id, "ACK")}
                          className="h-8 px-3 rounded-md bg-ink-100 dark:bg-ink-800 text-xs font-medium hover:bg-ink-200 dark:hover:bg-ink-700">
                    Acusar recibo
                  </button>
                  <button onClick={() => decide(a.id, "DISMISS")}
                          className="h-8 px-3 rounded-md text-xs font-medium hover:bg-ink-50 dark:hover:bg-ink-900 text-ink-500">
                    Descartar (falso positivo)
                  </button>
                  <button onClick={() => decide(a.id, "ESCALATE")}
                          className="h-8 px-3 rounded-md bg-no-500/15 text-no-500 hover:bg-no-500/25 text-xs font-medium">
                    Escalar — flaggear usuario
                  </button>
                  <button onClick={() => setMuteFor({ user_id: a.user_id, rule_code: a.rule_code })}
                          className="ml-auto h-8 px-3 rounded-md border border-ink-200 dark:border-ink-700 text-xs font-medium hover:bg-ink-50 dark:hover:bg-ink-800">
                    Silenciar...
                  </button>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800 text-xs text-ink-500 dark:text-ink-400">
                  {a.status} {a.reviewed_at && `· ${timeAgo(a.reviewed_at)}`}
                  {a.review_note && <span className="italic"> · {a.review_note}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Review-with-note modal */}
      {picked && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setPicked(null)}>
          <div className="bg-white dark:bg-ink-900 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">{picked.rule_code}</h3>
            <p className="text-sm text-ink-500 dark:text-ink-400 mb-3">{picked.message}</p>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Nota de revisión (queda registrada en la alerta y se muestra si se escala)..."
                      className="w-full px-3 py-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm"/>
            <div className="flex flex-wrap justify-end gap-2 mt-3">
              <button onClick={() => { setPicked(null); setNote(""); }} className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 text-sm">Cancelar</button>
              <button onClick={() => decide(picked.id, "DISMISS")} className="h-9 px-3 rounded-lg text-sm font-medium hover:bg-ink-50 dark:hover:bg-ink-800">Descartar</button>
              <button onClick={() => decide(picked.id, "ACK")} className="h-9 px-3 rounded-lg bg-ink-100 dark:bg-ink-800 text-sm font-medium">Acusar recibo</button>
              <button onClick={() => decide(picked.id, "ESCALATE")} className="h-9 px-3 rounded-lg bg-no-500 text-white text-sm font-medium">Escalar</button>
            </div>
          </div>
        </div>
      )}

      {/* Mute modal */}
      {muteFor && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setMuteFor(null)}>
          <div className="bg-white dark:bg-ink-900 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Silenciar alertas AML</h3>
            <p className="text-xs text-ink-500 dark:text-ink-400 mb-4">
              Suprime futuros hallazgos para este usuario. El registro de auditoría sigue documentando la supresión.
            </p>

            <label className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">Alcance</label>
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <button onClick={() => setMuteScope("rule")}
                      className={`h-10 rounded-lg border font-medium ${muteScope === "rule"
                        ? "bg-ink-900 text-white border-ink-900 dark:bg-white dark:text-ink-900 dark:border-white"
                        : "border-ink-200 dark:border-ink-700"}`}>
                Solo {muteFor.rule_code}
              </button>
              <button onClick={() => setMuteScope("all")}
                      className={`h-10 rounded-lg border font-medium ${muteScope === "all"
                        ? "bg-ink-900 text-white border-ink-900 dark:bg-white dark:text-ink-900 dark:border-white"
                        : "border-ink-200 dark:border-ink-700"}`}>
                Todas las reglas para este usuario
              </button>
            </div>

            <label className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">Duración</label>
            <select value={muteDuration} onChange={(e) => setMuteDuration(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-700 bg-transparent text-sm mb-3">
              <option value="24">24 horas</option>
              <option value="168">7 días</option>
              <option value="720">30 días</option>
              <option value="forever">Hasta revocarse</option>
            </select>

            <label className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">Motivo (obligatorio, queda en auditoría)</label>
            <textarea rows={3} value={muteReason} onChange={(e) => setMuteReason(e.target.value)}
                      placeholder="ej. Market maker verificado de ABC, alta velocidad esperada"
                      className="w-full px-3 py-2 rounded-lg border border-ink-200 dark:border-ink-700 bg-transparent text-sm"/>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setMuteFor(null); setMuteReason(""); }}
                      className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 text-sm">Cancelar</button>
              <button onClick={submitMute} disabled={muteReason.trim().length < 5}
                      className="h-9 px-3 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium disabled:opacity-50">
                Silenciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "no" }) {
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4">
      <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</div>
      <div className={`text-2xl font-semibold num mt-1 ${accent === "no" ? "text-no-500" : ""}`}>{value}</div>
    </div>
  );
}
