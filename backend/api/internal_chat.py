import os
import re
import json
import base64
import logging
import time
from typing import Any
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from openai import OpenAI
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from agents.base_agent import BaseAgent
from core.config import settings
from core.auth import assert_request_user_matches
from database import models, schemas
from database.attendance_models import AttendanceRecord
from database.connection import get_db
from integrations.attendance.attendance_service import attendance_service
from integrations.attendance.qr_engine import qr_token_engine

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
JUDITH_TASK_AI_ENABLED = os.getenv("JUDITH_TASK_AI_ENABLED", "True") == "True"
JUDITH_TASK_PRIMARY_PROVIDER = (os.getenv("JUDITH_TASK_PRIMARY_PROVIDER", "anthropic").strip().lower() or "anthropic")
JUDITH_TASK_PRIMARY_MODEL = os.getenv("JUDITH_TASK_PRIMARY_MODEL", "").strip()
JUDITH_TASK_FALLBACK_MODELS = os.getenv(
    "JUDITH_TASK_FALLBACK_MODELS",
    "openai:gpt-4.1-mini,anthropic:claude-haiku-4-5-20251001",
).strip()
JUDITH_TASK_MAX_ITEMS = max(1, min(20, int(os.getenv("JUDITH_TASK_MAX_ITEMS", "12"))))
JUDITH_TASK_MAX_ATTEMPTS = max(1, min(5, int(os.getenv("JUDITH_TASK_MAX_ATTEMPTS", "3"))))
UPLOAD_ROOT = Path(
    os.getenv(
        "INTERNAL_CHAT_UPLOAD_DIR",
        str(Path(__file__).resolve().parent.parent / "uploads" / "internal_chat"),
    )
)
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
_TELEGRAM_CONFLICT_LOG_COOLDOWN_SECONDS = int(os.getenv("TELEGRAM_CONFLICT_LOG_COOLDOWN_SECONDS", "300"))
_telegram_conflict_last_logged_monotonic = 0.0
_TELEGRAM_POLL_FAILURE_LOG_COOLDOWN_SECONDS = int(
    os.getenv("TELEGRAM_POLL_FAILURE_LOG_COOLDOWN_SECONDS", "90")
)
_telegram_poll_failure_last_logged_monotonic = 0.0
_telegram_webhook_cleanup_attempted = False
_telegram_bot_commands_initialized = False
_telegram_pending_actions: dict[str, dict[str, Any]] = {}

TELEGRAM_BTN_GET_UPDATES = "Get Updates"
TELEGRAM_BTN_ADD_TASK = "Add New Task"
TELEGRAM_BTN_UPCOMING_3H = "Upcoming Tasks (in the next 3 hours)"
TELEGRAM_BTN_ATTENDANCE = "Attendance Link"
TELEGRAM_BTN_ATTENDANCE_STATUS = "Attendance Status"
_TELEGRAM_PENDING_TTL_MINUTES = int(os.getenv("TELEGRAM_PENDING_ACTION_TTL_MINUTES", "20"))

ZOOM_ACCOUNT_ID = (os.getenv("ZOOM_ACCOUNT_ID", "") or "").strip()
ZOOM_CLIENT_ID = (os.getenv("ZOOM_CLIENT_ID", "") or "").strip()
ZOOM_CLIENT_SECRET = (os.getenv("ZOOM_CLIENT_SECRET", "") or "").strip()
ZOOM_HOST_USER_ID = (os.getenv("ZOOM_HOST_USER_ID", "me") or "me").strip()
ZOOM_MEETING_BASE_URL = (os.getenv("ZOOM_MEETING_BASE_URL", "") or "").strip()
ZOOM_DEFAULT_DURATION_MINUTES = max(15, min(480, int(os.getenv("ZOOM_DEFAULT_DURATION_MINUTES", "60"))))
ZOOM_DEFAULT_TIMEZONE = (os.getenv("ZOOM_DEFAULT_TIMEZONE", "Asia/Tashkent") or "Asia/Tashkent").strip()
ZOOM_CONFIRMATION_WINDOW_MINUTES = max(5, min(120, int(os.getenv("ZOOM_CONFIRMATION_WINDOW_MINUTES", "45"))))
ZOOM_CONFIRMATION_PROMPT = "I detected a meeting request. Should I schedule it as a Zoom meeting? Reply: 'Zoom yes' or 'Zoom no'."
def _normalize_display_name(name: str | None, email: str | None, user_id: str) -> str:
    if name and name.strip():
        return name.strip()[:120]
    if email and email.strip():
        return email.strip().split("@", 1)[0][:120]
    return user_id[:120]


def _normalize_role(role: str | None, fallback: str = "client") -> str:
    normalized = (role or "").strip().lower()
    return normalized or fallback


def _resolve_verified_actor(
    request: Request,
    *,
    user_id: str,
    role: str | None,
    email: str | None = None,
):
    # Only the authenticated JWT subject is authoritative here.
    # Client-supplied role/email fields are compatibility inputs for older
    # payloads and query strings; they must not participate in access control.
    return assert_request_user_matches(
        request,
        user_id=(user_id or "").strip(),
    )


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


def _linked_telegram_chat_ids(
    db: Session,
    workspace_id: str | None,
    *,
    thread_id: int | None = None,
    user_id: str | None = None,
) -> list[str]:
    if not workspace_id:
        return []
    query = (
        db.query(models.InternalChatTelegramLink.telegram_chat_id)
        .filter(
            models.InternalChatTelegramLink.workspace_id == workspace_id,
            models.InternalChatTelegramLink.is_active.is_(True),
        )
    )
    if thread_id is not None:
        query = query.filter(models.InternalChatTelegramLink.thread_id == thread_id)
    if user_id:
        query = query.filter(models.InternalChatTelegramLink.user_id == user_id)
    rows = query.distinct().all()
    values: list[str] = []
    seen: set[str] = set()
    for row in rows:
        value = str(row.telegram_chat_id or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        values.append(value)
    return values


def _resolve_telegram_chat_ids(
    db: Session,
    workspace_id: str | None,
    *,
    thread_id: int | None = None,
    user_id: str | None = None,
) -> list[str]:
    linked = _linked_telegram_chat_ids(
        db,
        workspace_id,
        thread_id=thread_id,
        user_id=user_id,
    )
    if linked:
        return linked

    # Privacy-first default: never fan-out Judith task/reminder updates to
    # global/workspace fallbacks unless explicitly allowed.
    if os.getenv("INTERNAL_CHAT_TELEGRAM_ALLOW_UNSCOPED_FALLBACK", "False").strip().lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }:
        return []

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


def _deactivate_conflicting_telegram_links(db: Session) -> int:
    """
    Keep only one active link per Telegram chat ID globally to avoid
    cross-workspace leakage when legacy duplicate links exist.
    """
    rows = (
        db.query(models.InternalChatTelegramLink)
        .filter(models.InternalChatTelegramLink.is_active.is_(True))
        .order_by(
            models.InternalChatTelegramLink.telegram_chat_id.asc(),
            models.InternalChatTelegramLink.updated_at.desc(),
            models.InternalChatTelegramLink.id.desc(),
        )
        .all()
    )

    seen: set[str] = set()
    deactivate_ids: list[int] = []
    for row in rows:
        chat_id = str(row.telegram_chat_id or "").strip()
        if not chat_id:
            deactivate_ids.append(row.id)
            continue
        if chat_id in seen:
            deactivate_ids.append(row.id)
            continue
        seen.add(chat_id)

    if not deactivate_ids:
        return 0

    now_utc = datetime.utcnow()
    (
        db.query(models.InternalChatTelegramLink)
        .filter(models.InternalChatTelegramLink.id.in_(deactivate_ids))
        .update(
            {
                models.InternalChatTelegramLink.is_active: False,
                models.InternalChatTelegramLink.updated_at: now_utc,
            },
            synchronize_session=False,
        )
    )
    db.info["force_commit"] = True
    return len(deactivate_ids)


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


def _log_telegram_poll_failure(message: str):
    global _telegram_poll_failure_last_logged_monotonic
    now = time.monotonic()
    if (now - _telegram_poll_failure_last_logged_monotonic) < _TELEGRAM_POLL_FAILURE_LOG_COOLDOWN_SECONDS:
        return
    _telegram_poll_failure_last_logged_monotonic = now
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


def _telegram_send_message(
    token: str,
    chat_id: str,
    text: str,
    reply_markup: dict | None = None,
) -> bool:
    payload = {
        "chat_id": chat_id,
        "text": text[:3900],
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    response = _telegram_api_post(token=token, method="sendMessage", payload=payload)
    if response.get("ok"):
        return True
    logger.warning(
        "Telegram sendMessage failed for chat_id=%s: %s",
        chat_id,
        response.get("description") or "unknown",
    )
    return False


def _telegram_answer_callback(token: str, callback_query_id: str, text: str):
    if not callback_query_id:
        return
    _telegram_api_post(
        token=token,
        method="answerCallbackQuery",
        payload={
            "callback_query_id": callback_query_id,
            "text": text[:180],
            "show_alert": False,
        },
    )


def _telegram_main_keyboard() -> dict:
    keyboard = [
        [{"text": TELEGRAM_BTN_GET_UPDATES}, {"text": TELEGRAM_BTN_UPCOMING_3H}],
        [{"text": TELEGRAM_BTN_ADD_TASK}],
    ]
    if settings.ATTENDANCE_TELEGRAM_ENABLED:
        keyboard.append([{"text": TELEGRAM_BTN_ATTENDANCE}, {"text": TELEGRAM_BTN_ATTENDANCE_STATUS}])
    return {
        "keyboard": keyboard,
        "resize_keyboard": True,
        "one_time_keyboard": False,
        "is_persistent": True,
    }


def _attendance_help_text() -> str:
    return (
        "Benela attendance via Telegram\n"
        "Link your employee account once:\n"
        "/attendance_link your.work@email.com 1234\n\n"
        "Then use:\n"
        "/attendance - get today's secure attendance link\n"
        "/attendance_status - see your attendance status for today\n"
        "/attendance_unlink - remove this Telegram link"
    )


def _parse_attendance_link_command(text: str) -> tuple[str, str] | None:
    match = re.match(r"^/(?:attendance_link|attendancelink)(?:@\w+)?\s+(\S+)\s+(\S+)\s*$", (text or "").strip(), flags=re.IGNORECASE)
    if not match:
        return None
    return match.group(1).strip(), match.group(2).strip()


def _attendance_status_text(db: Session, employee: models.Employee) -> str:
    today = attendance_service.local_now().date()
    row = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.employee_id == employee.id,
            AttendanceRecord.work_date == today,
        )
        .first()
    )
    if not row:
        return (
            f"Attendance status for {today.isoformat()}\n"
            "No attendance has been recorded yet.\n"
            "Use /attendance to open today's secure attendance link."
        )

    clock_in = attendance_service.format_local_hhmm(row.clock_in) or "—"
    clock_out = attendance_service.format_local_hhmm(row.clock_out) or "—"
    hours = f"{float(row.hours_worked or 0):.1f}h" if row.hours_worked is not None else "—"
    return (
        f"Attendance status for {today.isoformat()}\n"
        f"Employee: {employee.full_name}\n"
        f"Status: {str(row.status.value if hasattr(row.status, 'value') else row.status).replace('_', ' ')}\n"
        f"Clock in: {clock_in}\n"
        f"Clock out: {clock_out}\n"
        f"Worked: {hours}"
    )


def _telegram_attendance_link_markup(url: str) -> dict:
    return {
        "inline_keyboard": [
            [
                {"text": "Open Attendance", "url": url},
            ]
        ]
    }


def _current_attendance_link_for_employee(db: Session, employee: models.Employee) -> tuple[str, str, int]:
    company_id = int(employee.company_id or 0)
    if company_id <= 0:
        raise HTTPException(status_code=400, detail="Employee is not attached to a company.")
    location = attendance_service.default_location(db, company_id)
    current_qr = qr_token_engine.get_or_generate_token(
        db,
        company_id=company_id,
        location_id=location.id,
        rotation_seconds=int(location.qr_rotation_seconds or 30),
    )
    attendance_access = qr_token_engine.generate_attendance_access_token(
        employee_id=int(employee.id),
        company_id=company_id,
        location_id=location.id,
        qr_token_hash=current_qr.token_hash,
        expires_at=current_qr.expires_at,
    )
    joiner = "&" if "?" in current_qr.scan_url else "?"
    return (
        f"{current_qr.scan_url}{joiner}a={urllib_parse.quote(attendance_access.token, safe='')}",
        location.name,
        attendance_access.seconds_remaining,
    )


