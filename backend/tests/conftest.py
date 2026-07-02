"""Fixtures de test. Corren contra la DB de DATABASE_URL (en CI, el Postgres
efímero). Cada test recibe una DB limpia (drop_all + create_all)."""
from __future__ import annotations
import os

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.db import Base
import app.models  # noqa: F401  — registra los modelos en Base.metadata

TEST_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/pulso_ci"
)


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(TEST_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session
    await engine.dispose()
