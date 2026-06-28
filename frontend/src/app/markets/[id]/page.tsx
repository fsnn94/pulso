"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, Book, Market, ResolutionProposal, Trade } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMarketSocket } from "@/lib/ws";
import { LineChart } from "@/components/charts";
import { TradePanel } from "@/components/TradePanel";
import { MarketSummaryCard } from "@/components/MarketSummaryCard";
import { Icon } from "@/components/Icon";
import { compact, pct, timeAgo, statusEs, outcomeEs } from "@/lib/format";

export default function MarketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [market, setMarket]   = useState<Market | null>(null);
  const [history, setHistory] = useState<{ t: number; p: number }[]>([]);
  const [book, setBook]       = useState<Book | null>(null);
  const [trades, setTrades]   = useState<Trade[]>([]);
  const [tick, setTick]       = useState(0);

  useEffect(() => {
    api.getMarket(id).then((m) => {
      setMarket(m);
      setHistory([{ t: Date.now() - 60_000, p: m.current_yes_price },
                  { t: Date.now(), p: m.current_yes_price }]);
    }).catch(() => {});
    api.getBook(id).then(setBook).catch(() => {});
    api.getTrades(id).then(setTrades).catch(() => {});
  }, [id, tick]);

  useMarketSocket((e) => {
    if (e.type === "price" && e.market_id === id) {
      setMarket((m) => (m ? { ...m, current_yes_price: e.yes } : m));
      setHistory((cur) => [...cur.slice(-360), { t: Date.now(), p: e.yes }]);
    }
    if (e.type === "trade" && e.market_id === id) {
      setTick((t) => t + 1); // refetch book + trades
    }
  }, { markets: [id] });

  if (!market) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;

  const lastChange = history.length > 1 ? history[history.length - 1].p - history[0].p : 0;

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
      <div className="text-sm text-ink-500 dark:text-ink-400 mb-4 flex items-center gap-2">
        <Link href="/" className="hover:text-ink-900 dark:hover:text-ink-100">Mercados</Link>
        <Icon name="chevron-right" className="w-3.5 h-3.5"/>
        <span>{market.category}</span>
        <Icon name="chevron-right" className="w-3.5 h-3.5"/>
        <span className="text-ink-700 dark:text-ink-300 truncate">{market.short_title}</span>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-10">
        <div>
          <span className="inline-block text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded bg-ink-50 dark:bg-ink-800 text-ink-500 dark:text-ink-400 mb-3">
            {market.category}
          </span>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-[1.15]">{market.title}</h1>

          <div className="mt-6 flex items-baseline gap-4 flex-wrap">
            <div className="text-5xl sm:text-6xl font-semibold num tracking-tight">{pct(market.current_yes_price, 1)}</div>
            <div className="text-sm">
              <span className="text-ink-500 dark:text-ink-400">Probabilidad YES</span>
              <span className={`ml-3 num font-medium ${lastChange >= 0 ? "text-yes-500" : "text-no-500"}`}>
                {lastChange >= 0 ? "+" : ""}{(lastChange * 100).toFixed(1)}pp 30m
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
              {market.status === "OPEN" && <><span className="w-1.5 h-1.5 bg-yes-500 rounded-full livedot"/>En vivo</>}
              {market.status !== "OPEN" && <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800">{statusEs(market.status)}</span>}
            </div>
          </div>

          <ResolutionBanner market={market} onChange={() => setTick((t) => t + 1)} />

          <div className="mt-6 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-ink-500 dark:text-ink-400">Tendencia de probabilidad</div>
            </div>
            <LineChart data={history} accent="#A41F13"/>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Volumen 24h" value={compact(market.volume_24h)}/>
            <StatBox label="Liquidez"    value={compact(market.liquidity)}/>
            <StatBox label="Estado"      value={statusEs(market.status)}/>
            <StatBox label="Cierra"      value={new Date(market.closes_at).toLocaleDateString([], { month: "short", day: "numeric" })}/>
          </div>

          <div className="mt-6 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 sm:p-6">
            <h2 className="font-semibold mb-2">Sobre este mercado</h2>
            <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{market.description}</p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
              <KV k="Resuelve el" v={new Date(market.closes_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}/>
              <KV k="Fuente de resolución" v={market.resolution_source}/>
              <KV k="Liquidación" v="Automática al resolverse"/>
              <KV k="ID de mercado" v={market.id} mono/>
            </div>
          </div>

          {book && <BookView book={book} />}
          <TradesView trades={trades} />
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start space-y-4">
          {(market.status === "RESOLVED" || market.status === "VOIDED") && <MarketSummaryCard marketId={id} />}
          <TradePanel market={market} onTraded={() => setTick((t) => t + 1)}/>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 dark:border-ink-800 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</div>
      <div className="num font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-ink-100 dark:border-ink-800 py-1.5">
      <span className="text-ink-500 dark:text-ink-400">{k}</span>
      <span className={mono ? "mono text-xs" : "num"}>{v}</span>
    </div>
  );
}

