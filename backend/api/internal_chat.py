import os
import re
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from openai import OpenAI
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from core.config import settings
from database import models, schemas
from database.connection import get_db

router = APIRouter(prefix="/internal-chat", tags=["Internal Chat"])
logger = logging.getLogger("uvicorn.error")

OWNER_USER_ID = "benela-owner"
OWNER_EMAIL = "owner@benela.ai"
OWNER_NAME = "Benela Owner"
OWNER_ROLE = "super_admin"

JUDITH_USER_ID = "judith-ai"
JUDITH_EMAIL = "judith@benela.ai"
JUDITH_NAME = "Judith"
JUDITH_ROLE = "assistant"
TELEGRAM_BOT_USERNAME = (os.getenv("TELEGRAM_BOT_USERNAME", "judith_aibot").strip().lstrip("@") or "judith_aibot")

UZ_TZ = ZoneInfo("Asia/Tashkent")
MAX_UPLOAD_BYTES = int(os.getenv("INTERNAL_CHAT_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
DEFAULT_REMINDER_MINUTES = 30
TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe").strip() or "gpt-4o-mini-transcribe"
UPLOAD_ROOT = Path(
    os.getenv(
        "INTERNAL_CHAT_UPLOAD_DIR",
        str(Path(__file__).resolve().parent.parent / "uploads" / "internal_chat"),
    )
)
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
_TELEGRAM_CONFLICT_LOG_COOLDOWN_SECONDS = int(os.getenv("TELEGRAM_CONFLICT_LOG_COOLDOWN_SECONDS", "300"))
_telegram_conflict_last_logged_monotonic = 0.0
_telegram_webhook_cleanup_attempted = False


def _is_super_admin(role: str | None) -> bool:
    normalized = (role or "").strip().lower()
    return normalized in {"admin", "owner", "super_admin"}


def _normalize_display_name(name: str | None, email: str | None, user_id: str) -> str:
    if name and name.strip():
        return name.strip()[:120]
    if email and email.strip():
        return email.strip().split("@", 1)[0][:120]
    return user_id[:120]


def _normalize_role(role: str | None, fallback: str = "client") -> str:
    normalized = (role or "").strip().lower()
    return normalized or fallback


def _to_uz_datetime_label(value: datetime | None) -> str:
    if not value:
        return ""
    utc_value = value.replace(tzinfo=timezone.utc)
    local_value = utc_value.astimezone(UZ_TZ)
    return local_value.strftime("%Y-%m-%d %H:%M UZT")


def _parse_chat_id_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[,\n;|]+", raw)
    values = []
    seen: set[str] = set()
    for part in parts:
        value = part.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        values.append(value)
    return values


def _workspace_telegram_chat_ids(workspace_id: str | None) -> list[str]:
    if not workspace_id:
        return []
    mapping_raw = (settings.TELEGRAM_WORKSPACE_CHAT_IDS or "").strip()
    if not mapping_raw:
        return []
    for entry in re.split(r"[,\n]+", mapping_raw):
        item = entry.strip()
        if not item:
            continue
        if ":" in item:
            ws_key, ids_raw = item.split(":", 1)
        elif "=" in item:
            ws_key, ids_raw = item.split("=", 1)
        else:
            continue
        if ws_key.strip() == workspace_id:
            return _parse_chat_id_list(ids_raw)
    return []


def _linked_telegram_chat_ids(db: Session, workspace_id: str | None) -> list[str]:
    if not workspace_id:
        return []
    rows = (
        db.query(models.InternalChatTelegramLink.telegram_chat_id)
        .filter(
            models.InternalChatTelegramLink.workspace_id == workspace_id,
            models.InternalChatTelegramLink.is_active.is_(True),
        )
        .distinct()
        .all()
    )
    values: list[str] = []
    seen: set[str] = set()
    for row in rows:
        value = str(row.telegram_chat_id or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        values.append(value)
    return values


def _resolve_telegram_chat_ids(db: Session, workspace_id: str | None) -> list[str]:
    linked = _linked_telegram_chat_ids(db, workspace_id)
    if linked:
        return linked

    workspace_ids = _workspace_telegram_chat_ids(workspace_id)
    if workspace_ids:
        return workspace_ids
    combined = ",".join(
        [
            settings.TELEGRAM_CHAT_IDS or "",
            settings.TELEGRAM_CHAT_ID or "",
        ]
    )
    return _parse_chat_id_list(combined)


def _telegram_api_post(token: str, method: str, payload: dict, timeout: int = 10) -> dict:
    if not token:
        return {"ok": False, "description": "Missing telegram bot token"}
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url=url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="ignore")
        parsed = json.loads(body or "{}")
        if isinstance(parsed, dict):
            return parsed
    except (urllib_error.HTTPError, urllib_error.URLError, TimeoutError, ValueError) as exc:
        return {"ok": False, "description": str(exc)}
    return {"ok": False, "description": "Invalid Telegram response"}


def _telegram_api_get(token: str, method: str, timeout: int = 10) -> dict:
    if not token:
        return {"ok": False, "description": "Missing telegram bot token"}
    url = f"https://api.telegram.org/bot{token}/{method}"
    req = urllib_request.Request(url=url, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="ignore")
        parsed = json.loads(body or "{}")
        if isinstance(parsed, dict):
            return parsed
    except (urllib_error.HTTPError, urllib_error.URLError, TimeoutError, ValueError) as exc:
        return {"ok": False, "description": str(exc)}
    return {"ok": False, "description": "Invalid Telegram response"}


def _log_telegram_poll_conflict(message: str):
    global _telegram_conflict_last_logged_monotonic
    now = time.monotonic()
    if (now - _telegram_conflict_last_logged_monotonic) < _TELEGRAM_CONFLICT_LOG_COOLDOWN_SECONDS:
        return
    _telegram_conflict_last_logged_monotonic = now
    logger.warning(message)


def _handle_telegram_polling_conflict(token: str):
    """
    Handle Telegram 409 conflicts for getUpdates.
    Common causes:
    1) Existing webhook on the bot token.
    2) Another process already polling getUpdates with the same token.
    """
    global _telegram_webhook_cleanup_attempted

    webhook_url = ""
    info = _telegram_api_get(token=token, method="getWebhookInfo")
    if info.get("ok"):
        webhook_url = str((info.get("result") or {}).get("url") or "").strip()

    if webhook_url and not _telegram_webhook_cleanup_attempted:
        _telegram_webhook_cleanup_attempted = True
        delete_response = _telegram_api_post(
            token=token,
            method="deleteWebhook",
            payload={"drop_pending_updates": False},
        )
        if delete_response.get("ok"):
            _log_telegram_poll_conflict(
                f"Telegram polling conflict resolved by deleting webhook ({webhook_url}). "
                "Polling will continue on next cycle."
            )
            return
        _log_telegram_poll_conflict(
            "Telegram polling conflict detected and webhook cleanup failed. "
            f"deleteWebhook response: {delete_response.get('description') or 'unknown error'}"
        )
        return

    _log_telegram_poll_conflict(
        "Telegram updates polling conflict (HTTP 409). "
        "Another process is likely polling the same bot token. "
        "Run only one poller or disable updates polling on secondary instances "
        "with INTERNAL_CHAT_TELEGRAM_UPDATES_ENABLED=false."
    )


def _telegram_send_message(token: str, chat_id: str, text: str) -> bool:
    payload = {
        "chat_id": chat_id,
        "text": text[:3900],
        "disable_web_page_preview": True,
    }
    response = _telegram_api_post(token=token, method="sendMessage", payload=payload)
    if response.get("ok"):
        return True
    logger.warning(
        "Telegram sendMessage failed for chat_id=%s: %s",
        chat_id,
        response.get("description") or "unknown",
    )
    return False


def _discover_telegram_chat_ids(token: str) -> list[str]:
    if not token:
        return []
    url = f"https://api.telegram.org/bot{token}/getUpdates?limit=100&timeout=1"
    req = urllib_request.Request(url=url, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8", errors="ignore")
            parsed = json.loads(body or "{}")
    except (urllib_error.HTTPError, urllib_error.URLError, TimeoutError, ValueError) as exc:
        logger.warning("Telegram chat auto-discovery failed: %s", exc)
        return []

    if not parsed.get("ok"):
        return []

    chat_ids: list[str] = []
    seen: set[str] = set()
    for update in parsed.get("result", []) or []:
        candidates = [
            update.get("message"),
            update.get("edited_message"),
            (update.get("callback_query") or {}).get("message"),
            update.get("channel_post"),
        ]
        for item in candidates:
            if not item:
                continue
            chat_id = ((item.get("chat") or {}).get("id"))
            if chat_id is None:
                continue
            chat_id_str = str(chat_id).strip()
            if not chat_id_str or chat_id_str in seen:
                continue
            seen.add(chat_id_str)
            chat_ids.append(chat_id_str)
    return chat_ids


def _send_telegram_reminder(db: Session, workspace_id: str | None, message_text: str) -> int:
    if not settings.INTERNAL_CHAT_TELEGRAM_ENABLED:
        return 0

    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token:
        return 0

    chat_ids = _resolve_telegram_chat_ids(db, workspace_id)
    if not chat_ids and settings.TELEGRAM_AUTO_DISCOVER_CHAT_IDS:
        chat_ids = _discover_telegram_chat_ids(token)
    if not chat_ids:
        logger.info("Telegram bot token exists but no chat IDs configured for workspace=%s", workspace_id or "-")
        return 0

    sent_count = 0
    for chat_id in chat_ids:
        if _telegram_send_message(token=token, chat_id=chat_id, text=message_text):
            sent_count += 1
    return sent_count


def _send_telegram_task_update(
    db: Session,
    workspace_id: str,
    title: str,
    status_label: str,
    due_at: datetime | None,
    notes: str | None = None,
):
    due_label = _to_uz_datetime_label(due_at) if due_at else "No deadline"
    message = (
        "Benela Judith Update\n"
        f"Workspace: {workspace_id}\n"
        f"Task: {title[:255]}\n"
        f"Status: {status_label}\n"
        f"Due: {due_label}"
    )
    if notes and notes.strip():
        note_line = notes.strip().replace("\n", " ")
        message = f"{message}\nNotes: {note_line[:350]}"
    _send_telegram_reminder(db, workspace_id, message)


def _normalize_telegram_chat_id(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="telegram_chat_id is required.")
    if not re.fullmatch(r"-?\d{5,32}", value):
        raise HTTPException(status_code=400, detail="Invalid Telegram chat ID format.")
    return value


def _serialize_telegram_link(row: models.InternalChatTelegramLink) -> schemas.InternalChatTelegramLinkOut:
    return schemas.InternalChatTelegramLinkOut(
        id=row.id,
        workspace_id=row.workspace_id,
        thread_id=row.thread_id,
        user_id=row.user_id,
        user_role=row.user_role,
        telegram_chat_id=row.telegram_chat_id,
        telegram_username=row.telegram_username,
        telegram_first_name=row.telegram_first_name,
        is_active=row.is_active,
        last_seen_at=row.last_seen_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _build_telegram_start_instruction(chat_id: str) -> str:
    return (
        "Welcome to Judith AI bot.\n"
        f"Your Telegram chat ID: {chat_id}\n\n"
        "To connect with Benela:\n"
        "1) Open Benela Judith chat\n"
        "2) Click 'Set up Telegram Bot'\n"
        "3) Paste this chat ID and save\n\n"
        "After linking, deadline reminders will come here."
    )


def process_telegram_bot_updates_job(db: Session, last_update_id: int | None) -> int | None:
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token or not settings.INTERNAL_CHAT_TELEGRAM_ENABLED or not settings.INTERNAL_CHAT_TELEGRAM_UPDATES_ENABLED:
        return last_update_id

    params = ["limit=50", "timeout=1"]
    if last_update_id is not None:
        params.append(f"offset={int(last_update_id)}")
    url = f"https://api.telegram.org/bot{token}/getUpdates?{'&'.join(params)}"
    req = urllib_request.Request(url=url, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8", errors="ignore") or "{}")
    except urllib_error.HTTPError as exc:
        if exc.code == 409:
            _handle_telegram_polling_conflict(token)
            return last_update_id
        logger.warning("Telegram updates polling failed: %s", exc)
        return last_update_id
    except (urllib_error.URLError, TimeoutError, ValueError) as exc:
        logger.warning("Telegram updates polling failed: %s", exc)
        return last_update_id

    if not payload.get("ok"):
        logger.warning("Telegram getUpdates returned not ok: %s", payload.get("description") or "unknown")
        return last_update_id

    next_update_id = last_update_id
    updates = payload.get("result", []) or []
    for update in updates:
        update_id = update.get("update_id")
        if isinstance(update_id, int):
            candidate = update_id + 1
            if next_update_id is None or candidate > next_update_id:
                next_update_id = candidate

        message = (
            update.get("message")
            or update.get("edited_message")
            or (update.get("callback_query") or {}).get("message")
            or update.get("channel_post")
        )
        if not message:
            continue

        chat = message.get("chat") or {}
        chat_id_value = chat.get("id")
        if chat_id_value is None:
            continue
        chat_id = str(chat_id_value).strip()
        if not chat_id:
            continue

        text = str(message.get("text") or "").strip()
        if not text.lower().startswith("/start"):
            continue

        from_user = message.get("from") or {}
        username = str(from_user.get("username") or "").strip() or None
        first_name = str(from_user.get("first_name") or "").strip() or None
        now_utc = datetime.utcnow()

        links = (
            db.query(models.InternalChatTelegramLink)
            .filter(
                models.InternalChatTelegramLink.telegram_chat_id == chat_id,
                models.InternalChatTelegramLink.is_active.is_(True),
            )
            .all()
        )

        if links:
            touched_threads: set[int] = set()
            newly_verified_threads: set[int] = set()
            for link in links:
                is_first_verification = link.last_seen_at is None
                link.telegram_username = username or link.telegram_username
                link.telegram_first_name = first_name or link.telegram_first_name
                link.last_seen_at = now_utc
                link.updated_at = now_utc
                touched_threads.add(link.thread_id)
                if is_first_verification:
                    newly_verified_threads.add(link.thread_id)

            if newly_verified_threads:
                _telegram_send_message(
                    token=token,
                    chat_id=chat_id,
                    text=(
                        "Judith is connected with your Benela workspace.\n"
                        "You will receive task updates and deadline reminders here."
                    ),
                )
                for thread_id in newly_verified_threads:
                    _create_judith_message(
                        db,
                        thread_id=thread_id,
                        body="Telegram bot connected. Task updates and reminders are active.",
                    )
        else:
            _telegram_send_message(token=token, chat_id=chat_id, text=_build_telegram_start_instruction(chat_id))

    return next_update_id


def _parse_due_at_from_text(text: str) -> datetime | None:
    match = re.search(
        r"(?:due|deadline)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None

    raw = match.group(1).strip().replace("T", " ")
    parsed_local: datetime | None = None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            parsed_local = datetime.strptime(raw, fmt)
            break
        except ValueError:
            continue

    if not parsed_local:
        return None

    if raw.count(":") == 0:
        parsed_local = parsed_local.replace(hour=18, minute=0)

    with_tz = parsed_local.replace(tzinfo=UZ_TZ)
    return with_tz.astimezone(timezone.utc).replace(tzinfo=None)


def _parse_relative_due_at(text: str) -> datetime | None:
    lowered = text.lower()
    now_local = datetime.now(UZ_TZ)
    base_date = None

    if "day after tomorrow" in lowered or "indin" in lowered:
        base_date = (now_local + timedelta(days=2)).date()
    elif "tomorrow" in lowered or "ertaga" in lowered:
        base_date = (now_local + timedelta(days=1)).date()
    elif "today" in lowered or "bugun" in lowered:
        base_date = now_local.date()

    if base_date is None:
        return None

    hour = 18
    minute = 0
    time_24h = re.search(r"\b(\d{1,2}):(\d{2})\b", lowered)
    time_meridiem = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b", lowered)
    time_contextual = re.search(r"(?:\bat\b|\bby\b|@|\bsoat\b)\s*(\d{1,2})(?::(\d{2}))?\b", lowered)
    if time_meridiem:
        hour = int(time_meridiem.group(1))
        minute = int(time_meridiem.group(2) or "0")
        meridiem = time_meridiem.group(3).lower().replace(".", "")
        if meridiem == "pm" and hour < 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
        hour = min(23, max(0, hour))
        minute = min(59, max(0, minute))
    elif time_24h:
        hour = int(time_24h.group(1))
        minute = int(time_24h.group(2))
        hour = min(23, max(0, hour))
        minute = min(59, max(0, minute))
    elif time_contextual:
        hour = int(time_contextual.group(1))
        minute = int(time_contextual.group(2) or "0")
        hour = min(23, max(0, hour))
        minute = min(59, max(0, minute))
    else:
        if "morning" in lowered:
            hour = 9
        elif "afternoon" in lowered:
            hour = 15
        elif "evening" in lowered or "night" in lowered:
            hour = 19

    local_value = datetime(
        year=base_date.year,
        month=base_date.month,
        day=base_date.day,
        hour=hour,
        minute=minute,
        tzinfo=UZ_TZ,
    )
    return local_value.astimezone(timezone.utc).replace(tzinfo=None)


def _parse_time_only_due_at(text: str) -> datetime | None:
    lowered = text.lower()

    # If date context is already explicit, relative parser should handle it.
    if re.search(r"\b(today|tomorrow|day after tomorrow|bugun|ertaga|indin)\b", lowered):
        return None
    if re.search(r"\b(?:due|deadline)\b", lowered):
        return None
    if re.search(r"\b\d{4}-\d{2}-\d{2}\b", lowered):
        return None

    now_local = datetime.now(UZ_TZ)
    hour: int | None = None
    minute = 0

    time_meridiem = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b", lowered)
    time_24h = re.search(r"\b(\d{1,2}):(\d{2})\b", lowered)
    time_contextual = re.search(r"(?:\bat\b|\bby\b|@|\bsoat\b)\s*(\d{1,2})(?::(\d{2}))?\b", lowered)

    if time_meridiem:
        hour = int(time_meridiem.group(1))
        minute = int(time_meridiem.group(2) or "0")
        meridiem = time_meridiem.group(3).lower().replace(".", "")
        if meridiem == "pm" and hour < 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
    elif time_24h:
        hour = int(time_24h.group(1))
        minute = int(time_24h.group(2))
    elif time_contextual:
        hour = int(time_contextual.group(1))
        minute = int(time_contextual.group(2) or "0")

    if hour is None:
        return None

    hour = min(23, max(0, hour))
    minute = min(59, max(0, minute))

    local_candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    # If today's time has already passed, schedule for the next day.
    if local_candidate <= (now_local - timedelta(minutes=2)):
        local_candidate = local_candidate + timedelta(days=1)

    return local_candidate.astimezone(timezone.utc).replace(tzinfo=None)


def _extract_due_at(text: str) -> datetime | None:
    return _parse_due_at_from_text(text) or _parse_relative_due_at(text) or _parse_time_only_due_at(text)


def _has_time_hint(text: str) -> bool:
    lowered = text.lower()
    return bool(
        re.search(
            r"\b(\d{1,2}:\d{2}|\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)|(?:at|by|@|soat)\s*\d{1,2})\b",
            lowered,
        )
    )


def _looks_like_commitment(text: str) -> bool:
    lowered = text.lower()
    return bool(
        re.search(
            r"\b(i|we)\s+(will|need to|have to|must|should|plan to|going to)\b",
            lowered,
        )
    )


def _extract_checklist_items(text: str) -> list[str]:
    lines = []
    for line in text.splitlines():
        candidate = line.strip()
        if not candidate:
            continue
        candidate = re.sub(r"^[\-\*\s\[\]xX\d\.)]+", "", candidate).strip()
        if candidate:
            lines.append(candidate[:255])

    if len(lines) <= 1:
        comma_items = [item.strip() for item in text.split(",") if item.strip()]
        if len(comma_items) > 1:
            return [item[:255] for item in comma_items[:20]]

    return lines[:20]


def _derive_task_title(text: str) -> str:
    cleaned = text.strip()
    patterns = [
        r"^hey\s+judith[,\s]*",
        r"^judith[,\s]*",
        r"^please[,\s]*",
        r"^(can you|could you|kindly)\s+",
        r"^(mark|schedule|set|create|add|note|remember|remind)\s+",
    ]
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()

    cleaned = re.sub(r"(?:today|tomorrow|day after tomorrow|bugun|ertaga|indin)\b", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"(?:due|deadline)\s*[:\-]?\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\b(?:at|by|soat)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\b\d{1,2}(?::\d{2})\b", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\b\d{1,2}\s*(a\.?m\.?|p\.?m\.?)\b", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"^da\s+", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"^(as|as a|as an)\s+", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"^(a|an|the)\s+", "", cleaned, flags=re.IGNORECASE).strip()
    if "?" in cleaned:
        cleaned = cleaned.split("?", 1)[0].strip()
    cleaned = re.sub(r"\b(can you|could you)\b.*$", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,-")
    return (cleaned or text).strip()[:255]


def _transcribe_audio_bytes(payload: bytes, file_name: str, mime_type: str | None) -> str:
    if not payload or not settings.OPENAI_API_KEY:
        return ""

    safe_name = (file_name or "voice-note.webm").strip() or "voice-note.webm"
    suffix = Path(safe_name).suffix or (".m4a" if "mp4" in (mime_type or "") else ".webm")
    if not Path(safe_name).suffix:
        safe_name = f"{Path(safe_name).stem}{suffix}"

    audio_file = BytesIO(payload)
    audio_file.name = safe_name
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    try:
        result = client.audio.transcriptions.create(
            model=TRANSCRIBE_MODEL,
            file=audio_file,
        )
    except Exception:
        if TRANSCRIBE_MODEL == "whisper-1":
            return ""
        try:
            audio_file.seek(0)
            result = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
            )
        except Exception:
            return ""
    return (getattr(result, "text", "") or "").strip()


def _serialize_attachment(row: models.InternalChatAttachment) -> schemas.InternalChatAttachmentOut:
    return schemas.InternalChatAttachmentOut(
        id=row.id,
        thread_id=row.thread_id,
        file_name=row.file_name,
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        created_at=row.created_at,
        download_url=f"/internal-chat/attachments/{row.id}",
    )


def _serialize_participant(row: models.InternalChatParticipant) -> schemas.InternalChatParticipantOut:
    return schemas.InternalChatParticipantOut(
        user_id=row.user_id,
        email=row.email,
        display_name=row.display_name,
        role=row.role,
    )


def _serialize_message(row: models.InternalChatMessage) -> schemas.InternalChatMessageOut:
    attachments = sorted((row.attachments or []), key=lambda item: item.id)
    return schemas.InternalChatMessageOut(
        id=row.id,
        thread_id=row.thread_id,
        sender_user_id=row.sender_user_id,
        sender_name=row.sender_name,
        sender_email=row.sender_email,
        sender_role=row.sender_role,
        body=row.body,
        attachments=[_serialize_attachment(item) for item in attachments],
        created_at=row.created_at,
    )


def _serialize_thread(
    row: models.InternalChatThread,
    latest_message: models.InternalChatMessage | None = None,
) -> schemas.InternalChatThreadOut:
    preview = None
    last_message_at = None
    if latest_message:
        body = (latest_message.body or "").strip()
        preview = f"{body[:117]}..." if len(body) > 120 else body
        last_message_at = latest_message.created_at

    return schemas.InternalChatThreadOut(
        id=row.id,
        workspace_id=row.workspace_id,
        scope=row.scope,
        title=row.title,
        participants=[_serialize_participant(item) for item in row.participants],
        last_message_preview=preview,
        last_message_at=last_message_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _ensure_participant(
    db: Session,
    thread_id: int,
    user_id: str,
    email: str | None,
    display_name: str | None,
    role: str,
):
    row = (
        db.query(models.InternalChatParticipant)
        .filter(
            models.InternalChatParticipant.thread_id == thread_id,
            models.InternalChatParticipant.user_id == user_id,
        )
        .first()
    )
    normalized_name = _normalize_display_name(display_name, email, user_id)
    normalized_role = _normalize_role(role)

    if row:
        row.email = email.strip() if email else row.email
        row.display_name = normalized_name
        row.role = normalized_role
        return row

    row = models.InternalChatParticipant(
        thread_id=thread_id,
        user_id=user_id,
        email=email.strip() if email else None,
        display_name=normalized_name,
        role=normalized_role,
    )
    db.add(row)
    return row


def _latest_messages_by_thread(
    db: Session,
    thread_ids: list[int],
) -> dict[int, models.InternalChatMessage]:
    if not thread_ids:
        return {}

    latest_subquery = (
        db.query(
            models.InternalChatMessage.thread_id.label("thread_id"),
            func.max(models.InternalChatMessage.id).label("latest_id"),
        )
        .filter(models.InternalChatMessage.thread_id.in_(thread_ids))
        .group_by(models.InternalChatMessage.thread_id)
        .subquery()
    )

    rows = (
        db.query(models.InternalChatMessage)
        .join(latest_subquery, models.InternalChatMessage.id == latest_subquery.c.latest_id)
        .all()
    )
    return {row.thread_id: row for row in rows}


def _get_thread_or_404(
    db: Session,
    thread_id: int,
    include_participants: bool = False,
    include_messages: bool = False,
) -> models.InternalChatThread:
    loaders = []
    if include_participants:
        loaders.append(selectinload(models.InternalChatThread.participants))
    if include_messages:
        loaders.append(selectinload(models.InternalChatThread.messages))

    query = db.query(models.InternalChatThread).filter(models.InternalChatThread.id == thread_id)
    if loaders:
        query = query.options(*loaders)
    row = query.first()
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found.")
    return row


def _assert_thread_access(
    db: Session,
    thread_id: int,
    user_id: str,
    is_super_admin: bool,
):
    if is_super_admin:
        return

    membership = (
        db.query(models.InternalChatParticipant.id)
        .filter(
            models.InternalChatParticipant.thread_id == thread_id,
            models.InternalChatParticipant.user_id == user_id,
        )
        .first()
    )
    if membership:
        return

    raise HTTPException(status_code=403, detail="You do not have access to this conversation.")


def _assert_thread_scope(thread: models.InternalChatThread, allowed_scopes: set[str]):
    if thread.scope not in allowed_scopes:
        raise HTTPException(status_code=400, detail="This operation is only available for Judith chat.")


def _build_judith_ack(task_count: int, due_at: datetime | None) -> str:
    if task_count <= 0:
        return "Noted."
    due_label = _to_uz_datetime_label(due_at) if due_at else "no deadline"
    return f"Added {task_count} task{'s' if task_count != 1 else ''}. Due: {due_label}."


def _create_judith_message(
    db: Session,
    thread_id: int,
    body: str,
):
    row = models.InternalChatMessage(
        thread_id=thread_id,
        sender_user_id=JUDITH_USER_ID,
        sender_name=JUDITH_NAME,
        sender_email=JUDITH_EMAIL,
        sender_role=JUDITH_ROLE,
        body=body.strip()[:6000],
    )
    db.add(row)
    return row


def _schedule_reminder_for_task(
    db: Session,
    task: models.InternalChatTask,
    reminder_minutes: int = DEFAULT_REMINDER_MINUTES,
):
    if not task.due_at:
        return

    remind_at = task.due_at - timedelta(minutes=max(1, reminder_minutes))
    existing_pending = (
        db.query(models.InternalChatTaskReminder)
        .filter(models.InternalChatTaskReminder.task_id == task.id)
        .filter(models.InternalChatTaskReminder.sent_at.is_(None))
        .order_by(models.InternalChatTaskReminder.id.asc())
        .first()
    )

    if existing_pending:
        existing_pending.remind_at = remind_at
        existing_pending.workspace_id = task.workspace_id
        existing_pending.thread_id = task.thread_id
        return

    db.add(
        models.InternalChatTaskReminder(
            task_id=task.id,
            thread_id=task.thread_id,
            workspace_id=task.workspace_id,
            remind_at=remind_at,
        )
    )


def _suggest_judith_response_for_question(
    db: Session,
    thread: models.InternalChatThread,
    body: str,
) -> str | None:
    normalized = re.sub(r"^\s*(?:hey\s+)?judith[,\s:.-]*", "", body.strip(), flags=re.IGNORECASE)
    lowered = normalized.lower()
    now_utc = datetime.utcnow()

    open_count = (
        db.query(func.count(models.InternalChatTask.id))
        .filter(
            models.InternalChatTask.thread_id == thread.id,
            models.InternalChatTask.is_completed.is_(False),
        )
        .scalar()
        or 0
    )
    completed_count = (
        db.query(func.count(models.InternalChatTask.id))
        .filter(
            models.InternalChatTask.thread_id == thread.id,
            models.InternalChatTask.is_completed.is_(True),
        )
        .scalar()
        or 0
    )
    overdue_count = (
        db.query(func.count(models.InternalChatTask.id))
        .filter(
            models.InternalChatTask.thread_id == thread.id,
            models.InternalChatTask.is_completed.is_(False),
            models.InternalChatTask.due_at.isnot(None),
            models.InternalChatTask.due_at < now_utc,
        )
        .scalar()
        or 0
    )

    next_task = (
        db.query(models.InternalChatTask)
        .filter(
            models.InternalChatTask.thread_id == thread.id,
            models.InternalChatTask.is_completed.is_(False),
            models.InternalChatTask.due_at.isnot(None),
        )
        .order_by(models.InternalChatTask.due_at.asc(), models.InternalChatTask.created_at.desc())
        .first()
    )
    next_label = _to_uz_datetime_label(next_task.due_at) if next_task and next_task.due_at else "no deadline"

    if re.search(r"\b(how many|count|nechta|qancha)\b.*\b(task|tasks|todo|vazifa)\b", lowered):
        return f"Open: {open_count}. Completed: {completed_count}. Overdue: {overdue_count}."

    if re.search(r"\b(list|show|what are|which)\b.*\b(task|tasks|todo|vazifa)\b", lowered):
        open_tasks = (
            db.query(models.InternalChatTask)
            .filter(
                models.InternalChatTask.thread_id == thread.id,
                models.InternalChatTask.is_completed.is_(False),
            )
            .order_by(models.InternalChatTask.due_at.asc(), models.InternalChatTask.created_at.desc())
            .limit(5)
            .all()
        )
        if not open_tasks:
            return "No open tasks."
        summary = "; ".join(
            [f"{item.title} ({_to_uz_datetime_label(item.due_at) if item.due_at else 'no deadline'})" for item in open_tasks]
        )
        return f"Open tasks: {summary}."

    if re.search(r"\b(next|deadline|due|when)\b", lowered):
        return f"Next deadline: {next_label}."

    if any(keyword in lowered for keyword in {"upcoming", "today", "tomorrow", "pending", "status"}):
        horizon = now_utc + timedelta(days=3)
        pending_tasks = (
            db.query(models.InternalChatTask)
            .filter(
                models.InternalChatTask.thread_id == thread.id,
                models.InternalChatTask.is_completed.is_(False),
                models.InternalChatTask.due_at.isnot(None),
                models.InternalChatTask.due_at <= horizon,
            )
            .order_by(models.InternalChatTask.due_at.asc(), models.InternalChatTask.created_at.desc())
            .limit(5)
            .all()
        )
        if not pending_tasks:
            return "No upcoming deadlines in 3 days."
        summary = "; ".join([f"{item.title} ({_to_uz_datetime_label(item.due_at)})" for item in pending_tasks])
        return f"Upcoming: {summary}."

    if any(keyword in lowered for keyword in {"what can you do", "help", "how can you help"}):
        return "Send actions like: 'tomorrow 10 am meeting with clients' or 'create 3 tasks'."

    if "?" in body:
        return f"Open: {open_count}. Next deadline: {next_label}."

    return None


def _handle_task_control_command(
    db: Session,
    thread: models.InternalChatThread,
    body: str,
) -> bool:
    lowered = body.lower()
    has_task_context = bool(re.search(r"\b(task|tasks|todo|todos|checklist|vazifa)\b", lowered))
    if not has_task_context:
        return False

    complete_all = any(
        phrase in lowered
        for phrase in [
            "mark all tasks as completed",
            "mark as completed all tasks",
            "complete all tasks",
            "finish all tasks",
            "close all tasks",
        ]
    )
    reopen_all = any(
        phrase in lowered
        for phrase in [
            "reopen all tasks",
            "mark all tasks as pending",
            "mark all tasks as incomplete",
            "undo all completed tasks",
        ]
    )
    delete_completed = any(
        phrase in lowered
        for phrase in [
            "delete completed tasks",
            "remove completed tasks",
            "clear completed tasks",
        ]
    )
    delete_all = any(
        phrase in lowered
        for phrase in [
            "delete all tasks",
            "remove all tasks",
            "clear all tasks",
            "wipe all tasks",
        ]
    )
    # Support chained phrases like: "mark as completed all tasks and delete them"
    if ("delete them" in lowered or "remove them" in lowered or "clear them" in lowered) and (
        complete_all or "all tasks" in lowered
    ):
        delete_all = True

    if not any([complete_all, reopen_all, delete_completed, delete_all]):
        return False

    now_utc = datetime.utcnow()
    base_query = db.query(models.InternalChatTask).filter(models.InternalChatTask.thread_id == thread.id)
    completed_count = 0
    reopened_count = 0
    deleted_count = 0

    if complete_all:
        completed_count = (
            base_query.filter(models.InternalChatTask.is_completed.is_(False)).update(
                {
                    models.InternalChatTask.is_completed: True,
                    models.InternalChatTask.completed_at: now_utc,
                    models.InternalChatTask.updated_at: now_utc,
                },
                synchronize_session=False,
            )
            or 0
        )

    if reopen_all:
        reopened_count = (
            base_query.filter(models.InternalChatTask.is_completed.is_(True)).update(
                {
                    models.InternalChatTask.is_completed: False,
                    models.InternalChatTask.completed_at: None,
                    models.InternalChatTask.updated_at: now_utc,
                },
                synchronize_session=False,
            )
            or 0
        )

    if delete_completed:
        deleted_count = (
            base_query.filter(models.InternalChatTask.is_completed.is_(True)).delete(synchronize_session=False) or 0
        )
    elif delete_all:
        deleted_count = base_query.delete(synchronize_session=False) or 0

    parts: list[str] = []
    if complete_all:
        parts.append(f"Completed {completed_count} task{'s' if completed_count != 1 else ''}.")
    if reopen_all:
        parts.append(f"Reopened {reopened_count} task{'s' if reopened_count != 1 else ''}.")
    if delete_completed:
        parts.append(f"Deleted {deleted_count} completed task{'s' if deleted_count != 1 else ''}.")
    elif delete_all:
        parts.append(f"Deleted {deleted_count} task{'s' if deleted_count != 1 else ''}.")

    if not parts:
        parts.append("No matching tasks found.")

    summary_text = " ".join(parts)
    _create_judith_message(db, thread_id=thread.id, body=summary_text)
    if any([completed_count, reopened_count, deleted_count]):
        _send_telegram_reminder(
            db,
            thread.workspace_id,
            (
                "Benela Judith Update\n"
                f"Workspace: {thread.workspace_id}\n"
                f"Task batch action: {summary_text}"
            ),
        )
    return True


def _process_judith_instruction(
    db: Session,
    thread: models.InternalChatThread,
    sender_user_id: str,
    body: str,
) -> bool:
    text = body.strip()
    if not text:
        return False

    if _handle_task_control_command(db, thread, text):
        return True

    due_at = _extract_due_at(text)
    items = _extract_checklist_items(text)
    lowered = text.lower()
    explicit_action = bool(
        re.search(
            r"\b(mark|schedule|set|create|add|note|remember|remind|plan|book|assign|vazifa|uchrashuv|eslat)\b",
            lowered,
        )
    ) or any(
        keyword in lowered
        for keyword in {
            "meeting",
            "meet",
            "appointment",
            "deadline",
            "checklist",
            "interview",
            "call",
            "sync",
            "standup",
            "review",
            "demo",
            "presentation",
            "lunch",
            "dinner",
            "breakfast",
            "reminder",
        }
    )
    numeric_match = re.search(r"\b(\d{1,2})\s+tasks?\b", lowered)
    commitment = _looks_like_commitment(text)
    has_action_intent = bool(due_at or explicit_action or numeric_match or commitment or _has_time_hint(text))

    if "?" in text and not explicit_action and not numeric_match and not commitment:
        suggested = _suggest_judith_response_for_question(db, thread, text)
        if suggested:
            _create_judith_message(db, thread_id=thread.id, body=suggested)
            return True
        _create_judith_message(
            db,
            thread_id=thread.id,
            body="Noted. Add action + time, e.g. 'tomorrow 10 am meeting with clients'.",
        )
        return True

    if not has_action_intent:
        suggested = _suggest_judith_response_for_question(db, thread, text)
        if suggested:
            _create_judith_message(db, thread_id=thread.id, body=suggested)
            return True
        _create_judith_message(
            db,
            thread_id=thread.id,
            body="Noted. Add action + time, e.g. 'tomorrow 10 am meeting with clients'.",
        )
        return True

    if not items:
        items = [_derive_task_title(text)]
    elif explicit_action and len(items) == 1:
        items = [_derive_task_title(items[0])]

    if numeric_match and len(items) == 1:
        count = min(10, max(1, int(numeric_match.group(1))))
        base = _derive_task_title(items[0])
        items = [f"{base} - item {index}" for index in range(1, count + 1)]

    created_tasks: list[models.InternalChatTask] = []
    for title in items:
        task = models.InternalChatTask(
            thread_id=thread.id,
            workspace_id=thread.workspace_id,
            title=(title or _derive_task_title(text))[:255],
            notes=text if len(items) == 1 else None,
            due_at=due_at,
            created_by_user_id=sender_user_id,
        )
        db.add(task)
        db.flush()
        _schedule_reminder_for_task(db, task)
        created_tasks.append(task)

    if created_tasks:
        if len(created_tasks) == 1:
            task = created_tasks[0]
            _send_telegram_task_update(
                db,
                workspace_id=task.workspace_id,
                title=task.title,
                status_label="Added",
                due_at=task.due_at,
                notes=task.notes,
            )
        else:
            due_label = _to_uz_datetime_label(due_at) if due_at else "No deadline"
            preview = ", ".join(task.title[:80] for task in created_tasks[:3])
            if len(created_tasks) > 3:
                preview = f"{preview}, +{len(created_tasks) - 3} more"
            summary = (
                "Benela Judith Update\n"
                f"Workspace: {thread.workspace_id}\n"
                f"Added tasks: {len(created_tasks)}\n"
                f"Due: {due_label}\n"
                f"Items: {preview}"
            )
            _send_telegram_reminder(db, thread.workspace_id, summary)

    _create_judith_message(db, thread_id=thread.id, body=_build_judith_ack(len(created_tasks), due_at))
    return True


def _dispatch_due_reminders(
    db: Session,
    workspace_id: str | None,
) -> int:
    now_utc = datetime.utcnow()
    query = (
        db.query(models.InternalChatTaskReminder)
        .join(models.InternalChatTask, models.InternalChatTask.id == models.InternalChatTaskReminder.task_id)
        .filter(
            models.InternalChatTaskReminder.sent_at.is_(None),
            models.InternalChatTaskReminder.remind_at <= now_utc,
            models.InternalChatTask.is_completed.is_(False),
        )
        .order_by(models.InternalChatTaskReminder.remind_at.asc())
    )
    if workspace_id:
        query = query.filter(models.InternalChatTaskReminder.workspace_id == workspace_id)

    due_reminders = query.limit(50).all()
    touched_threads: set[int] = set()
    processed = 0

    for reminder in due_reminders:
        task = db.query(models.InternalChatTask).filter(models.InternalChatTask.id == reminder.task_id).first()
        if not task or task.is_completed:
            reminder.sent_at = now_utc
            continue

        due_label = _to_uz_datetime_label(task.due_at)
        reminder_body = f"Reminder: '{task.title}' is due at {due_label}."
        _create_judith_message(db, thread_id=task.thread_id, body=reminder_body)
        telegram_message = (
            "Benela Judith Reminder\n"
            f"Workspace: {task.workspace_id}\n"
            f"Task: {task.title}\n"
            f"Due: {due_label}"
        )
        _send_telegram_reminder(db, task.workspace_id, telegram_message)
        reminder.sent_at = now_utc
        touched_threads.add(task.thread_id)
        processed += 1

    for thread_id in touched_threads:
        thread = db.query(models.InternalChatThread).filter(models.InternalChatThread.id == thread_id).first()
        if thread:
            thread.updated_at = now_utc

    return processed


def dispatch_due_reminders_job(db: Session) -> int:
    """
    Process due Judith reminders across all workspaces.
    Returns number of reminders dispatched.
    """
    return _dispatch_due_reminders(db, workspace_id=None)


@router.get(
    "/threads/{thread_id}/judith/telegram-link",
    response_model=schemas.InternalChatTelegramLinkOut | None,
)
def get_judith_telegram_link(
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=user_id,
        is_super_admin=_is_super_admin(user_role),
    )

    link = (
        db.query(models.InternalChatTelegramLink)
        .filter(
            models.InternalChatTelegramLink.thread_id == thread.id,
            models.InternalChatTelegramLink.user_id == user_id,
            models.InternalChatTelegramLink.is_active.is_(True),
        )
        .order_by(models.InternalChatTelegramLink.updated_at.desc(), models.InternalChatTelegramLink.id.desc())
        .first()
    )
    if not link:
        return None
    return _serialize_telegram_link(link)


@router.post(
    "/threads/{thread_id}/judith/telegram-link",
    response_model=schemas.InternalChatTelegramLinkOut,
)
def upsert_judith_telegram_link(
    thread_id: int,
    payload: schemas.InternalChatTelegramLinkCreate,
    db: Session = Depends(get_db),
):
    normalized_user_id = (payload.user_id or "").strip()
    if not normalized_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=normalized_user_id,
        is_super_admin=_is_super_admin(payload.user_role),
    )

    chat_id = _normalize_telegram_chat_id(payload.telegram_chat_id)
    now_utc = datetime.utcnow()
    link = (
        db.query(models.InternalChatTelegramLink)
        .filter(
            models.InternalChatTelegramLink.thread_id == thread.id,
            models.InternalChatTelegramLink.user_id == normalized_user_id,
            models.InternalChatTelegramLink.is_active.is_(True),
        )
        .order_by(models.InternalChatTelegramLink.updated_at.desc(), models.InternalChatTelegramLink.id.desc())
        .first()
    )

    if link:
        link.telegram_chat_id = chat_id
        link.telegram_username = (payload.telegram_username or "").strip() or link.telegram_username
        link.telegram_first_name = (payload.telegram_first_name or "").strip() or link.telegram_first_name
        link.updated_at = now_utc
    else:
        link = models.InternalChatTelegramLink(
            workspace_id=thread.workspace_id,
            thread_id=thread.id,
            user_id=normalized_user_id,
            user_role=_normalize_role(payload.user_role),
            telegram_chat_id=chat_id,
            telegram_username=(payload.telegram_username or "").strip() or None,
            telegram_first_name=(payload.telegram_first_name or "").strip() or None,
            is_active=True,
            last_seen_at=None,
        )
        db.add(link)
        db.flush()

    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    can_contact_bot = bool(settings.INTERNAL_CHAT_TELEGRAM_ENABLED and token)
    connected_now = False
    if can_contact_bot:
        connected_now = _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=(
                "Benela Judith linking request received.\n"
                f"Bot: @{TELEGRAM_BOT_USERNAME}\n"
                "If this is your first message to the bot, send /start first.\n"
                "After verification, deadline reminders will arrive here."
            ),
        )

    if connected_now:
        _create_judith_message(
            db,
            thread_id=thread.id,
            body=(
                f"Telegram linked to @{TELEGRAM_BOT_USERNAME} (chat ID: {chat_id}). "
                "Deadline reminders are now active in Telegram."
            ),
        )
    else:
        _create_judith_message(
            db,
            thread_id=thread.id,
            body=(
                f"Telegram chat ID {chat_id} saved. Open @{TELEGRAM_BOT_USERNAME}, send /start, "
                "then keep this chat ID linked in Judith. Unknown users can send /start to instantly receive their chat ID."
            ),
        )

    thread.updated_at = now_utc
    db.commit()
    db.refresh(link)
    return _serialize_telegram_link(link)

@router.get("/threads", response_model=list[schemas.InternalChatThreadOut])
def list_threads(
    user_id: str = Query(...),
    user_role: str = Query("client"),
    workspace_id: str | None = Query(None),
    limit: int = Query(60, ge=1, le=200),
    db: Session = Depends(get_db),
):
    super_admin = _is_super_admin(user_role)

    query = (
        db.query(models.InternalChatThread)
        .options(selectinload(models.InternalChatThread.participants))
        .order_by(models.InternalChatThread.updated_at.desc(), models.InternalChatThread.id.desc())
    )

    if workspace_id:
        query = query.filter(models.InternalChatThread.workspace_id == workspace_id)

    if not super_admin:
        query = (
            query.join(
                models.InternalChatParticipant,
                models.InternalChatParticipant.thread_id == models.InternalChatThread.id,
            )
            .filter(models.InternalChatParticipant.user_id == user_id)
            .distinct()
        )

    rows = query.limit(limit).all()
    latest_by_thread = _latest_messages_by_thread(db, [row.id for row in rows])
    return [_serialize_thread(row, latest_by_thread.get(row.id)) for row in rows]


@router.post("/threads/bridge", response_model=schemas.InternalChatThreadOut)
def open_workspace_bridge(
    payload: schemas.InternalChatBridgeOpen,
    db: Session = Depends(get_db),
):
    workspace_id = payload.workspace_id.strip()
    requester_user_id = payload.requester_user_id.strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if not requester_user_id:
        raise HTTPException(status_code=400, detail="requester_user_id is required.")

    thread = (
        db.query(models.InternalChatThread)
        .filter(
            models.InternalChatThread.workspace_id == workspace_id,
            models.InternalChatThread.scope == "workspace_owner",
        )
        .first()
    )

    if not thread:
        thread = models.InternalChatThread(
            workspace_id=workspace_id,
            scope="workspace_owner",
            title=f"{workspace_id} · Owner Bridge",
            created_by_user_id=requester_user_id,
        )
        db.add(thread)
        db.flush()

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=requester_user_id,
        email=payload.requester_email,
        display_name=payload.requester_name,
        role=payload.requester_role,
    )
    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=OWNER_USER_ID,
        email=OWNER_EMAIL,
        display_name=OWNER_NAME,
        role=OWNER_ROLE,
    )

    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(thread)
    row = _get_thread_or_404(db, thread.id, include_participants=True)
    latest_by_thread = _latest_messages_by_thread(db, [row.id])
    return _serialize_thread(row, latest_by_thread.get(row.id))


@router.post("/threads/owner-direct", response_model=schemas.InternalChatThreadOut)
def open_owner_direct(
    payload: schemas.InternalChatBridgeOpen,
    db: Session = Depends(get_db),
):
    workspace_id = payload.workspace_id.strip()
    requester_user_id = payload.requester_user_id.strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if not requester_user_id:
        raise HTTPException(status_code=400, detail="requester_user_id is required.")

    candidates = (
        db.query(models.InternalChatThread)
        .filter(
            models.InternalChatThread.workspace_id == workspace_id,
            models.InternalChatThread.scope == "owner_direct",
        )
        .options(selectinload(models.InternalChatThread.participants))
        .all()
    )

    thread = None
    expected = {requester_user_id, OWNER_USER_ID}
    for candidate in candidates:
        ids = {participant.user_id for participant in candidate.participants}
        if ids == expected:
            thread = candidate
            break

    if not thread:
        requester_name = _normalize_display_name(payload.requester_name, payload.requester_email, requester_user_id)
        thread = models.InternalChatThread(
            workspace_id=workspace_id,
            scope="owner_direct",
            title=f"Owner Direct • {requester_name}",
            created_by_user_id=requester_user_id,
        )
        db.add(thread)
        db.flush()

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=requester_user_id,
        email=payload.requester_email,
        display_name=payload.requester_name,
        role=payload.requester_role,
    )
    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=OWNER_USER_ID,
        email=OWNER_EMAIL,
        display_name=OWNER_NAME,
        role=OWNER_ROLE,
    )

    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(thread)
    row = _get_thread_or_404(db, thread.id, include_participants=True)
    latest_by_thread = _latest_messages_by_thread(db, [row.id])
    return _serialize_thread(row, latest_by_thread.get(row.id))


@router.post("/threads/judith", response_model=schemas.InternalChatThreadOut)
def open_judith_thread(
    payload: schemas.InternalChatBridgeOpen,
    db: Session = Depends(get_db),
):
    workspace_id = payload.workspace_id.strip()
    requester_user_id = payload.requester_user_id.strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if not requester_user_id:
        raise HTTPException(status_code=400, detail="requester_user_id is required.")

    thread = (
        db.query(models.InternalChatThread)
        .filter(
            models.InternalChatThread.workspace_id == workspace_id,
            models.InternalChatThread.scope == "judith_assistant",
        )
        .first()
    )

    created_now = False
    if not thread:
        thread = models.InternalChatThread(
            workspace_id=workspace_id,
            scope="judith_assistant",
            title="Judith • Notes & Checklists",
            created_by_user_id=requester_user_id,
        )
        db.add(thread)
        db.flush()
        created_now = True

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=requester_user_id,
        email=payload.requester_email,
        display_name=payload.requester_name,
        role=payload.requester_role,
    )
    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=OWNER_USER_ID,
        email=OWNER_EMAIL,
        display_name=OWNER_NAME,
        role=OWNER_ROLE,
    )
    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=JUDITH_USER_ID,
        email=JUDITH_EMAIL,
        display_name=JUDITH_NAME,
        role=JUDITH_ROLE,
    )

    if created_now:
        _create_judith_message(
            db,
            thread_id=thread.id,
            body=(
                "Hello, I am Judith. I can capture notes, create checklists, and track deadlines for this workspace. "
                "Add 'deadline: YYYY-MM-DD HH:MM' in your message to set due dates in Uzbekistan time (UZT)."
            ),
        )

    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(thread)
    row = _get_thread_or_404(db, thread.id, include_participants=True)
    latest_by_thread = _latest_messages_by_thread(db, [row.id])
    return _serialize_thread(row, latest_by_thread.get(row.id))


