"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Botón seguir/dejar de seguir un mercado. Se auto-oculta si no hay sesión. */
export function FollowButton({ marketId }: { marketId: string }) {
  const { user } = useAuth();
  const [watched, setWatched] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.watchlistIds()
      .then((ids) => setWatched(ids.includes(marketId)))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [user?.id, marketId]); // eslint-disable-line

  if (!user) return null;

  const toggle = () => {
    setWatched((w) => {
      const nv = !w;
      (nv ? api.addWatch(marketId) : api.removeWatch(marketId)).catch(() => {});
      return nv;
    });
  };

  return (
    <button type="button" onClick={toggle} disabled={!ready}
      aria-pressed={watched}
      className={`h-8 px-3 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition disabled:opacity-50 ${watched
        ? "border-accent-500 text-accent-500 bg-accent-500/5"
        : "border-ink-200 dark:border-ink-800 text-ink-600 dark:text-ink-300 hover:border-accent-500"}`}>
      <span>{watched ? "★" : "☆"}</span>{watched ? "Siguiendo" : "Seguir"}
    </button>
  );
}
