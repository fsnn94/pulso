"""Idempotent seed: admin user + sample markets."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import Activity, Market, MarketStatus, Position, Side, Trade, User
from .security import hash_password


async def seed_if_empty(db: AsyncSession) -> None:
    settings = get_settings()

    # Admin user: only seed if explicitly opted-in via CREATE_DEFAULT_ADMIN env var.
    # On existing deployments where you have your own admin, this stays off so the
    # default credentials cant be re-created accidentally.
    res = await db.execute(select(User).where(User.email == settings.admin_email))
    admin = res.scalar_one_or_none()
    if not admin and settings.create_default_admin:
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

    # If no default admin was created (or already exists), fall back to any admin
    # in the DB so seeded markets still have a creator.
    if not admin:
        res2 = await db.execute(select(User).where(User.is_admin == True).limit(1))
        admin = res2.scalar_one_or_none()
    if not admin:
        # No admin to seed under. Skip the whole seed (research preview safety).
        await db.commit()
        return

    # Per-market idempotent seed: each sample is inserted only if its id is missing.
    samples = [
        ("pena-aprob-q3",        "Economics",
         "¿La aprobación del presidente Santiago Peña superará el 45% en septiembre de 2026?",
         "Aprobación de Peña > 45% en septiembre",
         "Resuelve YES si al menos una encuesta nacional reconocida (DataAtenas, Last Decision, MyM, ICA u otra firma con metodología publicada) reporta una aprobación presidencial superior al 45% durante el mes de septiembre de 2026.",
         datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc), 0.32),

        ("dolar-blue-1500",      "Economics",
         "¿El dólar blue en Argentina cerrará por debajo de $1.500 ARS el 30 de septiembre de 2026?",
         "Dólar blue < $1.500 al 30/9",
         "Resuelve YES si la cotización del dólar blue publicada por Bluelytics (promedio de venta del día) al cierre del 30 de septiembre de 2026 está por debajo de 1.500 pesos argentinos por dólar estadounidense.",
         datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc), 0.28),

        ("bcp-tasa-jul",         "Economics",
         "¿El Banco Central del Paraguay reducirá la Tasa de Política Monetaria en su reunión de julio de 2026?",
         "BCP baja la tasa en julio",
         "Resuelve YES si el Directorio del BCP anuncia una reducción de la Tasa de Política Monetaria en el comunicado oficial posterior a la reunión programada para julio de 2026.",
         datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc), 0.55),

        ("olimpia-apertura",     "Sports",
         "¿Club Olimpia ganará el Torneo Apertura 2026 del fútbol paraguayo?",
         "Olimpia campeón del Apertura 2026",
         "Resuelve YES si Club Olimpia se consagra campeón del Torneo Apertura 2026 organizado por la APF al concluir todas las fechas del torneo.",
         datetime(2026, 7, 15, 23, 59, tzinfo=timezone.utc), 0.42),

        ("cerro-sudam-cuartos",  "Sports",
         "¿Cerro Porteño llegará a cuartos de final de la Copa Sudamericana 2026?",
         "Cerro a cuartos de Sudamericana",
         "Resuelve YES si Cerro Porteño clasifica a la fase de cuartos de final de la CONMEBOL Sudamericana 2026 según los resultados oficiales de la CONMEBOL.",
         datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc), 0.36),

        ("argentina-mundial-semis", "Sports",
         "¿Argentina llegará a las semifinales del Mundial FIFA 2026?",
         "Argentina a semis del Mundial",
         "Resuelve YES si la Selección Argentina avanza a la fase de semifinales del Mundial FIFA 2026 según el cuadro oficial publicado por FIFA.",
         datetime(2026, 7, 10, 23, 59, tzinfo=timezone.utc), 0.48),

        ("btc-150k-q3",          "Crypto",
         "¿Bitcoin cerrará por encima de USD 150.000 en algún día del Q3 2026?",
         "BTC > USD 150K en Q3",
         "Resuelve YES si el cierre diario de BTC/USD en Coinbase es igual o mayor a USD 150.000 en algún día UTC entre el 1 de julio y el 30 de septiembre de 2026.",
         datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc), 0.41),

        ("eth-flippening",       "Crypto",
         "¿La capitalización de mercado de ETH superará a la de BTC en algún día de 2026?",
         "Flippening de ETH en 2026",
         "Resuelve YES si la capitalización de mercado totalmente diluida de ETH supera a la de BTC durante al menos un día UTC completo en 2026 según CoinGecko.",
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.07),

        ("openai-gpt6",          "Tech & AI",
         '¿OpenAI lanzará un modelo bajo el nombre "GPT-6" antes del 31 de diciembre de 2026?',
         'OpenAI lanza "GPT-6" en 2026',
         'Resuelve YES si OpenAI publica un modelo de propósito general bajo el nombre explícito "GPT-6" en o antes del 31 de diciembre de 2026. No cuentan modelos con sufijos como "GPT-5.5" ni versiones de investigación cerradas.',
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.34),

        ("anthropic-claude5",    "Tech & AI",
         "¿Anthropic lanzará un modelo Claude 5 antes del 31 de diciembre de 2026?",
         "Anthropic lanza Claude 5 en 2026",
         "Resuelve YES si Anthropic anuncia y pone a disposición pública un modelo bajo el nombre explícito de Claude 5 (Opus, Sonnet, Haiku o equivalente) en o antes del 31 de diciembre de 2026.",
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.55),

        ("bizarrap-grammy",      "Culture",
         "¿Bizarrap ganará al menos un Grammy Latino en la entrega de noviembre de 2026?",
         "Bizarrap gana Grammy Latino 2026",
         "Resuelve YES si Bizarrap (solo o como colaborador) gana al menos un premio en cualquier categoría de la ceremonia oficial de los Latin Grammy Awards de noviembre de 2026 según el sitio oficial latingrammy.com.",
         datetime(2026, 11, 30, 23, 59, tzinfo=timezone.utc), 0.58),

        ("mercosur-ue-vigor",    "Economics",
         "¿El acuerdo Mercosur-Unión Europea entrará en vigor antes del 31 de diciembre de 2026?",
         "Mercosur-UE vigente en 2026",
         "Resuelve YES si el acuerdo de asociación entre el Mercosur y la Unión Europea entra en vigor (aplicación provisional o definitiva) en o antes del 31 de diciembre de 2026 según comunicado oficial de la Comisión Europea o del Mercosur.",
         datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc), 0.18),
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
            "source_name": "CoinGecko dominancia global",
            "auto_finalize_hours": 24,
        },
        "dolar-blue-1500": {
            "type": "json_api",
            "url": "https://api.bluelytics.com.ar/v2/latest",
            "jsonpath": "$.blue.value_sell",
            "comparator": "<",
            "threshold": 1500,
            "source_name": "Bluelytics dólar blue Argentina",
            "auto_finalize_hours": 24,
        },
        # LLM-assisted markets: model reads rules + primary sources and
        # proposes YES / NO / VOID — but the proposal NEVER auto-finalizes,
        # admin must confirm.
        "openai-gpt6": {
            "type": "llm_search",
            "primary_sources": ["openai.com/blog", "openai.com/news"],
            "prompt_extras": 'Solo cuenta si el modelo se lanza públicamente con el nombre exacto "GPT-6". No cuentan "GPT-5.5" ni betas privadas.',
        },
        "anthropic-claude5": {
            "type": "llm_search",
            "primary_sources": ["anthropic.com/news", "anthropic.com/claude"],
            "prompt_extras": "Solo cuenta un lanzamiento público bajo el nombre Claude 5 (cualquier tier: Opus, Sonnet, Haiku).",
        },
        "bizarrap-grammy": {
            "type": "llm_search",
            "primary_sources": ["latingrammy.com", "es.wikipedia.org/wiki/Anexo:Premios_Grammy_Latinos_de_2026"],
            "prompt_extras": "Cuenta cualquier categoría donde Bizarrap aparezca como ganador (individual o como colaborador acreditado).",
        },
        "mercosur-ue-vigor": {
            "type": "llm_search",
            "primary_sources": ["ec.europa.eu/commission", "mercosur.int"],
            "prompt_extras": "Cuenta tanto la aplicación provisional como la entrada en vigor definitiva del acuerdo.",
        },
    }

    for sid, cat, title, short, desc, closes, p in samples:
        existing = (await db.execute(select(Market).where(Market.id == sid))).scalar_one_or_none()
        if existing:
            continue
        db.add(Market(
            id=sid, category=cat, title=title, short_title=short, description=desc,
            closes_at=closes, current_yes_price=p, status=MarketStatus.OPEN,
            volume_24h=p * 1_500_000 + 50_000, liquidity=p * 500_000 + 30_000,
            created_by=admin.id,
            resolution_config=resolver_configs.get(sid) or {
                "type": "manual", "instructions": desc,
            },
        ))

    await db.flush()
    await _seed_demo_users(db)
    await db.commit()


async def _seed_demo_users(db: AsyncSession) -> None:
    """Idempotent demo seed: 4 fake users with positions, activity, and recent trades.

    Skipped if any @demo.pulso.app user already exists.
    """
    res = await db.execute(select(User).where(User.email.like("%@demo.pulso.app")))
    if res.first():
        return

    now = datetime.now(timezone.utc)

    demos = [
        # (email, handle, full_name, country, has_kyc)
        ("sofia@demo.pulso.app",   "sofia",   "Sofía Méndez",    "PY", True),
        ("mateo@demo.pulso.app",   "mateo",   "Mateo Giménez",   "PY", False),
        ("lucia@demo.pulso.app",   "lucia",   "Lucía Fernández", "AR", True),
        ("joaquin@demo.pulso.app", "joaquin", "Joaquín Riveros", "PY", True),
    ]

    users: dict[str, User] = {}
    for email, handle, full_name, country, has_kyc in demos:
        u = User(
            email=email,
            handle=handle,
            password_hash=hash_password("demo123"),
            is_admin=False,
            cash=10000.0,
            email_verified=True,
            email_verified_at=now - timedelta(days=20),
            full_name=full_name if has_kyc else None,
            country=country if has_kyc else None,
            kyc_completed_at=(now - timedelta(days=15)) if has_kyc else None,
            accepted_research_disclaimer=True,
        )
        db.add(u)
        users[handle] = u
    await db.flush()

    # (handle, market_id, side, shares, price, hours_ago)
    demo_trades = [
        # Sofía — bullish Olimpia, bear Argentina at WC, modest BTC long
        ("sofia",   "olimpia-apertura",        Side.YES,  60.0, 0.40, 18),
        ("sofia",   "argentina-mundial-semis", Side.NO,   35.0, 0.55, 12),
        ("sofia",   "btc-150k-q3",             Side.YES,  25.0, 0.39,  6),
        # Mateo — skeptical GPT-6, fan de Bizarrap
        ("mateo",   "openai-gpt6",             Side.NO,   80.0, 0.62, 20),
        ("mateo",   "bizarrap-grammy",         Side.YES, 120.0, 0.55, 16),
        ("mateo",   "cerro-sudam-cuartos",     Side.YES,  50.0, 0.38,  8),
        # Lucía — argentina/crypto, piensa que el blue sube (NO al < 1500)
        ("lucia",   "dolar-blue-1500",         Side.NO,  100.0, 0.70, 22),
        ("lucia",   "btc-150k-q3",             Side.YES,  40.0, 0.41, 14),
        ("lucia",   "eth-flippening",          Side.YES, 200.0, 0.07, 10),
        ("lucia",   "argentina-mundial-semis", Side.YES,  60.0, 0.48,  4),
        # Joaquín — diversificado, más conservador
        ("joaquin", "pena-aprob-q3",           Side.YES,  30.0, 0.30, 19),
        ("joaquin", "bcp-tasa-jul",            Side.YES,  60.0, 0.53, 15),
        ("joaquin", "anthropic-claude5",       Side.YES,  45.0, 0.56,  9),
        ("joaquin", "mercosur-ue-vigor",       Side.YES,  25.0, 0.18,  5),
        ("joaquin", "olimpia-apertura",        Side.YES,  80.0, 0.42,  2),
    ]

    for handle, mid, side, shares, price, hrs in demo_trades:
        u = users[handle]
        cost = shares * price
        ts = now - timedelta(hours=hrs)

        db.add(Position(
            user_id=u.id, market_id=mid, side=side,
            shares=shares, avg_cost=price, realized_pnl=0.0,
            updated_at=ts,
        ))
        db.add(Activity(
            user_id=u.id, market_id=mid, kind="FILL",
            side=side, quantity=shares, price=price, total=-cost,
            note=f"Compra a mercado: {shares:.0f} contratos @ {price*100:.0f}c",
            created_at=ts,
        ))
        db.add(Trade(
            market_id=mid, buyer_id=u.id, seller_id=None,
            side=side, price=price, quantity=shares,
            created_at=ts,
        ))
        u.cash -= cost

    await db.flush()
