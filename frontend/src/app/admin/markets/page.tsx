"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, Market, MarketCreateIn } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { statusEs } from "@/lib/format";
import { sideLabel } from "@/lib/market";

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
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

type Sort = "close_asc" | "close_desc" | "volume";
const SORTS: { value: Sort; label: string }[] = [
  { value: "close_asc",  label: "Cierre próximo" },
  { value: "close_desc", label: "Cierre lejano" },
  { value: "volume",     label: "Más volumen" },
];

export default function AdminMarketsPage() {
  const { user, loading } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<Sort>("close_asc");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = async () => {
    try { setMarkets((await api.listMarkets({ sort: "newest" })).items); } catch {}
  };
  useEffect(() => { if (user?.is_admin) void refresh(); }, [user?.id]); // eslint-disable-line

  // Categorías realmente presentes en los mercados (para no mostrar chips vacíos).
  const presentCategories = useMemo(() => {
    return Array.from(new Set(markets.map((m) => m.category))).sort();
  }, [markets]);

  const filtered = useMemo(() => {
    let xs = markets;
    if (category !== "All") xs = xs.filter((m) => m.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((m) => m.title.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
    }
    const byClose = (a: Market, b: Market) => new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime();
    xs = [...xs];
    if (sort === "close_asc")  xs.sort(byClose);
    if (sort === "close_desc") xs.sort((a, b) => byClose(b, a));
    if (sort === "volume")     xs.sort((a, b) => b.volume_24h - a.volume_24h);
    return xs;
  }, [markets, category, sort, search]);

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-ink-500">Cargando...</div>;
  if (!user)   return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-ink-500"><Link href="/login" className="underline">Ingresa</Link> para acceder al admin.</div>;
  if (!user.is_admin) return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-ink-500">Se requiere acceso de admin.</div>;

  const resolve = async (id: string, outcome: "YES" | "NO") => {
    if (!confirm(`¿Resolver el mercado ${id} como ${outcome}? Esto pagará a los ganadores.`)) return;
    try {
      await api.resolveMarket(id, outcome);
      setMsg({ kind: "ok", text: `Resuelto ${id} como ${outcome}.` });
      await refresh();
    } catch (e: any) { setMsg({ kind: "err", text: e?.message ?? "Falló la resolución" }); }
  };

  const chip = (active: boolean) =>
    `h-9 px-3 rounded-lg text-xs font-medium ${active
      ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900"
      : "bg-ink-50 dark:bg-ink-900 text-ink-700 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"}`;

  return (
    <div className="view-enter max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Panel admin</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Mercados</h1>
        </div>
        <Link href="/admin" className="text-sm text-ink-500 dark:text-ink-400 hover:underline">← Volver al panel</Link>
      </div>

      {/* Toolbar: búsqueda + crear */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          type="text"
          placeholder="Buscar por título o ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm flex-1 min-w-[200px]"
        />
        <label className="text-xs text-ink-500 dark:text-ink-400">Ordenar</label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
                className="h-9 px-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={() => setOpen(true)}
                className="h-9 px-3 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium text-sm">
          Crear mercado
        </button>
      </div>

      {/* Filtro por categoría */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <button onClick={() => setCategory("All")} className={chip(category === "All")}>Todas</button>
        {presentCategories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={chip(category === c)}>
            {CATEGORY_LABEL[c] ?? c}
          </button>
        ))}
      </div>

      <div className="text-xs text-ink-500 dark:text-ink-400 mb-2">
        Mostrando {filtered.length} de {markets.length} mercados
      </div>

      {msg && (
        <div className={`mb-4 text-sm rounded-md px-3 py-2 ${msg.kind === "ok" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30">
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
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-14 text-center text-sm text-ink-500 dark:text-ink-400">No hay mercados que coincidan con los filtros.</td></tr>
            ) : filtered.map((m) => (
              <tr key={m.id} className="border-b border-ink-50 dark:border-ink-800/50 last:border-0">
                <td className="px-5 sm:px-6 py-3 max-w-md">
                  <Link href={`/markets/${m.id}`} className="font-medium hover:text-accent-500 line-clamp-2">{m.title}</Link>
                  <div className="text-[11px] text-ink-500 mono">{m.id}</div>
                </td>
                <td className="px-3 py-3 text-ink-600 dark:text-ink-300">{CATEGORY_LABEL[m.category] ?? m.category}</td>
                <td className="px-3 py-3 text-right num">{(m.current_yes_price * 100).toFixed(1)}¢</td>
                <td className="px-3 py-3 text-xs">{statusEs(m.status)}{m.resolved_outcome ? ` (${sideLabel(m, m.resolved_outcome)})` : ""}</td>
                <td className="px-3 py-3 text-xs text-ink-500 dark:text-ink-400 num">{new Date(m.closes_at).toLocaleDateString()}</td>
                <td className="px-5 sm:px-6 py-3 text-right whitespace-nowrap">
                  {m.status !== "RESOLVED" && (
                    <>
                      <button onClick={() => resolve(m.id, "YES")} className="h-8 px-2.5 text-xs rounded-md bg-yes-500/15 text-yes-500 hover:bg-yes-500/25 font-medium mr-2">Resolver {sideLabel(m, "YES")}</button>
                      <button onClick={() => resolve(m.id, "NO")}  className="h-8 px-2.5 text-xs rounded-md bg-no-500/15 text-no-500 hover:bg-no-500/25 font-medium">Resolver {sideLabel(m, "NO")}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <CreateMarketModal onClose={() => setOpen(false)} onCreated={async () => { setOpen(false); await refresh(); }} />}
    </div>
  );
}

function CreateMarketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<MarketCreateIn>({
    id: "", title: "", short_title: "", description: "",
    category: "Economics", closes_at: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 16),
    initial_yes_price: 0.5, resolution_source: "Fuente oficial primaria",
    yes_label: "Sí", no_label: "No",
  });
  const [marketType, setMarketType] = useState<"yesno" | "labeled">("yesno");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labeled = marketType === "labeled";
  const yesName = labeled && (form.yes_label ?? "").trim() ? form.yes_label!.trim() : "Sí";
  const noName  = labeled && (form.no_label ?? "").trim()  ? form.no_label!.trim()  : "No";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.createMarket({
        ...form, yes_label: yesName, no_label: noName,
        closes_at: new Date(form.closes_at).toISOString(),
      });
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
          <F label="Tipo de mercado">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMarketType("yesno")}
                      className={`h-9 rounded-lg border text-sm font-medium ${!labeled ? "border-accent-500 bg-accent-500/10 text-accent-500" : "border-ink-200 dark:border-ink-800"}`}>Sí / No</button>
              <button type="button" onClick={() => setMarketType("labeled")}
                      className={`h-9 rounded-lg border text-sm font-medium ${labeled ? "border-accent-500 bg-accent-500/10 text-accent-500" : "border-ink-200 dark:border-ink-800"}`}>Dos opciones</button>
            </div>
          </F>
          {labeled && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Opción A (paga si ocurre)"><input required maxLength={40} value={form.yes_label ?? ""} onChange={(e) => setForm({ ...form, yes_label: e.target.value })} placeholder="ej. Boca" className={inp}/></F>
              <F label="Opción B"><input required maxLength={40} value={form.no_label ?? ""} onChange={(e) => setForm({ ...form, no_label: e.target.value })} placeholder="ej. River" className={inp}/></F>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <F label="Categoría">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </F>
            <F label={`Precio inicial de "${yesName}"`}>
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
