import base64
import logging
import os
import socket
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from openai import (
    APIConnectionError,
    APIStatusError,
    AuthenticationError,
    BadRequestError,
    OpenAI,
    RateLimitError,
)
from pydantic import BaseModel, Field

from agents.base_agent import BaseAgent
from agents.data_fetcher import get_context_for_section
from agents.finance_agent import FinanceAgent
from core.config import settings
from database import admin_crud
from database.connection import SessionLocal, get_db
from integrations.onec.service import audit_onec_ai_query, resolve_company_account
from sqlalchemy.orm import Session

router = APIRouter()
logger = logging.getLogger("uvicorn.error")


MAX_ATTACHMENT_TEXT_CHARS = 12000
MAX_TOTAL_ATTACHMENT_CONTEXT_CHARS = 24000
MAX_ATTACHMENTS = 5
MAX_BASE64_CHARS = 16000000
MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024
OPENAI_TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe").strip() or "gpt-4o-mini-transcribe"
AGENT_PROVIDER_FAILOVER_ENABLED = os.getenv("AGENT_PROVIDER_FAILOVER_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
AGENT_CONTEXT_TIMEOUT_SECONDS = max(1.0, float(os.getenv("AGENT_CONTEXT_TIMEOUT_SECONDS", "6")))
AI_TRAINER_CONTEXT_TIMEOUT_SECONDS = max(1.0, float(os.getenv("AI_TRAINER_CONTEXT_TIMEOUT_SECONDS", "4")))
AI_TRAINER_RUNTIME_CONTEXT_MAX_CHARS = max(2000, int(os.getenv("AI_TRAINER_RUNTIME_CONTEXT_MAX_CHARS", "12000")))
AI_PROVIDER_TIMEOUT_SECONDS = max(3.0, float(os.getenv("AI_PROVIDER_TIMEOUT_SECONDS", "15")))
AI_ROUTE_TIMEOUT_SECONDS = max(8.0, float(os.getenv("AI_ROUTE_TIMEOUT_SECONDS", "35")))


class AgentAttachment(BaseModel):
    file_name: str
    mime_type: str | None = None
    size_bytes: int = 0
    text_content: str | None = None
    base64_data: str | None = None
    encoding: str | None = None


class TaskRequest(BaseModel):
    message: str
    model: str | None = None
    provider: str | None = None
    data_source: Literal["benela", "onec_combined"] | None = None
    attachments: list[AgentAttachment] = Field(default_factory=list)


class TaskResponse(BaseModel):
    agent: str
    message: str
    response: str


class TranscriptionResponse(BaseModel):
    text: str


def _probe_https_host(host: str, timeout_seconds: float = 2.5) -> tuple[bool, str]:
    try:
        with socket.create_connection((host, 443), timeout=timeout_seconds):
            return True, "reachable"
    except Exception as exc:
        return False, str(exc)


def get_agent(section: str) -> BaseAgent:
    if section == "finance":
        return FinanceAgent()
    if section == "hr":
        return BaseAgent(
            name="HR Agent",
            system_prompt=(
                "You are an expert AI assistant for the HR module of Benela AI. "
                "You have access to real employee, attendance, leave, and payroll data. "
                "Answer using employee names, not IDs. "
                "Format times as HH:MM and dates as DD.MM.YYYY. "
                "Format currency as UZS with spaces as thousand separators. "
                "Explain payroll calculations clearly and flag late, absent, leave, overtime, and payroll approval issues when relevant. "
                "Never use markdown. Plain text only."
            ),
        )

    section_label = section.replace("_", " ").title()
    return BaseAgent(
        name=f"{section_label} Agent",
        system_prompt=(
            f"You are an expert AI assistant for the {section_label} module "
            f"of Benela AI, an enterprise ERP platform. "
            f"RULES: "
            f"1. Use the real data provided - reference actual numbers and names. "
            f"2. Never use markdown - no #, **, -, or bullet symbols. Plain text only. "
            f"3. Never say you lack real-time access. You have live data. "
            f"4. Be concise - 3-5 sentences max unless asked for detail. "
            f"5. Give direct answers, never ask clarifying questions first."
        ),
    )


def _provider_is_configured(provider: str) -> bool:
    if provider == "openai":
        return bool(settings.OPENAI_API_KEY)
    if provider == "anthropic":
        return bool(settings.ANTHROPIC_API_KEY)
    return False


def _pick_first_available_provider(preferred: str) -> str:
    if _provider_is_configured(preferred):
        return preferred
    alternate = "openai" if preferred == "anthropic" else "anthropic"
    if _provider_is_configured(alternate):
        return alternate
    return preferred


def _infer_provider_from_model(model: str | None) -> str | None:
    if not model:
        return None
    normalized = model.strip().lower()
    if not normalized:
        return None
    if normalized.startswith("gpt-"):
        return "openai"
    if normalized.startswith("claude-"):
        return "anthropic"
    return None


def _safe_get_section_context(section: str, company_id: int | None = None, include_onec: bool = True) -> str:
    """Protect agent requests from slow/stuck DB context fetches."""
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="agent-context")
    future = executor.submit(get_context_for_section, section, company_id, include_onec)
    try:
        return future.result(timeout=AGENT_CONTEXT_TIMEOUT_SECONDS)
    except FutureTimeoutError:
        logger.warning("Context fetch timed out for section=%s after %.1fs", section, AGENT_CONTEXT_TIMEOUT_SECONDS)
        future.cancel()
        return (
            "Note: Live context fetch timed out. "
            "Provide a concise answer based on available message and attachments."
        )
    except Exception as exc:
        logger.warning("Context fetch failed for section=%s: %s", section, str(exc))
        return f"Note: Live context fetch failed ({str(exc)}). Provide a concise fallback answer."
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def _alternate_provider(provider: str) -> str | None:
    alt = "openai" if provider == "anthropic" else "anthropic"
    if _provider_is_configured(alt):
        return alt
    return None


