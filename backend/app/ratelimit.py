"""Rate limiting in-memory (sliding window) por IP.

Suficiente para una sola instancia (WEB_CONCURRENCY=1, como corre hoy en Render).
Cuando se escale a múltiples instancias hay que moverlo a Redis (backlog P2/S2).
"""
from __future__ import annotations
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[str, deque[float]] = defaultdict(deque)
_last_gc = 0.0


def _client_ip(request: Request) -> str:
    # Render (y la mayoría de los PaaS) va detrás de un proxy → usar X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _gc(now: float) -> None:
    """Poda perezosa de buckets vacíos para que el dict no crezca sin límite."""
    global _last_gc
    if now - _last_gc < 300:
        return
    _last_gc = now
    for k in [k for k, dq in _hits.items() if not dq]:
        _hits.pop(k, None)


def rate_limit(bucket: str, limit: int, window_seconds: int):
    """Dependencia de FastAPI: máx `limit` requests por `window_seconds` por IP."""
    async def _dep(request: Request) -> None:
        now = time.monotonic()
        _gc(now)
        key = f"{bucket}:{_client_ip(request)}"
        dq = _hits[key]
        cutoff = now - window_seconds
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            retry = int(window_seconds - (now - dq[0])) + 1
            raise HTTPException(
                429, f"Demasiadas solicitudes. Probá de nuevo en ~{retry}s.",
                headers={"Retry-After": str(max(retry, 1))},
            )
        dq.append(now)
    return _dep
