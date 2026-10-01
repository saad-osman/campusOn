"""Feature 10: Telegram bot (only runs when TELEGRAM_BOT_TOKEN is set).

Commands: /start <code> links the chat to an account (code from Settings),
/matches, /deadlines, /digest. Talks to the Bot API directly over httpx with
long polling in a background thread, so there's no webhook to expose.
"""
import logging
import secrets
import threading
from datetime import date, datetime, timedelta

import httpx

from app.config import get_settings

logger = logging.getLogger("scholarradar.telegram")
settings = get_settings()

CODE_TTL = timedelta(minutes=15)
_thread: threading.Thread | None = None
_stop = threading.Event()
_bot_username: str | None = None


def bot_enabled() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


def _api(method: str, **params) -> dict | None:
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"
    timeout = params.get("timeout", 0) + 10
    try:
        resp = httpx.post(url, json=params, timeout=timeout)
        data = resp.json()
        return data.get("result") if data.get("ok") else None
    except (httpx.HTTPError, ValueError) as e:
        logger.info("Telegram %s failed: %s", method, e)
        return None


def bot_username() -> str | None:
    global _bot_username
    if bot_enabled() and _bot_username is None:
        me = _api("getMe")
        _bot_username = me.get("username") if me else None
    return _bot_username


def send_message(chat_id: str, text: str) -> bool:
    if not bot_enabled():
        return False
    return _api("sendMessage", chat_id=chat_id, text=text[:4000], disable_web_page_preview=True) is not None


def new_link_code() -> tuple[str, datetime]:
    return secrets.token_hex(3).upper(), datetime.utcnow() + CODE_TTL


# ---------- command handling ----------

HELP = (
    "ScholarRadar bot\n"
    "/matches: your top matches\n"
    "/deadlines: saved deadlines in the next 14 days\n"
    "/digest: this week's digest"
)


def handle_message(db, chat_id: str, text: str) -> str:
    """Pure-ish handler (takes a DB session), returns the reply text. Unit-testable."""
    from app.models.opportunity import Opportunity
    from app.models.user import User
    from app.services.digest import build_digest, followed_opportunity_ids, render_text
    from app.services.opportunity_view import build_payloads

    parts = (text or "").strip().split()
    command = parts[0].split("@")[0].lower() if parts else ""
    user = db.query(User).filter(User.telegram_chat_id == chat_id).first()

    if command == "/start":
        if len(parts) < 2:
            return ("Hi! To connect, open ScholarRadar > Settings > Telegram, generate a code, "
                    "then send /start <code> here.") if not user else f"You're connected as {user.name}.\n\n{HELP}"
        code = parts[1].strip().upper()
        target = db.query(User).filter(User.telegram_link_code == code).first()
        if not target or not target.telegram_link_expires_at or target.telegram_link_expires_at < datetime.utcnow():
            return "That code is invalid or has expired. Generate a new one in Settings."
        db.query(User).filter(User.telegram_chat_id == chat_id, User.id != target.id).update({"telegram_chat_id": None})
        target.telegram_chat_id = chat_id
        target.telegram_link_code = None
        target.telegram_link_expires_at = None
        db.commit()
        return f"Connected! You'll get your weekly digest here, {target.name.split(' ')[0]}.\n\n{HELP}"

    if not user:
        return "This chat isn't connected yet. Generate a code in ScholarRadar > Settings > Telegram and send /start <code>."

    base = settings.FRONTEND_ORIGIN
    if command == "/matches":
        opps = db.query(Opportunity).filter(Opportunity.canonical_id.is_(None), Opportunity.status == "active").all()
        payloads = [p for p in build_payloads(db, opps, user) if p.get("match")]
        payloads = [p for p in payloads if p["eligibility_check"]["verdict"] != "not_eligible"]
        payloads.sort(key=lambda p: p["match"]["score"], reverse=True)
        if not payloads:
            return "No matches yet. Complete your profile on ScholarRadar first."
        lines = ["Your top matches:"]
        for p in payloads[:5]:
            lines.append(f"• {p['title']} ({p['match']['score']}): {p['match']['reasons'][0] if p['match']['reasons'] else ''}\n  {base}/opportunities/{p['id']}")
        return "\n".join(lines)
    if command == "/deadlines":
        ids = followed_opportunity_ids(db, user)
        today = date.today()
        opps = db.query(Opportunity).filter(Opportunity.id.in_(ids)).all() if ids else []
        soon = sorted([o for o in opps if o.deadline and today <= o.deadline <= today + timedelta(days=14)], key=lambda o: o.deadline)
        if not soon:
            return "No saved deadlines in the next 14 days."
        return "Upcoming deadlines:\n" + "\n".join(f"• {o.title}: {o.deadline.strftime('%d %b')} ({(o.deadline - today).days} days)" for o in soon)
    if command == "/digest":
        return render_text(user, build_digest(db, user, since=datetime.utcnow() - timedelta(days=7)))
    return HELP


def _poll_loop() -> None:
    from app.db import SessionLocal

    offset = None
    while not _stop.is_set():
        updates = _api("getUpdates", offset=offset, timeout=25) or []
        for update in updates:
            offset = update["update_id"] + 1
            msg = update.get("message") or {}
            chat = msg.get("chat") or {}
            if not chat.get("id") or not msg.get("text"):
                continue
            db = SessionLocal()
            try:
                reply = handle_message(db, str(chat["id"]), msg["text"])
            except Exception:
                logger.exception("Telegram handler failed")
                reply = "Something went wrong. Try again in a minute."
            finally:
                db.close()
            send_message(str(chat["id"]), reply)
        if not updates:
            _stop.wait(1)


def start_bot() -> None:
    global _thread
    if not bot_enabled() or (_thread and _thread.is_alive()):
        return
    _stop.clear()
    _thread = threading.Thread(target=_poll_loop, name="telegram-bot", daemon=True)
    _thread.start()
    logger.info("Telegram bot polling started")


def stop_bot() -> None:
    _stop.set()
