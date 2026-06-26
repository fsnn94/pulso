"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Market } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "Economics", label: "Economía" },
  { value: "Tech & AI", label: "Tecnología e IA" },
  { value: "Crypto",    label: "Cripto" },
  { value: "Science",   label: "Ciencia" },
  { value: "Sports",    label: "Deportes" },
  { value: "Climate",   label: "Clima" },
  { value: "Space",     label: "Espacio" },
  { value: "Culture",   label: "Cultura" },
];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = async () => {
    try { setMarkets((await api.listMarkets({ sort: "newest" })).items); } catch {}
  };
  useEffect(() => { if (user?.is_admin) void refresh(); }, [user?.id]); // eslint-disable-line

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user)   return <div className="p-12 text-center text-sm text-ink-500"><Link href="/login" className="underline">Ingresa</Link> para acceder al admin.</div>;
  if (!user.is_admin) return <div className="p-12 text-center text-sm text-ink-500">Solo para admins.</div>;

  const resolve = async (id: string, outcome: "YES" | "NO") => {
    if (!confirm(`¿Resolver el mercado ${id} como ${outcome}? Esto pagará a los ganadores.`)) return;
    try {
      await api.resolveMarket(id, outcome);
      setMsg({ kind: "ok", text: `Resuelto ${id} como ${outcome}.` });
      await refresh();
    } catch (e: any) { setMsg({ kind: "err", text: e?.message ?? "Falló la resolución" }); }
  };

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Admin</h1>
          <p className="text-ink-500 dark:text-ink-400 text-sm mt-1">Crear mercados, revisar propuestas, monitorear flujo de caja, exportar datos de auditoría.</p>
        </div>
        <button onClick={() => setOpen(true)}
                className="h-10 px-4 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium text-sm">
          Crear mercado directamente
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Link href="/admin/proposals" className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 hover:border-accent-500 transition">
          <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Cola de revisión</div>
          <div className="font-semibold mt-1">Propuestas de usuarios</div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">Aprobar, editar o rechazar mercados entrantes.</div>
        </Link>
        <Link href="/admin/cashflow" className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 hover:border-accent-500 transition">
          <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Vista en tiempo real</div>
          <div className="font-semibold mt-1">Flujo de caja y cinta en vivo</div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">Volumen de operaciones, P&L, export de auditoría.</div>
        </Link>
        <Link href="/admin/aml" className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 hover:border-accent-500 transition">
          <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Riesgo</div>
          <div className="font-semibold mt-1">Motor de reglas AML</div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">Operaciones ficticias, velocidad, concentración, fraccionamiento.</div>
        </Link>
        <Link href="/admin/resolutions" className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 hover:border-accent-500 transition">
          <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Ciclo de vida</div>
          <div className="font-semibold mt-1">Cola de resoluciones</div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">Confirmar o anular propuestas del resolutor (ventana de 24h).</div>
        </Link>
        <Link href="/compliance" className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 hover:border-accent-500 transition">
          <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Regulatorio</div>
          <div className="font-semibold mt-1">Marco de cumplimiento (Paraguay)</div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">Postura ante CONAJZAR / CNV / SEPRELAD.</div>
        </Link>
      </div>

      {msg && (
        <div className={`mb-4 text-sm rounded-md px-3 py-2 ${msg.kind === "ok" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>
          {msg.text}
        </div>
      )}

      <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
              <tr className="border-b border-ink-100 dark:border-ink-800">
                <th className="text-left px-5 sm:px-6 py-2 font-medium">Título</th>
                <th className="text-left px-3 py-2 font-medium">Categoría</th>
                <th className="text-right px-3 py-2 font-medium">Precio YES</th>
                <th className="text-left px-3 py-2 font-medium">Estado</th>
                <th className="text-left px-3 py-2 font-medium">Cierra</th>
                <th className="px-5 sm:px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.id} className="border-b border-ink-50 dark:border-ink-800/50">
                  <td className="px-5 sm:px-6 py-3 max-w-md">
                    <Link href={`/markets/${m.id}`} className="font-medium hover:text-accent-500 line-clamp-2">{m.title}</Link>
                    <div className="text-[11px] text-ink-500 mono">{m.id}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-600 dark:text-ink-300">{m.category}</td>
                  <td className="px-3 py-3 text-right num">{(m.current_yes_price * 100).toFixed(1)}¢</td>
                  <td className="px-3 py-3 text-xs">{m.status}{m.resolved_outcome ? ` (${m.resolved_outcome})` : ""}</td>
                  <td className="px-3 py-3 text-xs text-ink-500 dark:text-ink-400 num">{new Date(m.closes_at).toLocaleDateString()}</td>
                  <td className="px-5 sm:px-6 py-3 text-right whitespace-nowrap">
                    {m.status !== "RESOLVED" && (
                      <>
                        <button onClick={() => resolve(m.id, "YES")} className="h-8 px-2.5 text-xs rounded-md bg-yes-500/15 text-yes-500 hover:bg-yes-500/25 font-medium mr-2">Resolver YES</button>
                        <button onClick={() => resolve(m.id, "NO")}  className="h-8 px-2.5 text-xs rounded-md bg-no-500/15 text-no-500 hover:bg-no-500/25 font-medium">Resolver NO</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && <CreateMarketModal onClose={() => setOpen(false)} onCreated={async () => { setOpen(false); await refresh(); }} />}
    </div>
  );
}

function CreateMarketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    id: "", title: "", short_title: "", description: "",
    category: "Economics", closes_at: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 16),
    initial_yes_price: 0.5, resolution_source: "Fuente oficial primaria",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.createMarket({ ...form, closes_at: new Date(form.closes_at).toISOString() });
      onCreated();
    } catch (e: any) { setErr(e?.message ?? "Falló la creación"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-ink-900 rounded-xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Crear mercado</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <F label="Slug ID (a-z, 0-9, guiones)"><input required pattern="[a-z0-9-]{3,64}" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} className={inp}/></F>
          <F label="Título"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp}/></F>
          <F label="Título corto"><input required maxLength={160} value={form.short_title} onChange={(e) => setForm({ ...form, short_title: e.target.value })} className={inp}/></F>
          <F label="Descripción / reglas de resolución"><textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inp} resize-y`}/></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Categoría">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </F>
            <F label="Precio YES inicial">
              <input type="number" min="0.02" max="0.98" step="0.01" value={form.initial_yes_price}
                     onChange={(e) => setForm({ ...form, initial_yes_price: parseFloat(e.target.value) })} className={inp}/>
            </F>
          </div>
          <F label="Cierra el">
            <input type="datetime-local" required value={form.closes_at}
                   onChange={(e) => setForm({ ...form, closes_at: e.target.value })} className={inp}/>
          </F>
          {err && <div className="text-no-500 text-sm">{err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-ink-200 dark:border-ink-700 text-sm">Cancelar</button>
            <button disabled={busy} type="submit" className="h-10 px-4 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium disabled:opacity-50">
              {busy ? "Creando..." : "Crear mercado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inp = "w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
