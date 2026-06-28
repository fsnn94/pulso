"""Noticias de última hora (item #10).

Endpoint público: cualquiera puede ver los headlines. El fetch al provider y la
API key viven en el backend (ver app.news).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import news
from ..schemas import HeadlineOut, NewsCategoryOut, NewsOut

router = APIRouter(prefix="/news", tags=["news"])

_CATEGORIES = [
    NewsCategoryOut(key=k, label=news.CATEGORY_LABELS.get(k, k)) for k in news.CATEGORIES
]


@router.get("", response_model=NewsOut)
async def get_news(category: str = Query("all")):
    if category not in news.CATEGORIES:
        category = "all"

    if not news.is_enabled():
        return NewsOut(enabled=False, category=category, categories=_CATEGORIES, headlines=[])

    try:
        headlines = await news.get_headlines(category)
    except Exception:
        raise HTTPException(502, "No se pudieron obtener las noticias en este momento.")

    return NewsOut(
        enabled=True,
        category=category,
        categories=_CATEGORIES,
        headlines=[
            HeadlineOut(
                title=h.title, source=h.source, url=h.url, image=h.image,
                published_at=h.published_at, description=h.description, category=h.category,
            )
            for h in headlines
        ],
    )
