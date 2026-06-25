"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, Proposal } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";

const CATEGORIES = ["Economics", "Tech & AI", "Crypto", "Science", "Sports", "Climate", "Space", "Culture"];

export default function ProposeMarketPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    slug: "", title: "", short_title: "", description: "",
    category: "Economics",
    closes_at: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 16),
    initial_yes_price: 0.5,
    resolution_source: "Official primary source",
    rationale: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [mine, setMine] = useState<Proposal[]>([]);

  useEffect(() => {
    if (!user) return;
    api.myProposals().then(setMine).catch(() => {});
  }, [user?.id]); // eslint-disable-line

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Loading…</div>;
  if (!user) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="text-2xl font-semibold mb-2">Sign in to propose a market</h1>
        <p className="text-ink-500 dark:text-ink-400 text-sm mb-6">Any verified user can submit market ideas — an admin reviews each one before it goes live.</p>
        <Link href="/login" className="inline-block h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium">Log in</Link>
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
      setMsg({ kind: "ok", text: `Submitted! Proposal "${created.title}" is now pending admin review.` });
      setMine((p) => [created, ...p]);
      setForm({ ...form, slug: "", title: "", short_title: "", description: "", rationale: "" });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Submission failed" });
    } finally { setBusy(false); }
  };

  return (
    <div className="view-enter max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12 grid lg:grid-cols-[1fr_320px] gap-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Propose a market</h1>
        <p className="text-ink-500 dark:text-ink-400 text-sm mb-8 max-w-prose">
          Submit a question about a future event. An admin reviews each proposal for clarity, an unambiguous resolution rule, and adherence to our content policy before it goes live.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Title (the question)">
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                   placeholder="Will X happen by date Y?" className={inp}/>
          </Field>
          <Field label="Short title (used in cards & breadcrumbs)">
            <input maxLength={160} value={form.short_title} onChange={(e) => setForm({ ...form, short_title: e.target.value })}
                   placeholder="Concise summary" className={inp}/>
          </Field>
          <Field label="Slug ID (optional — auto-derived)">
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                   placeholder="e.g. fed-jul-cut (a-z, 0-9, dashes)" className={inp} pattern="[a-z0-9-]{3,64}"/>
          </Field>
          <Field label="Resolution rules — describe exactly when this resolves YES vs NO">
            <textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className={`${inp} resize-y`}
                      placeholder="Resolves YES if [specific verifiable event]; otherwise NO. Source: [primary source]."/>
          </Field>
          <Field label="Why this market matters (optional rationale for the admin reviewer)">
            <textarea rows={2} value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })}
                      className={`${inp} resize-y`}/>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Suggested initial YES price">
              <input type="number" min="0.02" max="0.98" step="0.01" value={form.initial_yes_price}
                     onChange={(e) => setForm({ ...form, initial_yes_price: parseFloat(e.target.value) })} className={inp}/>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Closes at (resolution deadline)">
              <input type="datetime-local" required value={form.closes_at}
                     onChange={(e) => setForm({ ...form, closes_at: e.target.value })} className={inp}/>
            </Field>
            <Field label="Resolution source">
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
            {busy ? "Submitting…" : "Submit for review"}
          </button>
        </form>
      </div>

      <aside>
        <div className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5">
          <h2 className="font-semibold mb-3">Your proposals</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">No submissions yet.</p>
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
                    <div className="text-xs text-ink-500 dark:text-ink-400 mt-1 italic">Admin note: {p.review_note}</div>
                  )}
                  {p.approved_market_id && (
                    <Link href={`/markets/${p.approved_market_id}`} className="text-xs text-accent-500 hover:underline mt-1 inline-block">View live market →</Link>
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
