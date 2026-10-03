"""Process memory readings for the production logs (the free host has 512 MB)."""
import os
import sys

try:
    import resource
except ImportError:  # Windows has no `resource`; local dev must still start.
    resource = None


def rss_mb() -> float:
    """Current resident memory in MB (Linux /proc; falls back to the peak elsewhere)."""
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024
    except OSError:
        pass
    return peak_rss_mb()


def peak_rss_mb() -> float:
    if resource is None:
        return 0.0
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Linux reports KB, macOS bytes.
    return peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024


def log_memory(event: str) -> None:
    # print, not logging: uvicorn only configures its own loggers, and these lines must
    # reach the host's log stream.
    print(
        f"[memory] {event}: rss={rss_mb():.0f}MB peak={peak_rss_mb():.0f}MB cpus={os.cpu_count()}",
        flush=True,
    )
