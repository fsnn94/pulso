"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, Balance, Deposit, Withdrawal } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const EXP: Record<string, number> = { PYG: 0, USD: 2, EUR: 2, BRL: 2, ARS: 2, UYU: 2, CLP: 0 };
function fmtMinor(minor: number, currency: string): string {
  const e = EXP[currency] ?? 2;
  const v = e ? (minor / 10 ** e).toFixed(e) : String(minor);
  return `${v} ${currency}`;
}

type Msg = { kind: "ok" | "err"; text: string } | null;

export default function WalletPage() {
  const { user, loading } = useAuth();
  const [cfg, setCfg] = useState<{ enabled: boolean; currency: string } | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  const reload = useCallback(() => {
    if (!user) return;
    api.paymentsConfig().then(setCfg).catch(() => {});
    api.myBalance().then(setBalance).catch(() => {});
    api.myDeposits().then(setDeposits).catch(() => {});
    api.myWithdrawals().then(setWithdrawals).catch(() => {});
  }, [user?.id]); // eslint-disable-line

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="text-2xl font-semibold mb-2">Ingresá para ver tu billetera</h1>
      <Link href="/login" className="inline-block h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium mt-4">Ingresar</Link>
    </div>
  );

  const enabled = cfg?.enabled ?? false;
  const currency = cfg?.currency ?? "PYG";
  const kycApproved = user.kyc_status === "APPROVED";

  return (
    <div className="view-enter max-w-2xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Billetera</h1>
      <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">Saldo de dinero real, depósitos y retiros.</p>

      {!enabled && (
        <div className="mt-5 rounded-lg border border-accent-500/20 bg-accent-500/5 text-accent-600 dark:text-accent-400 px-4 py-3 text-sm">
          Los pagos con dinero real todavía <strong>no están habilitados</strong>. Podés ver tu billetera; los depósitos y retiros se activan próximamente.
        </div>
      )}

      {/* Saldo */}
      <div className="mt-6 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-6">
        <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Saldo disponible</div>
        <div className="text-4xl font-semibold num mt-1">{balance ? balance.balance : `0 ${currency}`}</div>
      </div>

      {/* Acciones */}
      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <DepositCard currency={currency} enabled={enabled} onDone={reload} />
        <WithdrawCard currency={currency} enabled={enabled} kycApproved={kycApproved} onDone={reload} />
      </div>

      {/* Historial */}
      <History title="Depósitos" items={deposits.map((d) => ({ id: d.id, amount: fmtMinor(d.amount_minor, d.currency), status: d.status, ts: d.created_at }))} />
      <History title="Retiros" items={withdrawals.map((w) => ({ id: w.id, amount: fmtMinor(w.amount_minor, w.currency), status: w.status, ts: w.requested_at }))} />
    </div>
  );
}

function DepositCard({ currency, enabled, onDone }: { currency: string; enabled: boolean; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api.createDeposit({ amount, currency });
      setAmount("");
      setMsg({ kind: "ok", text: "Solicitud de depósito creada. Un administrador la confirmará al recibir los fondos." });
      onDone();
    } catch (e: any) { setMsg({ kind: "err", text: e?.message ?? "No se pudo crear el depósito" }); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-ink-100 dark:border-ink-800 p-5">
      <h2 className="font-semibold text-sm">Depositar</h2>
      <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 mb-3">Cargá saldo a tu billetera.</p>
      <div className="flex gap-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={`Monto (${currency})`}
               disabled={!enabled} className={inp}/>
        <button disabled={!enabled || busy || !amount} className="h-10 px-4 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium disabled:opacity-50">
          {busy ? "..." : "Depositar"}
        </button>
      </div>
      <Feedback msg={msg} />
    </form>
  );
}

function WithdrawCard({ currency, enabled, kycApproved, onDone }: { currency: string; enabled: boolean; kycApproved: boolean; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api.createWithdrawal({ amount, currency, destination: { account: dest.trim() } });
      setAmount(""); setDest("");
      setMsg({ kind: "ok", text: "Solicitud de retiro creada. Queda pendiente de aprobación." });
      onDone();
    } catch (e: any) { setMsg({ kind: "err", text: e?.message ?? "No se pudo crear el retiro" }); }
    finally { setBusy(false); }
  };

  const disabled = !enabled || !kycApproved;
  return (
    <form onSubmit={submit} className="rounded-xl border border-ink-100 dark:border-ink-800 p-5">
      <h2 className="font-semibold text-sm">Retirar</h2>
      <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 mb-3">Transferí saldo a tu cuenta.</p>
      {enabled && !kycApproved && (
        <div className="text-xs text-no-500 mb-2">Necesitás <Link href="/settings/compliance" className="underline">verificar tu identidad</Link> para retirar.</div>
      )}
      <div className="space-y-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={`Monto (${currency})`}
               disabled={disabled} className={inp}/>
        <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Cuenta / alias de destino"
               disabled={disabled} className={inp}/>
        <button disabled={disabled || busy || !amount || !dest} className="h-10 px-4 w-full rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium disabled:opacity-50">
          {busy ? "..." : "Solicitar retiro"}
        </button>
      </div>
      <Feedback msg={msg} />
    </form>
  );
}

function History({ title, items }: { title: string; items: { id: string; amount: string; status: string; ts: string }[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-2">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-500">Sin movimientos.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded-lg border border-ink-100 dark:border-ink-800 px-3 py-2 text-sm">
              <span className="num font-medium">{it.amount}</span>
              <span className="text-xs text-ink-500">{new Date(it.ts).toLocaleString()}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusCls(it.status)}`}>{it.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function statusCls(s: string): string {
  if (s === "CONFIRMED" || s === "PAID") return "bg-yes-500/10 text-yes-500";
  if (s === "FAILED" || s === "REJECTED" || s === "REVERSED") return "bg-no-500/10 text-no-500";
  return "bg-accent-500/10 text-accent-500";
}

const inp = "flex-1 w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm disabled:opacity-50";

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <div className={`rounded-lg px-3 py-2 mt-3 text-sm ${msg.kind === "ok" ? "bg-yes-500/5 text-yes-700 dark:text-yes-500" : "bg-no-500/5 text-no-700 dark:text-no-500"}`}>{msg.text}</div>;
}