@router.post("/threads/direct", response_model=schemas.InternalChatThreadOut)
def create_direct_thread(
    payload: schemas.InternalChatDirectCreate,
    db: Session = Depends(get_db),
):
    workspace_id = payload.workspace_id.strip()
    requester_user_id = payload.requester_user_id.strip()
    target_user_id = payload.target_user_id.strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if not requester_user_id or not target_user_id:
        raise HTTPException(status_code=400, detail="Both requester_user_id and target_user_id are required.")
    if requester_user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot create a direct thread with yourself.")

    candidates = (
        db.query(models.InternalChatThread)
        .filter(
            models.InternalChatThread.workspace_id == workspace_id,
            models.InternalChatThread.scope == "direct",
        )
        .options(selectinload(models.InternalChatThread.participants))
        .all()
    )

    thread = None
    wanted_ids = {requester_user_id, target_user_id}
    for candidate in candidates:
        ids = {participant.user_id for participant in candidate.participants}
        if ids == wanted_ids:
            thread = candidate
            break

    if not thread:
        thread = models.InternalChatThread(
            workspace_id=workspace_id,
            scope="direct",
            title=(payload.title or payload.target_name or "Direct Chat").strip()[:255] or "Direct Chat",
            created_by_user_id=requester_user_id,
        )
        db.add(thread)
        db.flush()

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=requester_user_id,
        email=payload.requester_email,
        display_name=payload.requester_name,
        role=payload.requester_role,
    )
    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=target_user_id,
        email=payload.target_email,
        display_name=payload.target_name,
        role=payload.target_role,
    )

    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(thread)
    row = _get_thread_or_404(db, thread.id, include_participants=True)
    latest_by_thread = _latest_messages_by_thread(db, [row.id])
    return _serialize_thread(row, latest_by_thread.get(row.id))


