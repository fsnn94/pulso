"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "./Icon";

export function VerificationBanner() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  if (!user || user.email_verified) return null;

  const resend = async () => {
    setBusy(true);
    try {
      const r = await api.resendVerification();
      if (r.verification_link) setLink(r.verification_link);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo reenviar");
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-ink-700 dark:text-ink-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3 text-[13px] flex-wrap">
        <span className="text-yellow-600 dark:text-yellow-500 flex-shrink-0"><Icon name="info" className="w-4 h-4"/></span>
        <span>
          <span className="font-medium">Verifica tu email</span> para poder operar. Enviamos un link a <span className="mono">{user.email}</span>.
        </span>
        <button onClick={resend} disabled={busy}
                className="ml-auto h-7 px-2.5 text-xs rounded-md border border-yellow-500/30 hover:bg-yellow-500/10 font-medium disabled:opacity-50">
          {busy ? "Enviando..." : "Reenviar"}
        </button>
        {link && (
          <Link href={link.replace(/^https?:\/\/[^/]+/, "")} onClick={() => void refresh()}
                className="text-yellow-600 dark:text-yellow-500 underline underline-offset-2 ml-1 text-xs">
            Abrir link de verificación (modo dev)
          </Link>
        )}
      </div>
    </div>
  );
}
