"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [handle, setHandle]     = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await register({ email, handle, password, accepted_disclaimer: accepted });
      router.push("/");
    } catch (e: any) { setErr(e?.message ?? "Sign up failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto py-12 sm:py-20 px-4 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Create your account</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mb-8">
        You'll start with $10,000 in virtual credits. Trades are simulated for research and education.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                 className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent"/>
        </Field>
        <Field label="Handle">
          <input required value={handle} onChange={(e) => setHandle(e.target.value)} pattern="[a-zA-Z0-9_]{2,40}"
                 className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent"/>
        </Field>
        <Field label="Password (6+ chars)">
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                 className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent"/>
        </Field>
        <label className="flex items-start gap-2.5 text-xs text-ink-600 dark:text-ink-300 leading-relaxed">
          <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5"/>
          <span>I understand Pulso is a research and education tool. Trades are simulated using virtual credits — there are no real-money payouts, this is not a security, and not gambling. I confirm I am of legal age in my jurisdiction and that this product is permitted there.</span>
        </label>
        {err && <div className="text-no-500 text-sm">{err}</div>}
        <button disabled={busy || !accepted} type="submit"
                className="w-full h-11 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-500 dark:text-ink-400">
        Already have an account? <Link href="/login" className="text-accent-500 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
