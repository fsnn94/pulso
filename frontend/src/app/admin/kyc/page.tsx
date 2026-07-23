"use client";

import { useCallback, useEffect, useState } from "react";
import { api, KycProfile, hasCap } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STATUSES = ["UNDER_REVIEW", "SUBMITTED", "APPROVED", "REJECTED", "ALL"];

export default function AdminKycPage() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState("UNDER_REVIEW");
  const [rows, setRows] = useState<KycProfile[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canAccess = hasCap(user, "kyc");

  const reload = useCallback(() => {
    if (!canAccess) return;
    api.adminKycList(status).then(setRows).catch((e) => setErr(e?.message ?? "Error"));
  }, [canAccess, status]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!canAccess) return <div className="p-12 text-center text-sm text-ink-500">No tenés permiso para esta sección.</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 view-enter">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Panel · Verificación</p>
      <h1 className="text-2xl font-semibold tracking-tight mt-1">Revisión de identidad (KYC)</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mt-2">Revisá los datos y documentos, y aprobá o rechazá cada cuenta.</p>

      <div className="mt-4 flex gap-1.5 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
                  className={`h-8 px-3 rounded-full text-xs font-medium ${status === s ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "bg-ink-100 dark:bg-ink-800 text-ink-500"}`}>
            {s}
          </button>
        ))}
      </div>

      {err && <div className="mt-4 text-sm rounded-md px-3 py-2 bg-no-500/10 text-no-500">{err}</div>}

      <div className="mt-4 space-y-2">
        {rows.length === 0 && <p className="text-sm text-ink-500">Nada en este estado.</p>}
        {rows.map((p) => (
          <ProfileRow key={p.user_id} p={p} open={openId === p.user_id}
                      onToggle={() => setOpenId(openId === p.user_id ? null : p.user_id)}
                      onChanged={reload}/>
        ))}
      </div>
    </div>
  );
}

function ProfileRow({ p, open, onToggle, onChanged }: { p: KycProfile; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); onChanged(); }
    catch (e: any) { setErr(e?.message ?? "Error"); }
    finally { setBusy(false); }
  };
  const reject = () => {
    const reason = window.prompt("Motivo del rechazo:");
    if (reason && reason.trim().length >= 3) act(() => api.rejectKyc(p.user_id, reason.trim()));
  };

  return (
    <div className="rounded-lg border border-ink-200 dark:border-ink-800">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-3 text-left">
        <div>
          <div className="font-medium text-sm">{p.full_name || p.handle} <span className="text-ink-500">@{p.handle}</span></div>
          <div className="text-xs text-ink-500">{p.email} · {new Date(p.created_at).toLocaleDateString()}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${badge(p.kyc_status)}`}>{p.kyc_status}</span>
      </button>

      {open && (
        <div className="border-t border-ink-200 dark:border-ink-800 p-3 space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Info k="Nombres" v={p.first_name}/><Info k="Apellidos" v={p.last_name}/>
            <Info k="Documento" v={`${p.document_type ?? ""} ${p.id_number ?? ""}`}/>
            <Info k="País" v={p.country}/>
            <Info k="Nacimiento" v={p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString() : null}/>
            <Info k="Teléfono" v={p.phone}/>
            <Info k="Dirección" v={p.address}/>
          </dl>

          <div className="grid grid-cols-3 gap-2">
            {["FRONT", "BACK", "SELFIE"].map((side) => {
              const doc = p.documents.find((d) => d.side === side);
              return <DocThumb key={side} label={side} userId={p.user_id} docId={doc?.id}/>;
            })}
          </div>

          {p.kyc_rejection_reason && <div className="text-xs text-no-500">Rechazo previo: {p.kyc_rejection_reason}</div>}
          {err && <div className="text-sm text-no-500">{err}</div>}

          {p.kyc_status !== "APPROVED" && (
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => act(() => api.approveKyc(p.user_id))}
                      className="h-9 px-4 rounded-md bg-yes-500/10 text-yes-500 text-sm font-medium disabled:opacity-50">
                Aprobar
              </button>
              <button disabled={busy} onClick={reject}
                      className="h-9 px-4 rounded-md bg-no-500/10 text-no-500 text-sm font-medium disabled:opacity-50">
                Rechazar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocThumb({ label, userId, docId }: { label: string; userId: string; docId?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!docId) return;
    let dead = false; let created: string | null = null;
    api.kycDocBlobUrl(userId, docId).then((u) => { if (!dead) { created = u; setUrl(u); } }).catch(() => setErr(true));
    return () => { dead = true; if (created) URL.revokeObjectURL(created); };
  }, [userId, docId]);

  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">{label}</div>
      {!docId ? <div className="h-28 rounded-md bg-no-500/5 text-no-500 text-xs flex items-center justify-center">falta</div>
        : err ? <div className="h-28 rounded-md bg-ink-100 dark:bg-ink-800 text-ink-500 text-xs flex items-center justify-center">error</div>
        : url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className="h-28 w-full object-cover rounded-md border border-ink-200 dark:border-ink-800"/></a>
        : <div className="h-28 rounded-md bg-ink-100 dark:bg-ink-800 animate-pulse"/>}
    </div>
  );
}

function Info({ k, v }: { k: string; v?: string | null }) {
  return <><dt className="text-ink-500 text-xs">{k}</dt><dd className="text-sm">{v || "—"}</dd></>;
}

function badge(s: string): string {
  if (s === "APPROVED") return "bg-yes-500/10 text-yes-500";
  if (s === "REJECTED") return "bg-no-500/10 text-no-500";
  if (s === "UNDER_REVIEW" || s === "SUBMITTED") return "bg-accent-500/10 text-accent-500";
  return "bg-ink-100 dark:bg-ink-800 text-ink-500";
}
