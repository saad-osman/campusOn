import threading
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import get_settings

settings = get_settings()

# Argon2id at OWASP's recommended minimum (19 MiB, 2 passes, 1 lane). The library
# default allocates 64 MiB per hash, and logins run in parallel threads: 4 at once
# peaked at 491 MB and 10 at 879 MB, past the 512 MB production host.
_hasher = PasswordHasher(time_cost=2, memory_cost=19 * 1024, parallelism=1)
# At most two hashes in flight; a burst of logins queues for a few ms instead.
_hash_slots = threading.BoundedSemaphore(2)


def hash_password(password: str) -> str:
    with _hash_slots:
        return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        with _hash_slots:
            return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def needs_rehash(password_hash: str) -> bool:
    """True for hashes made with older (heavier) parameters; rehash them on login."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
