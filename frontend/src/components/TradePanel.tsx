"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, Market, OrderIn } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { statusEs, usd } from "@/lib/format";
import { isLabeledMarket, sideLabel } from "@/lib/market";

type Tab = "market" | "limit";

export function TradePanel({ market, onTraded }: { market: Market; onTraded?: () => void }) {
  const { user, refresh } = useAuth();
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [tab, setTab]   = useState<Tab>("market");
  const [amount, setAmount] = useState("25");
  const [limitPrice, setLimitPrice] = useState("0.50");
  const [shares, setShares] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setLimitPrice((side === "YES" ? market.current_yes_price : 1 - market.current_yes_price).toFixed(2));
  }, [side, market.current_yes_price]);

  useEffect(() => { setMsg(null); }, [side, tab, market.id, amount, shares]);

  const px = side === "YES" ? market.current_yes_price : 1 - market.current_yes_price;
  const labeled = isLabeledMarket(market);

  const summary = useMemo(() => {
    if (tab === "market") {
      const dollars = Math.max(0, parseFloat(amount) || 0);
      const sh = px > 0 ? dollars / px : 0;
      const fill = marketFill(px, sh, market.liquidity); // avg price incl. slippage — matches backend
      const cost = fill * sh;
      return {
        priceCents: (fill * 100).toFixed(1),
        shares: sh.toFixed(2),
        cost,
        payout: sh,
        ret: sh - cost,
        retPct: fill > 0 ? ((1 / fill) - 1) * 100 : 0,
        breakeven: (fill * 100).toFixed(1),
      };
    } else {
      const lp = clampPrice(parseFloat(limitPrice) || 0);
      const sh = Math.max(0, parseFloat(shares) || 0);
      const cost = lp * sh;
      return {
        priceCents: (lp * 100).toFixed(1),
        shares: sh.toFixed(2),
        cost,
        payout: sh,
        ret: sh - cost,
        retPct: lp > 0 ? ((1 / lp) - 1) * 100 : 0,
        breakeven: (lp * 100).toFixed(1),
      };
    }
  }, [tab, amount, limitPrice, shares, px, market.liquidity]);

  const cantAfford = user ? summary.cost > user.cash : true;

  const submit = async () => {
    if (!user) return;
    setBusy(true); setMsg(null);
    try {
      const body: OrderIn =
        tab === "market"
          ? { market_id: market.id, side, action: "BUY", type: "MARKET", quantity: parseFloat(summary.shares) }
          : { market_id: market.id, side, action: "BUY", type: "LIMIT",
              quantity: parseFloat(summary.shares), limit_price: parseFloat(limitPrice) };
      const o = await api.placeOrder(body);
      setMsg({
        kind: "ok",
        text: o.status === "FILLED"
          ? `Ejecutada ${o.filled_quantity.toFixed(2)} contratos @ ${(((o.avg_fill_price ?? 0) * 100)).toFixed(1)}¢`
          : o.status === "PARTIAL"
            ? `Ejecución parcial ${o.filled_quantity.toFixed(2)} / ${o.quantity.toFixed(2)}`
            : "Orden colocada y descansando en el libro",
      });
      await refresh();
      onTraded?.();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "La orden falló" });
    } finally { setBusy(false); }
  };

  // Only OPEN markets accept orders (the backend rejects the rest); don't show
  // the trade form for resolved/closed/voided/disputed/proposed markets.
  if (market.status !== "OPEN") {
    return (
      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 text-sm">
        <div className="font-semibold mb-2">Operaciones cerradas</div>
        <p className="text-ink-500 dark:text-ink-400">
          Este mercado está en estado{" "}
          <span className="font-medium text-ink-700 dark:text-ink-300">{statusEs(market.status)}</span>{" "}
          y ya no acepta órdenes.
          {market.status === "RESOLVED" && " Las posiciones ganadoras ya fueron liquidadas a $1 por contrato."}
          {market.status === "VOIDED" && " Las posiciones abiertas fueron reembolsadas a su costo promedio."}
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 text-sm">
        <div className="font-semibold mb-2">Operar</div>
        <p className="text-ink-500 dark:text-ink-400 mb-4">
          Ingresá para operar posiciones en este mercado.
        </p>
        <Link href="/login" className="block w-full h-10 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium">Ingresar</Link>
        <Link href="/register" className="block w-full h-10 mt-2 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-700 font-medium">Crear cuenta</Link>
      </div>
    );
  }

  if (!user.email_verified) {
    return (
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 text-sm">
        <div className="font-semibold mb-2">Verifica tu email para operar</div>
        <p className="text-ink-500 dark:text-ink-400 mb-4">
          Enviamos un link de verificación a <span className="mono">{user.email}</span>. No podrás operar hasta confirmar tu email.
        </p>
        <button
          onClick={async () => {
            try {
              const r = await api.resendVerification();
              if (r.verification_link) {
                // Dev convenience: navigate to the link
                window.location.href = r.verification_link;
              } else {
                alert("Enviado. Revisa tu bandeja de entrada.");
              }
            } catch (e: any) { alert(e?.message ?? "Falló"); }
          }}
          className="w-full h-10 rounded-lg bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 font-medium hover:bg-yellow-500/25">
          Reenviar email de verificación
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Operar</h3>
        <div className="flex bg-ink-50 dark:bg-ink-900 p-0.5 rounded-lg text-xs">
          {(["market", "limit"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
                    className={`px-2.5 h-7 rounded-md font-medium ${tab === t
                      ? "bg-white dark:bg-ink-800 shadow-sm"
                      : "text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100"}`}>
              {t === "market" ? "Mercado" : "Límite"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <SideButton selected={side === "YES"} onClick={() => setSide("YES")} label={sideLabel(market, "YES")} price={market.current_yes_price}     accent={labeled ? "neutral" : "yes"}/>
        <SideButton selected={side === "NO"}  onClick={() => setSide("NO")}  label={sideLabel(market, "NO")}  price={1 - market.current_yes_price} accent={labeled ? "neutral" : "no"}/>
      </div>

      {tab === "market" ? (
        <>
          <Label>Monto (USD)</Label>
          <PrefixInput prefix="$" value={amount} onChange={setAmount} type="number" min="0"/>
          <div className="grid grid-cols-4 gap-1.5 mb-5 mt-2">
            {[10, 25, 100, "Max"].map((v) => (
              <button key={String(v)}
                      onClick={() => setAmount(v === "Max" ? Math.floor(maxAffordable(user.cash, px, market.liquidity)).toString() : String(v))}
                      className="h-8 text-xs rounded-md bg-ink-50 dark:bg-ink-800 hover:bg-ink-100 dark:hover:bg-ink-700 font-medium">
                {typeof v === "number" ? `$${v}` : v === "Max" ? "Máx" : v}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <Label>Precio límite (0.01–0.99)</Label>
          <PrefixInput prefix="¢" value={(parseFloat(limitPrice) * 100).toFixed(1)}
                       onChange={(v) => setLimitPrice((parseFloat(v) / 100 || 0).toFixed(2))}
                       type="number" step="0.5" min="1" max="99"/>
          <Label className="mt-3">Contratos</Label>
          <PrefixInput prefix="#" value={shares} onChange={setShares} type="number" min="0"/>
          <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-2 mb-4 leading-relaxed">
            Las órdenes a límite descansan en el libro y pueden cruzarse contra órdenes del lado opuesto cuyos precios sumen ≥ $1.00.
          </p>
        </>
      )}

      <div className="rounded-lg bg-ink-50 dark:bg-ink-900/60 p-3 text-sm space-y-1.5 mb-4">
        <Row k="Precio promedio"  v={`${summary.priceCents}¢`} />
        <Row k="Contratos"        v={summary.shares} />
        <Row k="Costo"            v={usd(summary.cost)} />
        <Row k="Pago potencial"   v={usd(summary.payout)} />
        <Row k="Retorno potencial" v={
          <span className={`num font-medium ${summary.ret >= 0 ? "text-yes-500" : "text-no-500"}`}>
            {usd(summary.ret)} ({summary.retPct.toFixed(0)}%)
          </span>
        } />
        <Row k="Punto de equilibrio" v={`${summary.breakeven}¢`} />
      </div>

      <button
        onClick={submit}
        disabled={busy || cantAfford || summary.cost <= 0}
        className={`w-full h-11 rounded-lg font-semibold text-sm transition
          ${labeled ? "bg-accent-500 hover:bg-accent-600" : side === "YES" ? "bg-yes-500 hover:bg-yes-600" : "bg-no-500 hover:bg-no-600"}
          text-white disabled:opacity-40 disabled:cursor-not-allowed`}>
        {busy ? "Enviando..." : cantAfford ? "Saldo virtual insuficiente" : `${tab === "limit" ? "Colocar límite" : "Comprar"} ${sideLabel(market, side)} · ${usd(summary.cost)}`}
      </button>

      {msg && (
        <div className={`mt-3 text-xs rounded-md px-3 py-2 ${msg.kind === "ok" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>
          {msg.text}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
        Se opera con créditos virtuales, sin dinero real. Cada contrato paga $1 si el mercado resuelve a tu favor, $0 en caso contrario. No es un valor ni una apuesta.
      </p>
    </div>
  );
}

function clampPrice(n: number) { return Math.max(0.01, Math.min(0.99, n)); }

// Mirror of backend matching._slippage / _fill_market_buy so the cost shown,
// the affordability check and the "Max" button match exactly what the server charges.
function slippage(quantity: number, liquidity: number) {
  if (liquidity <= 0) return Math.min(0.05, 0.001 * quantity);
  return Math.min(0.05, (0.05 * quantity) / Math.max(liquidity, 1));
}
function marketFill(px: number, quantity: number, liquidity: number) {
  return clampPrice(px + slippage(quantity, liquidity));
}
// Largest dollar notional whose real cost (incl. slippage) is still <= cash.
// Cost is monotonic in the notional, so a short binary search converges exactly.
function maxAffordable(cash: number, px: number, liquidity: number) {
  if (px <= 0 || cash <= 0) return 0;
  const costOf = (dollars: number) => {
    const sh = dollars / px;
    return marketFill(px, sh, liquidity) * sh;
  };
  let lo = 0, hi = cash;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (costOf(mid) <= cash) lo = mid; else hi = mid;
  }
  return lo;
}

function SideButton({ selected, onClick, label, price, accent }:
  { selected: boolean; onClick: () => void; label: string; price: number; accent: "yes" | "no" | "neutral" }) {
  const c = accent === "yes"
    ? selected ? "bg-yes-500 text-white border-yes-500" : "border-ink-200 dark:border-ink-800 text-yes-500 hover:border-yes-500/60"
    : accent === "no"
    ? selected ? "bg-no-500 text-white border-no-500"   : "border-ink-200 dark:border-ink-800 text-no-500 hover:border-no-500/60"
    : selected ? "bg-accent-500 text-white border-accent-500" : "border-ink-200 dark:border-ink-800 text-accent-500 hover:border-accent-500/60";
  return (
    <button onClick={onClick} className={`h-14 rounded-lg border font-semibold transition ${c}`}>
      <div className="text-sm leading-none px-1 truncate">{label}</div>
      <div className={`text-xs num mt-1 leading-none ${selected ? "opacity-90" : "text-ink-500 dark:text-ink-400"}`}>
        {(price * 100).toFixed(1)}¢
      </div>
    </button>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between"><span className="text-ink-500 dark:text-ink-400 text-xs">{k}</span><span className="num text-sm">{v}</span></div>;
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 ${className}`}>{children}</label>;
}

function PrefixInput({ prefix, value, onChange, ...rest }:
  { prefix: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  return (
    <div className="mt-1.5 flex items-stretch rounded-lg border border-ink-200 dark:border-ink-800 focus-within:border-accent-500">
      <span className="px-3 grid place-items-center text-ink-400 dark:text-ink-500 border-r border-ink-200 dark:border-ink-800 text-sm">{prefix}</span>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)}
             className="flex-1 bg-transparent px-3 py-2 num text-base outline-none"/>
    </div>
  );
}
