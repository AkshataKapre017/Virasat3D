"""Password authentication primitives.

Passwords are stretched with PBKDF2-HMAC-SHA256 and a per-user random salt; only the encoded hash
is stored. Sessions are opaque random tokens; the cookie carries the token, the database stores only
its digest.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 600_000
SALT_BYTES = 16


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"{PASSWORD_SCHEME}${PASSWORD_ITERATIONS}${_encode(salt)}${_encode(digest)}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        scheme, iterations, salt, expected = encoded.split("$", 3)
        if scheme != PASSWORD_SCHEME:
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), _decode(salt), int(iterations))
        return hmac.compare_digest(digest, _decode(expected))
    except (ValueError, TypeError):
        return False


# A fixed hash used to keep the failed-login path's timing similar for unknown emails.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(24))


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session_token() -> str:
    return secrets.token_urlsafe(32)
