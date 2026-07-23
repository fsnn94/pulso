"""FastAPI entrypoint."""
from __future__ import annotations
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .aml_loop import aml_scan_loop
from .config import get_settings
from .db import Base, engine, session_scope
from .resolution_loop import resolution_loop
from .snapshot_loop import snapshot_loop
from .routers import admin, auth, comments, leaderboard, markets, news, notifications, orders, payments, portfolio, proposals, users
from .routers import aml as aml_router
from .routers import resolutions as resolutions_router
from .seed import ensure_superadmin, purge_demo_data, seed_if_empty
from .ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pulso.startup")

_WEAK_JWT_SECRETS = {"", "dev-secret-change-me", "change-me", "secret"}


def _assert_production_safe() -> None:
    """Guardas de producción (fail-fast). Evita arrancar con secretos inseguros.
    En prod, seteá ENVIRONMENT=production y un JWT_SECRET fuerte (≥32 chars)."""
    s = get_settings()
    weak_jwt = s.jwt_secret in _WEAK_JWT_SECRETS or len(s.jwt_secret) < 32
    if s.environment == "production":
        if weak_jwt:
            raise RuntimeError(
                "JWT_SECRET inseguro o ausente en producción. Seteá un valor fuerte (≥32 chars) "
                "en la env var JWT_SECRET. Abortando por seguridad."
            )
    elif weak_jwt:
        logger.warning(
            "JWT_SECRET usa un valor débil/por defecto. Es OK en desarrollo pero NUNCA en producción."
        )


def _run_alembic_upgrade() -> None:
    """Run "alembic upgrade head" against the configured database URL.

    Errors are logged but do not crash startup: in a research preview we
    prefer the API to come up even if a migration fails (admin can inspect).
    """
    import os
    import logging
    from alembic import command
    from alembic.config import Config
    log = logging.getLogger("alembic.startup")
    try:
        cfg_path = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
        cfg = Config(cfg_path)
        command.upgrade(cfg, "head")
        log.info("Alembic upgrade head: OK")
    except Exception as e:
        log.warning("Alembic upgrade failed (continuing startup): %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _assert_production_safe()  # fail-fast: no arrancar con secretos inseguros en prod
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Apply Alembic migrations (incremental schema changes beyond create_all).
    # Runs synchronously in a worker thread to avoid blocking the event loop.
    await asyncio.to_thread(_run_alembic_upgrade)

    s = get_settings()
    if s.seed_on_startup:
        async with session_scope() as db:
            await seed_if_empty(db)

    # Limpieza única de datos demo (gateada por PURGE_DEMO_DATA), antes del resto.
    async with session_scope() as db:
        await purge_demo_data(db)

    # Marca al admin principal (superadmin) si SUPERADMIN_EMAIL está configurado.
    async with session_scope() as db:
        await ensure_superadmin(db)

    aml_task   = asyncio.create_task(aml_scan_loop(),       name="aml_scan")
    res_task   = asyncio.create_task(resolution_loop(),     name="resolution")
    snap_task  = asyncio.create_task(snapshot_loop(),       name="equity_snapshot")
    try:
        yield
    finally:
        for t in (aml_task, res_task, snap_task):
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Pulso",
        version="0.1.0",
        description="Research-grade prediction platform (simulated trading).",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list or ["*"],
        # Auth por bearer token (no cookies) → no hacen falta credenciales cross-origin.
        # Con credentials=False, "*" es una combinación válida y segura.
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(markets.router)
    app.include_router(orders.router)
    app.include_router(portfolio.router)
    app.include_router(proposals.router)
    app.include_router(users.router)
    app.include_router(leaderboard.router)
    app.include_router(comments.router)
    app.include_router(news.router)
    app.include_router(notifications.router)
    app.include_router(admin.router)
    app.include_router(payments.router)
    app.include_router(payments.admin_router)
    app.include_router(aml_router.router)
    app.include_router(resolutions_router.admin_router)
    app.include_router(resolutions_router.user_router)
    app.include_router(ws_router)

    @app.get("/health", tags=["meta"])
    async def health():
        return {"ok": True, "env": s.environment}

    return app


app = create_app()