def _handle_telegram_attendance_message(
    db: Session,
    *,
    token: str,
    chat_id: str,
    text: str,
    username: str | None,
    first_name: str | None,
) -> bool:
    if not settings.ATTENDANCE_TELEGRAM_ENABLED:
        return False

    normalized = (text or "").strip()
    lowered = normalized.lower()

    credentials = _parse_attendance_link_command(normalized)
    if credentials:
        email, pin = credentials
        employee = attendance_service.find_employee_by_email_and_pin(db, email=email, pin=pin)
        if not employee:
            _telegram_send_message(
                token=token,
                chat_id=chat_id,
                text="Could not link attendance access. Check your work email and employee PIN, then try again.",
                reply_markup=_telegram_main_keyboard(),
            )
            return True
        attendance_service.link_employee_telegram(
            db,
            employee=employee,
            chat_id=chat_id,
            username=username,
            first_name=first_name,
        )
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=(
                f"Attendance linked for {employee.full_name}.\n"
                "Use /attendance for today's secure attendance link."
            ),
            reply_markup=_telegram_main_keyboard(),
        )
        return True

    if lowered in {"/attendance_help", "/attendancehelp"}:
        _telegram_send_message(token=token, chat_id=chat_id, text=_attendance_help_text(), reply_markup=_telegram_main_keyboard())
        return True

    employee = attendance_service.find_employee_by_telegram_chat(db, chat_id)
    if lowered in {"/attendance_unlink", "/unlinkattendance"}:
        if not employee:
            _telegram_send_message(
                token=token,
                chat_id=chat_id,
                text="This Telegram chat is not currently linked to an employee attendance profile.",
                reply_markup=_telegram_main_keyboard(),
            )
            return True
        attendance_service.unlink_employee_telegram(db, employee)
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text="Attendance link removed for this Telegram chat.",
            reply_markup=_telegram_main_keyboard(),
        )
        return True

    if lowered in {"/attendance", "attendance", TELEGRAM_BTN_ATTENDANCE.lower()}:
        if not employee:
            _telegram_send_message(token=token, chat_id=chat_id, text=_attendance_help_text(), reply_markup=_telegram_main_keyboard())
            return True
        try:
            url, location_name, seconds_remaining = _current_attendance_link_for_employee(db, employee)
        except Exception as exc:
            logger.warning("Telegram attendance link generation failed for employee_id=%s: %s", employee.id, exc)
            _telegram_send_message(
                token=token,
                chat_id=chat_id,
                text="Could not generate the attendance link right now. Try again in a moment.",
                reply_markup=_telegram_main_keyboard(),
            )
            return True
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=(
                f"Today's attendance link for {employee.full_name}\n"
                f"Location: {location_name}\n"
                f"Expires in: {seconds_remaining}s"
            ),
            reply_markup=_telegram_attendance_link_markup(url),
        )
        return True

    if lowered in {"/attendance_status", "/attendancestatus", "attendance status", TELEGRAM_BTN_ATTENDANCE_STATUS.lower()}:
        if not employee:
            _telegram_send_message(token=token, chat_id=chat_id, text=_attendance_help_text(), reply_markup=_telegram_main_keyboard())
            return True
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=_attendance_status_text(db, employee),
            reply_markup=_telegram_main_keyboard(),
        )
        return True

    return False


def _telegram_task_inline_keyboard(task_id: int) -> dict:
    return {
        "inline_keyboard": [
            [
                {"text": "Edit Task", "callback_data": f"jt|et|{task_id}"},
                {"text": "Edit Time", "callback_data": f"jt|ed|{task_id}"},
                {"text": "Delete", "callback_data": f"jt|del|{task_id}"},
            ]
        ]
    }


def _telegram_task_card_text(task: models.InternalChatTask) -> str:
    due_label = _to_uz_datetime_label(task.due_at) if task.due_at else "No deadline"
    status_label = "Completed" if task.is_completed else "Open"
    return f"{task.title[:220]}\nDue: {due_label}\nStatus: {status_label}"


def _cleanup_telegram_pending_actions():
    now_utc = datetime.utcnow()
    threshold = now_utc - timedelta(minutes=max(5, _TELEGRAM_PENDING_TTL_MINUTES))
    stale_keys = [
        key
        for key, value in _telegram_pending_actions.items()
        if not isinstance(value, dict) or value.get("created_at", threshold) < threshold
    ]
    for key in stale_keys:
        _telegram_pending_actions.pop(key, None)


def _set_telegram_pending_action(chat_id: str, mode: str, thread_id: int, task_id: int | None = None):
    _cleanup_telegram_pending_actions()
    _telegram_pending_actions[chat_id] = {
        "mode": mode,
        "thread_id": thread_id,
        "task_id": task_id,
        "created_at": datetime.utcnow(),
    }


def _pop_telegram_pending_action(chat_id: str) -> dict[str, Any] | None:
    _cleanup_telegram_pending_actions()
    return _telegram_pending_actions.pop(chat_id, None)


def _peek_telegram_pending_action(chat_id: str) -> dict[str, Any] | None:
    _cleanup_telegram_pending_actions()
    return _telegram_pending_actions.get(chat_id)


def _ensure_telegram_bot_commands(token: str):
    global _telegram_bot_commands_initialized
    if _telegram_bot_commands_initialized:
        return
    commands = [
        {"command": "start", "description": "Connect bot and show your chat ID"},
        {"command": "updates", "description": "Get latest Judith updates"},
        {"command": "addtask", "description": "Add a new Judith task"},
        {"command": "upcoming", "description": "Tasks due in the next 3 hours"},
    ]
    if settings.ATTENDANCE_TELEGRAM_ENABLED:
        commands.extend(
            [
                {"command": "attendance", "description": "Open today's attendance link"},
                {"command": "attendance_status", "description": "Check today's attendance status"},
                {"command": "attendance_link", "description": "Link employee email + PIN"},
                {"command": "attendance_unlink", "description": "Remove attendance link"},
            ]
        )
    response = _telegram_api_post(
        token=token,
        method="setMyCommands",
        payload={
            "commands": commands
        },
    )
    if response.get("ok"):
        _telegram_bot_commands_initialized = True


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


def _send_telegram_reminder(
    db: Session,
    workspace_id: str | None,
    message_text: str,
    *,
    thread_id: int | None = None,
    user_id: str | None = None,
) -> int:
    if not settings.INTERNAL_CHAT_TELEGRAM_ENABLED:
        return 0

    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token:
        return 0

    chat_ids = _resolve_telegram_chat_ids(
        db,
        workspace_id,
        thread_id=thread_id,
        user_id=user_id,
    )
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
    thread_id: int,
    title: str,
    status_label: str,
    due_at: datetime | None,
    notes: str | None = None,
    task_id: int | None = None,
    user_id: str | None = None,
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
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    chat_ids = _resolve_telegram_chat_ids(
        db,
        workspace_id,
        thread_id=thread_id,
        user_id=user_id,
    )
    if not chat_ids:
        _send_telegram_reminder(
            db,
            workspace_id,
            message,
            thread_id=thread_id,
            user_id=user_id,
        )
        return

    markup = _telegram_task_inline_keyboard(task_id) if task_id else None
    sent_any = False
    if token:
        for chat_id in chat_ids:
            if _telegram_send_message(token=token, chat_id=chat_id, text=message, reply_markup=markup):
                sent_any = True

    if not sent_any:
        _send_telegram_reminder(
            db,
            workspace_id,
            message,
            thread_id=thread_id,
            user_id=user_id,
        )


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


def _normalize_zoom_join_base_url(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="zoom_join_base_url is required.")
    if not re.match(r"^https?://", value, flags=re.IGNORECASE):
        value = f"https://{value}"
    parsed = urllib_parse.urlparse(value)
    host = (parsed.netloc or "").lower()
    if parsed.scheme not in {"http", "https"} or not host:
        raise HTTPException(status_code=400, detail="Invalid Zoom URL.")
    if "zoom" not in host:
        raise HTTPException(status_code=400, detail="Zoom URL must point to a zoom domain.")
    normalized = parsed._replace(fragment="").geturl()
    return normalized[:2048]


def _serialize_zoom_link(row: models.InternalChatZoomLink) -> schemas.InternalChatZoomLinkOut:
    return schemas.InternalChatZoomLinkOut(
        id=row.id,
        workspace_id=row.workspace_id,
        thread_id=row.thread_id,
        user_id=row.user_id,
        user_role=row.user_role,
        zoom_join_base_url=row.zoom_join_base_url,
        use_for_meetings=row.use_for_meetings,
        is_active=row.is_active,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_active_zoom_link(
    db: Session,
    *,
    thread_id: int,
    user_id: str,
) -> models.InternalChatZoomLink | None:
    return (
        db.query(models.InternalChatZoomLink)
        .filter(
            models.InternalChatZoomLink.thread_id == thread_id,
            models.InternalChatZoomLink.user_id == user_id,
            models.InternalChatZoomLink.is_active.is_(True),
            models.InternalChatZoomLink.use_for_meetings.is_(True),
        )
        .order_by(models.InternalChatZoomLink.updated_at.desc(), models.InternalChatZoomLink.id.desc())
        .first()
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


def _get_latest_telegram_link_for_chat(db: Session, chat_id: str) -> models.InternalChatTelegramLink | None:
    return (
        db.query(models.InternalChatTelegramLink)
        .filter(
            models.InternalChatTelegramLink.telegram_chat_id == chat_id,
            models.InternalChatTelegramLink.is_active.is_(True),
        )
        .order_by(
            models.InternalChatTelegramLink.updated_at.desc(),
            models.InternalChatTelegramLink.id.desc(),
        )
        .first()
    )


def _telegram_open_tasks_for_thread(
    db: Session,
    thread_id: int,
    include_completed: bool = False,
    limit: int = 10,
) -> list[models.InternalChatTask]:
    query = db.query(models.InternalChatTask).filter(models.InternalChatTask.thread_id == thread_id)
    if not include_completed:
        query = query.filter(models.InternalChatTask.is_completed.is_(False))
    return (
        query.order_by(
            models.InternalChatTask.is_completed.asc(),
            models.InternalChatTask.due_at.asc(),
            models.InternalChatTask.created_at.desc(),
        )
        .limit(max(1, min(30, limit)))
        .all()
    )


def _telegram_upcoming_tasks_for_thread(
    db: Session,
    thread_id: int,
    hours: int = 3,
    limit: int = 10,
) -> list[models.InternalChatTask]:
    now_utc = datetime.utcnow()
    horizon = now_utc + timedelta(hours=max(1, min(24, hours)))
    return (
        db.query(models.InternalChatTask)
        .filter(
            models.InternalChatTask.thread_id == thread_id,
            models.InternalChatTask.is_completed.is_(False),
            models.InternalChatTask.due_at.isnot(None),
            models.InternalChatTask.due_at >= now_utc,
            models.InternalChatTask.due_at <= horizon,
        )
        .order_by(models.InternalChatTask.due_at.asc(), models.InternalChatTask.created_at.desc())
        .limit(max(1, min(30, limit)))
        .all()
    )


def _telegram_send_tasks_with_actions(
    token: str,
    chat_id: str,
    heading: str,
    tasks: list[models.InternalChatTask],
):
    _telegram_send_message(
        token=token,
        chat_id=chat_id,
        text=heading,
        reply_markup=_telegram_main_keyboard(),
    )
    if not tasks:
        _telegram_send_message(token=token, chat_id=chat_id, text="No matching tasks right now.")
        return

    for idx, task in enumerate(tasks, start=1):
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=f"{idx}. {_telegram_task_card_text(task)}",
            reply_markup=_telegram_task_inline_keyboard(task.id),
        )


def _telegram_create_task_for_link(
    db: Session,
    link: models.InternalChatTelegramLink,
    text: str,
) -> models.InternalChatTask | None:
    title = _derive_task_title(text)
    if not title:
        return None
    due_at = _extract_due_at(text)
    task = models.InternalChatTask(
        thread_id=link.thread_id,
        workspace_id=link.workspace_id,
        title=title[:255],
        notes=text.strip()[:5000] or None,
        due_at=due_at,
        created_by_user_id=link.user_id,
    )
    db.add(task)
    db.flush()
    _schedule_reminder_for_task(db, task)
    thread = db.query(models.InternalChatThread).filter(models.InternalChatThread.id == link.thread_id).first()
    if thread:
        _create_judith_message(
            db,
            thread_id=thread.id,
            body=f"Telegram added task: {task.title} (deadline: {_to_uz_datetime_label(task.due_at) if task.due_at else 'no deadline'}).",
        )
        thread.updated_at = datetime.utcnow()
    return task


def _telegram_sync_message_to_judith(
    db: Session,
    link: models.InternalChatTelegramLink,
    text: str,
    first_name: str | None,
    username: str | None,
) -> str | None:
    thread = db.query(models.InternalChatThread).filter(models.InternalChatThread.id == link.thread_id).first()
    if not thread:
        return None

    sender_name = (first_name or link.telegram_first_name or username or link.telegram_username or "Telegram User").strip()
    user_message = models.InternalChatMessage(
        thread_id=thread.id,
        sender_user_id=link.user_id,
        sender_name=sender_name[:120],
        sender_email=None,
        sender_role=link.user_role or "client",
        body=text.strip()[:6000],
    )
    db.add(user_message)
    db.flush()

    before_judith_id = (
        db.query(func.max(models.InternalChatMessage.id))
        .filter(
            models.InternalChatMessage.thread_id == thread.id,
            models.InternalChatMessage.sender_user_id == JUDITH_USER_ID,
        )
        .scalar()
        or 0
    )

    if thread.scope == "judith_assistant":
        _process_judith_instruction(db, thread=thread, sender_user_id=link.user_id, body=text)

    thread.updated_at = datetime.utcnow()

    latest_judith = (
        db.query(models.InternalChatMessage)
        .filter(
            models.InternalChatMessage.thread_id == thread.id,
            models.InternalChatMessage.sender_user_id == JUDITH_USER_ID,
            models.InternalChatMessage.id > before_judith_id,
        )
        .order_by(models.InternalChatMessage.id.desc())
        .first()
    )
    return (latest_judith.body or "").strip() if latest_judith else None


def _handle_telegram_callback_query(
    db: Session,
    token: str,
    callback_query: dict,
):
    callback_id = str(callback_query.get("id") or "").strip()
    data = str(callback_query.get("data") or "").strip()
    message = callback_query.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = str(chat.get("id") or "").strip()
    if not chat_id or not data:
        return

    link = _get_latest_telegram_link_for_chat(db, chat_id)
    if not link:
        _telegram_answer_callback(token, callback_id, "Link this chat from Benela Judith first.")
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=_build_telegram_start_instruction(chat_id),
            reply_markup=_telegram_main_keyboard(),
        )
        return

    now_utc = datetime.utcnow()
    link.last_seen_at = now_utc
    link.updated_at = now_utc

    parts = data.split("|")
    if len(parts) != 3 or parts[0] != "jt":
        _telegram_answer_callback(token, callback_id, "Unsupported action.")
        return

    action = parts[1]
    try:
        task_id = int(parts[2])
    except (TypeError, ValueError):
        _telegram_answer_callback(token, callback_id, "Invalid task.")
        return

    task = (
        db.query(models.InternalChatTask)
        .filter(
            models.InternalChatTask.id == task_id,
            models.InternalChatTask.thread_id == link.thread_id,
        )
        .first()
    )
    if not task:
        _telegram_answer_callback(token, callback_id, "Task not found.")
        return

    if action == "del":
        title = task.title[:180]
        workspace_id = task.workspace_id
        due_at = task.due_at
        notes = task.notes
        db.delete(task)
        _create_judith_message(
            db,
            thread_id=link.thread_id,
            body=f"Telegram removed task '{title}'.",
        )
        _send_telegram_task_update(
            db,
            workspace_id=workspace_id,
            thread_id=link.thread_id,
            title=title,
            status_label="Removed via Telegram",
            due_at=due_at,
            notes=notes,
            task_id=None,
            user_id=link.user_id,
        )
        _telegram_answer_callback(token, callback_id, "Task deleted.")
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=f"Deleted task: {title}",
            reply_markup=_telegram_main_keyboard(),
        )
        return

    if action == "et":
        _set_telegram_pending_action(chat_id, mode="edit_title", thread_id=link.thread_id, task_id=task.id)
        _telegram_answer_callback(token, callback_id, "Send new task title.")
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=f"Send new title for task:\n{task.title}",
            reply_markup=_telegram_main_keyboard(),
        )
        return

    if action == "ed":
        _set_telegram_pending_action(chat_id, mode="edit_due", thread_id=link.thread_id, task_id=task.id)
        _telegram_answer_callback(token, callback_id, "Send new due date/time.")
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=(
                "Send new deadline in UZT.\n"
                "Examples: 2026-03-25 14:30, tomorrow 10 am, today 18:00."
            ),
            reply_markup=_telegram_main_keyboard(),
        )
        return

    _telegram_answer_callback(token, callback_id, "Unsupported action.")


