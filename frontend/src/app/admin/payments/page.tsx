"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Deposit, Withdrawal, ReconciliationRow, hasCap } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Exponente de la unidad menor por moneda (debe coincidir con backend/money.py).
const EXP: Record<string, number> = { PYG: 0, USD: 2, EUR: 2, BRL: 2, ARS: 2, UYU: 2, CLP: 0 };
function fmtMinor(minor: number, currency: string): string {
  const e = EXP[currency] ?? 2;
  const v = e ? (minor / 10 ** e).toFixed(e) : String(minor);
  return `${v} ${currency}`;
}

export default function AdminPaymentsPage() {
  const { user, loading } = useAuth();
  const [recon, setRecon] = useState<ReconciliationRow[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canAccess = hasCap(user, "payments");

  const reload = useCallback(() => {
    if (!canAccess) return;
    Promise.all([api.reconciliation(), api.adminDeposits(), api.adminWithdrawals()])
      .then(([r, d, w]) => { setRecon(r); setDeposits(d); setWithdrawals(w); })
      .catch((e) => setErr(e?.message ?? "Error al cargar"));
  }, [canAccess]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!canAccess) return <div className="p-12 text-center text-sm text-ink-500">No tenés permiso para esta sección.</div>;

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr(null);
    try { await fn(); reload(); }
    catch (e: any) { setErr(e?.message ?? "No se pudo completar la acción"); }
    finally { setBusy(null); }
  };

  const pendingDeposits = deposits.filter((d) => d.status === "PENDING");
  const openWithdrawals = withdrawals.filter((w) => w.status === "REQUESTED" || w.status === "APPROVED");

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 view-enter">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Panel · Pagos</p>
      <h1 className="text-2xl font-semibold tracking-tight mt-1">Dinero real</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mt-2">
        Estructura wallet-ready. Los rieles a un proveedor externo están apagados: los depósitos y retiros
        se confirman manualmente acá.
      </p>

      {err && <div className="mt-4 text-sm rounded-md px-3 py-2 bg-no-500/10 text-no-500">{err}</div>}

      {/* Reconciliación */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500 mb-2">Reconciliación</h2>
        {recon.length === 0 ? (
          <p className="text-sm text-ink-500">Sin movimientos todavía.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {recon.map((r) => (
              <div key={r.currency} className="rounded-lg border border-ink-200 dark:border-ink-800 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.currency}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.balanced ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>
                    {r.balanced ? "cuadra ✓" : "descuadre"}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
                  <dt>Saldos usuarios</dt><dd className="text-right num">{fmtMinor(r.users_total, r.currency)}</dd>
                  <dt>Retiros en hold</dt><dd className="text-right num">{fmtMinor(r.payout_payable, r.currency)}</dd>
                  <dt>Custodia</dt><dd className="text-right num">{fmtMinor(r.custody, r.currency)}</dd>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Depósitos pendientes */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Depósitos pendientes ({pendingDeposits.length})
        </h2>
        {pendingDeposits.length === 0 ? (
          <p className="text-sm text-ink-500">Nada pendiente.</p>
        ) : (
          <div className="space-y-2">
            {pendingDeposits.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-ink-200 dark:border-ink-800 p-3 text-sm">
                <div>
                  <div className="num font-medium">{fmtMinor(d.amount_minor, d.currency)}</div>
                  <div className="text-xs text-ink-500">{d.provider} · {new Date(d.created_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy === d.id} onClick={() => act(d.id, () => api.confirmDeposit(d.id))}
                          className="h-8 px-3 rounded-md bg-yes-500/10 text-yes-500 text-xs font-medium disabled:opacity-50">
                    Confirmar
                  </button>
                  <button disabled={busy === d.id} onClick={() => act(d.id, () => api.failDeposit(d.id))}
                          className="h-8 px-3 rounded-md bg-no-500/10 text-no-500 text-xs font-medium disabled:opacity-50">
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Retiros */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Retiros abiertos ({openWithdrawals.length})
        </h2>
        {openWithdrawals.length === 0 ? (
          <p className="text-sm text-ink-500">Nada pendiente.</p>
        ) : (
          <div className="space-y-2">
            {openWithdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-lg border border-ink-200 dark:border-ink-800 p-3 text-sm">
                <div>
                  <div className="num font-medium">{fmtMinor(w.amount_minor, w.currency)}</div>
                  <div className="text-xs text-ink-500">{w.status} · {new Date(w.requested_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  {w.status === "REQUESTED" && (
                    <button disabled={busy === w.id} onClick={() => act(w.id, () => api.approveWithdrawal(w.id))}
                            className="h-8 px-3 rounded-md bg-accent-500/10 text-accent-500 text-xs font-medium disabled:opacity-50">
                      Aprobar
                    </button>
                  )}
                  {w.status === "APPROVED" && (
                    <button disabled={busy === w.id} onClick={() => act(w.id, () => api.markWithdrawalPaid(w.id))}
                            className="h-8 px-3 rounded-md bg-yes-500/10 text-yes-500 text-xs font-medium disabled:opacity-50">
                      Marcar pagado
                    </button>
                  )}
                  <button disabled={busy === w.id} onClick={() => act(w.id, () => api.rejectWithdrawal(w.id))}
                          className="h-8 px-3 rounded-md bg-no-500/10 text-no-500 text-xs font-medium disabled:opacity-50">
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
