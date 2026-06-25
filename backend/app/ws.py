"""WebSocket connection manager and endpoint.

Clients connect to `/ws` and may send `{"type":"subscribe","markets":[...]}`
to receive only events for selected markets, or omit the filter to receive
the global firehose.
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        # ws -> set of market_ids (None means firehose)
        self._clients: dict[WebSocket, set[str] | None] = {}

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients[ws] = None

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.pop(ws, None)

    async def set_subscriptions(self, ws: WebSocket, markets: list[str] | None) -> None:
        async with self._lock:
            self._clients[ws] = set(markets) if markets else None

    async def broadcast(self, market_id: str | None, payload: dict[str, Any]) -> None:
        message = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        async with self._lock:
            targets = list(self._clients.items())
        for ws, subs in targets:
            if subs is not None and market_id is not None and market_id not in subs:
                continue
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.pop(ws, None)


manager = ConnectionManager()


async def broadcast_market_event(market_id: str | None, payload: dict[str, Any]) -> None:
    await manager.broadcast(market_id, payload)


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "channels": ["prices", "trades", "markets"]}))
        while True:
            try:
                raw = await ws.receive_text()
            except WebSocketDisconnect:
                break
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "subscribe":
                markets = msg.get("markets")
                await manager.set_subscriptions(ws, markets)
                await ws.send_text(json.dumps({"type": "subscribed", "markets": markets}))
            elif msg.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    finally:
        await manager.disconnect(ws)