function BookView({ book }: { book: Book }) {
  return (
    <div className="mt-6 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Libro de órdenes</h2>
        <span className="text-xs text-ink-500 dark:text-ink-400">Top 5 niveles</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        <Side label="Ofertas YES" data={book.yes_bids} color="text-yes-500"/>
        <Side label="Ofertas NO"  data={book.no_bids}  color="text-no-500"/>
      </div>
    </div>
  );
}

function Side({ label, data, color }: { label: string; data: { price: number; size: number }[]; color: string }) {
  const max = Math.max(1, ...data.map((r) => r.size));
  return (
    <div>
      <div className={`text-xs font-semibold mb-2 ${color}`}>{label}</div>
      <div className="grid grid-cols-2 text-[11px] uppercase tracking-wider text-ink-400 dark:text-ink-500 pb-1.5 border-b border-ink-100 dark:border-ink-800">
        <span>Precio ¢</span><span className="text-right">Tamaño</span>
      </div>
      {data.length === 0 ? (
        <div className="py-2 text-xs text-ink-500">Sin órdenes en el libro</div>
      ) : data.map((r, i) => (
        <div key={i} className="relative grid grid-cols-2 text-sm py-1 num">
          <div className="absolute inset-y-0 right-0 bg-ink-50 dark:bg-ink-800/40" style={{ width: `${(r.size / max) * 60}%` }}/>
          <span className="z-10">{(r.price * 100).toFixed(1)}</span>
          <span className="text-right z-10">{r.size.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function TradesView({ trades }: { trades: Trade[] }) {
  return (
    <div className="mt-6 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 sm:p-6">
      <h2 className="font-semibold mb-3">Operaciones recientes</h2>
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] text-[11px] uppercase tracking-wider text-ink-400 dark:text-ink-500 pb-1.5 border-b border-ink-100 dark:border-ink-800">
        <span>Trader</span><span>Lado</span><span>Precio</span><span>Tamaño</span><span className="text-right">Hora</span>
      </div>
      {trades.length === 0 ? (
        <div className="py-4 text-xs text-ink-500">Aún no hay operaciones.</div>
      ) : trades.slice(0, 12).map((t) => (
        <div key={t.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] py-1.5 text-sm num border-b border-ink-50 dark:border-ink-800/60 last:border-0 items-center">
          {t.handle ? (
            <Link href={`/u/${encodeURIComponent(t.handle)}`} className="truncate font-medium text-ink-700 dark:text-ink-300 hover:text-accent-500">
              @{t.handle}
            </Link>
          ) : (
            <span className="text-ink-400 dark:text-ink-500">—</span>
          )}
          <span className={t.side === "YES" ? "text-yes-500 font-medium" : "text-no-500 font-medium"}>{t.side}</span>
          <span>{(t.price * 100).toFixed(1)}¢</span>
          <span>{t.quantity.toLocaleString()}</span>
          <span className="text-right text-ink-500 dark:text-ink-400">{timeAgo(t.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

/* ----- Resolution banner (lifecycle state + dispute) ----- */


function untilFinalize(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "listo";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ResolutionBanner({ market, onChange }: { market: Market; onChange?: () => void }) {
  const { user } = useAuth();
  const [proposal, setProposal] = useState<ResolutionProposal | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    if (market.status === "OPEN" || market.status === "RESOLVED" || market.status === "VOIDED") { setProposal(null); return; }
    api.listResolutions().then((all) => {
      const p = all.find((x) => x.market_id === market.id && (x.status === "PENDING" || x.status === "DISPUTED"));
      setProposal(p || null);
    }).catch(() => {});
  }, [market.id, market.status]);

  useEffect(() => {
    if (!proposal?.finalizes_at) return;
    const t = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [proposal?.finalizes_at]);

  if (market.status === "OPEN") return null;

  if (market.status === "RESOLVED") {
    const o = market.resolved_outcome;
    return (
      <div className={`mt-6 rounded-xl border p-4 ${o === "YES" ? "border-yes-500/30 bg-yes-500/5" : "border-no-500/30 bg-no-500/5"}`}>
        <div className="text-xs uppercase tracking-wider font-semibold mb-0.5">Resuelto {o}</div>
        <div className="text-sm text-ink-600 dark:text-ink-300">
          {o === "YES" ? "Los tenedores de YES recibieron $1 por contrato." : "Los tenedores de NO recibieron $1 por contrato."}
          {market.resolved_at && <> Liquidado el {new Date(market.resolved_at).toLocaleString()}.</>}
        </div>
      </div>
    );
  }

  if (market.status === "VOIDED") {
    return (
      <div className="mt-6 rounded-xl border border-ink-300 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 p-4">
        <div className="text-xs uppercase tracking-wider font-semibold mb-0.5">Mercado nulo</div>
        <div className="text-sm text-ink-600 dark:text-ink-300">
          Cada posición abierta fue reembolsada a su costo promedio — P&L neto cero.
          {market.resolved_at && <> Liquidado el {new Date(market.resolved_at).toLocaleString()}.</>}
        </div>
      </div>
    );
  }

  if (market.status === "CLOSED" && !proposal) {
    return (
      <div className="mt-6 rounded-xl border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 p-4">
        <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 font-semibold mb-0.5">Mercado cerrado</div>
        <div className="text-sm">Las operaciones se detuvieron. A la espera del resolutor — pendiente de revisión por admin.</div>
      </div>
    );
  }

  if (!proposal) return null;

  const submit = async () => {
    if (reason.trim().length < 10) return;
    setBusy(true);
    try {
      await api.disputeMarket(market.id, { reason: reason.trim() });
      setOpen(false); setReason("");
      onChange?.();
    } catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(false); }
  };

  const isDisputed = proposal.status === "DISPUTED" || market.status === "DISPUTED";
  const tone = isDisputed ? "border-no-500/40 bg-no-500/5"
              : "border-accent-500/30 bg-accent-500/5";
  const outcome = proposal.proposed_outcome;

  return (
    <div className={`mt-6 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold mb-0.5">
            {isDisputed ? "En disputa — bajo revisión de admin" : "Resolución propuesta"}
          </div>
          <div className="text-sm">
            {outcome ? (
              <>
                El resolutor propone <span className={`font-semibold ${outcome === "YES" ? "text-yes-500" : "text-no-500"}`}>{outcome}</span>{" "}
                <span className="text-ink-500 dark:text-ink-400">según {proposal.source_name}.</span>
              </>
            ) : (
              <span className="text-ink-500 dark:text-ink-400">Sin decisión automática — revisión manual del admin.</span>
            )}
          </div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">
            {proposal.finalizes_at && !isDisputed && <>Se finaliza automáticamente en <span className="num">{untilFinalize(proposal.finalizes_at)}</span> salvo disputa.</>}
            {proposal.dispute_count > 0 && <> · {proposal.dispute_count} disputa{proposal.dispute_count !== 1 ? "s" : ""}.</>}
          </div>
        </div>
        {user && user.email_verified && !isDisputed && proposal.proposed_outcome && (
          <button onClick={() => setOpen(true)}
                  className="h-9 px-3 rounded-lg border border-no-500/30 text-no-500 text-sm font-medium hover:bg-no-500/10">
            Disputar
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-ink-900 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Disputar resolución</h3>
            <p className="text-xs text-ink-500 dark:text-ink-400 mb-3">
              Explica por qué el resultado propuesto es incorrecto. Una sola disputa congela la finalización automática y deriva el mercado a un admin.
            </p>
            <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="¿En qué se equivocó el resolutor? Incluye una fuente si la tienes."
                      className="w-full px-3 py-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm mb-3"/>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 text-sm">Cancelar</button>
              <button onClick={submit} disabled={busy || reason.trim().length < 10}
                      className="h-9 px-3 rounded-lg bg-no-500 text-white text-sm font-medium disabled:opacity-50">
                {busy ? "Enviando..." : "Presentar disputa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