@router.get("/threads/{thread_id}/messages", response_model=list[schemas.InternalChatMessageOut])
def list_messages(
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    _get_thread_or_404(db, thread_id)
    _assert_thread_access(db, thread_id=thread_id, user_id=user_id, is_super_admin=_is_super_admin(user_role))

    rows = (
        db.query(models.InternalChatMessage)
        .options(selectinload(models.InternalChatMessage.attachments))
        .filter(models.InternalChatMessage.thread_id == thread_id)
        .order_by(models.InternalChatMessage.created_at.desc(), models.InternalChatMessage.id.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    return [_serialize_message(row) for row in rows]


@router.delete("/threads/{thread_id}/messages")
def clear_thread_messages(
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=user_id,
        is_super_admin=_is_super_admin(user_role),
    )
    _assert_thread_scope(thread, {"judith_assistant"})

    attachment_paths = [
        Path(row.storage_key)
        for row in db.query(models.InternalChatAttachment.storage_key)
        .filter(models.InternalChatAttachment.thread_id == thread.id)
        .all()
        if row.storage_key
    ]

    deleted_messages = (
        db.query(models.InternalChatMessage)
        .filter(models.InternalChatMessage.thread_id == thread.id)
        .delete(synchronize_session=False)
        or 0
    )
    thread.updated_at = datetime.utcnow()
    db.commit()

    # Best-effort file cleanup for attachment blobs.
    for path in attachment_paths:
        try:
            if path.exists() and path.is_file():
                path.unlink()
        except Exception:
            continue

    return {"ok": True, "deleted_messages": deleted_messages}


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    message = (
        db.query(models.InternalChatMessage)
        .options(selectinload(models.InternalChatMessage.attachments))
        .filter(models.InternalChatMessage.id == message_id)
        .first()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found.")

    thread = _get_thread_or_404(db, message.thread_id)
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=user_id,
        is_super_admin=_is_super_admin(user_role),
    )
    _assert_thread_scope(thread, {"judith_assistant"})

    # Regular members can remove their own messages and Judith assistant messages.
    if not _is_super_admin(user_role):
        allowed_sender_ids = {user_id, JUDITH_USER_ID}
        if message.sender_user_id not in allowed_sender_ids:
            raise HTTPException(
                status_code=403,
                detail="You can remove only your own or Judith assistant messages.",
            )

    attachment_paths = [Path(item.storage_key) for item in (message.attachments or []) if item.storage_key]
    db.delete(message)
    thread.updated_at = datetime.utcnow()
    db.commit()

    # Best-effort file cleanup for attachment blobs.
    for path in attachment_paths:
        try:
            if path.exists() and path.is_file():
                path.unlink()
        except Exception:
            continue

    return {"ok": True}


@router.post("/threads/{thread_id}/messages", response_model=schemas.InternalChatMessageOut)
def send_message(
    thread_id: int,
    payload: schemas.InternalChatMessageCreate,
    db: Session = Depends(get_db),
):
    sender_user_id = payload.sender_user_id.strip()
    if not sender_user_id:
        raise HTTPException(status_code=400, detail="sender_user_id is required.")
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body cannot be empty.")

    thread = _get_thread_or_404(db, thread_id)
    sender_super_admin = _is_super_admin(payload.sender_role)
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=sender_user_id,
        is_super_admin=sender_super_admin,
    )

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=sender_user_id,
        email=payload.sender_email,
        display_name=payload.sender_name,
        role=payload.sender_role,
    )

    row = models.InternalChatMessage(
        thread_id=thread.id,
        sender_user_id=sender_user_id,
        sender_name=_normalize_display_name(payload.sender_name, payload.sender_email, sender_user_id),
        sender_email=payload.sender_email.strip() if payload.sender_email else None,
        sender_role=_normalize_role(payload.sender_role),
        body=body,
    )
    db.add(row)

    if thread.scope == "judith_assistant" and sender_user_id != JUDITH_USER_ID:
        _process_judith_instruction(db, thread=thread, sender_user_id=sender_user_id, body=body)

    thread.updated_at = datetime.utcnow()
    db.commit()

    fresh = (
        db.query(models.InternalChatMessage)
        .options(selectinload(models.InternalChatMessage.attachments))
        .filter(models.InternalChatMessage.id == row.id)
        .first()
    )
    if not fresh:
        raise HTTPException(status_code=500, detail="Could not persist message.")
    return _serialize_message(fresh)


@router.post("/threads/{thread_id}/attachments", response_model=schemas.InternalChatMessageOut)
async def send_attachment_message(
    thread_id: int,
    sender_user_id: str = Form(...),
    sender_role: str = Form("client"),
    sender_name: str | None = Form(None),
    sender_email: str | None = Form(None),
    caption: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    normalized_sender = sender_user_id.strip()
    if not normalized_sender:
        raise HTTPException(status_code=400, detail="sender_user_id is required.")

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=normalized_sender,
        is_super_admin=_is_super_admin(sender_role),
    )

    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    if not payload:
        raise HTTPException(status_code=400, detail="Attachment file is empty.")

    display_name = (file.filename or "attachment").strip()[:255] or "attachment"
    extension = Path(display_name).suffix[:15]
    storage_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid4().hex}{extension}"
    thread_folder = UPLOAD_ROOT / str(thread.id)
    thread_folder.mkdir(parents=True, exist_ok=True)
    storage_path = thread_folder / storage_name
    storage_path.write_bytes(payload)

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=normalized_sender,
        email=sender_email,
        display_name=sender_name,
        role=sender_role,
    )

    body = (caption or "").strip() or f"Sent an attachment: {display_name}"
    instruction_text = body
    is_audio = (file.content_type or "").lower().startswith("audio/")
    has_transcript = "transcript:" in body.lower()
    if has_transcript:
        # Prefer explicit transcript content over metadata lines like "Voice message".
        transcript_line = re.search(r"transcript:\s*(.+)", body, flags=re.IGNORECASE)
        if transcript_line:
            instruction_text = transcript_line.group(1).strip()
    if is_audio and not has_transcript:
        transcript = _transcribe_audio_bytes(payload, display_name, file.content_type)
        if transcript:
            instruction_text = transcript
            body = f"{body}\nTranscript: {transcript}"

    message = models.InternalChatMessage(
        thread_id=thread.id,
        sender_user_id=normalized_sender,
        sender_name=_normalize_display_name(sender_name, sender_email, normalized_sender),
        sender_email=sender_email.strip() if sender_email else None,
        sender_role=_normalize_role(sender_role),
        body=body,
    )
    db.add(message)
    db.flush()

    attachment = models.InternalChatAttachment(
        message_id=message.id,
        thread_id=thread.id,
        file_name=display_name,
        mime_type=file.content_type,
        size_bytes=len(payload),
        storage_key=str(storage_path),
    )
    db.add(attachment)

    if thread.scope == "judith_assistant" and normalized_sender != JUDITH_USER_ID:
        _process_judith_instruction(db, thread=thread, sender_user_id=normalized_sender, body=instruction_text)

    thread.updated_at = datetime.utcnow()
    db.commit()

    fresh = (
        db.query(models.InternalChatMessage)
        .options(selectinload(models.InternalChatMessage.attachments))
        .filter(models.InternalChatMessage.id == message.id)
        .first()
    )
    if not fresh:
        raise HTTPException(status_code=500, detail="Could not persist attachment message.")
    return _serialize_message(fresh)


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    attachment = db.query(models.InternalChatAttachment).filter(models.InternalChatAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found.")

    _assert_thread_access(
        db,
        thread_id=attachment.thread_id,
        user_id=user_id,
        is_super_admin=_is_super_admin(user_role),
    )

    file_path = Path(attachment.storage_key)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file is missing.")

    return FileResponse(
        path=file_path,
        media_type=attachment.mime_type or "application/octet-stream",
        filename=attachment.file_name,
    )


@router.get("/threads/{thread_id}/judith/tasks", response_model=list[schemas.InternalChatTaskOut])
def list_judith_tasks(
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(db, thread_id=thread.id, user_id=user_id, is_super_admin=_is_super_admin(user_role))

    rows = (
        db.query(models.InternalChatTask)
        .filter(models.InternalChatTask.thread_id == thread.id)
        .order_by(
            models.InternalChatTask.is_completed.asc(),
            models.InternalChatTask.due_at.asc(),
            models.InternalChatTask.created_at.desc(),
        )
        .limit(limit)
        .all()
    )
    return rows


@router.post("/threads/{thread_id}/judith/tasks", response_model=schemas.InternalChatTaskOut)
def create_judith_task(
    thread_id: int,
    payload: schemas.InternalChatTaskCreate,
    db: Session = Depends(get_db),
):
    creator_user_id = payload.creator_user_id.strip()
    if not creator_user_id:
        raise HTTPException(status_code=400, detail="creator_user_id is required.")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Task title is required.")

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=creator_user_id,
        is_super_admin=_is_super_admin(payload.creator_role),
    )

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=creator_user_id,
        email=payload.creator_email,
        display_name=payload.creator_name,
        role=payload.creator_role,
    )

    row = models.InternalChatTask(
        thread_id=thread.id,
        workspace_id=thread.workspace_id,
        title=title[:255],
        notes=(payload.notes or "").strip()[:5000] or None,
        due_at=payload.due_at,
        created_by_user_id=creator_user_id,
    )
    db.add(row)
    db.flush()
    _schedule_reminder_for_task(db, row)
    _send_telegram_task_update(
        db,
        workspace_id=row.workspace_id,
        title=row.title,
        status_label="Added",
        due_at=row.due_at,
        notes=row.notes,
    )

    due_label = _to_uz_datetime_label(payload.due_at) if payload.due_at else "no deadline"
    _create_judith_message(db, thread.id, f"Judith added task: {title[:200]} (deadline: {due_label}).")

    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


