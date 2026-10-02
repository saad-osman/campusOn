"""Exit 0 if the database has at least one user, 1 otherwise (missing tables count as empty).

Used by backend/start.sh so a fresh (empty) container gets seeded once.
"""
import sys

from sqlalchemy import text

from app.db import engine


def main() -> int:
    try:
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
    except Exception:  # noqa: BLE001 - no database or no users table yet
        return 1
    return 0 if count else 1


if __name__ == "__main__":
    sys.exit(main())
