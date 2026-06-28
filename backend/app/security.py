"""Password hashing + JWT helpers."""
from datetime import datetime, timedelta, timezone
from typing import Any
import hashlib
import hmac
import uuid

from jose import jwt, JWTError
from passlib.context import CryptContext

from .config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def password_token_version(password_hash: str) -> str:
    """Short, opaque tag derived from the current password hash (HMAC'd with the
    server secret). Embedded in the JWT as `pv` and re-checked on every request,
    so changing the password invalidates all previously issued tokens —
    without needing a server-side revocation list (cf. Django's
    get_session_auth_hash)."""
    s = get_settings()
    return hmac.new(s.jwt_secret.encode(), password_hash.encode(), hashlib.sha256).hexdigest()[:16]


def create_access_token(user_id: uuid.UUID, *, is_admin: bool, password_hash: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "adm": bool(is_admin),
        "pv": password_token_version(password_hash),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=s.access_token_ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any] | None:
    s = get_settings()
    try:
        return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except JWTError:
        return None
