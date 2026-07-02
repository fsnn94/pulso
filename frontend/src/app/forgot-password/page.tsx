"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.forgotPassword(email.trim());
      setSent(true);
      setDevLink(r.reset_link ?? null);
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo procesar el pedido");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto py-12 sm:py-20 px-4 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Recuperar contraseña</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mb-8">
        Ingresá tu email y te enviamos un link para elegir una nueva contraseña.
      </p>

      {sent ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-yes-500/30 bg-yes-500/5 px-4 py-3 text-sm text-yes-700 dark:text-yes-500">
            Si hay una cuenta con ese email, te enviamos un link de recuperación. Revisá tu bandeja (y el spam). El link expira en 2 horas.
          </div>
          {devLink && (
            <div className="rounded-lg border border-ink-200 dark:border-ink-800 px-4 py-3 text-xs">
              <div className="text-ink-500 dark:text-ink-400 mb-1">Modo desarrollo — link directo:</div>
              <Link href={devLink} className="text-accent-500 hover:underline break-all">{devLink}</Link>
            </div>
          )}
          <Link href="/login" className="inline-block text-sm text-accent-500 hover:underline">← Volver a ingresar</Link>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">Email</span>
              <input type="email" required autoCapitalize="none" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent"/>
            </label>
            {err && <div className="text-no-500 text-sm">{err}</div>}
            <button disabled={busy} type="submit"
                    className="w-full h-11 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
              {busy ? "Enviando..." : "Enviar link de recuperación"}
            </button>
          </form>
          <p className="mt-6 text-sm text-ink-500 dark:text-ink-400">
            <Link href="/login" className="text-accent-500 hover:underline">← Volver a ingresar</Link>
          </p>
        </>
      )}
    </div>
  );
}