@router.patch("/judith/tasks/{task_id}", response_model=schemas.InternalChatTaskOut)
def set_judith_task_state(
    task_id: int,
    payload: schemas.InternalChatTaskPatch,
    db: Session = Depends(get_db),
):
    task = db.query(models.InternalChatTask).filter(models.InternalChatTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    thread = _get_thread_or_404(db, task.thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=payload.user_id,
        is_super_admin=_is_super_admin(payload.user_role),
    )

    task.is_completed = bool(payload.is_completed)
    task.completed_at = datetime.utcnow() if task.is_completed else None
    task.updated_at = datetime.utcnow()
    if task.is_completed:
        (
            db.query(models.InternalChatTaskReminder)
            .filter(
                models.InternalChatTaskReminder.task_id == task.id,
                models.InternalChatTaskReminder.sent_at.is_(None),
            )
            .update({models.InternalChatTaskReminder.sent_at: datetime.utcnow()}, synchronize_session=False)
        )

    action = "completed" if task.is_completed else "reopened"
    _create_judith_message(db, thread.id, f"Judith marked task '{task.title[:120]}' as {action}.")
    _send_telegram_task_update(
        db,
        workspace_id=task.workspace_id,
        title=task.title,
        status_label="Completed" if task.is_completed else "Reopened",
        due_at=task.due_at,
        notes=task.notes,
    )

    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.delete("/judith/tasks/{task_id}")
def delete_judith_task(
    task_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    task = db.query(models.InternalChatTask).filter(models.InternalChatTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    thread = _get_thread_or_404(db, task.thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=user_id,
        is_super_admin=_is_super_admin(user_role),
    )
    if not task.is_completed:
        raise HTTPException(status_code=400, detail="Only completed tasks can be removed.")

    task_title = (task.title or "task")[:120]
    task_due = task.due_at
    task_workspace = task.workspace_id
    task_notes = task.notes
    db.delete(task)
    _create_judith_message(db, thread.id, f"Removed completed task '{task_title}'.")
    _send_telegram_task_update(
        db,
        workspace_id=task_workspace,
        title=task_title,
        status_label="Removed",
        due_at=task_due,
        notes=task_notes,
    )
    thread.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/judith/reminders", response_model=list[schemas.InternalChatTaskOut])
def list_judith_reminders(
    user_id: str = Query(...),
    user_role: str = Query("client"),   
    workspace_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    super_admin = _is_super_admin(user_role)
    now_utc = datetime.utcnow()
    horizon = now_utc + timedelta(hours=48)

    _dispatch_due_reminders(db, workspace_id=workspace_id)
    db.commit()

    query = (
        db.query(models.InternalChatTask)
        .join(models.InternalChatThread, models.InternalChatThread.id == models.InternalChatTask.thread_id)
        .filter(
            models.InternalChatThread.scope == "judith_assistant",
            models.InternalChatTask.is_completed.is_(False),
            models.InternalChatTask.due_at.isnot(None),
            models.InternalChatTask.due_at <= horizon,
        )
        .order_by(models.InternalChatTask.due_at.asc(), models.InternalChatTask.created_at.desc())
    )

    if workspace_id:
        query = query.filter(models.InternalChatThread.workspace_id == workspace_id)

    if not super_admin:
        if workspace_id:
            query = query.filter(models.InternalChatTask.workspace_id == workspace_id)
        else:
            query = query.join(
                models.InternalChatParticipant,
                models.InternalChatParticipant.thread_id == models.InternalChatTask.thread_id,
            ).filter(models.InternalChatParticipant.user_id == user_id)

    rows = query.limit(limit).all()
    return rows


@router.get("/contacts")
def list_contacts(
    user_id: str = Query(...),
    user_role: str = Query("client"),
    workspace_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    super_admin = _is_super_admin(user_role)
    seen: dict[str, dict] = {}

    if super_admin:
        query = (
            db.query(models.InternalChatParticipant)
            .join(models.InternalChatThread, models.InternalChatThread.id == models.InternalChatParticipant.thread_id)
            .options(selectinload(models.InternalChatParticipant.thread))
        )
        if workspace_id:
            query = query.filter(models.InternalChatThread.workspace_id == workspace_id)
        rows = query.order_by(models.InternalChatParticipant.display_name.asc()).all()

        for row in rows:
            if row.user_id == user_id:
                continue
            if row.user_id not in seen:
                seen[row.user_id] = {
                    "user_id": row.user_id,
                    "email": row.email,
                    "display_name": row.display_name,
                    "role": row.role,
                }
    else:
        member_threads_query = db.query(models.InternalChatParticipant.thread_id).filter(
            models.InternalChatParticipant.user_id == user_id
        )
        if workspace_id:
            member_threads_query = member_threads_query.join(
                models.InternalChatThread,
                models.InternalChatThread.id == models.InternalChatParticipant.thread_id,
            ).filter(models.InternalChatThread.workspace_id == workspace_id)
        thread_ids = [item.thread_id for item in member_threads_query.distinct().all()]
        if thread_ids:
            rows = (
                db.query(models.InternalChatParticipant)
                .filter(models.InternalChatParticipant.thread_id.in_(thread_ids))
                .order_by(models.InternalChatParticipant.display_name.asc())
                .all()
            )
            for row in rows:
                if row.user_id == user_id:
                    continue
                if row.user_id not in seen:
                    seen[row.user_id] = {
                        "user_id": row.user_id,
                        "email": row.email,
                        "display_name": row.display_name,
                        "role": row.role,
                    }

    seen.setdefault(
        OWNER_USER_ID,
        {
            "user_id": OWNER_USER_ID,
            "email": OWNER_EMAIL,
            "display_name": OWNER_NAME,
            "role": OWNER_ROLE,
        },
    )
    seen.setdefault(
        JUDITH_USER_ID,
        {
            "user_id": JUDITH_USER_ID,
            "email": JUDITH_EMAIL,
            "display_name": JUDITH_NAME,
            "role": JUDITH_ROLE,
        },
    )

    return sorted(seen.values(), key=lambda item: (item.get("display_name") or "").lower())
