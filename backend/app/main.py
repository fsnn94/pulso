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
from .price_engine import price_engine_loop
from .resolution_loop import resolution_loop
from .routers import admin, auth, markets, orders, portfolio, proposals
from .routers import aml as aml_router
from .routers import resolutions as resolutions_router
from .seed import seed_if_empty
from .ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    s = get_settings()
    if s.seed_on_startup:
        async with session_scope() as db:
            await seed_if_empty(db)

    price_task = asyncio.create_task(price_engine_loop(),  name="price_engine")
    aml_task   = asyncio.create_task(aml_scan_loop(),       name="aml_scan")
    res_task   = asyncio.create_task(resolution_loop(),     name="resolution")
    try:
        yield
    finally:
        for t in (price_task, aml_task, res_task):
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
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(markets.router)
    app.include_router(orders.router)
    app.include_router(portfolio.router)
    app.include_router(proposals.router)
    app.include_router(admin.router)
    app.include_router(aml_router.router)
    app.include_router(resolutions_router.admin_router)
    app.include_router(resolutions_router.user_router)
    app.include_router(ws_router)

    @app.get("/health", tags=["meta"])
    async def health():
        return {"ok": True, "env": s.environment}

    return app


app = create_app()
