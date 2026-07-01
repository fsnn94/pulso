"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Comment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";

export function MarketComments({ marketId }: { marketId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.marketComments(marketId).then(setComments).catch(() => {});
  useEffect(() => { void load(); }, [marketId]); // eslint-disable-line

  const submit = async () => {
    const text = body.trim();
    if (text.length < 2) return;
    setBusy(true); setErr(null);
    try {
      const c = await api.postComment(marketId, text);
      setComments((cur) => [c, ...cur]);
      setBody("");
    } catch (e: any) { setErr(e?.message ?? "No se pudo publicar"); }
    finally { setBusy(false); }
  };

  const remove = async (c: Comment) => {
    if (!confirm("¿Eliminar este comentario?")) return;
    try {
      await api.deleteComment(marketId, c.id);
      setComments((cur) => cur.filter((x) => x.id !== c.id));
    } catch (e: any) { alert(e?.message ?? "Falló"); }
  };

  return (
    <div className="mt-6 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-5 sm:p-6">
      <h2 className="font-semibold mb-3">Discusión ({comments.length})</h2>

      {user ? (
        user.email_verified ? (
          <div className="mb-5">
            <textarea
              value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1000}
              placeholder="Compartí tu análisis…"
              className="w-full px-3 py-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm resize-y focus:outline-none focus:border-accent-500"/>
            <div className="flex items-center justify-between mt-2">
              {err ? <span className="text-xs text-no-500">{err}</span> : <span className="text-[11px] text-ink-400 dark:text-ink-500">{body.length}/1000</span>}
              <button onClick={submit} disabled={busy || body.trim().length < 2}
                className="h-8 px-3 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium disabled:opacity-40">
                {busy ? "Publicando…" : "Publicar"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-500 dark:text-ink-400 mb-5">Verificá tu email para participar en la discusión.</p>
        )
      ) : (
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-5">
          <Link href="/login" className="text-accent-500 hover:underline">Ingresá</Link> para dejar un comentario.
        </p>
      )}

      {comments.length === 0 ? (
        <div className="text-sm text-ink-500 dark:text-ink-400 py-4 text-center">Todavía no hay comentarios. Sé el primero.</div>
      ) : (
        <div className="divide-y divide-ink-50 dark:divide-ink-800/60">
          {comments.map((c) => {
            const canDelete = user && (user.handle === c.handle || user.is_admin);
            return (
              <div key={c.id} className="py-3 group">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <Link href={`/u/${encodeURIComponent(c.handle)}`} className="font-medium text-ink-700 dark:text-ink-300 hover:text-accent-500">@{c.handle}</Link>
                  <span className="text-ink-400 dark:text-ink-500">{timeAgo(c.created_at)}</span>
                  {canDelete && (
                    <button onClick={() => remove(c)}
                      className="ml-auto text-[11px] text-ink-400 hover:text-no-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      Eliminar
                    </button>
                  )}
                </div>
                <p className="text-sm text-ink-700 dark:text-ink-200 whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
