"""Almacenamiento de documentos KYC. Las imágenes NUNCA van en la DB: viven en
object storage (Cloudflare R2 en prod) y la DB guarda solo el `storage_key`.

Los documentos NUNCA se sirven públicos: se descargan a través de un endpoint
del backend gateado por capacidad admin (que además loguea el acceso). Por eso la
interfaz expone `get()` (traer bytes) en vez de URLs firmadas.
"""
from __future__ import annotations
import asyncio
import os
from functools import lru_cache
from typing import Protocol

from .config import get_settings


class StorageError(RuntimeError):
    pass


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...


class FilesystemStorage:
    """Solo para desarrollo. En Render el disco es efímero (se borra en cada
    deploy) → NO usar en producción."""
    def __init__(self, base_dir: str) -> None:
        self.base = os.path.abspath(base_dir)

    def _path(self, key: str) -> str:
        # Evita traversal: normaliza y verifica que quede dentro de base.
        p = os.path.abspath(os.path.join(self.base, key))
        if not p.startswith(self.base + os.sep):
            raise StorageError("Clave de almacenamiento inválida")
        return p

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        def _w() -> None:
            p = self._path(key)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as f:
                f.write(data)
        await asyncio.to_thread(_w)

    async def get(self, key: str) -> bytes:
        def _r() -> bytes:
            with open(self._path(key), "rb") as f:
                return f.read()
        return await asyncio.to_thread(_r)

    async def delete(self, key: str) -> None:
        def _d() -> None:
            try:
                os.remove(self._path(key))
            except FileNotFoundError:
                pass
        await asyncio.to_thread(_d)


class R2Storage:
    """Cloudflare R2 (S3-compatible) vía boto3. boto3 es síncrono → se envuelve en
    hilos para no bloquear el event loop."""
    def __init__(self) -> None:
        s = get_settings()
        if not (s.r2_access_key_id and s.r2_secret_access_key and s.r2_bucket):
            raise StorageError("R2 no está configurado (faltan credenciales/bucket).")
        endpoint = s.r2_endpoint or f"https://{s.r2_account_id}.r2.cloudflarestorage.com"
        import boto3  # import perezoso: solo si se usa R2
        self._bucket = s.r2_bucket
        self._client = boto3.client(
            "s3", endpoint_url=endpoint,
            aws_access_key_id=s.r2_access_key_id,
            aws_secret_access_key=s.r2_secret_access_key,
            region_name="auto",
        )

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket, Key=key, Body=data, ContentType=content_type,
        )

    async def get(self, key: str) -> bytes:
        def _g() -> bytes:
            obj = self._client.get_object(Bucket=self._bucket, Key=key)
            return obj["Body"].read()
        return await asyncio.to_thread(_g)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)


@lru_cache
def get_storage() -> Storage:
    s = get_settings()
    backend = s.kyc_storage_backend.lower()
    if backend == "r2":
        return R2Storage()
    return FilesystemStorage(s.kyc_local_storage_dir)
