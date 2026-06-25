"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await login(email, password); router.push("/"); }
    catch (e: any) { setErr(e?.message ?? "Login failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto py-12 sm:py-20 px-4 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Welcome back</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mb-8">
        Sign in to your simulated trading account.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                 className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent"/>
        </Field>
        <Field label="Password">
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                 className="w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent"/>
        </Field>
        {err && <div className="text-no-500 text-sm">{err}</div>}
        <button disabled={busy} type="submit"
                className="w-full h-11 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-500 dark:text-ink-400">
        New here? <Link href="/register" className="text-accent-500 hover:underline">Create an account</Link>
      </p>
      <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
        Try the seeded admin: <span className="mono">admin@pulso.local / admin123</span>
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
