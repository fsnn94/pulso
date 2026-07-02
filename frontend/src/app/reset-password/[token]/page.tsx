"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { refresh } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres."); return; }
    if (pw !== pw2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.resetPassword(params.token, pw);
      tokens.set(r.access_token);   // el reset devuelve un token → quedás logueado
      await refresh();
      router.push("/portfolio");
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo restablecer la contraseña");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto py-12 sm:py-20 px-4 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Nueva contraseña</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mb-8">Elegí una contraseña nueva para tu cuenta.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">Nueva contraseña</span>
          <input type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
                 className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent"/>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">Repetí la contraseña</span>
          <input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)}
                 className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent"/>
        </label>
        {err && <div className="text-no-500 text-sm">{err}</div>}
        <button disabled={busy} type="submit"
                className="w-full h-11 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
          {busy ? "Guardando..." : "Cambiar contraseña"}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-500 dark:text-ink-400">
        ¿El link no funciona? <Link href="/forgot-password" className="text-accent-500 hover:underline">Pedí uno nuevo</Link>
      </p>
    </div>
  );
}
