"""Outgoing email over SMTP when SMTP_HOST is configured; a logged no-op otherwise."""
import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

logger = logging.getLogger("scholarradar.email")
settings = get_settings()


def email_enabled() -> bool:
    return bool(settings.SMTP_HOST)


def send_email(to: str, subject: str, body: str) -> bool:
    """Plain-text email. Returns True if it was handed to the SMTP server."""
    if not email_enabled():
        logger.info("SMTP not configured; skipping email to %s: %s", to, subject)
        return False
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            if smtp.has_extn("starttls"):
                smtp.starttls()
                smtp.ehlo()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as e:
        logger.warning("Email to %s failed: %s", to, e)
        return False
