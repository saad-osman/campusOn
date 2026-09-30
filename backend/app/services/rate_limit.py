import threading
import time
from collections import defaultdict

_lock = threading.Lock()
_hits: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(key: str, max_calls: int, window_seconds: float) -> bool:
    """Returns True if the call is allowed (and records it), False if rate-limited."""
    now = time.monotonic()
    with _lock:
        hits = _hits[key]
        cutoff = now - window_seconds
        while hits and hits[0] < cutoff:
            hits.pop(0)
        if len(hits) >= max_calls:
            return False
        hits.append(now)
        return True


def reset_rate_limits() -> None:
    """Test helper."""
    with _lock:
        _hits.clear()
