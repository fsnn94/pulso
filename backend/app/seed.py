"""Arranque de la base: admin principal + limpieza única de datos demo.

La plataforma NO siembra mercados de ejemplo: los mercados se cargan como reales
desde el panel de admin. `purge_demo_data` existe para borrar la demo que quedó
sembrada en producción por versiones anteriores."""
from __future__ import annotations
import logging

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import (
    Activity, AmlAlert, AmlMute, AppSetting, Commission, EmailVerification,
    EquitySnapshot, KycStatus, Market, MarketDispute, MarketProposal,
    Notification, Order, Position, ResolutionProposal, Trade, User,
)
from .security import hash_password

logger = logging.getLogger(__name__)

# Slugs de los mercados de ejemplo que siembra seed_if_empty (para la purga).
SAMPLE_MARKET_IDS = [
    "pena-aprob-q3", "dolar-blue-1500", "bcp-tasa-jul", "olimpia-apertura",
    "cerro-sudam-cuartos", "argentina-mundial-semis", "btc-150k-q3",
    "eth-flippening", "openai-gpt6", "anthropic-claude5", "bizarrap-grammy",
    "mercosur-ue-vigor",
]
DEMO_EMAIL_SUFFIX = "@demo.pulso.app"
PURGE_MARKER_KEY = "demo_data_purged"


async def purge_demo_data(db: AsyncSession) -> None:
    """Limpieza única de datos demo para la salida en vivo (gateada por
    PURGE_DEMO_DATA). Borra todos los datos de operatoria + mercados + usuarios
    @demo.pulso.app y resetea el saldo de las cuentas reales a los créditos
    iniciales. Conserva las cuentas (admin incluido) y los app_settings.

    Salvaguarda: si existe algún mercado que NO sea de los sembrados (uno real
    que hayas creado), ABORTA sin tocar nada. Idempotente vía marcador."""
    s = get_settings()
    if not s.purge_demo_data:
        return
    if await db.get(AppSetting, PURGE_MARKER_KEY) is not None:
        return  # ya se corrió una vez

    all_markets = (await db.execute(select(Market.id))).scalars().all()
    non_seed = [m for m in all_markets if m not in SAMPLE_MARKET_IDS]
    if non_seed:
        logger.warning(
            "purga demo ABORTADA: hay %d mercado(s) no sembrados (%s). No se tocó nada.",
            len(non_seed), non_seed[:5],
        )
        return

    try:
        # 1) borrar toda la data de operatoria (orden respetando las FKs)
        for model in (
            MarketDispute, ResolutionProposal, Commission, Trade, Order, Position,
            Activity, Notification, EquitySnapshot, EmailVerification, AmlAlert,
            AmlMute, MarketProposal,
        ):
            await db.execute(delete(model))
        # 2) borrar los mercados (ya sin filas dependientes)
        await db.execute(delete(Market))
        # 3) borrar usuarios demo (nuleando refs en app_settings antes)
        demo_ids = (await db.execute(
            select(User.id).where(User.email.ilike(f"%{DEMO_EMAIL_SUFFIX}"))
        )).scalars().all()
        if demo_ids:
            await db.execute(
                update(AppSetting).where(AppSetting.updated_by.in_(demo_ids)).values(updated_by=None)
            )
            await db.execute(delete(User).where(User.id.in_(demo_ids)))
        # 4) resetear el saldo de las cuentas que quedan a los créditos iniciales
        await db.execute(update(User).values(cash=s.starting_credits))
        # 5) marcar como hecho (una sola vez)
        db.add(AppSetting(key=PURGE_MARKER_KEY, value="1"))
        await db.commit()
        logger.info("purga demo OK: base en slate limpio, %d usuarios demo eliminados", len(demo_ids))
    except Exception:
        await db.rollback()
        logger.exception("purga demo falló; no se aplicó ningún cambio")


async def ensure_superadmin(db: AsyncSession) -> None:
    """Hace de SUPERADMIN_EMAIL la única fuente de verdad del admin principal:
    marca esa cuenta como superadmin y degrada a cualquier otro superadmin.
    Idempotente; no falla si la cuenta todavía no existe (solo avisa)."""
    email = get_settings().superadmin_email.strip()
    if not email:
        return
    u = (await db.execute(
        select(User).where(func.lower(User.email) == email.lower())
    )).scalar_one_or_none()
    if u is None:
        logger.warning("SUPERADMIN_EMAIL=%s no corresponde a ninguna cuenta (todavía)", email)
        return

    changed = False
    if not u.is_admin:
        u.is_admin = True; changed = True
    if not u.is_superadmin:
        u.is_superadmin = True; changed = True
    if u.admin_perms is not None:
        u.admin_perms = None; changed = True  # superadmin: acceso total, sin lista

    # Unicidad: nadie más puede ser superadmin.
    demoted = await db.execute(
        update(User)
        .where(User.is_superadmin.is_(True), User.id != u.id)
        .values(is_superadmin=False)
    )
    if demoted.rowcount:
        changed = True
        logger.info("Se degradó a %d superadmin(s) distinto(s) de %s", demoted.rowcount, email)

    if changed:
        await db.commit()
        logger.info("Cuenta %s marcada como admin principal (superadmin único)", email)


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
            kyc_status=KycStatus.APPROVED,
        )
        db.add(admin)
        await db.flush()

    # La plataforma arranca SIN datos demo: los mercados se cargan como REALES
    # desde el panel de admin. La limpieza de la demo ya sembrada en prod la hace
    # purge_demo_data (gateada por PURGE_DEMO_DATA); ver arriba.
    await db.commit()
