import json
import os
import re
from datetime import datetime
from html import unescape
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote_plus, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from database import crud


class LegalSearchProvider(Protocol):
    name: str

    def search(
        self,
        query: str,
        jurisdiction: str | None = None,
        category: str | None = None,
        source: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        ...


_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
_DOC_ROW_RE = re.compile(r'<tr class="dd-table__main-item".*?</tr>', re.IGNORECASE | re.DOTALL)
_DOC_LINK_RE = re.compile(
    r'<a[^>]+href="(?P<href>/docs/[^"]+)"[^>]*>(?P<title>.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
_DOC_BADGE_RE = re.compile(r'<span class="badge[^"]*">(?P<text>.*?)</span>', re.IGNORECASE | re.DOTALL)
_DOC_ID_RE = re.compile(r"/docs/(-?\d+)")
_DOC_NUMBER_RE = re.compile(r"\b([A-ZА-Я0-9ЎҚҒҲʼ‘'`’\-]{2,}-\d+(?:-son)?)\b", re.IGNORECASE)
_DATE_RE = re.compile(r"\b(\d{2})\.(\d{2})\.(\d{4})\b")


def _clean_html(value: str) -> str:
    if not value:
        return ""
    text = _TAG_RE.sub(" ", value)
    return _WHITESPACE_RE.sub(" ", unescape(text)).strip()


def _env_bool(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _resolve_lex_miner_endpoint(endpoint_url: str, resource: str) -> str:
    split = urlsplit(endpoint_url.strip())
    path = split.path.rstrip("/")
    lowered = path.lower()
    target_resource = resource.strip().strip("/")

    if lowered.endswith("/legal/search"):
        target_path = f"{path[: -len('/legal/search')]}/legal/{target_resource}"
    elif lowered.endswith("/search"):
        target_path = f"{path[: -len('/search')]}/{target_resource}"
    else:
        target_path = f"{path}/{target_resource}" if path else f"/{target_resource}"

    return urlunsplit((split.scheme, split.netloc, target_path, "", split.fragment))


def _resolve_lex_miner_ping_endpoint(endpoint_url: str) -> str:
    split = urlsplit(endpoint_url.strip())
    path = split.path.rstrip("/")
    lowered = path.lower()

    if lowered.endswith("/legal/search"):
        target_path = f"{path[: -len('/legal/search')]}/ping"
    elif lowered.endswith("/search"):
        target_path = f"{path[: -len('/search')]}/ping"
    else:
        target_path = f"{path}/ping" if path else "/ping"

    return urlunsplit((split.scheme, split.netloc, target_path, "", split.fragment))


def _normalize_integration_source(item: dict, index: int = 1) -> dict:
    title = (
        item.get("title")
        or item.get("title_uz")
        or item.get("title_ru")
        or item.get("name")
        or "Untitled legal document"
    )
    category = item.get("category") or item.get("doc_type") or "general"
    published_at = item.get("published_at") or item.get("adoption_date") or item.get("date")

    return {
        "id": item.get("id"),
        "title": title,
        "document_number": item.get("document_number") or item.get("doc_number") or item.get("number"),
        "jurisdiction": item.get("jurisdiction") or "Uzbekistan",
        "category": str(category),
        "source": item.get("source") or "lex_miner",
        "source_url": item.get("source_url") or item.get("url"),
        "published_at": published_at,
        "excerpt": item.get("excerpt") or item.get("summary"),
        "relevance_score": float(item.get("relevance_score") or item.get("score") or max(0.1, 1 - index * 0.03)),
    }


class LexMinerIntegrationError(RuntimeError):
    pass


class DatabaseLegalSearchProvider:
    name = "database"

    def __init__(self, db: Session):
        self.db = db

    def search(
        self,
        query: str,
        jurisdiction: str | None = None,
        category: str | None = None,
        source: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        return crud.search_legal_documents(
            self.db,
            query=query,
            jurisdiction=jurisdiction,
            category=category,
            source=source,
            limit=limit,
        )


class LiveLexUzSearchProvider:
    name = "lex_uz_live"

    def __init__(self, timeout_seconds: float = 10.0):
        self.timeout_seconds = max(2.0, float(timeout_seconds))
        self.base_url = os.getenv("LEX_UZ_SEARCH_URL", "https://lex.uz/search/all").strip()

    def _build_url(self, query: str) -> str:
        if "?" in self.base_url:
            return f"{self.base_url}&query={quote_plus(query)}"
        return f"{self.base_url}?searchtype=all&query={quote_plus(query)}"

    def _normalize_url(self, href: str) -> str:
        path = href.strip()
        if path.startswith("http://") or path.startswith("https://"):
            return path.split("#", 1)[0]
        if not path.startswith("/"):
            path = f"/{path}"
        return f"https://lex.uz{path.split('#', 1)[0]}"

    def _extract_doc_id(self, href: str) -> int | None:
        match = _DOC_ID_RE.search(href)
        if not match:
            return None
        try:
            return int(match.group(1))
        except ValueError:
            return None

    def _extract_doc_number(self, badge: str) -> str | None:
        match = _DOC_NUMBER_RE.search(badge)
        return match.group(1) if match else None

    def _extract_published_at(self, badge: str) -> str | None:
        match = _DATE_RE.search(badge)
        if not match:
            return None
        day, month, year = match.groups()
        try:
            return datetime(int(year), int(month), int(day)).date().isoformat()
        except ValueError:
            return None

    def _infer_category(self, text: str) -> str:
        lowered = text.lower()
        if "qonun" in lowered or "закон" in lowered:
            return "law"
        if "qaror" in lowered or "постанов" in lowered:
            return "resolution"
        if "farmon" in lowered or "указ" in lowered:
            return "decree"
        return "general"

    def search(
        self,
        query: str,
        jurisdiction: str | None = None,
        category: str | None = None,
        source: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        del jurisdiction, category, source
        cleaned = (query or "").strip()
        if not cleaned:
            return []

        request_url = self._build_url(cleaned)
        req = Request(
            request_url,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "User-Agent": "Mozilla/5.0 (compatible; BenelaLegalBot/1.0)",
            },
            method="GET",
        )
        with urlopen(req, timeout=self.timeout_seconds) as response:
            payload = response.read().decode("utf-8", errors="ignore")

        rows: list[dict] = []
        max_results = max(1, min(int(limit), 100))
        for index, row_html in enumerate(_DOC_ROW_RE.findall(payload), start=1):
            link_match = _DOC_LINK_RE.search(row_html)
            if not link_match:
                continue

            href = link_match.group("href").strip()
            title = _clean_html(link_match.group("title"))
            if not title:
                continue

            badge_match = _DOC_BADGE_RE.search(row_html)
            badge_text = _clean_html(badge_match.group("text")) if badge_match else ""

            rows.append(
                {
                    "id": self._extract_doc_id(href),
                    "title": title,
                    "document_number": self._extract_doc_number(badge_text),
                    "jurisdiction": "Uzbekistan",
                    "category": self._infer_category(f"{title} {badge_text}"),
                    "source": "lex_uz_live",
                    "source_url": self._normalize_url(href),
                    "published_at": self._extract_published_at(badge_text),
                    "excerpt": badge_text or None,
                    "relevance_score": round(max(0.15, 1.0 - (index - 1) * 0.03), 3),
                }
            )

            if len(rows) >= max_results:
                break

        return rows


class RemoteLexMinerSearchProvider:
    name = "lex_miner"

    def __init__(
        self,
        endpoint_url: str,
        timeout_seconds: float = 8.0,
        api_key: str | None = None,
        live_fallback_enabled: bool = True,
    ):
        self.endpoint_url = self._resolve_search_url(endpoint_url)
        self.timeout_seconds = max(1.0, float(timeout_seconds))
        self.api_key = (api_key or "").strip() or None
        self.live_fallback_enabled = live_fallback_enabled
        self.live_provider = LiveLexUzSearchProvider(timeout_seconds=max(self.timeout_seconds, 8.0))

    def _resolve_search_url(self, endpoint_url: str) -> str:
        base = endpoint_url.strip()
        if not base:
            raise ValueError("Lex miner endpoint URL is required")
        cleaned = base.rstrip("/")
        if cleaned.lower().endswith("/search"):
            return cleaned
        return f"{cleaned}/search"

    def _build_url(self, params: dict[str, str | int]) -> str:
        split = urlsplit(self.endpoint_url)
        query_pairs = dict(parse_qsl(split.query, keep_blank_values=True))
        query_pairs.update({k: str(v) for k, v in params.items()})
        return urlunsplit((split.scheme, split.netloc, split.path, urlencode(query_pairs), split.fragment))

    def _request_headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "User-Agent": "BenelaLegalBot/1.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["X-API-Key"] = self.api_key
            headers["X-Integration-API-Key"] = self.api_key
        return headers

    def _normalize_item(self, raw: dict) -> dict:
        raw_category = raw.get("category")
        if isinstance(raw_category, list):
            category = str(raw_category[0]) if raw_category else "general"
        else:
            category = str(raw_category or "general")

        title = (
            raw.get("title")
            or raw.get("title_uz")
            or raw.get("title_ru")
            or raw.get("name")
            or "Untitled legal document"
        )

        return {
            "id": raw.get("id"),
            "title": title,
            "document_number": raw.get("document_number") or raw.get("doc_number") or raw.get("number"),
            "jurisdiction": raw.get("jurisdiction") or "Uzbekistan",
            "category": category,
            "source": raw.get("source") or "lex_uz",
            "source_url": raw.get("source_url") or raw.get("url"),
            "published_at": raw.get("published_at") or raw.get("adoption_date") or raw.get("date"),
            "excerpt": raw.get("excerpt") or raw.get("summary"),
            "relevance_score": float(raw.get("relevance_score") or raw.get("score") or 0),
        }

    def search(
        self,
        query: str,
        jurisdiction: str | None = None,
        category: str | None = None,
        source: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        params = {
            "query": query,
            "q": query,
            "limit": max(1, min(limit, 100)),
            "per_page": max(1, min(limit, 100)),
            "status": "active",
            "lang": "uz_lat",
        }
        if jurisdiction:
            params["jurisdiction"] = jurisdiction
        if category:
            params["category"] = category
        if source:
            params["source"] = source

        request_url = self._build_url(params)
        req = Request(
            request_url,
            headers=self._request_headers(),
            method="GET",
        )
        try:
            with urlopen(req, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception:
            if self.live_fallback_enabled:
                return self.live_provider.search(
                    query=query,
                    jurisdiction=jurisdiction,
                    category=category,
                    source=source,
                    limit=params["limit"],
                )
            raise

        if isinstance(payload, list):
            docs = payload
        elif isinstance(payload, dict):
            docs = payload.get("documents") or payload.get("results") or []
        else:
            docs = []

        normalized = [self._normalize_item(item) for item in docs if isinstance(item, dict)]
        normalized = normalized[: params["limit"]]
        if normalized:
            return normalized

        if self.live_fallback_enabled:
            return self.live_provider.search(
                query=query,
                jurisdiction=jurisdiction,
                category=category,
                source=source,
                limit=params["limit"],
            )

        return []


def build_legal_search_provider(db: Session, provider_hint: str | None = None) -> LegalSearchProvider:
    hint = (provider_hint or "").strip().lower()
    lex_url = os.getenv("LEX_MINER_API_URL", "").strip()
    timeout = float(os.getenv("LEX_MINER_TIMEOUT", "8"))
    live_fallback_enabled = _env_bool("LEX_LIVE_FALLBACK_ENABLED", True)
    integration_key = (
        os.getenv("INTEGRATION_API_KEY", "").strip()
        or os.getenv("LEX_MINER_API_KEY", "").strip()
        or None
    )

    if hint in {"local", "db", "database"}:
        return DatabaseLegalSearchProvider(db)

    if hint in {"lex", "lex_uz", "remote"}:
        if lex_url:
            return RemoteLexMinerSearchProvider(
                endpoint_url=lex_url,
                timeout_seconds=timeout,
                api_key=integration_key,
                live_fallback_enabled=live_fallback_enabled,
            )
        return DatabaseLegalSearchProvider(db)

    if lex_url:
        return RemoteLexMinerSearchProvider(
            endpoint_url=lex_url,
            timeout_seconds=timeout,
            api_key=integration_key,
            live_fallback_enabled=live_fallback_enabled,
        )

    return DatabaseLegalSearchProvider(db)


def request_lex_miner_advice(
    question: str,
    company_context: str = "",
    response_language: str = "uz",
    max_documents: int = 8,
    endpoint_url: str | None = None,
    timeout_seconds: float | None = None,
    api_key: str | None = None,
) -> dict:
    lex_url = (endpoint_url or os.getenv("LEX_MINER_API_URL", "")).strip()
    if not lex_url:
        raise LexMinerIntegrationError("LEX_MINER_API_URL is not configured")

    advice_url = _resolve_lex_miner_endpoint(lex_url, "advice")
    timeout = max(3.0, float(timeout_seconds or os.getenv("LEX_MINER_TIMEOUT", "12")))
    key = (api_key or os.getenv("INTEGRATION_API_KEY", "") or os.getenv("LEX_MINER_API_KEY", "")).strip()
    if not key:
        raise LexMinerIntegrationError("INTEGRATION_API_KEY is not configured")

    payload = {
        "question": question.strip(),
        "company_context": company_context.strip(),
        "response_language": response_language if response_language in {"uz", "ru", "en"} else "uz",
        "max_documents": max(3, min(int(max_documents), 20)),
    }
    if not payload["question"]:
        raise LexMinerIntegrationError("Question is required for Lex miner advice")

    req = Request(
        advice_url,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {key}",
            "X-API-Key": key,
            "X-Integration-API-Key": key,
            "User-Agent": "BenelaLegalBot/1.0",
        },
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
    )

    try:
        with urlopen(req, timeout=timeout) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="ignore")[:240]
        except Exception:
            body = ""
        raise LexMinerIntegrationError(
            f"Lex miner advice failed with HTTP {exc.code}{': ' + body if body else ''}"
        ) from exc
    except URLError as exc:
        reason = getattr(exc, "reason", "connection error")
        raise LexMinerIntegrationError(f"Lex miner advice connection failed: {reason}") from exc
    except Exception as exc:
        raise LexMinerIntegrationError(f"Lex miner advice error: {exc}") from exc

    answer = str(raw.get("answer") or "").strip()
    sources_raw = raw.get("sources") or []
    if isinstance(sources_raw, list):
        references = [
            _normalize_integration_source(item, index=index)
            for index, item in enumerate(sources_raw, start=1)
            if isinstance(item, dict)
        ]
    else:
        references = []

    return {
        "provider": "lex_miner_advice",
        "recommendation": answer,
        "references": references,
        "model": raw.get("model"),
        "confidence": raw.get("confidence"),
        "disclaimer": raw.get("disclaimer"),
    }


def get_lex_miner_integration_status(
    endpoint_url: str | None = None,
    timeout_seconds: float | None = None,
    api_key: str | None = None,
) -> dict:
    lex_url = (endpoint_url or os.getenv("LEX_MINER_API_URL", "")).strip()
    key = (api_key or os.getenv("INTEGRATION_API_KEY", "") or os.getenv("LEX_MINER_API_KEY", "")).strip()
    timeout = max(2.0, float(timeout_seconds or os.getenv("LEX_MINER_TIMEOUT", "8")))
    live_fallback_enabled = _env_bool("LEX_LIVE_FALLBACK_ENABLED", True)

    status = {
        "configured": bool(lex_url),
        "api_key_configured": bool(key),
        "live_fallback_enabled": live_fallback_enabled,
        "search_url": lex_url or None,
        "advice_url": _resolve_lex_miner_endpoint(lex_url, "advice") if lex_url else None,
        "ping_url": _resolve_lex_miner_ping_endpoint(lex_url) if lex_url else None,
        "reachable": False,
        "service": None,
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "detail": "",
    }

    if not lex_url:
        status["detail"] = "LEX_MINER_API_URL is not configured."
        return status
    if not key:
        status["detail"] = "INTEGRATION_API_KEY is not configured."
        return status

    ping_url = _resolve_lex_miner_ping_endpoint(lex_url)
    req = Request(
        ping_url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {key}",
            "X-API-Key": key,
            "X-Integration-API-Key": key,
            "User-Agent": "BenelaLegalBot/1.0",
        },
        method="GET",
    )

    try:
        with urlopen(req, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        status["reachable"] = True
        status["service"] = payload.get("service")
        status["detail"] = "Lex miner integration is reachable."
    except Exception as exc:
        status["detail"] = f"Lex miner ping failed: {exc}"
    return status
