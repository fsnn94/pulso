"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const COUNTRIES = [
  ["PY", "Paraguay"], ["AR", "Argentina"], ["BR", "Brasil"], ["CL", "Chile"],
  ["UY", "Uruguay"], ["BO", "Bolivia"], ["US", "Estados Unidos"], ["ES", "España"],
  ["MX", "México"], ["OT", "Otro"],
];

export default function KycPage() {
  const { user, loading, refresh } = useAuth();
  const [form, setForm] = useState({
    full_name: "", country: "PY", id_number: "",
    date_of_birth: "1990-01-01", document_type: "CEDULA" as "CEDULA" | "PASSPORT",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Edad calculada en cliente (aviso; la regla dura la aplica el backend).
  const age = ageFrom(form.date_of_birth);
  const underage = age !== null && age < 18;

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user) {
    return <div className="max-w-md mx-auto py-20 text-center text-sm text-ink-500">
      <Link href="/login" className="underline">Ingresa</Link> para gestionar tu perfil de cumplimiento.
    </div>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (underage) { setMsg({ kind: "err", text: "Debes ser mayor de 18 años." }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.submitKyc({
        full_name: form.full_name.trim(),
        country: form.country,
        id_number: form.id_number.trim(),
        date_of_birth: new Date(form.date_of_birth).toISOString(),
        document_type: form.document_type,
      });
      await refresh();
      setMsg({ kind: "ok", text: "Perfil de cumplimiento guardado. Gracias." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "No se pudo guardar" });
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 lg:py-14 view-enter">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Perfil de cumplimiento</p>
      <h1 className="text-3xl font-semibold tracking-tight mt-1">Verifica tu identidad</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mt-3 leading-relaxed">
        Estos campos son obligatorios si Pulso debe presentar reportes regulatorios (AML tipo SEPRELAD, registros para CNV). La información se cifra en reposo y solo se entrega a admins bajo procedimientos operativos documentados y el marco de base legal de la Ley 6534/2020 de Paraguay.
      </p>

      <div className="mt-4 mb-6 grid grid-cols-2 gap-2 text-xs">
        <Status label="Email verificado" ok={user.email_verified}/>
        <Status label={`Verificación: ${kycStatusLabel(user.kyc_status)}`} ok={user.kyc_status === "APPROVED"}/>
      </div>
      {user.kyc_status === "REJECTED" && user.kyc_rejection_reason && (
        <div className="mb-6 text-sm rounded-md px-3 py-2 bg-no-500/10 text-no-500">
          Verificación rechazada: {user.kyc_rejection_reason}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre legal completo">
          <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inp}/>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de documento">
            <select value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value as "CEDULA" | "PASSPORT" })} className={inp}>
              <option value="CEDULA">Cédula de identidad</option>
              <option value="PASSPORT">Pasaporte</option>
            </select>
          </Field>
          <Field label="País emisor (ISO alpha-2)">
            <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inp}>
              {COUNTRIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Número de documento">
          <input required value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} className={inp}/>
        </Field>
        <Field label="Fecha de nacimiento">
          <input required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className={inp}/>
          <span className={`block text-xs mt-1 ${underage ? "text-no-500" : "text-ink-500 dark:text-ink-400"}`}>
            {age === null ? "Ingresa tu fecha de nacimiento." : underage
              ? `Debes ser mayor de 18 años (tenés ${age}).`
              : `Edad: ${age} años ✓`}
          </span>
        </Field>
        {msg && (
          <div className={`text-sm rounded-md px-3 py-2 ${msg.kind === "ok" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>{msg.text}</div>
        )}
        <button type="submit" disabled={busy || underage}
                className="h-11 px-5 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
          {busy ? "Guardando..." : "Guardar perfil de cumplimiento"}
        </button>
      </form>

      {user.kyc_status !== "APPROVED" && (
        <DocsResubmit onSubmitted={refresh} />
      )}

      <p className="text-xs text-ink-500 dark:text-ink-400 mt-6">
        Lee el <Link href="/compliance" className="text-accent-500 underline">marco completo de cumplimiento paraguayo</Link>.
      </p>
    </div>
  );
}

function DocsResubmit({ onSubmitted }: { onSubmitted: () => Promise<void> }) {
  const [docs, setDocs] = useState<{ FRONT: File | null; BACK: File | null; SELFIE: File | null }>({ FRONT: null, BACK: null, SELFIE: null });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const send = async () => {
    if (!docs.FRONT || !docs.BACK || !docs.SELFIE) { setMsg({ kind: "err", text: "Subí las 3 imágenes." }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.uploadKycDocument("FRONT", docs.FRONT);
      await api.uploadKycDocument("BACK", docs.BACK);
      await api.uploadKycDocument("SELFIE", docs.SELFIE);
      await api.submitKycForReview();
      await onSubmitted();
      setMsg({ kind: "ok", text: "Documentos enviados. Tu cuenta está en revisión (hasta 48 hs)." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "No se pudo enviar" });
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-8 pt-6 border-t border-ink-200 dark:border-ink-800 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-accent-500">Documentos de identidad</h2>
      <p className="text-xs text-ink-500 dark:text-ink-400">Subí tu cédula (frente + dorso) y una selfie sosteniéndola. JPG, PNG, WEBP o PDF, máx. 8 MB.</p>
      {(["FRONT", "BACK", "SELFIE"] as const).map((side) => (
        <label key={side} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-ink-300 dark:border-ink-700 px-3 py-2.5 cursor-pointer hover:border-accent-500">
          <div className="text-sm">
            <div className="font-medium">{side === "FRONT" ? "Frente de la cédula" : side === "BACK" ? "Dorso de la cédula" : "Selfie con la cédula"}</div>
            <div className="text-xs text-ink-500 truncate max-w-[220px]">{docs[side]?.name ?? "Tocar para elegir"}</div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-md ${docs[side] ? "bg-yes-500/10 text-yes-500" : "bg-ink-100 dark:bg-ink-800 text-ink-500"}`}>{docs[side] ? "listo ✓" : "subir"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                 onChange={(e) => setDocs({ ...docs, [side]: e.target.files?.[0] ?? null })}/>
        </label>
      ))}
      {msg && <div className={`text-sm rounded-md px-3 py-2 ${msg.kind === "ok" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>{msg.text}</div>}
      <button type="button" onClick={send} disabled={busy}
              className="h-11 px-5 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
        {busy ? "Enviando..." : "Enviar a revisión"}
      </button>
    </div>
  );
}

function Status({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`rounded-md px-3 py-2 flex items-center gap-2 border ${ok ? "border-yes-500/30 bg-yes-500/5 text-yes-500" : "border-ink-200 dark:border-ink-800 text-ink-500"}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? "#2D6A4F" : "#9D9088" }}/>
      {label}
    </div>
  );
}

const inp = "w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">{label}</span>{children}</label>;
}

function ageFrom(dateStr: string): number | null {
  if (!dateStr) return null;
  const dob = new Date(dateStr);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function kycStatusLabel(status?: string): string {
  switch (status) {
    case "APPROVED": return "aprobada";
    case "SUBMITTED": return "enviada";
    case "UNDER_REVIEW": return "en revisión";
    case "REJECTED": return "rechazada";
    default: return "sin iniciar";
  }
}
