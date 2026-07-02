"""Chequeo de CI: replica el arranque de la app (create_all + alembic upgrade)
contra la DB de DATABASE_URL. Falla si el schema o las migraciones no aplican.

Ataja crashes de migración como el 0004/0005 antes de que lleguen a producción.
Uso: python scripts/ci_startup_check.py   (desde backend/)
"""
from __future__ import annotations
import asyncio

from alembic import command
from alembic.config import Config

from app.db import Base, engine


async def _create_all() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


def main() -> None:
    asyncio.run(_create_all())                 # como el lifespan de la app
    command.upgrade(Config("alembic.ini"), "head")
    print("startup schema (create_all + alembic upgrade) OK")


if __name__ == "__main__":
    main()