def _load_training_context(
    section: str,
    query: str,
    max_context_chars: int,
    max_chunks: int = 8,
) -> str:
    db = SessionLocal()
    try:
        return admin_crud.get_ai_trainer_training_context(
            db=db,
            section=section,
            query=query,
            max_context_chars=max_context_chars,
            max_chunks=max_chunks,
        )
    finally:
        db.close()


def _safe_get_training_context(
    section: str,
    query: str,
    max_context_chars: int,
    max_chunks: int = 8,
) -> str:
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="agent-trainer")
    future = executor.submit(_load_training_context, section, query, max_context_chars, max_chunks)
    try:
        return future.result(timeout=AI_TRAINER_CONTEXT_TIMEOUT_SECONDS)
    except FutureTimeoutError:
        logger.warning(
            "Trainer context fetch timed out for section=%s after %.1fs",
            section,
            AI_TRAINER_CONTEXT_TIMEOUT_SECONDS,
        )
        future.cancel()
        return ""
    except Exception as exc:
        logger.warning("Trainer context fetch failed for section=%s: %s", section, str(exc))
        return ""
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def _same_provider_fast_fallback_model(provider: str, model: str | None) -> str | None:
    normalized = (model or "").strip().lower()
    if provider == "openai":
        if normalized == "gpt-4.1":
            return "gpt-4.1-mini"
        if normalized == "gpt-4o":
            return "gpt-4o-mini"
        return None
    if provider == "anthropic":
        if normalized in {"claude-sonnet-4-5-20250929", "claude-opus-4-1-20250805"}:
            return "claude-haiku-4-5-20251001"
    return None


def _remaining_agent_budget(started_at: float) -> float:
    elapsed = time.monotonic() - started_at
    return max(0.0, AI_ROUTE_TIMEOUT_SECONDS - elapsed)


def _get_openai_client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="Transcription is not configured. Add OPENAI_API_KEY.")
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def _normalize_base64_data(raw: str | None) -> str:
    if not raw:
        return ""
    candidate = raw.strip()
    if not candidate:
        return ""
    if candidate.startswith("data:") and ";base64," in candidate:
        candidate = candidate.split(";base64,", 1)[1].strip()
    return candidate


def _decode_base64_data(raw: str | None) -> bytes | None:
    normalized = _normalize_base64_data(raw)
    if not normalized:
        return None
    if len(normalized) > MAX_BASE64_CHARS:
        return None
    try:
        return base64.b64decode(normalized, validate=True)
    except Exception:
        return None


def _transcribe_audio_bytes(payload: bytes, file_name: str, mime_type: str | None) -> str:
    if not payload:
        return ""
    if len(payload) > MAX_AUDIO_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file is too large. Maximum size is {MAX_AUDIO_FILE_BYTES // (1024 * 1024)} MB.",
        )

    safe_name = file_name.strip() if file_name else "voice-note.webm"
    suffix = Path(safe_name).suffix or (".m4a" if "mp4" in (mime_type or "") else ".webm")
    if not Path(safe_name).suffix:
        safe_name = f"{Path(safe_name).stem}{suffix}"

    audio_file = BytesIO(payload)
    audio_file.name = safe_name

    client = _get_openai_client()
    try:
        result = client.audio.transcriptions.create(
            model=OPENAI_TRANSCRIBE_MODEL,
            file=audio_file,
        )
    except Exception:
        if OPENAI_TRANSCRIBE_MODEL == "whisper-1":
            raise
        audio_file.seek(0)
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
        )
    return (getattr(result, "text", "") or "").strip()


