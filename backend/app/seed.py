"""Idempotent seed: admin user + sample markets."""
from __future__ import annotations
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import Market, MarketStatus, User
from .security import hash_password


async def seed_if_empty(db: AsyncSession) -> None:
    settings = get_settings()

    # Admin user
    res = await db.execute(select(User).where(User.email == settings.admin_email))
    admin = res.scalar_one_or_none()
    if not admin:
        admin = User(
            email=settings.admin_email,
            handle="admin",
            password_hash=hash_password(settings.admin_password),
            is_admin=True,
            cash=100_000.0,
            accepted_research_disclaimer=True,
        )
        db.add(admin)
        await db.flush()

    # Markets: only seed if there are none
    has_market = (await db.execute(select(Market).limit(1))).scalar_one_or_none()
    if has_market:
        await db.commit()
        return

    samples = [
        ("fed-jun-cut",   "Economics", "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?",
         "Fed cuts rates in June",
         "Resolves YES if the Federal Open Market Committee announces a reduction in the target federal funds rate at the meeting concluding June 17, 2026.",
         datetime(2026, 6, 17, 18, 0, tzinfo=timezone.utc), 0.62),
        ("gpt-next-2026", "Tech & AI", 'Will OpenAI release a model branded "GPT-6" before December 31, 2026?',
         "GPT-6 released in 2026",
         'Resolves YES if OpenAI publicly releases a model under the explicit "GPT-6" name on or before Dec 31, 2026.',
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.34),
        ("btc-150k-q3",   "Crypto", "Will BTC close above $150,000 on any day in Q3 2026?",
         "BTC > $150K in Q3",
         "Resolves YES if the Coinbase BTC/USD daily close is at or above $150,000 on any UTC day between July 1 and September 30, 2026.",
         datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc), 0.41),
        ("fda-alz",       "Science", "Will the FDA approve a new Alzheimer's therapy in 2026?",
         "FDA approves new Alzheimer's drug",
         "Resolves YES if the FDA grants full or accelerated approval to any new molecular entity indicated for Alzheimer's disease in 2026.",
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.27),
        ("lakers-finals", "Sports", "Will the Los Angeles Lakers reach the 2026 NBA Finals?",
         "Lakers in 2026 NBA Finals",
         "Resolves YES if the Lakers win the 2026 NBA Western Conference Finals.",
         datetime(2026, 6, 1, 23, 59, tzinfo=timezone.utc), 0.18),
        ("atlantic-hurr", "Climate", "Will the 2026 Atlantic hurricane season exceed 14 named storms?",
         "Above-average Atlantic season",
         "Resolves YES if NOAA records more than 14 named storms in the Atlantic basin during the 2026 season.",
         datetime(2026, 11, 30, 23, 59, tzinfo=timezone.utc), 0.71),
        ("starship-orbit","Space", "Will SpaceX achieve a fully reusable Starship orbital flight in 2026?",
         "Starship full reuse 2026",
         "Resolves YES if SpaceX completes an orbital Starship mission in 2026 with both stages recovered intact and verified flight-reusable.",
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.38),
        ("avatar3-2b",    "Culture", "Will Avatar: Fire and Ash gross over $2B worldwide?",
         "Avatar 3 > $2B box office",
         "Resolves YES if worldwide theatrical gross exceeds $2,000,000,000 USD per Box Office Mojo within 180 days of wide release.",
         datetime(2026, 7, 1, 23, 59, tzinfo=timezone.utc), 0.46),
        ("ai-nobel",      "Tech & AI", "Will the 2026 Nobel Prize in any science category cite AI-driven discovery?",
         "AI-cited Nobel in 2026",
         "Resolves YES if the official 2026 Nobel announcements (Physics, Chemistry, Medicine) explicitly credit AI/ML as central methodology.",
         datetime(2026, 10, 15, 23, 59, tzinfo=timezone.utc), 0.33),
        ("eth-flippening","Crypto", "Will ETH market cap exceed BTC market cap on any day in 2026?",
         "ETH flippening in 2026",
         "Resolves YES if ETH fully diluted market cap exceeds BTC's for at least one full UTC day in 2026 per CoinGecko.",
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.07),
        ("world-cup-host","Sports", "Will the 2030 FIFA World Cup host be officially confirmed by Q4 2026?",
         "2030 World Cup host confirmed",
         "Resolves YES if FIFA publicly confirms the host nation(s) of the 2030 World Cup on or before December 31, 2026.",
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.84),
        ("fusion-grid",   "Science", "Will any fusion reactor deliver net electricity to a grid in 2026?",
         "Fusion electricity to grid",
         "Resolves YES if any operational fusion reactor anywhere in the world delivers net positive electrical power to a public utility grid for any sustained period in 2026.",
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.04),
    ]

    # Per-market resolver hints. Auto-resolvable markets get a JSON-API config;
    # everything else falls through to the manual admin queue.
    resolver_configs: dict[str, dict] = {
        "btc-150k-q3": {
            "type": "json_api",
            "url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
            "jsonpath": "$.bitcoin.usd",
            "comparator": ">=",
            "threshold": 150_000,
            "source_name": "CoinGecko BTC/USD",
            "auto_finalize_hours": 24,
        },
        "eth-flippening": {
            "type": "json_api",
            "url": "https://api.coingecko.com/api/v3/global",
            "jsonpath": "$.data.market_cap_percentage.eth",
            "comparator": ">",
            "threshold": 50,
            "source_name": "CoinGecko global market dominance",
            "auto_finalize_hours": 24,
        },
        "atlantic-hurr": {
            "type": "json_api",
            "url": "https://www.nhc.noaa.gov/cyclones/",
            "jsonpath": "$.season_total",
            "comparator": ">",
            "threshold": 14,
            "source_name": "NOAA NHC Atlantic season tally",
            "auto_finalize_hours": 48,
        },
        # LLM-assisted markets: model reads rules + primary sources and
        # proposes YES / NO / VOID — but the proposal NEVER auto-finalizes,
        # admin must confirm.
        "fda-alz": {
            "type": "llm_search",
            "primary_sources": ["fda.gov/drugs/news-events",
                                "fda.gov/news-events/press-announcements"],
            "prompt_extras": "Only count new molecular entities (NMEs), not label expansions.",
        },
        "ai-nobel": {
            "type": "llm_search",
            "primary_sources": ["nobelprize.org"],
            "prompt_extras": "VOID if the citation is ambiguous about AI/ML being central methodology.",
        },
    }

    for sid, cat, title, short, desc, closes, p in samples:
        db.add(Market(
            id=sid, category=cat, title=title, short_title=short, description=desc,
            closes_at=closes, current_yes_price=p, status=MarketStatus.OPEN,
            volume_24h=p * 1_500_000 + 50_000, liquidity=p * 500_000 + 30_000,
            created_by=admin.id,
            resolution_config=resolver_configs.get(sid) or {
                "type": "manual", "instructions": desc,
            },
        ))

    await db.commit()
