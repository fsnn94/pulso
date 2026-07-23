"""WebSocket connection manager and endpoint.

Clients connect to `/ws` and may send `{"type":"subscribe","markets":[...]}`
to receive only events for selected markets, or omit the filter to receive
the global firehose of PUBLIC market events (prices/trades/markets).

Eventos sensibles de compliance (AML) NO viajan por el firehose público: un
cliente debe autenticarse con `{"type":"auth","token":"<jwt>"}` y solo se le
entregan si el usuario es admin con la capacidad `aml`. El token va por mensaje
(no en la URL) para no filtrarlo en logs de acceso.
"""
from __future__ import annotations
import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .db import session_scope
from .deps import has_capability
from .models import User
from .security import decode_token, password_token_version

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        # ws -> set of market_ids (None means firehose)
        self._clients: dict[WebSocket, set[str] | None] = {}
        # Sockets autenticados como admin con capacidad `aml` — únicos que reciben
        # los eventos de compliance (aml_*).
        self._aml_admins: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients[ws] = None

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.pop(ws, None)
            self._aml_admins.discard(ws)

    async def set_subscriptions(self, ws: WebSocket, markets: list[str] | None) -> None:
        async with self._lock:
            self._clients[ws] = set(markets) if markets else None

    async def set_aml_admin(self, ws: WebSocket, on: bool) -> None:
        async with self._lock:
            if on:
                self._aml_admins.add(ws)
            else:
                self._aml_admins.discard(ws)

    async def broadcast(self, market_id: str | None, payload: dict[str, Any]) -> None:
        """Firehose público de eventos de mercado (precios/trades/mercados)."""
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
                    self._aml_admins.discard(ws)

    async def broadcast_admin(self, payload: dict[str, Any]) -> None:
        """Canal restringido: solo sockets autenticados como admin con `aml`."""
        message = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        async with self._lock:
            targets = list(self._aml_admins)
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.pop(ws, None)
                    self._aml_admins.discard(ws)


manager = ConnectionManager()


async def broadcast_market_event(market_id: str | None, payload: dict[str, Any]) -> None:
    await manager.broadcast(market_id, payload)


async def broadcast_admin_event(payload: dict[str, Any]) -> None:
    """Emite un evento de compliance (aml_*) solo a admins autenticados con `aml`."""
    await manager.broadcast_admin(payload)


async def _verify_aml_admin(token: str | None) -> bool:
    """Valida el token del handshake contra la DB (no se confía del claim del JWT):
    debe ser un usuario existente, no deshabilitado, con sesión vigente (pv) y con
    la capacidad `aml`."""
    if not token:
        return False
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        return False
    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        return False
    async with session_scope() as db:
        user = await db.get(User, user_id)
        if user is None or user.disabled:
            return False
        if payload.get("pv") != password_token_version(user.password_hash):
            return False
        return has_capability(user, "aml")


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
            mtype = msg.get("type")
            if mtype == "auth":
                ok = await _verify_aml_admin(msg.get("token"))
                await manager.set_aml_admin(ws, ok)
                await ws.send_text(json.dumps({"type": "authed", "aml": ok}))
            elif mtype == "subscribe":
                markets = msg.get("markets")
                await manager.set_subscriptions(ws, markets)
                await ws.send_text(json.dumps({"type": "subscribed", "markets": markets}))
            elif mtype == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    finally:
        await manager.disconnect(ws)
