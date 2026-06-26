"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const { refresh } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "ok" | "err">("working");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancel = false;
    api.verifyEmail(token).then(async () => {
      if (cancel) return;
      await refresh();
      setStatus("ok");
      setTimeout(() => router.push("/"), 1500);
    }).catch((e) => {
      if (cancel) return;
      setStatus("err"); setMsg(e?.message ?? "Falló la verificación");
    });
    return () => { cancel = true; };
  }, [token, refresh, router]);

  return (
    <div className="max-w-md mx-auto py-20 px-6 text-center">
      {status === "working" && (
        <>
          <div className="text-xl font-medium mb-2">Verificando tu email...</div>
          <div className="text-sm text-ink-500 dark:text-ink-400">Un momento.</div>
        </>
      )}
      {status === "ok" && (
        <>
          <div className="w-12 h-12 mx-auto mb-3 grid place-items-center rounded-full bg-yes-500/15 text-yes-500">✓</div>
          <div className="text-xl font-semibold mb-2">Email verificado</div>
          <div className="text-sm text-ink-500 dark:text-ink-400">Ya puedes operar. Redirigiendo...</div>
        </>
      )}
      {status === "err" && (
        <>
          <div className="w-12 h-12 mx-auto mb-3 grid place-items-center rounded-full bg-no-500/15 text-no-500">!</div>
          <div className="text-xl font-semibold mb-2">Falló la verificación</div>
          <div className="text-sm text-ink-500 dark:text-ink-400 mb-4">{msg}</div>
          <Link href="/" className="text-accent-500 underline">Volver a mercados</Link>
        </>
      )}
    </div>
  );
}
