"""Async SQLAlchemy engine, session, and Base."""
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession, async_sessionmaker, create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings

# Claves de advisory lock (Postgres) para que los loops de fondo no corran
# duplicados si hay más de una instancia del backend (ver P1 de la auditoría).
LOCK_RESOLUTION = 811_001
LOCK_AML = 811_002
LOCK_SNAPSHOT = 811_003


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency."""
    async with SessionLocal() as session:
        yield session


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Manual session for background tasks."""
    async with SessionLocal() as session:
        yield session


@asynccontextmanager
async def advisory_lock(db: AsyncSession, key: int) -> AsyncIterator[bool]:
    """Lock de aplicación a nivel sesión (Postgres). Devuelve True si se obtuvo,
    False si otra instancia lo tiene (en ese caso el loop saltea el tick).
    El lock de sesión NO se libera con commit, así que lo liberamos explícito."""
    got = bool((await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": key})).scalar())
    try:
        yield got
    finally:
        if got:
            try:
                await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})
            except Exception:
                pass  # la sesión se cierra igual y libera el lock
