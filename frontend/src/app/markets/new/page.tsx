"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, Proposal } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";

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

export default function ProposeMarketPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    slug: "", title: "", short_title: "", description: "",
    category: "Economics",
    closes_at: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 16),
    initial_yes_price: 0.5,
    resolution_source: "Fuente oficial primaria",
    rationale: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [mine, setMine] = useState<Proposal[]>([]);

  useEffect(() => {
    if (!user) return;
    api.myProposals().then(setMine).catch(() => {});
  }, [user?.id]); // eslint-disable-line

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="text-2xl font-semibold mb-2">Ingresa para proponer un mercado</h1>
        <p className="text-ink-500 dark:text-ink-400 text-sm mb-6">Cualquier usuario verificado puede enviar ideas de mercado — un admin revisa cada una antes de publicarla.</p>
        <Link href="/login" className="inline-block h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium">Ingresar</Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const slug = (form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)).replace(/^-|-$/g, "");
      const created = await api.submitProposal({
        ...form, slug,
        closes_at: new Date(form.closes_at).toISOString(),
      });
      setMsg({ kind: "ok", text: `¡Enviado! La propuesta "${created.title}" está pendiente de revisión por admin.` });
      setMine((p) => [created, ...p]);
      setForm({ ...form, slug: "", title: "", short_title: "", description: "", rationale: "" });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falló el envío" });
    } finally { setBusy(false); }
  };

  return (
    <div className="view-enter max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12 grid lg:grid-cols-[1fr_320px] gap-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Proponer un mercado</h1>
        <p className="text-ink-500 dark:text-ink-400 text-sm mb-8 max-w-prose">
          Envía una pregunta sobre un evento futuro. Un admin revisa cada propuesta por claridad, una regla de resolución inequívoca y cumplimiento de nuestra política de contenidos antes de publicarla.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Título (la pregunta)">
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                   placeholder="¿Sucederá X antes de la fecha Y?" className={inp}/>
          </Field>
          <Field label="Título corto (usado en tarjetas y migas)">
            <input maxLength={160} value={form.short_title} onChange={(e) => setForm({ ...form, short_title: e.target.value })}
                   placeholder="Resumen conciso" className={inp}/>
          </Field>
          <Field label="Slug ID (opcional — se genera automáticamente)">
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                   placeholder="ej. fed-jul-cut (a-z, 0-9, guiones)" className={inp} pattern="[a-z0-9-]{3,64}"/>
          </Field>
          <Field label="Reglas de resolución — describe exactamente cuándo resuelve YES vs NO">
            <textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className={`${inp} resize-y`}
                      placeholder="Resuelve YES si [evento verificable específico]; en caso contrario NO. Fuente: [fuente primaria]."/>
          </Field>
          <Field label="Por qué importa este mercado (motivación opcional para el revisor)">
            <textarea rows={2} value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })}
                      className={`${inp} resize-y`}/>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Categoría">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Precio YES inicial sugerido">
              <input type="number" min="0.02" max="0.98" step="0.01" value={form.initial_yes_price}
                     onChange={(e) => setForm({ ...form, initial_yes_price: parseFloat(e.target.value) })} className={inp}/>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Cierra el (fecha de resolución)">
              <input type="datetime-local" required value={form.closes_at}
                     onChange={(e) => setForm({ ...form, closes_at: e.target.value })} className={inp}/>
            </Field>
            <Field label="Fuente de resolución">
              <input value={form.resolution_source}
                     onChange={(e) => setForm({ ...form, resolution_source: e.target.value })} className={inp}/>
            </Field>
          </div>

          {msg && (
            <div className={`text-sm rounded-md px-3 py-2 ${msg.kind === "ok" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={busy}
                  className="h-11 px-5 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
            {busy ? "Enviando..." : "Enviar para revisión"}
          </button>
        </form>
      </div>

      <aside>
        <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5">
          <h2 className="font-semibold mb-3">Tus propuestas</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">Aún no has enviado ninguna.</p>
          ) : (
            <div className="space-y-3">
              {mine.map((p) => (
                <div key={p.id} className="pb-3 border-b border-ink-100 dark:border-ink-800 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded
                      ${p.status === "PENDING" ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-500"
                        : p.status === "APPROVED" ? "bg-yes-500/15 text-yes-500" : "bg-no-500/15 text-no-500"}`}>
                      {p.status}
                    </span>
                    <span className="text-[11px] text-ink-500 dark:text-ink-400">{timeAgo(p.created_at)}</span>
                  </div>
                  <div className="text-sm font-medium mt-1 line-clamp-2">{p.title}</div>
                  {p.review_note && (
                    <div className="text-xs text-ink-500 dark:text-ink-400 mt-1 italic">Nota del admin: {p.review_note}</div>
                  )}
                  {p.approved_market_id && (
                    <Link href={`/markets/${p.approved_market_id}`} className="text-xs text-accent-500 hover:underline mt-1 inline-block">Ver mercado en vivo →</Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

const inp = "w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
