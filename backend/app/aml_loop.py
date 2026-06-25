"""Background scan task that runs every `aml_scan_interval_seconds`."""
from __future__ import annotations
import asyncio
import logging

from .aml import run_all_rules
from .config import get_settings
from .db import session_scope
from .models import AmlAlertStatus
from .ws import broadcast_market_event

logger = logging.getLogger(__name__)


async def aml_scan_loop() -> None:
    settings = get_settings()
    interval = settings.aml_scan_interval_seconds
    logger.info("AML scan loop starting (every %ds)", interval)
    while True:
        try:
            async with session_scope() as db:
                alerts = await run_all_rules(db)
            new_or_updated_open = [a for a in alerts if a.status == AmlAlertStatus.OPEN]
            if new_or_updated_open:
                await broadcast_market_event(None, {
                    "type": "aml_scan_complete",
                    "open_alert_count": len(new_or_updated_open),
                    "by_rule": _by_rule(new_or_updated_open),
                })
        except Exception:  # pragma: no cover
            logger.exception("AML scan tick failed")
        await asyncio.sleep(interval)


def _by_rule(alerts) -> dict:
    out: dict[str, int] = {}
    for a in alerts:
        out[a.rule_code] = out.get(a.rule_code, 0) + 1
    return out
