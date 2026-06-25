"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const COUNTRIES = [
  ["PY", "Paraguay"], ["AR", "Argentina"], ["BR", "Brazil"], ["CL", "Chile"],
  ["UY", "Uruguay"], ["BO", "Bolivia"], ["US", "United States"], ["ES", "Spain"],
  ["MX", "Mexico"], ["OT", "Other"],
];

export default function KycPage() {
  const { user, loading, refresh } = useAuth();
  const [form, setForm] = useState({
    full_name: "", country: "PY", id_number: "",
    date_of_birth: "1990-01-01",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Loading…</div>;
  if (!user) {
    return <div className="max-w-md mx-auto py-20 text-center text-sm text-ink-500">
      <Link href="/login" className="underline">Sign in</Link> to manage your compliance profile.
    </div>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api.submitKyc({
        full_name: form.full_name.trim(),
        country: form.country,
        id_number: form.id_number.trim(),
        date_of_birth: new Date(form.date_of_birth).toISOString(),
      });
      await refresh();
      setMsg({ kind: "ok", text: "Compliance profile saved. Thank you." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Save failed" });
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 lg:py-14 view-enter">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Compliance profile</p>
      <h1 className="text-3xl font-semibold tracking-tight mt-1">Verify your identity</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mt-3 leading-relaxed">
        These fields are required if Pulso is ever required to file regulator reports (SEPRELAD-style AML, CNV record-keeping). Information is encrypted at rest and only released to admins under documented operational procedures and Paraguay's Law 6534/2020 lawful-basis framework.
      </p>

      <div className="mt-4 mb-6 grid grid-cols-2 gap-2 text-xs">
        <Status label="Email verified" ok={user.email_verified}/>
        <Status label="KYC submitted" ok={!!user.kyc_completed_at}/>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Full legal name">
          <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inp}/>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country (ISO alpha-2)">
            <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inp}>
              {COUNTRIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </Field>
          <Field label="ID number (cédula / passport)">
            <input required value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} className={inp}/>
          </Field>
        </div>
        <Field label="Date of birth">
          <input required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className={inp}/>
        </Field>
        {msg && (
          <div className={`text-sm rounded-md px-3 py-2 ${msg.kind === "ok" ? "bg-yes-500/10 text-yes-500" : "bg-no-500/10 text-no-500"}`}>{msg.text}</div>
        )}
        <button type="submit" disabled={busy}
                className="h-11 px-5 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
          {busy ? "Saving…" : "Save compliance profile"}
        </button>
      </form>
      <p className="text-xs text-ink-500 dark:text-ink-400 mt-6">
        Read the full <Link href="/compliance" className="text-accent-500 underline">Paraguayan compliance framework</Link>.
      </p>
    </div>
  );
}

function Status({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`rounded-md px-3 py-2 flex items-center gap-2 border ${ok ? "border-yes-500/30 bg-yes-500/5 text-yes-500" : "border-ink-200 dark:border-ink-800 text-ink-500"}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? "#2D6A4F" : "#9D9088" }}/>
      {label}
    </div>
  );
}

const inp = "w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">{label}</span>{children}</label>;
}
