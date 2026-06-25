"""
Email helper.

In production, this would dispatch via SES / SendGrid / Mailgun / Postmark.
For now, it logs the message and returns the verification link so the dev
server can also surface it in the API response. Replace `send_verification_email`
with a real provider call before going to production.
"""
from __future__ import annotations
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from .models import EmailVerification, User

logger = logging.getLogger(__name__)


VERIFICATION_TTL_HOURS = 24


async def issue_verification_token(db: AsyncSession, user: User) -> str:
    """Create a single-use verification token for `user` and return it."""
    token = secrets.token_urlsafe(32)
    ev = EmailVerification(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_TTL_HOURS),
    )
    db.add(ev)
    return token


def verification_link(frontend_base: str, token: str) -> str:
    return f"{frontend_base.rstrip('/')}/verify-email/{token}"


async def send_verification_email(user: User, link: str) -> None:
    """Stub: just log. Replace with provider integration."""
    logger.info(
        "Email verification (stub)\n"
        "  to:   %s\n  link: %s\n  user: %s\n"
        "  Replace app/email.py:send_verification_email with a real SES/SendGrid call.",
        user.email, link, user.handle,
    )
