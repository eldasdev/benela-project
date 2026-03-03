import base64
import os
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from openai import OpenAI
from pydantic import BaseModel, Field

from agents.base_agent import BaseAgent
from agents.data_fetcher import get_context_for_section
from agents.finance_agent import FinanceAgent
from core.config import settings

router = APIRouter()


MAX_ATTACHMENT_TEXT_CHARS = 12000
MAX_TOTAL_ATTACHMENT_CONTEXT_CHARS = 24000
MAX_ATTACHMENTS = 5
MAX_BASE64_CHARS = 16000000
MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024
OPENAI_TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe").strip() or "gpt-4o-mini-transcribe"


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
    attachments: list[AgentAttachment] = Field(default_factory=list)


class TaskResponse(BaseModel):
    agent: str
    message: str
    response: str


class TranscriptionResponse(BaseModel):
    text: str


def get_agent(section: str) -> BaseAgent:
    if section == "finance":
        return FinanceAgent()

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
    except Exception:
        raise HTTPException(status_code=503, detail="Audio transcription service is temporarily unavailable.")

    if not text:
        raise HTTPException(status_code=422, detail="No speech detected in the provided audio.")

    return TranscriptionResponse(text=text)


@router.post("/{section}", response_model=TaskResponse)
def run_agent(section: str, request: TaskRequest):
    """Send a message to the AI agent with real data context."""

    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        # 1) Pick the right agent
        agent = get_agent(section)

        # 2) Pull live context for this section
        context = get_context_for_section(section)
        attachment_context, multimodal_blocks = _build_attachment_context(request.attachments)
        if attachment_context:
            context = f"{context}\n\n{attachment_context}"

        # 3) Run model with injected context
        response = agent.run(
            request.message,
            context=context,
            model=request.model,
            user_blocks=multimodal_blocks,
        )

        return TaskResponse(
            agent=agent.name,
            message=request.message,
            response=response,
        )

    except Exception as e:
        error_msg = str(e)

        if "529" in error_msg or "overloaded" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="AI is temporarily busy. Please try again in a moment.",
            )

        if "401" in error_msg or "authentication" in error_msg.lower():
            raise HTTPException(
                status_code=401,
                detail="AI authentication failed. Check your API key.",
            )

        if "429" in error_msg or "rate limit" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment.",
            )

        raise HTTPException(
            status_code=500,
            detail="Something went wrong. Please try again.",
        )
