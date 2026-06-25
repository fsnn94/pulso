"use client";

import { useEffect, useRef } from "react";
import { api } from "./api";

export type WsEvent =
  | { type: "hello"; channels: string[] }
  | { type: "price"; market_id: string; yes: number; no: number }
  | { type: "trade"; market_id: string; side: "YES" | "NO"; price: number; quantity: number }
  | { type: "created"; market_id: string }
  | { type: "resolved"; market_id: string; outcome: "YES" | "NO"; positions_settled: number }
  | { type: "subscribed"; markets: string[] | null }
  | { type: "pong" };

export function useMarketSocket(
  onEvent: (e: WsEvent) => void,
  opts: { markets?: string[] | null } = {}
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    let backoff = 500;

    function connect() {
      try {
        ws = new WebSocket(api.wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        backoff = 500;
        if (opts.markets !== undefined) {
          ws?.send(JSON.stringify({ type: "subscribe", markets: opts.markets }));
        }
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as WsEvent;
          handlerRef.current(data);
        } catch {}
      };
      ws.onclose = scheduleReconnect;
      ws.onerror = () => ws?.close();
    }

    function scheduleReconnect() {
      if (cancelled) return;
      backoff = Math.min(backoff * 2, 8000);
      setTimeout(connect, backoff);
    }

    connect();
    return () => { cancelled = true; ws?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(opts.markets ?? null)]);
}