def _extract_pdf_text(payload: bytes) -> str:
    if not payload:
        return ""
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        return ""

    try:
        reader = PdfReader(BytesIO(payload))
        chunks: list[str] = []
        for page in reader.pages:
            page_text = (page.extract_text() or "").strip()
            if page_text:
                chunks.append(page_text)
        return "\n".join(chunks).strip()
    except Exception:
        return ""


def _build_attachment_context(attachments: list[AgentAttachment]) -> tuple[str, list[dict]]:
    if not attachments:
        return "", []

    lines: list[str] = ["USER ATTACHED FILES (use this content as evidence when relevant):"]
    total_chars = 0
    multimodal_blocks: list[dict] = []

    for idx, attachment in enumerate(attachments[:MAX_ATTACHMENTS], start=1):
        name = attachment.file_name.strip() or f"file-{idx}"
        mime = attachment.mime_type.strip() if attachment.mime_type else "application/octet-stream"
        size = max(0, int(attachment.size_bytes or 0))
        base64_raw = _normalize_base64_data(attachment.base64_data)
        binary_payload = _decode_base64_data(base64_raw)
        content = (attachment.text_content or "").strip()

        if not content and mime == "application/pdf" and binary_payload:
            content = _extract_pdf_text(binary_payload)

        if not content and mime.startswith("audio/") and binary_payload:
            try:
                transcript = _transcribe_audio_bytes(binary_payload, name, mime)
                if transcript:
                    content = f"[Audio transcription]\n{transcript}"
                else:
                    content = "[Audio file attached, but no speech was detected.]"
            except Exception:
                content = "[Audio file attached, but transcription could not be completed.]"

        if mime.startswith("image/") and base64_raw and binary_payload:
            multimodal_blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime,
                        "data": base64_raw,
                    },
                }
            )
            if not content:
                content = "[Image attached and provided to the model for visual analysis.]"

        if not content:
            content = (
                "[Binary attachment available. File metadata included. "
                "If deeper extraction is required, enable server-side parser integration for this format.]"
            )
        else:
            content = content[:MAX_ATTACHMENT_TEXT_CHARS]

        block = (
            f"\n[File {idx}] {name}\n"
            f"MIME: {mime}\n"
            f"Size: {size} bytes\n"
            f"Content:\n{content}\n"
        )
        if total_chars + len(block) > MAX_TOTAL_ATTACHMENT_CONTEXT_CHARS:
            break
        lines.append(block)
        total_chars += len(block)

    return "\n".join(lines).strip(), multimodal_blocks


@router.get("/health")
def agents_health():
    openai_configured = bool(settings.OPENAI_API_KEY)
    anthropic_configured = bool(settings.ANTHROPIC_API_KEY)
    openai_reachable, openai_note = _probe_https_host("api.openai.com")
    anthropic_reachable, anthropic_note = _probe_https_host("api.anthropic.com")
    return {
        "status": "ok",
        "providers": {
            "openai": {
                "configured": openai_configured,
                "https_reachable": openai_reachable,
                "network_note": openai_note,
            },
            "anthropic": {
                "configured": anthropic_configured,
                "https_reachable": anthropic_reachable,
                "network_note": anthropic_note,
            },
        },
        "timeouts": {
            "provider_timeout_seconds": AI_PROVIDER_TIMEOUT_SECONDS,
            "context_timeout_seconds": AGENT_CONTEXT_TIMEOUT_SECONDS,
            "route_timeout_seconds": AI_ROUTE_TIMEOUT_SECONDS,
        },
        "advice": (
            "At least one provider must be configured and reachable. "
            "If configured=true but https_reachable=false, check outbound network/DNS in cloud runtime."
        ),
    }


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    try:
        text = _transcribe_audio_bytes(
            payload=payload,
            file_name=file.filename or "voice-note.webm",
            mime_type=file.content_type,
        )
    except HTTPException:
        raise
    except RateLimitError as exc:
        message = str(exc).lower()
        if "insufficient_quota" in message or "exceeded your current quota" in message:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Transcription provider quota is exhausted. "
                    "Add billing/credits to OPENAI_API_KEY or configure a fallback transcription provider."
                ),
            )
        raise HTTPException(
            status_code=429,
            detail="Transcription rate limit reached. Please retry in a few seconds.",
        )
    except AuthenticationError:
        raise HTTPException(
            status_code=503,
            detail="Transcription authentication failed. Verify OPENAI_API_KEY.",
        )
    except APIConnectionError:
        raise HTTPException(
            status_code=503,
            detail="Transcription provider is unreachable. Check outbound network/DNS from backend.",
        )
    except BadRequestError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Audio could not be processed: {str(exc)}",
        )
    except APIStatusError:
        raise HTTPException(
            status_code=503,
            detail="Transcription provider returned an unexpected error.",
        )
    except Exception:
        logger.exception("Unexpected transcription failure")
        raise HTTPException(status_code=503, detail="Audio transcription service is temporarily unavailable.")

    if not text:
        raise HTTPException(status_code=422, detail="No speech detected in the provided audio.")

    return TranscriptionResponse(text=text)


