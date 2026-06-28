"use client";

import { useState } from "react";
import Link from "next/link";
import { api, tokens } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Msg = { kind: "ok" | "err"; text: string } | null;

export default function SettingsPage() {
  const { user, loading, refresh } = useAuth();

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="text-2xl font-semibold mb-2">Ingresá para administrar tu cuenta</h1>
      <Link href="/login" className="inline-block h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium mt-4">Ingresar</Link>
    </div>
  );

  return (
    <div className="view-enter max-w-2xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
          Conectado como <span className="font-medium">@{user.handle}</span> · {user.email}
        </p>
      </div>

      <HandleCard currentHandle={user.handle} onChanged={refresh} />
      <PasswordCard />
      <ExternalAccountsCard />
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 sm:p-6 mb-6">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="text-sm text-ink-500 dark:text-ink-400 mt-0.5 mb-4">{desc}</p>}
      {children}
    </section>
  );
}

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div className={`rounded-lg px-3 py-2 mt-3 text-sm border ${msg.kind === "ok"
      ? "border-yes-500/30 bg-yes-500/5 text-yes-700 dark:text-yes-500"
      : "border-no-500/30 bg-no-500/5 text-no-700 dark:text-no-500"}`}>
      {msg.text}
    </div>
  );
}

const input = "w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm";

function HandleCard({ currentHandle, onChanged }: { currentHandle: string; onChanged: () => Promise<void> }) {
  const [handle, setHandle] = useState(currentHandle);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (handle.trim() === currentHandle) { setMsg({ kind: "err", text: "El usuario es el mismo." }); return; }
    setBusy(true);
    try {
      await api.changeHandle(handle.trim());
      await onChanged();
      setMsg({ kind: "ok", text: "Usuario actualizado." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "No se pudo cambiar el usuario." });
    } finally { setBusy(false); }
  };

  return (
    <Card title="Nombre de usuario" desc="Tu @handle público. Letras, números y guion bajo (2-40).">
      <form onSubmit={submit} className="flex gap-2 items-start">
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-ink-400">@</span>
            <input className={input} value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={40} />
          </div>
        </div>
        <button disabled={busy} className="h-10 px-4 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium disabled:opacity-50">
          {busy ? "Guardando..." : "Guardar"}
        </button>
      </form>
      <Feedback msg={msg} />
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 6) { setMsg({ kind: "err", text: "La nueva contraseña debe tener al menos 6 caracteres." }); return; }
    if (next !== confirm) { setMsg({ kind: "err", text: "Las contraseñas nuevas no coinciden." }); return; }
    setBusy(true);
    try {
      const { access_token } = await api.changePassword({ current_password: current, new_password: next });
      tokens.set(access_token); // keep the session valid with the fresh token
      setCurrent(""); setNext(""); setConfirm("");
      setMsg({ kind: "ok", text: "Contraseña actualizada." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "No se pudo cambiar la contraseña." });
    } finally { setBusy(false); }
  };

  return (
    <Card title="Contraseña" desc="Necesitás tu contraseña actual para cambiarla.">
      <form onSubmit={submit} className="space-y-3">
        <input className={input} type="password" placeholder="Contraseña actual" autoComplete="current-password"
               value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input className={input} type="password" placeholder="Nueva contraseña" autoComplete="new-password"
               value={next} onChange={(e) => setNext(e.target.value)} />
        <input className={input} type="password" placeholder="Repetir nueva contraseña" autoComplete="new-password"
               value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button disabled={busy || !current || !next} className="h-10 px-4 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium disabled:opacity-50">
          {busy ? "Guardando..." : "Cambiar contraseña"}
        </button>
      </form>
      <Feedback msg={msg} />
    </Card>
  );
}

function ExternalAccountsCard() {
  return (
    <Card title="Cuentas externas" desc="Vincular cuentas externas para depósitos y retiros.">
      <div className="rounded-lg border border-dashed border-ink-200 dark:border-ink-700 px-4 py-6 text-center">
        <div className="text-sm font-medium">Próximamente</div>
        <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
          Esta es una vista previa con créditos simulados. La vinculación de cuentas externas estará disponible más adelante.
        </p>
      </div>
    </Card>
  );
}
