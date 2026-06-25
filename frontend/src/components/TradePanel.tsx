"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, Market, OrderIn } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usd } from "@/lib/format";

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

  useEffect(() => { setMsg(null); }, [side, tab, market.id, amount, shares, limitPrice]);

  const px = side === "YES" ? market.current_yes_price : 1 - market.current_yes_price;

  const summary = useMemo(() => {
    if (tab === "market") {
      const dollars = Math.max(0, parseFloat(amount) || 0);
      const sh = px > 0 ? dollars / px : 0;
      return {
        priceCents: (px * 100).toFixed(1),
        shares: sh.toFixed(2),
        cost: dollars,
        payout: sh,
        ret: sh - dollars,
        retPct: px > 0 ? ((1 / px) - 1) * 100 : 0,
        breakeven: (px * 100).toFixed(1),
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
  }, [tab, amount, limitPrice, shares, px]);

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
          ? `Filled ${o.filled_quantity.toFixed(2)} sh @ ${(((o.avg_fill_price ?? 0) * 100)).toFixed(1)}¢`
          : o.status === "PARTIAL"
            ? `Partial fill ${o.filled_quantity.toFixed(2)} / ${o.quantity.toFixed(2)}`
            : "Order placed and resting on book",
      });
      await refresh();
      onTraded?.();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Order failed" });
    } finally { setBusy(false); }
  };

  if (!user) {
    return (
      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 text-sm">
        <div className="font-semibold mb-2">Trade</div>
        <p className="text-ink-500 dark:text-ink-400 mb-4">
          Sign in to trade simulated YES/NO positions on this market.
        </p>
        <Link href="/login" className="block w-full h-10 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium">Log in</Link>
        <Link href="/register" className="block w-full h-10 mt-2 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-700 font-medium">Create an account</Link>
      </div>
    );
  }

  if (!user.email_verified) {
    return (
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 text-sm">
        <div className="font-semibold mb-2">Verify your email to trade</div>
        <p className="text-ink-500 dark:text-ink-400 mb-4">
          We sent a verification link to <span className="mono">{user.email}</span>. Trading is locked until you confirm your email.
        </p>
        <button
          onClick={async () => {
            try {
              const r = await api.resendVerification();
              if (r.verification_link) {
                // Dev convenience: navigate to the link
                window.location.href = r.verification_link;
              } else {
                alert("Sent. Check your inbox.");
              }
            } catch (e: any) { alert(e?.message ?? "Failed"); }
          }}
          className="w-full h-10 rounded-lg bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 font-medium hover:bg-yellow-500/25">
          Resend verification email
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Trade</h3>
        <div className="flex bg-ink-50 dark:bg-ink-900 p-0.5 rounded-lg text-xs">
          {(["market", "limit"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
                    className={`px-2.5 h-7 rounded-md font-medium ${tab === t
                      ? "bg-white dark:bg-ink-800 shadow-sm"
                      : "text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100"}`}>
              {t === "market" ? "Market" : "Limit"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <SideButton selected={side === "YES"} onClick={() => setSide("YES")} label="YES" price={market.current_yes_price} accent="yes"/>
        <SideButton selected={side === "NO"}  onClick={() => setSide("NO")}  label="NO"  price={1 - market.current_yes_price} accent="no"/>
      </div>

      {tab === "market" ? (
        <>
          <Label>Amount (USD)</Label>
          <PrefixInput prefix="$" value={amount} onChange={setAmount} type="number" min="0"/>
          <div className="grid grid-cols-4 gap-1.5 mb-5 mt-2">
            {[10, 25, 100, "Max"].map((v) => (
              <button key={String(v)}
                      onClick={() => setAmount(v === "Max" ? Math.floor(user.cash).toString() : String(v))}
                      className="h-8 text-xs rounded-md bg-ink-50 dark:bg-ink-800 hover:bg-ink-100 dark:hover:bg-ink-700 font-medium">
                {typeof v === "number" ? `$${v}` : v}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <Label>Limit price (0.01–0.99)</Label>
          <PrefixInput prefix="¢" value={(parseFloat(limitPrice) * 100).toFixed(1)}
                       onChange={(v) => setLimitPrice((parseFloat(v) / 100 || 0).toFixed(2))}
                       type="number" step="0.5" min="1" max="99"/>
          <Label className="mt-3">Shares</Label>
          <PrefixInput prefix="#" value={shares} onChange={setShares} type="number" min="0"/>
          <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-2 mb-4 leading-relaxed">
            Limit orders rest on the book and may match against opposite-side limit bids whose prices sum to ≥ $1.00.
          </p>
        </>
      )}

      <div className="rounded-lg bg-ink-50 dark:bg-ink-900/60 p-3 text-sm space-y-1.5 mb-4">
        <Row k="Avg price"        v={`${summary.priceCents}¢`} />
        <Row k="Shares"           v={summary.shares} />
        <Row k="Cost"             v={usd(summary.cost)} />
        <Row k="Potential payout" v={usd(summary.payout)} />
        <Row k="Potential return" v={
          <span className={`num font-medium ${summary.ret >= 0 ? "text-yes-500" : "text-no-500"}`}>
            {usd(summary.ret)} ({summary.retPct.toFixed(0)}%)
          </span>
        } />
        <Row k="Breakeven" v={`${summary.breakeven}¢`} />
      </div>

      <button
        onClick={submit}
        disabled={busy || cantAfford || summary.cost <= 0}
        className={`w-full h-11 rounded-lg font-semibold text-sm transition
          ${side === "YES" ? "bg-yes-500 hover:bg-yes-600" : "bg-no-500 hover:bg-no-600"}
          text-white disabled:opacity-40 disabled:cursor-not-allowed`}>
        {busy ? "Placing..." : cantAfford ? "Insufficient virtual cash" : `${tab === "limit" ? "Place limit" : "Buy"} ${side} · ${usd(summary.cost)}`}
      </button>

      {msg && (
        <div className={`mt-3 text-xs rounded-md px-3 py-2 ${msg.kind === "ok" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>
          {msg.text}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
        Simulated trading using virtual credits. Each share pays $1 if the market resolves on your side, $0 otherwise. Not a security, not gambling.
      </p>
    </div>
  );
}

function clampPrice(n: number) { return Math.max(0.01, Math.min(0.99, n)); }

function SideButton({ selected, onClick, label, price, accent }:
  { selected: boolean; onClick: () => void; label: string; price: number; accent: "yes" | "no" }) {
  const c = accent === "yes"
    ? selected ? "bg-yes-500 text-white border-yes-500" : "border-ink-200 dark:border-ink-800 text-yes-500 hover:border-yes-500/60"
    : selected ? "bg-no-500 text-white border-no-500"   : "border-ink-200 dark:border-ink-800 text-no-500 hover:border-no-500/60";
  return (
    <button onClick={onClick} className={`h-14 rounded-lg border font-semibold transition ${c}`}>
      <div className="text-sm leading-none">{label}</div>
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