@router.post("/{section}", response_model=TaskResponse)
def run_agent(section: str, payload: TaskRequest, http_request: Request, db: Session = Depends(get_db)):
    """Send a message to the AI agent with real data context."""

    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    request_started_at = time.monotonic()

    try:
        # 1) Pick the right agent
        agent = get_agent(section)

        company_id: int | None = None
        onec_audit_user_id: str | None = None
        if section in {"finance", "dashboard"}:
            try:
                account = resolve_company_account(http_request, db)
                company_id = account.client_org_id
                onec_audit_user_id = account.user_id
            except Exception:
                company_id = None

        include_onec = payload.data_source != "benela"

        # 2) Pull live context for this section
        context = _safe_get_section_context(section, company_id=company_id, include_onec=include_onec)
        requested_provider = (payload.provider or "").strip().lower()
        explicit_user_selection = bool((payload.provider or "").strip()) or bool((payload.model or "").strip())
        if requested_provider in {"anthropic", "openai"}:
            runtime_provider = requested_provider
        else:
            runtime_provider = _infer_provider_from_model(payload.model) or _pick_first_available_provider("anthropic")
        runtime_model = payload.model
        runtime_temperature: float | None = None
        runtime_instructions = ""

        trainer_profile = admin_crud.get_ai_trainer_runtime_profile(db, section)
        if trainer_profile and trainer_profile.is_enabled:
            runtime_instructions = (trainer_profile.system_instructions or "").strip()
            runtime_temperature = float(trainer_profile.temperature or 0.2)
            if trainer_profile.model:
                runtime_model = trainer_profile.model

            preferred_provider = (trainer_profile.provider or "auto").strip().lower()
            if preferred_provider in {"anthropic", "openai"}:
                runtime_provider = preferred_provider
            else:
                model_hint = (runtime_model or "").strip().lower()
                runtime_provider = "openai" if model_hint.startswith("gpt-") else "anthropic"

            trained_context = _safe_get_training_context(
                section=section,
                query=payload.message,
                max_context_chars=min(
                    int(trainer_profile.max_context_chars or 12000),
                    AI_TRAINER_RUNTIME_CONTEXT_MAX_CHARS,
                ),
                max_chunks=8,
            )
            if trained_context:
                context = f"{context}\n\n{trained_context}".strip()

        attachment_context, multimodal_blocks = _build_attachment_context(payload.attachments)
        if attachment_context:
            context = f"{context}\n\n{attachment_context}"

        # 3) Run model with injected context
        providers_to_try: list[str] = []
        if _provider_is_configured(runtime_provider):
            providers_to_try.append(runtime_provider)
        fallback_provider = (
            _alternate_provider(runtime_provider)
            if AGENT_PROVIDER_FAILOVER_ENABLED and not explicit_user_selection
            else None
        )
        if fallback_provider and fallback_provider not in providers_to_try:
            providers_to_try.append(fallback_provider)
        if not providers_to_try:
            raise HTTPException(
                status_code=503,
                detail="No AI provider is configured. Add ANTHROPIC_API_KEY and/or OPENAI_API_KEY.",
            )
        if providers_to_try[0] != runtime_provider:
            logger.warning(
                "Primary AI provider is not configured for section=%s: requested=%s using=%s",
                section,
                runtime_provider,
                providers_to_try[0],
            )

        response: str | None = None
        last_error: Exception | None = None
        for provider_name in providers_to_try:
            remaining_budget = _remaining_agent_budget(request_started_at)
            if remaining_budget <= 2.0:
                last_error = TimeoutError("AI request timed out before provider execution could complete.")
                break
            provider_timeout = min(AI_PROVIDER_TIMEOUT_SECONDS, max(3.0, remaining_budget - 1.0))
            try:
                response = agent.run(
                    payload.message,
                    context=context,
                    model=runtime_model,
                    provider=provider_name,
                    temperature=runtime_temperature,
                    extra_system_instructions=runtime_instructions,
                    user_blocks=multimodal_blocks,
                    timeout_seconds=provider_timeout,
                )
                if provider_name != runtime_provider:
                    logger.warning(
                        "AI provider failover used for section=%s: primary=%s fallback=%s",
                        section,
                        runtime_provider,
                        provider_name,
                    )
                break
            except Exception as exc:
                last_error = exc
                fallback_model = None
                error_text = str(exc).lower()
                if "timeout" in error_text or "timed out" in error_text:
                    fallback_model = _same_provider_fast_fallback_model(provider_name, runtime_model)
                if fallback_model:
                    fallback_remaining = _remaining_agent_budget(request_started_at)
                    if fallback_remaining > 3.0:
                        fallback_timeout = min(max(3.0, fallback_remaining - 1.0), max(4.0, provider_timeout - 2.0))
                        try:
                            response = agent.run(
                                payload.message,
                                context=context,
                                model=fallback_model,
                                provider=provider_name,
                                temperature=runtime_temperature,
                                extra_system_instructions=runtime_instructions,
                                user_blocks=multimodal_blocks,
                                timeout_seconds=fallback_timeout,
                            )
                            logger.warning(
                                "AI same-provider model fallback used for section=%s provider=%s primary_model=%s fallback_model=%s",
                                section,
                                provider_name,
                                runtime_model,
                                fallback_model,
                            )
                            break
                        except Exception as fallback_exc:
                            last_error = fallback_exc
                logger.warning(
                    "AI provider call failed for section=%s provider=%s timeout=%.1fs error=%s",
                    section,
                    provider_name,
                    provider_timeout,
                    str(last_error),
                )
                continue

        if response is None:
            if last_error is not None:
                raise last_error
            raise RuntimeError("No AI response produced.")

        if include_onec and company_id is not None:
            audit_onec_ai_query(
                company_id=company_id,
                user_id=onec_audit_user_id,
                section=section,
                prompt=payload.message,
                success=True,
            )

        return TaskResponse(
            agent=agent.name,
            message=payload.message,
            response=response,
        )

    except HTTPException:
        if "include_onec" in locals() and include_onec and "company_id" in locals() and company_id is not None:
            audit_onec_ai_query(
                company_id=company_id,
                user_id=locals().get("onec_audit_user_id"),
                section=section,
                prompt=payload.message,
                success=False,
            )
        raise
    except Exception as e:
        if "include_onec" in locals() and include_onec and "company_id" in locals() and company_id is not None:
            audit_onec_ai_query(
                company_id=company_id,
                user_id=locals().get("onec_audit_user_id"),
                section=section,
                prompt=payload.message,
                success=False,
                error_message=str(e),
            )
        error_msg = str(e)
        lower_error = error_msg.lower()

        if "not configured" in lower_error and ("api key" in lower_error or "provider" in lower_error):
            raise HTTPException(
                status_code=503,
                detail="AI provider is not configured. Add ANTHROPIC_API_KEY and/or OPENAI_API_KEY.",
            )

        if "timeout" in lower_error or "timed out" in lower_error:
            raise HTTPException(
                status_code=503,
                detail="AI provider timeout. Please retry in a few seconds.",
            )

        if "connection" in lower_error and ("failed" in lower_error or "error" in lower_error):
            raise HTTPException(
                status_code=503,
                detail="AI provider is unreachable from backend. Verify outbound network and DNS.",
            )

        if "insufficient_quota" in lower_error or "quota" in lower_error:
            raise HTTPException(
                status_code=503,
                detail="AI provider quota is exhausted. Add billing/credits for the selected provider.",
            )

        if "529" in error_msg or "overloaded" in lower_error:
            raise HTTPException(
                status_code=503,
                detail="AI is temporarily busy. Please try again in a moment.",
            )

        if "401" in error_msg or "authentication" in lower_error:
            raise HTTPException(
                status_code=401,
                detail="AI authentication failed. Check your API key.",
            )

        if "429" in error_msg or "rate limit" in lower_error:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment.",
            )

        logger.exception("Unhandled agent error for section=%s", section)
        raise HTTPException(
            status_code=500,
            detail="Something went wrong. Please try again.",
        )