def _handle_telegram_linked_text_message(
    db: Session,
    token: str,
    chat_id: str,
    text: str,
    username: str | None,
    first_name: str | None,
):
    link = _get_latest_telegram_link_for_chat(db, chat_id)
    if not link:
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=_build_telegram_start_instruction(chat_id),
            reply_markup=_telegram_main_keyboard(),
        )
        return

    now_utc = datetime.utcnow()
    link.telegram_username = username or link.telegram_username
    link.telegram_first_name = first_name or link.telegram_first_name
    link.last_seen_at = now_utc
    link.updated_at = now_utc

    normalized = text.strip()
    lowered = normalized.lower()

    if lowered in {"/updates", "updates", TELEGRAM_BTN_GET_UPDATES.lower()}:
        all_open = _telegram_open_tasks_for_thread(db, link.thread_id, include_completed=False, limit=8)
        open_count = len(all_open)
        overdue_count = len([task for task in all_open if task.due_at and task.due_at < now_utc])
        next_due = next((task for task in all_open if task.due_at), None)
        next_due_label = _to_uz_datetime_label(next_due.due_at) if next_due else "No dated tasks"
        _telegram_send_tasks_with_actions(
            token=token,
            chat_id=chat_id,
            heading=(
                f"Judith updates\nOpen tasks: {open_count}\n"
                f"Overdue: {overdue_count}\nNext due: {next_due_label}"
            ),
            tasks=all_open,
        )
        return

    if lowered in {"/upcoming", "upcoming", TELEGRAM_BTN_UPCOMING_3H.lower()}:
        upcoming = _telegram_upcoming_tasks_for_thread(db, link.thread_id, hours=3, limit=8)
        _telegram_send_tasks_with_actions(
            token=token,
            chat_id=chat_id,
            heading="Upcoming tasks in the next 3 hours:",
            tasks=upcoming,
        )
        return

    if lowered in {"/addtask", "add task", TELEGRAM_BTN_ADD_TASK.lower()}:
        _set_telegram_pending_action(chat_id, mode="new_task", thread_id=link.thread_id)
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=(
                "Send task details in one message.\n"
                "Example: Finish iOS onboarding flow tomorrow 11:00"
            ),
            reply_markup=_telegram_main_keyboard(),
        )
        return

    pending = _peek_telegram_pending_action(chat_id)
    if pending and pending.get("thread_id") == link.thread_id:
        mode = str(pending.get("mode") or "")
        pending_task_id = pending.get("task_id")

        if mode == "new_task":
            task = _telegram_create_task_for_link(db, link, normalized)
            _pop_telegram_pending_action(chat_id)
            if not task:
                _telegram_send_message(
                    token=token,
                    chat_id=chat_id,
                    text="Could not parse task. Try: Task title + optional date/time.",
                    reply_markup=_telegram_main_keyboard(),
                )
                return
            _send_telegram_task_update(
                db,
                workspace_id=task.workspace_id,
                thread_id=task.thread_id,
                title=task.title,
                status_label="Added via Telegram",
                due_at=task.due_at,
                notes=task.notes,
                task_id=task.id,
                user_id=link.user_id,
            )
            _telegram_send_message(
                token=token,
                chat_id=chat_id,
                text=f"Task added.\n{_telegram_task_card_text(task)}",
                reply_markup=_telegram_task_inline_keyboard(task.id),
            )
            return

        task = None
        if pending_task_id:
            task = (
                db.query(models.InternalChatTask)
                .filter(
                    models.InternalChatTask.id == int(pending_task_id),
                    models.InternalChatTask.thread_id == link.thread_id,
                )
                .first()
            )
        if not task:
            _pop_telegram_pending_action(chat_id)
            _telegram_send_message(token=token, chat_id=chat_id, text="Task not found. Please retry.")
            return

        if mode == "edit_title":
            new_title = _derive_task_title(normalized)
            if not new_title:
                _telegram_send_message(
                    token=token,
                    chat_id=chat_id,
                    text="Title is empty. Send a valid task title.",
                    reply_markup=_telegram_main_keyboard(),
                )
                return
            task.title = new_title[:255]
            task.updated_at = datetime.utcnow()
            _create_judith_message(
                db,
                thread_id=link.thread_id,
                body=f"Telegram updated task title to '{task.title[:180]}'.",
            )
            _pop_telegram_pending_action(chat_id)
            _send_telegram_task_update(
                db,
                workspace_id=task.workspace_id,
                thread_id=task.thread_id,
                title=task.title,
                status_label="Edited via Telegram",
                due_at=task.due_at,
                notes=task.notes,
                task_id=task.id,
                user_id=link.user_id,
            )
            _telegram_send_message(
                token=token,
                chat_id=chat_id,
                text=f"Task title updated.\n{_telegram_task_card_text(task)}",
                reply_markup=_telegram_task_inline_keyboard(task.id),
            )
            return

        if mode == "edit_due":
            new_due = _extract_due_at(normalized) or _parse_uz_datetime_value(normalized)
            if not new_due:
                _telegram_send_message(
                    token=token,
                    chat_id=chat_id,
                    text="Could not parse date/time. Use: YYYY-MM-DD HH:MM or 'tomorrow 10 am'.",
                    reply_markup=_telegram_main_keyboard(),
                )
                return
            task.due_at = new_due
            task.updated_at = datetime.utcnow()
            _schedule_reminder_for_task(db, task)
            _create_judith_message(
                db,
                thread_id=link.thread_id,
                body=f"Telegram updated deadline for '{task.title[:180]}' to {_to_uz_datetime_label(task.due_at)}.",
            )
            _pop_telegram_pending_action(chat_id)
            _send_telegram_task_update(
                db,
                workspace_id=task.workspace_id,
                thread_id=task.thread_id,
                title=task.title,
                status_label="Deadline updated via Telegram",
                due_at=task.due_at,
                notes=task.notes,
                task_id=task.id,
                user_id=link.user_id,
            )
            _telegram_send_message(
                token=token,
                chat_id=chat_id,
                text=f"Task deadline updated.\n{_telegram_task_card_text(task)}",
                reply_markup=_telegram_task_inline_keyboard(task.id),
            )
            return

    judith_reply = _telegram_sync_message_to_judith(
        db=db,
        link=link,
        text=normalized,
        first_name=first_name,
        username=username,
    )
    if judith_reply:
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text=judith_reply,
            reply_markup=_telegram_main_keyboard(),
        )
    else:
        _telegram_send_message(
            token=token,
            chat_id=chat_id,
            text="Synced with Judith chat in Benela.",
            reply_markup=_telegram_main_keyboard(),
        )


def process_telegram_bot_updates_job(db: Session, last_update_id: int | None) -> int | None:
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    telegram_updates_enabled = settings.INTERNAL_CHAT_TELEGRAM_UPDATES_ENABLED or settings.ATTENDANCE_TELEGRAM_ENABLED
    telegram_features_enabled = settings.INTERNAL_CHAT_TELEGRAM_ENABLED or settings.ATTENDANCE_TELEGRAM_ENABLED
    if not token or not telegram_features_enabled or not telegram_updates_enabled:
        return last_update_id

    deactivated = _deactivate_conflicting_telegram_links(db)
    if deactivated:
        logger.info("Internal chat privacy cleanup deactivated %s conflicting Telegram link(s).", deactivated)

    _ensure_telegram_bot_commands(token)

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
        _log_telegram_poll_failure(f"Telegram updates polling failed: {exc}")
        return last_update_id
    except (urllib_error.URLError, TimeoutError, ValueError) as exc:
        _log_telegram_poll_failure(f"Telegram updates polling failed: {exc}")
        return last_update_id

    if not payload.get("ok"):
        _log_telegram_poll_failure(
            f"Telegram getUpdates returned not ok: {payload.get('description') or 'unknown'}"
        )
        return last_update_id

    next_update_id = last_update_id
    updates = payload.get("result", []) or []
    for update in updates:
        update_id = update.get("update_id")
        if isinstance(update_id, int):
            candidate = update_id + 1
            if next_update_id is None or candidate > next_update_id:
                next_update_id = candidate

        callback_query = update.get("callback_query")
        if callback_query:
            _handle_telegram_callback_query(db=db, token=token, callback_query=callback_query)
            continue

        message = update.get("message") or update.get("edited_message") or update.get("channel_post")
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
        if not text:
            continue

        from_user = message.get("from") or {}
        username = str(from_user.get("username") or "").strip() or None
        first_name = str(from_user.get("first_name") or "").strip() or None
        now_utc = datetime.utcnow()

        if text.lower().startswith("/start"):
            links = (
                db.query(models.InternalChatTelegramLink)
                .filter(
                    models.InternalChatTelegramLink.telegram_chat_id == chat_id,
                    models.InternalChatTelegramLink.is_active.is_(True),
                )
                .all()
            )

            if links:
                newly_verified_threads: set[int] = set()
                for link in links:
                    is_first_verification = link.last_seen_at is None
                    link.telegram_username = username or link.telegram_username
                    link.telegram_first_name = first_name or link.telegram_first_name
                    link.last_seen_at = now_utc
                    link.updated_at = now_utc
                    if is_first_verification:
                        newly_verified_threads.add(link.thread_id)

                _telegram_send_message(
                    token=token,
                    chat_id=chat_id,
                    text=(
                        "Judith is connected with your Benela workspace.\n"
                        + (
                            "Use buttons below to manage tasks quickly.\n\n" + _attendance_help_text()
                            if settings.ATTENDANCE_TELEGRAM_ENABLED
                            else "Use buttons below to manage tasks quickly."
                        )
                    ),
                    reply_markup=_telegram_main_keyboard(),
                )
                for thread_id in newly_verified_threads:
                    _create_judith_message(
                        db,
                        thread_id=thread_id,
                        body="Telegram bot connected. Task updates and reminders are active.",
                    )
            else:
                _telegram_send_message(
                    token=token,
                    chat_id=chat_id,
                    text=(
                        f"{_build_telegram_start_instruction(chat_id)}\n\n{_attendance_help_text()}"
                        if settings.ATTENDANCE_TELEGRAM_ENABLED
                        else _build_telegram_start_instruction(chat_id)
                    ),
                    reply_markup=_telegram_main_keyboard(),
                )
            continue

        if _handle_telegram_attendance_message(
            db=db,
            token=token,
            chat_id=chat_id,
            text=text,
            username=username,
            first_name=first_name,
        ):
            continue

        _handle_telegram_linked_text_message(
            db=db,
            token=token,
            chat_id=chat_id,
            text=text,
            username=username,
            first_name=first_name,
        )

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


