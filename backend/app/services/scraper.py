"""Scraping per Section 7: only public pages, robots.txt respected, clear
User-Agent with a contact email, 1 req/2s/domain, 15s timeout with backoff,
raw text + hash stored, unchanged pages skipped, every run logged.
"""
import hashlib
import threading
import time
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

from app.config import get_settings

settings = get_settings()

_domain_lock = threading.Lock()
_domain_last_fetch: dict[str, float] = {}


class ScrapeBlocked(Exception):
    """robots.txt disallows fetching this URL."""


class ScrapeFailed(Exception):
    pass


def _respect_domain_rate_limit(domain: str) -> None:
    with _domain_lock:
        last = _domain_last_fetch.get(domain, 0.0)
        wait = settings.SCRAPER_MIN_DELAY_SECONDS - (time.monotonic() - last)
        if wait > 0:
            time.sleep(wait)
        _domain_last_fetch[domain] = time.monotonic()


def _user_agent() -> str:
    return f"ScholarRadarBot/1.0 (+contact: {settings.SCRAPER_CONTACT_EMAIL})"


def check_robots_allowed(url: str) -> bool:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = RobotFileParser()
    try:
        # Fetched with our own client (not RobotFileParser.read) so the 15s timeout
        # and User-Agent apply -- urllib's default has no timeout and could hang a job.
        with httpx.Client(timeout=settings.SCRAPER_TIMEOUT_SECONDS, follow_redirects=True) as client:
            resp = client.get(robots_url, headers={"User-Agent": _user_agent()})
    except Exception:
        # If robots.txt is unreachable, err on the side of allowing public pages
        # (matches common crawler behavior) rather than blocking the whole source.
        return True
    if resp.status_code in (401, 403):
        return False  # same rule as urllib.robotparser: access-restricted robots => disallow all
    if resp.status_code >= 400:
        return True  # no robots.txt => no restrictions
    rp.parse(resp.text.splitlines())
    return rp.can_fetch(_user_agent(), url)


def fetch_page(url: str, max_retries: int = 2) -> tuple[str, int]:
    """Returns (html, status_code). Raises ScrapeBlocked or ScrapeFailed."""
    if not check_robots_allowed(url):
        raise ScrapeBlocked(f"robots.txt disallows {url}")

    domain = urlparse(url).netloc
    _respect_domain_rate_limit(domain)

    headers = {"User-Agent": _user_agent()}
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            with httpx.Client(timeout=settings.SCRAPER_TIMEOUT_SECONDS, follow_redirects=True) as client:
                resp = client.get(url, headers=headers)
            return resp.text, resp.status_code
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                time.sleep(2 ** (attempt + 1))
    raise ScrapeFailed(f"Failed to fetch {url}: {last_error}")


def fetch_rendered(url: str) -> tuple[str, int]:
    """Playwright fallback for JS-rendered pages -- not wired up in this build
    (see README "Infra notes": avoids an uninvited ~300MB browser download).
    Wire up on request: `playwright install chromium` + a page.goto/content() call
    here, called from run_scrape_for_source when fetch_page's extracted text looks
    too thin to be real content.
    """
    raise NotImplementedError("Playwright rendering is not enabled in this build")


def extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
