"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

/** Aviso para el usuario cuya cuenta todavía no está verificada. No se muestra a
 *  cuentas APPROVED (ni admins grandfathered). Bloqueo real está en el backend. */
export function KycNotice() {
  const { user } = useAuth();
  if (!user) return null;
  const s = user.kyc_status ?? "NONE";
  if (s === "APPROVED") return null;

  if (s === "UNDER_REVIEW" || s === "SUBMITTED") {
    return (
      <Banner tone="wait">
        Tu identidad está <strong>en revisión</strong>. La verificación demora hasta 48 hs; podrás operar cuando se apruebe.
      </Banner>
    );
  }
  if (s === "REJECTED") {
    return (
      <Banner tone="err">
        Tu verificación fue rechazada{user.kyc_rejection_reason ? `: ${user.kyc_rejection_reason}` : ""}.{" "}
        <Link href="/settings/compliance" className="underline">Reenviar documentos</Link>.
      </Banner>
    );
  }
  // NONE: cuenta creada sin completar el envío de documentos.
  return (
    <Banner tone="wait">
      Falta enviar tu verificación de identidad para poder operar.{" "}
      <Link href="/settings/compliance" className="underline">Completar</Link>.
    </Banner>
  );
}

function Banner({ tone, children }: { tone: "wait" | "err"; children: React.ReactNode }) {
  const cls = tone === "err"
    ? "bg-no-500/10 text-no-500 border-no-500/20"
    : "bg-accent-500/10 text-accent-600 dark:text-accent-400 border-accent-500/20";
  return (
    <div className={`rounded-lg border px-4 py-2.5 text-sm ${cls}`}>{children}</div>
  );
}
