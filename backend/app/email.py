"""
Email helper.

If `SENDGRID_API_KEY` is configured, sends real email via the SendGrid REST API.
Otherwise (development), logs the verification link so the dev server can
surface it in the API response.
"""
from __future__ import annotations
import logging
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import EmailVerification, User

logger = logging.getLogger(__name__)


VERIFICATION_TTL_HOURS = 24
SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"


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


def _build_verification_payload(user: User, link: str, sender: str, sender_name: str) -> dict:
    """Build the SendGrid payload for a verification email."""
    subject = "Verifica tu email — Pulso"
    text = (
        f"¡Hola {user.handle}!\n\n"
        f"Gracias por crear tu cuenta en Pulso. Para empezar a operar, "
        f"verificá tu email haciendo clic en el siguiente link:\n\n"
        f"{link}\n\n"
        f"Este link expira en 24 horas.\n\n"
        f"Si no creaste esta cuenta, podés ignorar este mensaje.\n\n"
        f"— El equipo de Pulso"
    )
    html = (
        f"<!DOCTYPE html><html><body style=\"font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; "
        f"max-width: 560px; margin: 32px auto; padding: 0 16px; color: #292F36; line-height: 1.6;\">"
        f"<div style=\"border-bottom: 2px solid #A41F13; padding-bottom: 12px; margin-bottom: 24px;\">"
        f"<h1 style=\"margin: 0; font-size: 24px; color: #A41F13;\">Pulso</h1>"
        f"</div>"
        f"<h2 style=\"font-size: 18px; margin: 0 0 12px;\">¡Hola {user.handle}!</h2>"
        f"<p>Gracias por crear tu cuenta en Pulso. Para empezar a operar, "
        f"verificá tu email haciendo clic en el siguiente botón:</p>"
        f"<p style=\"text-align: center; margin: 32px 0;\">"
        f"<a href=\"{link}\" style=\"display: inline-block; background: #A41F13; color: #FAF5F1; "
        f"text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;\">"
        f"Verificar email</a></p>"
        f"<p style=\"font-size: 13px; color: #8F7A6E;\">O copiá y pegá este link en tu navegador:<br>"
        f"<a href=\"{link}\" style=\"color: #A41F13; word-break: break-all;\">{link}</a></p>"
        f"<p style=\"font-size: 13px; color: #8F7A6E;\">Este link expira en 24 horas. "
        f"Si no creaste esta cuenta, podés ignorar este mensaje.</p>"
        f"<hr style=\"border: none; border-top: 1px solid #E0DBD8; margin: 32px 0;\">"
        f"<p style=\"font-size: 11px; color: #8F7A6E;\">"
        f"Pulso es una plataforma de investigación. No es un servicio financiero ni de apuestas. "
        f"Todas las operaciones usan créditos virtuales."
        f"</p>"
        f"</body></html>"
    )
    return {
        "personalizations": [{"to": [{"email": user.email}]}],
        "from": {"email": sender, "name": sender_name},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": text},
            {"type": "text/html", "value": html},
        ],
    }


async def send_verification_email(user: User, link: str) -> None:
    """Send the verification email — via SendGrid if configured, else log."""
    s = get_settings()
    if not s.sendgrid_api_key:
        logger.info(
            "Email verification (stub — SENDGRID_API_KEY not set)\n"
            "  to:   %s\n  link: %s\n  user: %s",
            user.email, link, user.handle,
        )
        return

    payload = _build_verification_payload(
        user=user, link=link,
        sender=s.email_from, sender_name=s.email_from_name,
    )
    headers = {
        "Authorization": f"Bearer {s.sendgrid_api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(SENDGRID_URL, json=payload, headers=headers)
        if res.status_code >= 400:
            logger.error(
                "SendGrid error %s sending to %s: %s",
                res.status_code, user.email, res.text[:500],
            )
        else:
            logger.info("Verification email sent to %s (SendGrid %s)", user.email, res.status_code)
    except Exception as e:
        logger.exception("Failed to send verification email to %s: %s", user.email, e)
