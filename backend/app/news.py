"""Noticias de última hora (item #10).

Integra NewsAPI.org (free tier) del lado del servidor — esconde la API key y
evita problemas de CORS. Mapea las categorías reales de los mercados de Pulso
a queries de noticias y cachea en memoria con TTL para no quemar el cupo diario
(~100 req/día en el plan free).

Si no hay `news_api_key` configurada, el endpoint responde enabled:false y el
frontend muestra un estado vacío (no rompe).
"""
from __future__ import annotations
import logging
import time
from dataclasses import dataclass

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

NEWSAPI_EVERYTHING = "https://newsapi.org/v2/everything"

# Categorías reales de los mercados (ver seed.py): Economics, Sports, Crypto,
# Tech & AI, Culture. "all" es un mix general para la pestaña por defecto.
CATEGORIES: list[str] = ["all", "Economics", "Sports", "Crypto", "Tech & AI", "Culture"]

_QUERIES: dict[str, str] = {
    "all":       "mercados OR economía OR bitcoin OR tecnología OR deportes",
    "Economics": "economía OR mercados OR finanzas OR inflación OR dólar OR banco central",
    "Sports":    "deportes OR fútbol OR mundial OR selección OR liga",
    "Crypto":    "cripto OR bitcoin OR ethereum OR blockchain",
    "Tech & AI": "tecnología OR \"inteligencia artificial\" OR OpenAI OR startup",
    "Culture":   "cultura OR música OR cine OR espectáculos OR premios",
}

# Etiquetas lindas para la UI (las manda el backend para no duplicar el mapa).
CATEGORY_LABELS: dict[str, str] = {
    "all":       "Todas",
    "Economics": "Economía",
    "Sports":    "Deportes",
    "Crypto":    "Cripto",
    "Tech & AI": "Tecnología & IA",
    "Culture":   "Cultura",
}


@dataclass
class Headline:
    title: str
    source: str
    url: str
    image: str | None
    published_at: str | None
    description: str | None
    category: str


# Cache en memoria: category -> (expira_en_monotonic, headlines)
_cache: dict[str, tuple[float, list[Headline]]] = {}


def is_enabled() -> bool:
    return bool(get_settings().news_api_key)


async def _fetch_newsapi(category: str) -> list[Headline]:
    s = get_settings()
    params = {
        "q": _QUERIES.get(category, _QUERIES["all"]),
        "language": s.news_lang,
        "sortBy": "publishedAt",
        "pageSize": s.news_page_size,
        "apiKey": s.news_api_key,
    }
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(NEWSAPI_EVERYTHING, params=params)
    data = resp.json()
    if data.get("status") != "ok":
        # NewsAPI devuelve {status:"error", code, message} en rate-limit / key inválida.
        logger.warning("NewsAPI error (%s): %s", data.get("code"), data.get("message"))
        raise RuntimeError(data.get("message", "news provider error"))

    out: list[Headline] = []
    for a in data.get("articles", []):
        title = (a.get("title") or "").strip()
        url = a.get("url") or ""
        if not title or not url or title == "[Removed]":
            continue
        out.append(Headline(
            title=title,
            source=((a.get("source") or {}).get("name") or "").strip(),
            url=url,
            image=a.get("urlToImage"),
            published_at=a.get("publishedAt"),
            description=(a.get("description") or None),
            category=category,
        ))
    return out


async def get_headlines(category: str) -> list[Headline]:
    """Headlines cacheados por categoría. Lanza RuntimeError si el provider falla
    y no hay cache previo que servir."""
    if category not in _QUERIES:
        category = "all"
    now = time.monotonic()
    cached = _cache.get(category)
    if cached and cached[0] > now:
        return cached[1]

    try:
        headlines = await _fetch_newsapi(category)
    except Exception:
        # Si falla pero tenemos cache (aunque vencido), servimos lo viejo.
        if cached:
            logger.info("news fetch failed; serving stale cache for %s", category)
            return cached[1]
        raise

    ttl = get_settings().news_cache_ttl_seconds
    _cache[category] = (now + ttl, headlines)
    return headlines