def _contains_meeting_intent(text: str) -> bool:
    lowered = (text or "").lower()
    return bool(
        re.search(
            r"\b(meeting|meet|appointment|call|sync|standup|interview|demo|review|workshop|zoom|uchrashuv|miting)\b",
            lowered,
        )
    )


def _is_affirmative_reply(text: str) -> bool:
    normalized = re.sub(r"[^a-z0-9 ]+", " ", (text or "").strip().lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized in {
        "yes",
        "y",
        "ok",
        "okay",
        "sure",
        "ha",
        "albatta",
        "zoom yes",
        "use zoom",
        "with zoom",
    }


def _is_negative_reply(text: str) -> bool:
    normalized = re.sub(r"[^a-z0-9 ]+", " ", (text or "").strip().lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized in {
        "no",
        "n",
        "not now",
        "yoq",
        "yoq kerak emas",
        "zoom no",
        "no zoom",
        "without zoom",
    }


def _extract_zoom_preference(text: str) -> bool | None:
    lowered = f" {(text or '').lower()} "
    yes = bool(
        re.search(
            r"\b(zoom\s*(yes|ha|true|on)|with\s+zoom|use\s+zoom|schedule\s+zoom|create\s+zoom|zoom\s+meeting)\b",
            lowered,
        )
    )
    no = bool(
        re.search(
            r"\b(zoom\s*(no|false|off)|without\s+zoom|no\s+zoom|do\s+not\s+use\s+zoom|dont\s+use\s+zoom)\b",
            lowered,
        )
    )
    if yes and not no:
        return True
    if no and not yes:
        return False
    return None


def _is_zoom_confirmation_prompt_message(body: str) -> bool:
    return "reply: 'zoom yes' or 'zoom no'" in (body or "").lower()


def _find_pending_zoom_request_text(
    db: Session,
    *,
    thread_id: int,
    sender_user_id: str,
) -> str | None:
    rows = (
        db.query(models.InternalChatMessage)
        .filter(models.InternalChatMessage.thread_id == thread_id)
        .order_by(models.InternalChatMessage.created_at.desc(), models.InternalChatMessage.id.desc())
        .limit(40)
        .all()
    )
    now_utc = datetime.utcnow()
    for index, row in enumerate(rows):
        if row.sender_user_id != JUDITH_USER_ID:
            continue
        if not _is_zoom_confirmation_prompt_message(row.body):
            continue
        if row.created_at and (now_utc - row.created_at) > timedelta(minutes=ZOOM_CONFIRMATION_WINDOW_MINUTES):
            return None
        for source in rows[index + 1 :]:
            if source.sender_user_id != sender_user_id:
                continue
            source_body = (source.body or "").strip()
            if _contains_meeting_intent(source_body):
                return source_body
        return None
    return None


def _zoom_get_access_token() -> str:
    auth_raw = f"{ZOOM_CLIENT_ID}:{ZOOM_CLIENT_SECRET}".encode("utf-8")
    auth_token = base64.b64encode(auth_raw).decode("utf-8")
    url = (
        "https://zoom.us/oauth/token?"
        f"grant_type=account_credentials&account_id={urllib_parse.quote(ZOOM_ACCOUNT_ID)}"
    )
    req = urllib_request.Request(
        url=url,
        data=b"",
        headers={
            "Authorization": f"Basic {auth_token}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urllib_request.urlopen(req, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8", errors="ignore") or "{}")
    token = str(payload.get("access_token") or "").strip()
    if not token:
        raise RuntimeError("Zoom token response did not include access_token.")
    return token


def _zoom_create_meeting(
    *,
    title: str,
    due_at_utc: datetime | None,
    agenda: str | None,
    fallback_url: str | None = None,
) -> tuple[str | None, str | None, str | None]:
    # Primary path: Zoom Server-to-Server OAuth (production-ready).
    if ZOOM_ACCOUNT_ID and ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET:
        try:
            token = _zoom_get_access_token()
            start_utc = due_at_utc or (datetime.utcnow() + timedelta(minutes=15))
            start_utc = start_utc.replace(tzinfo=timezone.utc)
            payload = {
                "topic": title[:180] or "Benela Judith Meeting",
                "type": 2,
                "start_time": start_utc.isoformat().replace("+00:00", "Z"),
                "duration": ZOOM_DEFAULT_DURATION_MINUTES,
                "timezone": ZOOM_DEFAULT_TIMEZONE,
                "agenda": (agenda or "")[:700] or None,
                "settings": {
                    "join_before_host": False,
                    "waiting_room": True,
                    "participant_video": True,
                    "host_video": True,
                },
            }
            req = urllib_request.Request(
                url=f"https://api.zoom.us/v2/users/{urllib_parse.quote(ZOOM_HOST_USER_ID)}/meetings",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib_request.urlopen(req, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8", errors="ignore") or "{}")
            join_url = str(data.get("join_url") or "").strip() or None
            start_url = str(data.get("start_url") or "").strip() or None
            if join_url:
                return join_url, start_url, None
            return None, None, "Zoom API did not return a join URL."
        except Exception as exc:
            fallback_url = (fallback_url or "").strip()
            if fallback_url:
                return fallback_url, None, f"Zoom API error: {exc}"
            return None, None, f"Zoom API error: {exc}"

    # Fallback path: user/global personal Zoom meeting link.
    fallback_url = (fallback_url or "").strip()
    if fallback_url:
        return fallback_url, None, None

    return None, None, "Zoom is not configured. Add Zoom API credentials or a Zoom meeting URL."


def _create_meeting_task_from_instruction(
    db: Session,
    *,
    thread: models.InternalChatThread,
    sender_user_id: str,
    source_text: str,
    use_zoom: bool,
) -> bool:
    due_at = _extract_due_at(source_text)
    title = _derive_task_title(source_text)
    if not title or _is_assistant_name_only(title):
        title = "Meeting"
    if not _contains_meeting_intent(title):
        title = f"Meeting: {title}"

    notes_parts: list[str] = []
    cleaned_source = source_text.strip()
    if cleaned_source:
        notes_parts.append(cleaned_source[:3000])

    zoom_join_url: str | None = None
    zoom_start_url: str | None = None
    zoom_error: str | None = None

    if use_zoom:
        linked_zoom = _get_active_zoom_link(
            db,
            thread_id=thread.id,
            user_id=sender_user_id,
        )
        effective_fallback_zoom_url = (
            linked_zoom.zoom_join_base_url.strip()
            if linked_zoom and linked_zoom.zoom_join_base_url
            else ZOOM_MEETING_BASE_URL
        )
        zoom_join_url, zoom_start_url, zoom_error = _zoom_create_meeting(
            title=title,
            due_at_utc=due_at,
            agenda=cleaned_source,
            fallback_url=effective_fallback_zoom_url,
        )

        if zoom_join_url:
            notes_parts.append(f"Zoom join link: {zoom_join_url}")
        if zoom_start_url:
            notes_parts.append(f"Zoom host link: {zoom_start_url}")

    task = models.InternalChatTask(
        thread_id=thread.id,
        workspace_id=thread.workspace_id,
        title=title[:255],
        notes=("\n".join(notes_parts).strip() or None),
        due_at=due_at,
        created_by_user_id=sender_user_id,
    )
    db.add(task)
    db.flush()
    _schedule_reminder_for_task(db, task)

    _send_telegram_task_update(
        db,
        workspace_id=task.workspace_id,
        thread_id=task.thread_id,
        title=task.title,
        status_label="Added",
        due_at=task.due_at,
        notes=task.notes,
        task_id=task.id,
        user_id=sender_user_id,
    )

    if use_zoom:
        if zoom_join_url:
            ack_body = (
                f"Meeting task added. Zoom link: {zoom_join_url}"
                if not due_at
                else f"Meeting task added for {_to_uz_datetime_label(due_at)}. Zoom link: {zoom_join_url}"
            )
        else:
            setup_hint = "Open Judith Zoom setup and save your Zoom meeting URL."
            ack_body = (
                f"Meeting task added. I could not generate a Zoom link automatically. {setup_hint}"
                if not zoom_error
                else f"Meeting task added. Zoom link generation failed ({zoom_error}). {setup_hint}"
            )
    else:
        ack_body = _build_judith_ack(1, due_at)

    _create_judith_message(db, thread_id=thread.id, body=ack_body[:6000])
    return True


def _handle_judith_meeting_instruction(
    db: Session,
    *,
    thread: models.InternalChatThread,
    sender_user_id: str,
    text: str,
) -> bool:
    lowered = text.lower()
    pending_request = _find_pending_zoom_request_text(
        db,
        thread_id=thread.id,
        sender_user_id=sender_user_id,
    )
    zoom_pref = _extract_zoom_preference(text)

    if pending_request and (zoom_pref is not None or _is_affirmative_reply(text) or _is_negative_reply(text)):
        use_zoom = zoom_pref if zoom_pref is not None else _is_affirmative_reply(text)
        return _create_meeting_task_from_instruction(
            db,
            thread=thread,
            sender_user_id=sender_user_id,
            source_text=pending_request,
            use_zoom=use_zoom,
        )

    if not _contains_meeting_intent(text):
        return False

    action_signal = bool(
        re.search(
            r"\b(schedule|set|book|appoint|arrange|plan|create|add|meeting with|meet with|uchrashuv|tayinla|belgila)\b",
            lowered,
        )
    ) or bool(_extract_due_at(text))
    if not action_signal:
        return False

    if zoom_pref is None:
        _create_judith_message(
            db,
            thread_id=thread.id,
            body=ZOOM_CONFIRMATION_PROMPT,
        )
        return True

    return _create_meeting_task_from_instruction(
        db,
        thread=thread,
        sender_user_id=sender_user_id,
        source_text=text,
        use_zoom=zoom_pref,
    )


def _normalize_judith_input(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        return ""

    # Collapse multiline voice payloads to the transcript content when present.
    transcript_match = re.search(r"transcript:\s*(.+)", cleaned, flags=re.IGNORECASE | re.DOTALL)
    if transcript_match:
        cleaned = transcript_match.group(1).strip()

    # Remove leading assistant calls.
    cleaned = re.sub(
        r"^\s*(?:hey|hi|hello)?\s*(?:judith|judy|judi|judit|judith ai|judith assistant)\b[,\s:.\-]*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned or text.strip()


def _is_assistant_name_only(text: str) -> bool:
    normalized = re.sub(r"[^a-z]+", " ", text.lower()).strip()
    return normalized in {
        "judith",
        "judy",
        "judi",
        "judit",
        "hey judith",
        "hey judy",
        "hi judith",
        "hi judy",
    }


def _is_complex_project_request(text: str) -> bool:
    lowered = text.lower()
    project_keywords = {
        "rebuild",
        "redesign",
        "website",
        "platform",
        "app",
        "application",
        "migration",
        "rollout",
        "launch",
        "integration",
        "implement",
        "implementation",
        "develop",
        "development",
        "refactor",
        "revamp",
        "campaign strategy",
    }
    strategy_keywords = {"project", "roadmap", "plan", "initiative", "program"}
    has_project_signal = any(keyword in lowered for keyword in project_keywords) or any(
        keyword in lowered for keyword in strategy_keywords
    )
    has_commitment_signal = _looks_like_commitment(text) or bool(
        re.search(r"\b(need to|have to|must|should|let's|lets|start|kickoff)\b", lowered)
    )
    return has_project_signal and has_commitment_signal


def _is_meta_instruction_line(text: str) -> bool:
    lowered = (text or "").strip().lower().strip(" .:-")
    if not lowered:
        return True
    patterns = [
        r"^(here is|this is)\s+(my|our)?\s*(plan|tasks?|checklist)\b",
        r"^(my|our)\s+(plan|tasks?|checklist)\b",
        r"^(add|set|estimate|assign)\b.*\b(task|tasks|task list|deadline|deadlines)\b",
        r"^(please\s+)?(add|create)\b.*\b(task|tasks|checklist)\b",
        r"^(task|tasks|todo|checklist)\s*:?$",
    ]
    return any(re.search(pattern, lowered) for pattern in patterns)


def _extract_checklist_items(text: str) -> list[str]:
    normalized_text = _normalize_judith_input(text)
    lowered = normalized_text.lower()
    lines: list[str] = []
    numbered_lines: list[str] = []
    for line in normalized_text.splitlines():
        original_candidate = line.strip()
        candidate = original_candidate
        if not candidate:
            continue
        is_numbered = bool(re.match(r"^\s*(?:\d{1,2}[.)]|[\-\*•])\s+", original_candidate))
        candidate = re.sub(r"^[\-\*\s\[\]xX\d\.)•]+", "", candidate).strip()
        candidate = _derive_task_title(candidate)
        if candidate and not _is_assistant_name_only(candidate) and not _is_meta_instruction_line(candidate):
            lines.append(candidate[:255])
            if is_numbered:
                numbered_lines.append(candidate[:255])

    # If user provided a numbered/bulleted list, prefer those lines only.
    if len(numbered_lines) >= 2:
        return numbered_lines[:20]

    if len(lines) <= 1:
        # Split by comma only for explicit list-style text to avoid
        # turning "Judy, we need..." into separate bogus task items.
        comma_count = normalized_text.count(",")
        list_style = bool(re.search(r"\b(tasks?|todo|checklist|items?)\b\s*[:\-]", lowered))
        if comma_count >= 2 or list_style:
            comma_items = [
                _derive_task_title(item.strip())
                for item in normalized_text.split(",")
                if item.strip()
            ]
            comma_items = [
                item
                for item in comma_items
                if item and not _is_assistant_name_only(item) and not _is_meta_instruction_line(item)
            ]
            if len(comma_items) > 1:
                return [item[:255] for item in comma_items[:20]]

    return lines[:20]


def _derive_task_title(text: str) -> str:
    cleaned = _normalize_judith_input(text)
    patterns = [
        r"^(?:here is|this is)\s+(?:my|our)?\s*(?:plan|tasks?|checklist)\s*[:\-]\s*",
        r"^hey\s+(?:judith|judy|judi|judit)[,\s]*",
        r"^(?:judith|judy|judi|judit)[,\s]*",
        r"^please[,\s]*",
        r"^(?:tasks?|todo|checklist)\s*[:\-]\s*",
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
    if cleaned and not _is_assistant_name_only(cleaned):
        return cleaned[:255]

    fallback = _normalize_judith_input(text).strip(" .,-")
    if not fallback or _is_assistant_name_only(fallback):
        return ""
    return fallback[:255]


def _judith_provider_configured(provider: str) -> bool:
    normalized = (provider or "").strip().lower()
    if normalized == "openai":
        return bool(settings.OPENAI_API_KEY)
    if normalized == "anthropic":
        return bool(settings.ANTHROPIC_API_KEY)
    return False


def _judith_default_model_for_provider(provider: str) -> str:
    normalized = (provider or "").strip().lower()
    if normalized == "openai":
        return os.getenv("JUDITH_TASK_OPENAI_DEFAULT_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"
    return os.getenv("JUDITH_TASK_ANTHROPIC_DEFAULT_MODEL", "claude-haiku-4-5-20251001").strip() or "claude-haiku-4-5-20251001"


def _parse_provider_model_spec(spec: str, fallback_provider: str) -> tuple[str, str]:
    raw = (spec or "").strip()
    if not raw:
        provider = fallback_provider if fallback_provider in {"anthropic", "openai"} else "anthropic"
        return provider, _judith_default_model_for_provider(provider)

    provider = fallback_provider if fallback_provider in {"anthropic", "openai"} else "anthropic"
    model = raw
    if ":" in raw:
        maybe_provider, maybe_model = raw.split(":", 1)
        maybe_provider = maybe_provider.strip().lower()
        if maybe_provider in {"anthropic", "openai"}:
            provider = maybe_provider
            model = maybe_model.strip() or _judith_default_model_for_provider(provider)
    elif raw.startswith("gpt-"):
        provider = "openai"
    elif raw.startswith("claude-"):
        provider = "anthropic"

    if not model:
        model = _judith_default_model_for_provider(provider)
    return provider, model


def _judith_task_planner_attempts() -> list[tuple[str, str]]:
    primary_provider = JUDITH_TASK_PRIMARY_PROVIDER if JUDITH_TASK_PRIMARY_PROVIDER in {"anthropic", "openai"} else "anthropic"
    primary_model = JUDITH_TASK_PRIMARY_MODEL or _judith_default_model_for_provider(primary_provider)
    attempts: list[tuple[str, str]] = [(primary_provider, primary_model)]

    for token in re.split(r"[,\n;]+", JUDITH_TASK_FALLBACK_MODELS):
        token = token.strip()
        if not token:
            continue
        attempts.append(_parse_provider_model_spec(token, fallback_provider=primary_provider))

    # Ensure at least one opposite-provider fallback if configured.
    opposite_provider = "openai" if primary_provider == "anthropic" else "anthropic"
    attempts.append((opposite_provider, _judith_default_model_for_provider(opposite_provider)))

    deduped: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in attempts:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
        if len(deduped) >= JUDITH_TASK_MAX_ATTEMPTS:
            break
    return deduped


def _extract_json_object(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    if not text:
        return None

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"```$", "", text).strip()

    candidates = [text]
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(text[start : end + 1].strip())

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue
    return None


def _parse_uz_datetime_value(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        if value.tzinfo:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    raw = str(value).strip()
    if not raw:
        return None

    raw_clean = raw.replace("UZT", "").replace("UZ", "").strip()
    iso_candidate = raw_clean.replace("Z", "+00:00")
    try:
        parsed_iso = datetime.fromisoformat(iso_candidate)
        if parsed_iso.tzinfo:
            return parsed_iso.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        pass

    formats = [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %H:%M",
        "%d.%m.%Y %H:%M",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d.%m.%Y",
    ]
    for fmt in formats:
        try:
            local_value = datetime.strptime(raw_clean, fmt)
            if fmt in {"%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"}:
                local_value = local_value.replace(hour=18, minute=0)
            with_tz = local_value.replace(tzinfo=UZ_TZ)
            return with_tz.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            continue
    return None


def _estimate_task_duration_hours(title: str, full_text: str) -> float:
    text = f"{title} {full_text}".lower()
    rulebook: list[tuple[set[str], float]] = [
        ({"find", "finding", "research", "analysis", "benchmark", "scenario"}, 6.0),
        ({"design", "wireframe", "ux", "ui", "mockup"}, 8.0),
        ({"develop", "build", "rebuild", "implement", "integration", "code"}, 12.0),
        ({"shoot", "record", "filming", "video"}, 8.0),
        ({"edit", "post-production", "montage"}, 6.0),
        ({"upload", "publish", "posting", "distribution"}, 2.0),
        ({"meeting", "call", "sync", "interview", "standup", "review"}, 1.0),
        ({"test", "qa", "validation"}, 4.0),
    ]
    for words, hours in rulebook:
        if any(word in text for word in words):
            return hours
    return 4.0


def _round_up_to_quarter_hour(local_value: datetime) -> datetime:
    minute = local_value.minute
    rounded_minute = ((minute + 14) // 15) * 15
    if rounded_minute >= 60:
        local_value = local_value + timedelta(hours=1)
        rounded_minute = 0
    return local_value.replace(minute=rounded_minute, second=0, microsecond=0)


def _estimate_due_sequence_utc(
    task_payloads: list[dict[str, Any]],
    source_text: str,
    global_due_at_utc: datetime | None,
) -> list[datetime | None]:
    if not task_payloads:
        return []

    explicit_due = [item.get("due_at_utc") for item in task_payloads if item.get("due_at_utc")]
    if len(explicit_due) == len(task_payloads):
        return explicit_due

    now_local = _round_up_to_quarter_hour(datetime.now(UZ_TZ) + timedelta(minutes=45))
    due_values_local: list[datetime] = []

    if global_due_at_utc:
        final_local = global_due_at_utc.replace(tzinfo=timezone.utc).astimezone(UZ_TZ)
        if final_local <= now_local:
            final_local = now_local + timedelta(hours=max(2, len(task_payloads) * 2))
        step = max((final_local - now_local) / max(1, len(task_payloads)), timedelta(minutes=45))
        for index in range(len(task_payloads)):
            candidate = now_local + (step * (index + 1))
            due_values_local.append(candidate if candidate <= final_local else final_local)
    else:
        cursor = now_local
        for task in task_payloads:
            hours = float(task.get("estimated_duration_hours") or _estimate_task_duration_hours(task.get("title", ""), source_text))
            hours = min(72.0, max(0.5, hours))
            cursor = cursor + timedelta(hours=hours)
            due_values_local.append(cursor)

    normalized: list[datetime | None] = []
    for idx, task in enumerate(task_payloads):
        explicit = task.get("due_at_utc")
        if explicit:
            normalized.append(explicit)
            continue
        fallback_local = due_values_local[min(idx, len(due_values_local) - 1)]
        normalized.append(fallback_local.astimezone(timezone.utc).replace(tzinfo=None))
    return normalized


def _force_judith_autoplan(text: str) -> bool:
    lowered = (text or "").strip().lower()
    patterns = [
        r"\bjust add tasks?\b",
        r"\badd .* to task ?list\b",
        r"\banaly[sz]e (and )?add .*yourself\b",
        r"\bno more information\b",
        r"\bi (do not|don't) know\b",
        r"\bi have already told you\b",
        r"\byou needed to analy[sz]e\b",
        r"\bstop asking\b",
    ]
    return any(re.search(pattern, lowered) for pattern in patterns)


def _collect_recent_context_text(db: Session, thread_id: int, limit: int = 24) -> str:
    rows = (
        db.query(models.InternalChatMessage)
        .filter(models.InternalChatMessage.thread_id == thread_id)
        .order_by(models.InternalChatMessage.created_at.desc(), models.InternalChatMessage.id.desc())
        .limit(max(4, min(60, limit)))
        .all()
    )
    rows.reverse()
    snippets: list[str] = []
    for row in rows:
        body = (row.body or "").strip()
        if not body:
            continue
        sender = (row.sender_name or row.sender_user_id or "User").strip()
        snippets.append(f"{sender}: {body[:600]}")
    return "\n".join(snippets)


def _extract_project_name(text: str) -> str | None:
    match = re.search(r"\bname\s*[:\-]\s*([A-Za-z0-9 _\-]{2,80})", text, flags=re.IGNORECASE)
    if not match:
        return None
    name = re.sub(r"\s+", " ", match.group(1)).strip(" .,-")
    return name[:80] if name else None


def _generate_project_tasks_from_context(
    combined_text: str,
    due_at_utc: datetime | None,
) -> list[dict[str, Any]]:
    lowered = (combined_text or "").lower()
    project_name = _extract_project_name(combined_text) or "Project"

    platform_label = "Mobile app"
    if "ios" in lowered and "android" in lowered:
        platform_label = "iOS + Android app"
    elif "ios" in lowered:
        platform_label = "iOS app"
    elif "android" in lowered:
        platform_label = "Android app"

    features: list[str] = []
    if "expense" in lowered:
        features.append("Expense tracking")
    if "income" in lowered:
        features.append("Income tracking")
    if "budget" in lowered:
        features.append("Budget planning")
    if "report" in lowered:
        features.append("Reporting dashboard")
    if "investment" in lowered:
        features.append("Investment review")
    if "recommend" in lowered or "ai" in lowered:
        features.append("AI recommendations")
    if not features:
        features = ["Core financial tracking features"]

    raw_tasks: list[dict[str, Any]] = [
        {
            "title": f"{project_name}: scope and PRD freeze",
            "notes": f"Finalize MVP scope, acceptance criteria, and release plan for {platform_label}.",
            "estimated_duration_hours": 6.0,
        },
        {
            "title": f"{project_name}: UX flows and wireframes",
            "notes": "Create onboarding, home, expense/income entry, and reports user flows.",
            "estimated_duration_hours": 10.0,
        },
        {
            "title": f"{project_name}: high-fidelity UI kit and prototype",
            "notes": "Build final mobile UI screens and clickable prototype for approval.",
            "estimated_duration_hours": 12.0,
        },
        {
            "title": f"{project_name}: iOS architecture and project setup",
            "notes": "Set up app structure, navigation, state management, and analytics scaffolding.",
            "estimated_duration_hours": 8.0,
        },
        {
            "title": f"{project_name}: authentication and registration flow",
            "notes": "Implement signup/login/session management and profile basics.",
            "estimated_duration_hours": 8.0,
        },
    ]

    for feature in features:
        raw_tasks.append(
            {
                "title": f"{project_name}: implement {feature.lower()}",
                "notes": f"Develop, integrate, and validate {feature.lower()} end-to-end.",
                "estimated_duration_hours": 10.0 if feature != "AI recommendations" else 12.0,
            }
        )

    raw_tasks.extend(
        [
            {
                "title": f"{project_name}: QA test plan and regression cycle",
                "notes": "Prepare test cases, run full QA pass, and verify bug fixes.",
                "estimated_duration_hours": 10.0,
            },
            {
                "title": f"{project_name}: release candidate and App Store submission",
                "notes": "Finalize build, compliance checklist, metadata, and submission artifacts.",
                "estimated_duration_hours": 6.0,
            },
            {
                "title": f"{project_name}: final product review and launch sign-off",
                "notes": "Conduct end-of-cycle review and approve production release.",
                "estimated_duration_hours": 4.0,
            },
        ]
    )

    tasks = raw_tasks[:JUDITH_TASK_MAX_ITEMS]
    due_values = _estimate_due_sequence_utc(tasks, source_text=combined_text, global_due_at_utc=due_at_utc)
    for idx, task in enumerate(tasks):
        if idx < len(due_values):
            task["due_at_utc"] = due_values[idx]
    return tasks


def _build_judith_planner_prompt(text: str, context_text: str | None = None, force_execute: bool = False) -> str:
    now_label = datetime.now(UZ_TZ).strftime("%Y-%m-%d %H:%M")
    context_block = f"\nRecent conversation context:\n{context_text.strip()[:6000]}\n" if context_text and context_text.strip() else ""
    force_rule = (
        "\n- USER EXPLICITLY ASKED TO PROCEED WITHOUT MORE QUESTIONS. "
        "Do not ask clarification; generate best-effort tasks with assumptions."
        if force_execute
        else ""
    )
    return (
        "Task request to analyze:\n"
        f"{text.strip()}\n\n"
        f"{context_block}"
        "You are Judith task parser for Benela internal chat. "
        "Timezone is Asia/Tashkent (UZT). Current local time: "
        f"{now_label} UZT.\n\n"
        "Return ONLY valid JSON with this schema:\n"
        "{\n"
        '  "intent": "create_tasks" | "clarify" | "answer" | "none",\n'
        '  "ack": "short response for user (<= 160 chars)",\n'
        '  "clarification": "question if intent=clarify",\n'
        '  "global_due_at_uz": "YYYY-MM-DD HH:MM" | null,\n'
        '  "tasks": [\n'
        "    {\n"
        '      "title": "task title",\n'
        '      "notes": "optional short notes",\n'
        '      "due_at_uz": "YYYY-MM-DD HH:MM" | null,\n'
        '      "estimated_duration_hours": number\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- Split user plan/checklist into actionable tasks.\n"
        "- Never return assistant names as a task title.\n"
        "- If request is too broad/ambiguous, use intent=clarify and ask concise follow-up.\n"
        "- If user asks a question about tasks, use intent=answer and provide short direct ack.\n"
        "- Prefer due_at_uz for each task; when not explicit estimate realistic sequence.\n"
        f"- Keep tasks count between 1 and {JUDITH_TASK_MAX_ITEMS}."
        f"{force_rule}"
    )


def _run_judith_task_planner(text: str, context_text: str | None = None, force_execute: bool = False) -> dict[str, Any] | None:
    if not JUDITH_TASK_AI_ENABLED:
        return None

    if not (settings.ANTHROPIC_API_KEY or settings.OPENAI_API_KEY):
        return None

    planner_agent = BaseAgent(
        name="Judith Task Planner",
        system_prompt=(
            "You convert internal chat instructions into structured tasks for execution. "
            "Always return strict JSON only."
        ),
    )

    attempts = _judith_task_planner_attempts()
    if not attempts:
        return None

    planner_prompt = _build_judith_planner_prompt(text, context_text=context_text, force_execute=force_execute)
    errors: list[str] = []

    for provider, model in attempts:
        if not _judith_provider_configured(provider):
            continue
        try:
            raw = planner_agent.run(
                user_message=planner_prompt,
                context="",
                model=model,
                provider=provider,
                temperature=0.1,
            )
            parsed = _extract_json_object(raw)
            if not parsed:
                errors.append(f"{provider}:{model}:invalid_json")
                continue

            raw_tasks = parsed.get("tasks")
            tasks: list[dict[str, Any]] = []
            if isinstance(raw_tasks, list):
                for item in raw_tasks[:JUDITH_TASK_MAX_ITEMS]:
                    if not isinstance(item, dict):
                        continue
                    title = _derive_task_title(str(item.get("title") or ""))
                    if not title or _is_assistant_name_only(title):
                        continue
                    notes_value = str(item.get("notes") or "").strip()
                    due_at_utc = _parse_uz_datetime_value(item.get("due_at_uz") or item.get("due_at"))
                    duration_raw = item.get("estimated_duration_hours")
                    try:
                        duration_value = float(duration_raw) if duration_raw is not None else None
                    except (TypeError, ValueError):
                        duration_value = None
                    tasks.append(
                        {
                            "title": title[:255],
                            "notes": notes_value[:5000] if notes_value else None,
                            "due_at_utc": due_at_utc,
                            "estimated_duration_hours": duration_value,
                        }
                    )

            intent_raw = str(parsed.get("intent") or "").strip().lower()
            if intent_raw not in {"create_tasks", "clarify", "answer", "none"}:
                intent_raw = "create_tasks" if tasks else "none"

            ack = str(parsed.get("ack") or "").strip()
            clarification = str(parsed.get("clarification") or "").strip()
            global_due = _parse_uz_datetime_value(parsed.get("global_due_at_uz"))

            estimated_due = _estimate_due_sequence_utc(tasks, source_text=text, global_due_at_utc=global_due)
            for idx, due_value in enumerate(estimated_due):
                if idx < len(tasks) and not tasks[idx].get("due_at_utc"):
                    tasks[idx]["due_at_utc"] = due_value

            return {
                "intent": intent_raw,
                "ack": ack[:220],
                "clarification": clarification[:600],
                "tasks": tasks,
                "provider": provider,
                "model": model,
            }
        except Exception as exc:
            errors.append(f"{provider}:{model}:{str(exc)}")
            continue

    if errors:
        logger.warning("Judith task planner fallback to deterministic parser. Errors: %s", " | ".join(errors[:4]))
    return None


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


def _participant_id_set(thread: models.InternalChatThread) -> set[str]:
    return {item.user_id for item in (thread.participants or [])}


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
        db.query(models.InternalChatParticipant)
        .filter(
            models.InternalChatParticipant.thread_id == thread_id,
            models.InternalChatParticipant.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You do not have access to this conversation.")

    thread = (
        db.query(models.InternalChatThread)
        .options(selectinload(models.InternalChatThread.participants))
        .filter(models.InternalChatThread.id == thread_id)
        .first()
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")

    participant_ids = _participant_id_set(thread)
    if thread.scope == "judith_assistant":
        expected = {user_id, JUDITH_USER_ID}
        if participant_ids != expected:
            raise HTTPException(status_code=403, detail="You do not have access to this conversation.")
    if thread.scope == "owner_direct":
        expected = {user_id, OWNER_USER_ID}
        if participant_ids != expected:
            raise HTTPException(status_code=403, detail="You do not have access to this conversation.")

    return


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


def _has_recent_judith_message(
    db: Session,
    thread_id: int,
    contains_text: str,
    within_hours: int = 24,
) -> bool:
    needle = (contains_text or "").strip().lower()
    if not needle:
        return False
    threshold = datetime.utcnow() - timedelta(hours=max(1, within_hours))
    row = (
        db.query(models.InternalChatMessage.id)
        .filter(
            models.InternalChatMessage.thread_id == thread_id,
            models.InternalChatMessage.sender_user_id == JUDITH_USER_ID,
            models.InternalChatMessage.created_at >= threshold,
            func.lower(models.InternalChatMessage.body).contains(needle),
        )
        .first()
    )
    return row is not None


def _schedule_reminder_for_task(
    db: Session,
    task: models.InternalChatTask,
    reminder_minutes: int = DEFAULT_REMINDER_MINUTES,
):
    if not task.due_at:
        return

    lead_minutes = max(1, reminder_minutes)
    remind_at = task.due_at - timedelta(minutes=lead_minutes)

    (
        db.query(models.InternalChatTaskReminder)
        .filter(models.InternalChatTaskReminder.task_id == task.id)
        .filter(models.InternalChatTaskReminder.sent_at.is_(None))
        .delete(synchronize_session=False)
    )

    # Reminder #1: before deadline.
    db.add(
        models.InternalChatTaskReminder(
            task_id=task.id,
            thread_id=task.thread_id,
            workspace_id=task.workspace_id,
            remind_at=remind_at,
        )
    )
    # Reminder #2: exactly at deadline.
    db.add(
        models.InternalChatTaskReminder(
            task_id=task.id,
            thread_id=task.thread_id,
            workspace_id=task.workspace_id,
            remind_at=task.due_at,
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
            thread_id=thread.id,
            user_id=next(
                (
                    participant.user_id
                    for participant in (thread.participants or [])
                    if participant.user_id != JUDITH_USER_ID
                ),
                None,
            ),
        )
    return True


def _process_judith_instruction(
    db: Session,
    thread: models.InternalChatThread,
    sender_user_id: str,
    body: str,
) -> bool:
    text = _normalize_judith_input(body)
    if not text:
        return False

    if _handle_task_control_command(db, thread, text):
        return True

    if _handle_judith_meeting_instruction(
        db,
        thread=thread,
        sender_user_id=sender_user_id,
        text=text,
    ):
        return True

    conversation_context = _collect_recent_context_text(db, thread.id, limit=28)
    force_autoplan = _force_judith_autoplan(text)
    ai_plan = _run_judith_task_planner(
        text,
        context_text=conversation_context,
        force_execute=force_autoplan,
    )
    if ai_plan:
        planned_tasks: list[dict[str, Any]] = ai_plan.get("tasks") or []
        plan_intent = str(ai_plan.get("intent") or "").lower()
        plan_ack = str(ai_plan.get("ack") or "").strip()
        plan_clarification = str(ai_plan.get("clarification") or "").strip()

        if force_autoplan and not planned_tasks:
            due_hint = _extract_due_at(f"{conversation_context}\n{text}")
            planned_tasks = _generate_project_tasks_from_context(
                combined_text=f"{conversation_context}\n{text}",
                due_at_utc=due_hint,
            )
            plan_intent = "create_tasks"
            if planned_tasks and not plan_ack:
                plan_ack = (
                    f"Understood. I created {len(planned_tasks)} structured tasks with estimated UZT deadlines."
                )

        if plan_intent == "clarify" and not planned_tasks:
            _create_judith_message(
                db,
                thread_id=thread.id,
                body=plan_clarification or plan_ack or "Please clarify scope, owners, and target deadline (UZT).",
            )
            return True

        if plan_intent == "answer" and not planned_tasks:
            direct_answer = plan_ack or _suggest_judith_response_for_question(db, thread, text)
            if direct_answer:
                _create_judith_message(db, thread_id=thread.id, body=direct_answer)
                return True

        if planned_tasks:
            created_tasks: list[models.InternalChatTask] = []
            for task_payload in planned_tasks:
                due_at_utc = task_payload.get("due_at_utc")
                task = models.InternalChatTask(
                    thread_id=thread.id,
                    workspace_id=thread.workspace_id,
                    title=str(task_payload.get("title") or "").strip()[:255],
                    notes=(str(task_payload.get("notes") or "").strip()[:5000] or (text[:5000] if len(planned_tasks) == 1 else None)),
                    due_at=due_at_utc,
                    created_by_user_id=sender_user_id,
                )
                if not task.title:
                    continue
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
                        thread_id=task.thread_id,
                        title=task.title,
                        status_label="Added",
                        due_at=task.due_at,
                        notes=task.notes,
                        task_id=task.id,
                        user_id=sender_user_id,
                    )
                else:
                    due_items = [task.due_at for task in created_tasks if task.due_at]
                    due_summary = (
                        f"{_to_uz_datetime_label(min(due_items))} -> {_to_uz_datetime_label(max(due_items))}"
                        if due_items
                        else "Estimated per task"
                    )
                    preview = ", ".join(task.title[:70] for task in created_tasks[:4])
                    if len(created_tasks) > 4:
                        preview = f"{preview}, +{len(created_tasks) - 4} more"
                    _send_telegram_reminder(
                        db,
                        thread.workspace_id,
                        (
                            "Benela Judith Update\n"
                            f"Workspace: {thread.workspace_id}\n"
                            f"Added tasks: {len(created_tasks)}\n"
                            f"Timeline: {due_summary}\n"
                            f"Items: {preview}"
                        ),
                        thread_id=thread.id,
                        user_id=sender_user_id,
                    )

                ack_text = plan_ack
                if not ack_text:
                    due_items = [task.due_at for task in created_tasks if task.due_at]
                    if len(created_tasks) > 1 and due_items:
                        ack_text = (
                            f"Added {len(created_tasks)} tasks. "
                            f"Estimated timeline: {_to_uz_datetime_label(min(due_items))} to {_to_uz_datetime_label(max(due_items))}."
                        )
                    else:
                        ack_text = _build_judith_ack(
                            len(created_tasks),
                            created_tasks[0].due_at if len(created_tasks) == 1 else (max(due_items) if due_items else None),
                        )
                _create_judith_message(db, thread_id=thread.id, body=ack_text[:6000])
                return True

    if force_autoplan:
        due_hint = _extract_due_at(f"{conversation_context}\n{text}")
        generated_tasks = _generate_project_tasks_from_context(
            combined_text=f"{conversation_context}\n{text}",
            due_at_utc=due_hint,
        )
        if generated_tasks:
            created_tasks: list[models.InternalChatTask] = []
            for task_payload in generated_tasks:
                task = models.InternalChatTask(
                    thread_id=thread.id,
                    workspace_id=thread.workspace_id,
                    title=str(task_payload.get("title") or "").strip()[:255],
                    notes=(str(task_payload.get("notes") or "").strip()[:5000] or None),
                    due_at=task_payload.get("due_at_utc"),
                    created_by_user_id=sender_user_id,
                )
                if not task.title:
                    continue
                db.add(task)
                db.flush()
                _schedule_reminder_for_task(db, task)
                created_tasks.append(task)

            if created_tasks:
                due_items = [task.due_at for task in created_tasks if task.due_at]
                due_text = (
                    f"{_to_uz_datetime_label(min(due_items))} to {_to_uz_datetime_label(max(due_items))}"
                    if due_items
                    else "without fixed deadlines"
                )
                _create_judith_message(
                    db,
                    thread_id=thread.id,
                    body=f"I created {len(created_tasks)} tasks with estimated timeline {due_text}.",
                )
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
    complex_request = _is_complex_project_request(text)

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

    # Large project requests need structured clarification before task creation.
    if complex_request and len(items) <= 1 and not numeric_match:
        deadline_hint = (
            f"- Target deadline (UZT): currently parsed as {_to_uz_datetime_label(due_at)}; confirm or update."
            if due_at
            else "- Target deadline (UZT): date and time."
        )
        _create_judith_message(
            db,
            thread_id=thread.id,
            body=(
                "Understood. Before I create tasks, please confirm:\n"
                "1) Scope: exact pages/features/modules to rebuild.\n"
                "2) Breakdown: how many tasks/workstreams.\n"
                "3) Owners: who is responsible for each part.\n"
                f"{deadline_hint}\n"
                "Reply in one message, and I will generate a structured task plan."
            ),
        )
        return True

    if not items:
        items = [_derive_task_title(text)]
    elif explicit_action and len(items) == 1:
        items = [_derive_task_title(items[0])]
    items = [item for item in items if item]
    if not items:
        _create_judith_message(
            db,
            thread_id=thread.id,
            body="I need a clearer action line. Example: 'tomorrow 10:00 redesign homepage draft'.",
        )
        return True

    if numeric_match and len(items) == 1:
        count = min(10, max(1, int(numeric_match.group(1))))
        base = _derive_task_title(items[0])
        items = [f"{base} - item {index}" for index in range(1, count + 1)]

    created_tasks: list[models.InternalChatTask] = []
    fallback_due_payloads = [{"title": title, "due_at_utc": None} for title in items]
    fallback_due_values = _estimate_due_sequence_utc(
        fallback_due_payloads,
        source_text=text,
        global_due_at_utc=due_at,
    )
    for index, title in enumerate(items):
        task_due_at = due_at if len(items) == 1 else fallback_due_values[min(index, len(fallback_due_values) - 1)]
        task = models.InternalChatTask(
            thread_id=thread.id,
            workspace_id=thread.workspace_id,
            title=(title or _derive_task_title(text))[:255],
            notes=text if len(items) == 1 else None,
            due_at=task_due_at,
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
                thread_id=task.thread_id,
                title=task.title,
                status_label="Added",
                due_at=task.due_at,
                notes=task.notes,
                task_id=task.id,
                user_id=sender_user_id,
            )
        else:
            due_values = [task.due_at for task in created_tasks if task.due_at]
            due_label = (
                f"{_to_uz_datetime_label(min(due_values))} -> {_to_uz_datetime_label(max(due_values))}"
                if due_values
                else "No deadline"
            )
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
            _send_telegram_reminder(
                db,
                thread.workspace_id,
                summary,
                thread_id=thread.id,
                user_id=sender_user_id,
            )

    ack_due = None
    if created_tasks:
        due_values = [task.due_at for task in created_tasks if task.due_at]
        if len(created_tasks) == 1:
            ack_due = created_tasks[0].due_at
        elif due_values:
            ack_due = max(due_values)
    _create_judith_message(db, thread_id=thread.id, body=_build_judith_ack(len(created_tasks), ack_due))
    return True


def _dispatch_due_reminders(
    db: Session,
    workspace_id: str | None,
    for_user_id: str | None = None,
) -> int:
    _deactivate_conflicting_telegram_links(db)

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
    if for_user_id:
        query = query.join(
            models.InternalChatParticipant,
            models.InternalChatParticipant.thread_id == models.InternalChatTaskReminder.thread_id,
        ).filter(models.InternalChatParticipant.user_id == for_user_id)

    due_reminders = query.limit(50).all()
    touched_threads: set[int] = set()
    processed = 0

    for reminder in due_reminders:
        task = db.query(models.InternalChatTask).filter(models.InternalChatTask.id == reminder.task_id).first()
        if not task or task.is_completed:
            reminder.sent_at = now_utc
            continue

        thread = (
            db.query(models.InternalChatThread)
            .options(selectinload(models.InternalChatThread.participants))
            .filter(models.InternalChatThread.id == task.thread_id)
            .first()
        )
        if not thread:
            reminder.sent_at = now_utc
            continue

        if for_user_id and thread.scope == "judith_assistant":
            expected = {for_user_id, JUDITH_USER_ID}
            if _participant_id_set(thread) != expected:
                # Skip legacy/shared Judith threads for user-scoped dispatch.
                continue

        due_label = _to_uz_datetime_label(task.due_at)
        is_deadline_trigger = bool(task.due_at and reminder.remind_at >= (task.due_at - timedelta(minutes=1)))
        if is_deadline_trigger:
            reminder_body = (
                f"Deadline reached: '{task.title}' ({due_label}). "
                "Should I remove this task or reschedule it?"
            )
            telegram_message = (
                "Benela Judith Reminder\n"
                f"Workspace: {task.workspace_id}\n"
                f"Task deadline reached: {task.title}\n"
                f"Due: {due_label}\n"
                "Reply in Benela: remove task or reschedule."
            )
        else:
            reminder_body = f"Reminder: '{task.title}' is due at {due_label}."
            telegram_message = (
                "Benela Judith Reminder\n"
                f"Workspace: {task.workspace_id}\n"
                f"Task: {task.title}\n"
                f"Due: {due_label}"
            )
        _create_judith_message(db, thread_id=task.thread_id, body=reminder_body)
        _send_telegram_reminder(
            db,
            task.workspace_id,
            telegram_message,
            thread_id=task.thread_id,
            user_id=next(
                (
                    participant.user_id
                    for participant in (thread.participants or [])
                    if participant.user_id != JUDITH_USER_ID
                ),
                None,
            ),
        )

        # Backfill: for old tasks that only had one pre-deadline reminder,
        # ensure a due-at reminder is still scheduled.
        if task.due_at and not is_deadline_trigger and reminder.remind_at < task.due_at:
            has_due_pending = (
                db.query(models.InternalChatTaskReminder.id)
                .filter(
                    models.InternalChatTaskReminder.task_id == task.id,
                    models.InternalChatTaskReminder.sent_at.is_(None),
                    models.InternalChatTaskReminder.remind_at >= (task.due_at - timedelta(minutes=1)),
                )
                .first()
            )
            if not has_due_pending:
                db.add(
                    models.InternalChatTaskReminder(
                        task_id=task.id,
                        thread_id=task.thread_id,
                        workspace_id=task.workspace_id,
                        remind_at=task.due_at,
                    )
                )

        reminder.sent_at = now_utc
        touched_threads.add(task.thread_id)
        processed += 1

    for thread_id in touched_threads:
        row = db.query(models.InternalChatThread).filter(models.InternalChatThread.id == thread_id).first()
        if row:
            row.updated_at = now_utc

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
    request: Request,
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=user_id,
        is_super_admin=auth_user.is_admin,
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


@router.get(
    "/threads/{thread_id}/judith/telegram-links",
    response_model=list[schemas.InternalChatTelegramLinkOut],
)
def list_judith_telegram_links(
    request: Request,
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=user_id,
        is_super_admin=auth_user.is_admin,
    )

    rows = (
        db.query(models.InternalChatTelegramLink)
        .filter(
            models.InternalChatTelegramLink.thread_id == thread.id,
            models.InternalChatTelegramLink.is_active.is_(True),
        )
        .order_by(
            models.InternalChatTelegramLink.last_seen_at.desc().nullslast(),
            models.InternalChatTelegramLink.updated_at.desc(),
            models.InternalChatTelegramLink.id.desc(),
        )
        .all()
    )
    return [_serialize_telegram_link(row) for row in rows]


@router.post(
    "/threads/{thread_id}/judith/telegram-link",
    response_model=schemas.InternalChatTelegramLinkOut,
)
def upsert_judith_telegram_link(
    thread_id: int,
    payload: schemas.InternalChatTelegramLinkCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    normalized_user_id = (payload.user_id or "").strip()
    if not normalized_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    auth_user = _resolve_verified_actor(request, user_id=normalized_user_id, role=payload.user_role)

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=normalized_user_id,
        is_super_admin=auth_user.is_admin,
    )

    chat_id = _normalize_telegram_chat_id(payload.telegram_chat_id)
    now_utc = datetime.utcnow()
    incoming_username = (payload.telegram_username or "").strip() or None
    incoming_first_name = (payload.telegram_first_name or "").strip() or None
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

    created_new_link = link is None
    previous_chat_id = (link.telegram_chat_id if link else "") or ""
    already_verified = bool(link and link.last_seen_at)
    changed_chat_id = created_new_link or (previous_chat_id != chat_id)

    # Enforce one active Judith link per Telegram chat ID globally.
    # This prevents one Telegram account from receiving updates for multiple
    # unrelated client workspaces/threads due to stale links.
    (
        db.query(models.InternalChatTelegramLink)
        .filter(
            models.InternalChatTelegramLink.telegram_chat_id == chat_id,
            models.InternalChatTelegramLink.is_active.is_(True),
            or_(
                models.InternalChatTelegramLink.thread_id != thread.id,
                models.InternalChatTelegramLink.user_id != normalized_user_id,
            ),
        )
        .update(
            {
                models.InternalChatTelegramLink.is_active: False,
                models.InternalChatTelegramLink.updated_at: now_utc,
            },
            synchronize_session=False,
        )
    )

    if link:
        changed_profile = False
        if changed_chat_id:
            link.telegram_chat_id = chat_id
            changed_profile = True
        if incoming_username and incoming_username != (link.telegram_username or ""):
            link.telegram_username = incoming_username
            changed_profile = True
        if incoming_first_name and incoming_first_name != (link.telegram_first_name or ""):
            link.telegram_first_name = incoming_first_name
            changed_profile = True
        if changed_profile:
            link.updated_at = now_utc
    else:
        link = models.InternalChatTelegramLink(
            workspace_id=thread.workspace_id,
            thread_id=thread.id,
            user_id=normalized_user_id,
            user_role=auth_user.role,
            telegram_chat_id=chat_id,
            telegram_username=incoming_username,
            telegram_first_name=incoming_first_name,
            is_active=True,
            last_seen_at=None,
        )
        db.add(link)
        db.flush()

    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    can_contact_bot = bool(settings.INTERNAL_CHAT_TELEGRAM_ENABLED and token)
    connected_now = False
    should_ping_bot = can_contact_bot and (changed_chat_id or not already_verified)
    if should_ping_bot:
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

    # Avoid repeating setup prompts for already-linked users.
    if changed_chat_id:
        if connected_now:
            _create_judith_message(
                db,
                thread_id=thread.id,
                body=(
                    f"Telegram linked to @{TELEGRAM_BOT_USERNAME} (chat ID: {chat_id}). "
                    "Deadline reminders are now active in Telegram."
                ),
            )
        elif not _has_recent_judith_message(db, thread.id, "send /start", within_hours=48):
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


@router.delete(
    "/threads/{thread_id}/judith/telegram-link/{link_id}",
    response_model=schemas.InternalChatTelegramLinkOut,
)
def delete_judith_telegram_link(
    request: Request,
    thread_id: int,
    link_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    normalized_user_id = (user_id or "").strip()
    if not normalized_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    auth_user = _resolve_verified_actor(request, user_id=normalized_user_id, role=user_role)

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=normalized_user_id,
        is_super_admin=auth_user.is_admin,
    )

    link = (
        db.query(models.InternalChatTelegramLink)
        .filter(
            models.InternalChatTelegramLink.id == link_id,
            models.InternalChatTelegramLink.thread_id == thread.id,
            models.InternalChatTelegramLink.is_active.is_(True),
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Telegram link not found.")

    now_utc = datetime.utcnow()
    link.is_active = False
    link.updated_at = now_utc
    thread.updated_at = now_utc
    db.commit()
    db.refresh(link)
    return _serialize_telegram_link(link)


@router.get(
    "/threads/{thread_id}/judith/zoom-link",
    response_model=schemas.InternalChatZoomLinkOut | None,
)
def get_judith_zoom_link(
    request: Request,
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    normalized_user_id = (user_id or "").strip()
    if not normalized_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    auth_user = _resolve_verified_actor(request, user_id=normalized_user_id, role=user_role)

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=normalized_user_id,
        is_super_admin=auth_user.is_admin,
    )

    link = (
        db.query(models.InternalChatZoomLink)
        .filter(
            models.InternalChatZoomLink.thread_id == thread.id,
            models.InternalChatZoomLink.user_id == normalized_user_id,
            models.InternalChatZoomLink.is_active.is_(True),
        )
        .order_by(models.InternalChatZoomLink.updated_at.desc(), models.InternalChatZoomLink.id.desc())
        .first()
    )
    if not link:
        return None
    return _serialize_zoom_link(link)


@router.post(
    "/threads/{thread_id}/judith/zoom-link",
    response_model=schemas.InternalChatZoomLinkOut,
)
def upsert_judith_zoom_link(
    thread_id: int,
    payload: schemas.InternalChatZoomLinkCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    normalized_user_id = (payload.user_id or "").strip()
    if not normalized_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    auth_user = _resolve_verified_actor(request, user_id=normalized_user_id, role=payload.user_role)

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=normalized_user_id,
        is_super_admin=auth_user.is_admin,
    )

    zoom_url = _normalize_zoom_join_base_url(payload.zoom_join_base_url)
    now_utc = datetime.utcnow()

    link = (
        db.query(models.InternalChatZoomLink)
        .filter(
            models.InternalChatZoomLink.thread_id == thread.id,
            models.InternalChatZoomLink.user_id == normalized_user_id,
            models.InternalChatZoomLink.is_active.is_(True),
        )
        .order_by(models.InternalChatZoomLink.updated_at.desc(), models.InternalChatZoomLink.id.desc())
        .first()
    )

    created = link is None
    if link:
        link.zoom_join_base_url = zoom_url
        link.use_for_meetings = bool(payload.use_for_meetings)
        link.user_role = auth_user.role
        link.updated_at = now_utc
    else:
        link = models.InternalChatZoomLink(
            workspace_id=thread.workspace_id,
            thread_id=thread.id,
            user_id=normalized_user_id,
            user_role=auth_user.role,
            zoom_join_base_url=zoom_url,
            use_for_meetings=bool(payload.use_for_meetings),
            is_active=True,
        )
        db.add(link)
        db.flush()

    thread.updated_at = now_utc
    if created or not _has_recent_judith_message(db, thread.id, "zoom", within_hours=24):
        _create_judith_message(
            db,
            thread_id=thread.id,
            body=(
                "Zoom setup saved. I will ask for Zoom confirmation on meeting requests "
                "and attach this Zoom link when you choose 'Zoom yes'."
            ),
        )
    db.commit()
    db.refresh(link)
    return _serialize_zoom_link(link)


@router.get("/threads", response_model=list[schemas.InternalChatThreadOut])
def list_threads(
    request: Request,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    workspace_id: str | None = Query(None),
    limit: int = Query(60, ge=1, le=200),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    super_admin = auth_user.is_admin

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
    if not super_admin:
        expected_judith_ids = {user_id, JUDITH_USER_ID}
        expected_owner_direct_ids = {user_id, OWNER_USER_ID}
        filtered: list[models.InternalChatThread] = []
        for row in rows:
            participant_ids = _participant_id_set(row)
            if row.scope == "judith_assistant" and participant_ids != expected_judith_ids:
                continue
            if row.scope == "owner_direct" and participant_ids != expected_owner_direct_ids:
                continue
            filtered.append(row)
        rows = filtered

    latest_by_thread = _latest_messages_by_thread(db, [row.id for row in rows])
    return [_serialize_thread(row, latest_by_thread.get(row.id)) for row in rows]


@router.post("/threads/bridge", response_model=schemas.InternalChatThreadOut)
def open_workspace_bridge(
    payload: schemas.InternalChatBridgeOpen,
    request: Request,
    db: Session = Depends(get_db),
):
    workspace_id = payload.workspace_id.strip()
    requester_user_id = payload.requester_user_id.strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if not requester_user_id:
        raise HTTPException(status_code=400, detail="requester_user_id is required.")
    auth_user = _resolve_verified_actor(
        request,
        user_id=requester_user_id,
        role=payload.requester_role,
        email=payload.requester_email,
    )

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
        email=auth_user.email,
        display_name=payload.requester_name,
        role=auth_user.role,
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
    request: Request,
    db: Session = Depends(get_db),
):
    workspace_id = payload.workspace_id.strip()
    requester_user_id = payload.requester_user_id.strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if not requester_user_id:
        raise HTTPException(status_code=400, detail="requester_user_id is required.")
    auth_user = _resolve_verified_actor(
        request,
        user_id=requester_user_id,
        role=payload.requester_role,
        email=payload.requester_email,
    )

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
        email=auth_user.email,
        display_name=payload.requester_name,
        role=auth_user.role,
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
    request: Request,
    db: Session = Depends(get_db),
):
    workspace_id = payload.workspace_id.strip()
    requester_user_id = payload.requester_user_id.strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if not requester_user_id:
        raise HTTPException(status_code=400, detail="requester_user_id is required.")
    auth_user = _resolve_verified_actor(
        request,
        user_id=requester_user_id,
        role=payload.requester_role,
        email=payload.requester_email,
    )

    candidates = (
        db.query(models.InternalChatThread)
        .filter(
            models.InternalChatThread.workspace_id == workspace_id,
            models.InternalChatThread.scope == "judith_assistant",
        )
        .options(selectinload(models.InternalChatThread.participants))
        .order_by(models.InternalChatThread.updated_at.desc(), models.InternalChatThread.id.desc())
        .all()
    )

    thread = None
    expected_ids = {requester_user_id, JUDITH_USER_ID}
    for candidate in candidates:
        if _participant_id_set(candidate) == expected_ids:
            thread = candidate
            break

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
        email=auth_user.email,
        display_name=payload.requester_name,
        role=auth_user.role,
    )
    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=JUDITH_USER_ID,
        email=JUDITH_EMAIL,
        display_name=JUDITH_NAME,
        role=JUDITH_ROLE,
    )

    # Hard-enforce isolated 1:1 Judith threads (client <-> Judith) to prevent
    # legacy participant leakage (e.g. owner/global users) in client chats.
    (
        db.query(models.InternalChatParticipant)
        .filter(
            models.InternalChatParticipant.thread_id == thread.id,
            models.InternalChatParticipant.user_id.notin_([requester_user_id, JUDITH_USER_ID]),
        )
        .delete(synchronize_session=False)
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
    request: Request,
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
    auth_user = _resolve_verified_actor(
        request,
        user_id=requester_user_id,
        role=payload.requester_role,
        email=payload.requester_email,
    )

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
        email=auth_user.email,
        display_name=payload.requester_name,
        role=auth_user.role,
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
    request: Request,
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    _get_thread_or_404(db, thread_id)
    _assert_thread_access(db, thread_id=thread_id, user_id=user_id, is_super_admin=auth_user.is_admin)

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
    request: Request,
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=user_id,
        is_super_admin=auth_user.is_admin,
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
    request: Request,
    message_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
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
        is_super_admin=auth_user.is_admin,
    )
    _assert_thread_scope(thread, {"judith_assistant"})

    # Regular members can remove their own messages and Judith assistant messages.
    if not auth_user.is_admin:
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
    request: Request,
    db: Session = Depends(get_db),
):
    sender_user_id = payload.sender_user_id.strip()
    if not sender_user_id:
        raise HTTPException(status_code=400, detail="sender_user_id is required.")
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body cannot be empty.")
    auth_user = _resolve_verified_actor(
        request,
        user_id=sender_user_id,
        role=payload.sender_role,
        email=payload.sender_email,
    )

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=sender_user_id,
        is_super_admin=auth_user.is_admin,
    )

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=sender_user_id,
        email=auth_user.email,
        display_name=payload.sender_name,
        role=auth_user.role,
    )

    row = models.InternalChatMessage(
        thread_id=thread.id,
        sender_user_id=sender_user_id,
        sender_name=_normalize_display_name(payload.sender_name, auth_user.email, sender_user_id),
        sender_email=auth_user.email,
        sender_role=auth_user.role,
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
    request: Request,
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
    auth_user = _resolve_verified_actor(
        request,
        user_id=normalized_sender,
        role=sender_role,
        email=sender_email,
    )

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=normalized_sender,
        is_super_admin=auth_user.is_admin,
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
        email=auth_user.email,
        display_name=sender_name,
        role=auth_user.role,
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
        sender_name=_normalize_display_name(sender_name, auth_user.email, normalized_sender),
        sender_email=auth_user.email,
        sender_role=auth_user.role,
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
    request: Request,
    attachment_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    attachment = db.query(models.InternalChatAttachment).filter(models.InternalChatAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found.")

    _assert_thread_access(
        db,
        thread_id=attachment.thread_id,
        user_id=user_id,
        is_super_admin=auth_user.is_admin,
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
    request: Request,
    thread_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(db, thread_id=thread.id, user_id=user_id, is_super_admin=auth_user.is_admin)

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
    return [row for row in rows if not _is_assistant_name_only(row.title or "")]


@router.post("/threads/{thread_id}/judith/tasks", response_model=schemas.InternalChatTaskOut)
def create_judith_task(
    thread_id: int,
    payload: schemas.InternalChatTaskCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    creator_user_id = payload.creator_user_id.strip()
    if not creator_user_id:
        raise HTTPException(status_code=400, detail="creator_user_id is required.")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Task title is required.")
    if _is_assistant_name_only(title):
        raise HTTPException(status_code=400, detail="Task title is too vague. Please provide a real task.")
    auth_user = _resolve_verified_actor(
        request,
        user_id=creator_user_id,
        role=payload.creator_role,
        email=payload.creator_email,
    )

    thread = _get_thread_or_404(db, thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=creator_user_id,
        is_super_admin=auth_user.is_admin,
    )

    _ensure_participant(
        db=db,
        thread_id=thread.id,
        user_id=creator_user_id,
        email=auth_user.email,
        display_name=payload.creator_name,
        role=auth_user.role,
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
        thread_id=row.thread_id,
        title=row.title,
        status_label="Added",
        due_at=row.due_at,
        notes=row.notes,
        task_id=row.id,
        user_id=creator_user_id,
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
    request: Request,
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=payload.user_id, role=payload.user_role)
    task = db.query(models.InternalChatTask).filter(models.InternalChatTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    thread = _get_thread_or_404(db, task.thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=payload.user_id,
        is_super_admin=auth_user.is_admin,
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
    elif task.due_at:
        _schedule_reminder_for_task(db, task)

    action = "completed" if task.is_completed else "reopened"
    _create_judith_message(db, thread.id, f"Judith marked task '{task.title[:120]}' as {action}.")
    _send_telegram_task_update(
        db,
        workspace_id=task.workspace_id,
        thread_id=task.thread_id,
        title=task.title,
        status_label="Completed" if task.is_completed else "Reopened",
        due_at=task.due_at,
        notes=task.notes,
        task_id=task.id,
        user_id=payload.user_id,
    )

    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.delete("/judith/tasks/{task_id}")
def delete_judith_task(
    request: Request,
    task_id: int,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    task = db.query(models.InternalChatTask).filter(models.InternalChatTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    thread = _get_thread_or_404(db, task.thread_id)
    _assert_thread_scope(thread, {"judith_assistant"})
    _assert_thread_access(
        db,
        thread_id=thread.id,
        user_id=user_id,
        is_super_admin=auth_user.is_admin,
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
        thread_id=task.thread_id,
        title=task_title,
        status_label="Removed",
        due_at=task_due,
        notes=task_notes,
        task_id=None,
        user_id=user_id,
    )
    thread.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/judith/reminders", response_model=list[schemas.InternalChatTaskOut])
def list_judith_reminders(
    request: Request,
    user_id: str = Query(...),
    user_role: str = Query("client"),   
    workspace_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    super_admin = auth_user.is_admin
    now_utc = datetime.utcnow()
    horizon = now_utc + timedelta(hours=48)

    _dispatch_due_reminders(db, workspace_id=workspace_id, for_user_id=None if super_admin else user_id)
    db.commit()

    query = (
        db.query(models.InternalChatTask)
        .join(models.InternalChatThread, models.InternalChatThread.id == models.InternalChatTask.thread_id)
        .options(
            selectinload(models.InternalChatTask.thread).selectinload(models.InternalChatThread.participants)
        )
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
        query = query.join(
            models.InternalChatParticipant,
            models.InternalChatParticipant.thread_id == models.InternalChatTask.thread_id,
        ).filter(models.InternalChatParticipant.user_id == user_id)

    rows = query.limit(limit).all()
    if not super_admin:
        expected = {user_id, JUDITH_USER_ID}
        rows = [
            row
            for row in rows
            if row.thread and row.thread.scope == "judith_assistant" and _participant_id_set(row.thread) == expected
        ]
    return rows


@router.get("/contacts")
def list_contacts(
    request: Request,
    user_id: str = Query(...),
    user_role: str = Query("client"),
    workspace_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    auth_user = _resolve_verified_actor(request, user_id=user_id, role=user_role)
    super_admin = auth_user.is_admin
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
        member_threads_query = (
            db.query(models.InternalChatThread)
            .join(
                models.InternalChatParticipant,
                models.InternalChatParticipant.thread_id == models.InternalChatThread.id,
            )
            .filter(models.InternalChatParticipant.user_id == user_id)
            .options(selectinload(models.InternalChatThread.participants))
        )
        if workspace_id:
            member_threads_query = member_threads_query.filter(models.InternalChatThread.workspace_id == workspace_id)

        candidate_threads = member_threads_query.distinct().all()
        thread_ids: list[int] = []
        for thread in candidate_threads:
            participant_ids = _participant_id_set(thread)
            if thread.scope == "judith_assistant":
                expected = {user_id, JUDITH_USER_ID}
                if participant_ids != expected:
                    continue
            if thread.scope == "owner_direct":
                expected = {user_id, OWNER_USER_ID}
                if participant_ids != expected:
                    continue
            thread_ids.append(thread.id)

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
