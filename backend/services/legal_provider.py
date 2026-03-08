import json
import os
import re
from datetime import datetime
from html import unescape
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote_plus, urlencode, urlparse, urlsplit, urlunsplit
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
_NON_WORD_RE = re.compile(r"[^a-z0-9а-яёўқғҳ]+", re.IGNORECASE)
_MULTI_SPACE_RE = re.compile(r"\s+")

_EN_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "about",
    "under",
    "over",
    "this",
    "that",
    "these",
    "those",
    "what",
    "which",
    "when",
    "where",
    "how",
    "why",
    "legal",
    "law",
    "laws",
    "code",
    "requirements",
    "requirement",
    "contract",
    "contracts",
    "agreement",
    "agreements",
    "rules",
    "regulation",
    "regulations",
    "compliance",
    "company",
    "client",
    "clients",
    "fixed",
    "term",
}

_EN_UZ_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("labour code", "mehnat kodeksi"),
    ("labor code", "mehnat kodeksi"),
    ("fixed-term contracts", "muddatli mehnat shartnomasi"),
    ("fixed-term contract", "muddatli mehnat shartnomasi"),
    ("fixed term contracts", "muddatli mehnat shartnomasi"),
    ("fixed term contract", "muddatli mehnat shartnomasi"),
    ("employment contract", "mehnat shartnomasi"),
    ("employment contracts", "mehnat shartnomalari"),
    ("tax code", "soliq kodeksi"),
    ("civil code", "fuqarolik kodeksi"),
    ("criminal code", "jinoyat kodeksi"),
    ("banking law", "bank va banklar to'g'risidagi qonun"),
    ("bank law", "bank va banklar to'g'risidagi qonun"),
    ("requirements", "talablari"),
    ("requirement", "talab"),
    ("contracts", "shartnomalar"),
    ("contract", "shartnoma"),
)

_EN_CONNECTORS_RE = re.compile(r"\b(for|of|in|on|with|about|the|a|an|to)\b", re.IGNORECASE)
_DDG_RESULT_RE = re.compile(
    r'<a[^>]+class="result__a"[^>]+href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
_DDG_SNIPPET_RE = re.compile(
    r'<a[^>]+class="result__snippet"[^>]*>(?P<snippet_a>.*?)</a>|'
    r'<div[^>]+class="result__snippet"[^>]*>(?P<snippet_b>.*?)</div>',
    re.IGNORECASE | re.DOTALL,
)
_DDG_UDDG_RE = re.compile(r"[?&]uddg=([^&]+)")


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

    def _extract_documents(self, payload: object) -> list[dict]:
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        if not isinstance(payload, dict):
            return []

        candidates: list[object] = [
            payload.get("documents"),
            payload.get("results"),
            payload.get("items"),
        ]
        nested_data = payload.get("data")
        if isinstance(nested_data, dict):
            candidates.extend(
                [
                    nested_data.get("documents"),
                    nested_data.get("results"),
                    nested_data.get("items"),
                ]
            )

        for rows in candidates:
            if isinstance(rows, list):
                return [row for row in rows if isinstance(row, dict)]
        return []

    def _coerce_title(self, raw: dict) -> str:
        direct_title = raw.get("title")
        if isinstance(direct_title, str) and direct_title.strip():
            return direct_title.strip()
        if isinstance(direct_title, dict):
            for key in ("uz", "uz_lat", "ru", "en"):
                value = direct_title.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            for value in direct_title.values():
                if isinstance(value, str) and value.strip():
                    return value.strip()

        for key in ("title_uz", "title_ru", "name"):
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        return "Untitled legal document"

    def _coerce_category(self, raw: dict) -> str:
        raw_category = raw.get("category")
        if isinstance(raw_category, list):
            if raw_category and isinstance(raw_category[0], str):
                return raw_category[0]
        elif isinstance(raw_category, str) and raw_category.strip():
            return raw_category.strip()

        raw_categories = raw.get("categories")
        if isinstance(raw_categories, list):
            for item in raw_categories:
                if isinstance(item, str) and item.strip():
                    return item.strip()

        raw_doc_type = raw.get("doc_type")
        if isinstance(raw_doc_type, str) and raw_doc_type.strip():
            return raw_doc_type.strip()

        return "general"

    def _keyword_query(self, query: str, max_terms: int = 4) -> str:
        lowered = _MULTI_SPACE_RE.sub(" ", _NON_WORD_RE.sub(" ", query.lower())).strip()
        if not lowered:
            return ""

        tokens = [token for token in lowered.split(" ") if len(token) >= 3 and token not in _EN_STOPWORDS]
        if not tokens:
            return ""
        return " ".join(tokens[:max_terms])

    def _is_probably_english(self, query: str) -> bool:
        letters = [ch for ch in query if ch.isalpha()]
        if not letters:
            return False
        latin_count = sum(1 for ch in letters if "a" <= ch.lower() <= "z")
        return (latin_count / len(letters)) >= 0.65

    def _translate_query_to_uz_hint(self, query: str) -> str:
        lowered = f" {query.lower()} "
        translated = lowered
        for source_phrase, target_phrase in _EN_UZ_REPLACEMENTS:
            translated = translated.replace(source_phrase, target_phrase)
        translated = _EN_CONNECTORS_RE.sub(" ", translated)
        translated = _MULTI_SPACE_RE.sub(" ", translated).strip()
        return translated

    def _query_candidates(self, query: str, category: str | None = None) -> list[str]:
        candidates: list[str] = []

        def add_candidate(value: str):
            candidate = value.strip()
            if len(candidate) < 2:
                return
            if candidate.lower() in {item.lower() for item in candidates}:
                return
            candidates.append(candidate)

        add_candidate(query)

        lowered = query.strip().lower()
        if ("labor code" in lowered or "labour code" in lowered) and ("fixed-term" in lowered or "fixed term" in lowered):
            add_candidate("mehnat kodeksi muddatli mehnat shartnomasi")
        if ("employment contract" in lowered or "employment contracts" in lowered) and (
            "fixed-term" in lowered or "fixed term" in lowered
        ):
            add_candidate("muddatli mehnat shartnomasi")
        if "tax code" in lowered:
            add_candidate("soliq kodeksi")
        if "bank" in lowered and ("law" in lowered or "code" in lowered):
            add_candidate("bank va banklar to'g'risidagi qonun")

        translated = self._translate_query_to_uz_hint(query)
        if translated and translated.lower() != query.strip().lower():
            add_candidate(translated)

        keyword_only = self._keyword_query(translated or query)
        if keyword_only:
            add_candidate(keyword_only)

        category_hint = (category or "").strip().lower()
        focused_category = "," not in category_hint and ";" not in category_hint and "/" not in category_hint
        if focused_category:
            if "labor" in category_hint or "mehnat" in category_hint:
                add_candidate("mehnat kodeksi muddatli mehnat shartnomasi")
            elif "tax" in category_hint or "soliq" in category_hint:
                add_candidate("soliq kodeksi")
            elif "bank" in category_hint:
                add_candidate("bank va banklar to'g'risidagi qonun")

        return candidates[:5]

    def _normalize_item(self, raw: dict) -> dict:
        category = self._coerce_category(raw)
        title = self._coerce_title(raw)

        return {
            "id": raw.get("id") or raw.get("lex_id"),
            "title": title,
            "document_number": raw.get("document_number") or raw.get("doc_number") or raw.get("number"),
            "jurisdiction": raw.get("jurisdiction") or "Uzbekistan",
            "category": category,
            "source": raw.get("source") or "lex_uz",
            "source_url": raw.get("source_url") or raw.get("url") or raw.get("lex_url"),
            "published_at": raw.get("published_at") or raw.get("adoption_date") or raw.get("date"),
            "excerpt": raw.get("excerpt") or raw.get("summary") or raw.get("snippet"),
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
        max_results = max(1, min(limit, 100))
        query_candidates = self._query_candidates(query, category=category)
        language_candidates = ["uz_lat", "ru"] if self._is_probably_english(query) else ["uz_lat", "ru"]

        rows: list[dict] = []
        seen: set[str] = set()
        remote_errors: list[Exception] = []

        for candidate_query in query_candidates:
            for lang in language_candidates:
                params = {
                    "query": candidate_query,
                    "q": candidate_query,
                    "limit": max_results,
                    "per_page": max_results,
                    "status": "active",
                    "lang": lang,
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
                except Exception as exc:
                    remote_errors.append(exc)
                    continue

                docs = self._extract_documents(payload)
                if not docs:
                    continue

                for item in docs:
                    normalized = self._normalize_item(item)
                    dedupe_key = (
                        str(normalized.get("source_url") or "")
                        or f"{normalized.get('id')}"
                        or normalized.get("title", "")
                    ).strip()
                    if not dedupe_key or dedupe_key in seen:
                        continue
                    seen.add(dedupe_key)
                    rows.append(normalized)
                    if len(rows) >= max_results:
                        return rows[:max_results]

            if rows:
                break

        if rows:
            return rows[:max_results]

        if self.live_fallback_enabled:
            for candidate_query in query_candidates:
                try:
                    fallback_rows = self.live_provider.search(
                        query=candidate_query,
                        jurisdiction=jurisdiction,
                        category=category,
                        source=source,
                        limit=max_results,
                    )
                except Exception:
                    continue
                if fallback_rows:
                    return fallback_rows[:max_results]

        if remote_errors and not self.live_fallback_enabled:
            raise remote_errors[-1]

        return []


def _decode_ddg_redirect(url: str) -> str:
    candidate = (url or "").strip()
    if not candidate:
        return ""

    if candidate.startswith("//"):
        candidate = f"https:{candidate}"
    if candidate.startswith("/l/?") or candidate.startswith("https://duckduckgo.com/l/?"):
        match = _DDG_UDDG_RE.search(candidate)
        if match:
            try:
                from urllib.parse import unquote

                candidate = unquote(match.group(1))
            except Exception:
                pass

    return candidate


def _domain_allowed(url: str, allowed_domains: set[str]) -> bool:
    if not allowed_domains:
        return True
    try:
        host = (urlparse(url).netloc or "").lower()
    except Exception:
        return False
    if not host:
        return False
    for domain in allowed_domains:
        clean = domain.lower().strip()
        if not clean:
            continue
        if host == clean or host.endswith(f".{clean}"):
            return True
    return False


def _is_likely_legal_result(title: str, snippet: str) -> bool:
    text = f"{title} {snippet}".lower()
    legal_markers = (
        "qonun",
        "kodeks",
        "mehnat",
        "soliq",
        "bank",
        "compliance",
        "regulation",
        "law",
        "legal",
        "contract",
        "policy",
        "decree",
    )
    return any(marker in text for marker in legal_markers)


def _web_query_candidates(query: str) -> list[str]:
    candidates: list[str] = []

    def add_candidate(value: str):
        candidate = _MULTI_SPACE_RE.sub(" ", value.strip())
        if len(candidate) < 2:
            return
        if candidate.lower() in {item.lower() for item in candidates}:
            return
        candidates.append(candidate)

    cleaned = (query or "").strip()
    add_candidate(cleaned)

    lowered = f" {cleaned.lower()} "
    translated = lowered
    for source_phrase, target_phrase in _EN_UZ_REPLACEMENTS:
        translated = translated.replace(source_phrase, target_phrase)
    translated = _EN_CONNECTORS_RE.sub(" ", translated)
    translated = _MULTI_SPACE_RE.sub(" ", translated).strip()
    add_candidate(translated)

    keyword_tokens = [
        token
        for token in _MULTI_SPACE_RE.sub(" ", _NON_WORD_RE.sub(" ", translated or cleaned)).strip().split(" ")
        if len(token) >= 3 and token not in _EN_STOPWORDS
    ]
    if keyword_tokens:
        add_candidate(" ".join(keyword_tokens[:5]))

    if ("labor code" in cleaned.lower() or "labour code" in cleaned.lower()) and (
        "fixed-term" in cleaned.lower() or "fixed term" in cleaned.lower()
    ):
        add_candidate("mehnat kodeksi muddatli mehnat shartnomasi")
    if ("employment contract" in cleaned.lower() or "employment contracts" in cleaned.lower()) and (
        "fixed-term" in cleaned.lower() or "fixed term" in cleaned.lower()
    ):
        add_candidate("muddatli mehnat shartnomasi")
    if "tax code" in cleaned.lower():
        add_candidate("soliq kodeksi")
    if "bank" in cleaned.lower() and ("law" in cleaned.lower() or "code" in cleaned.lower()):
        add_candidate("bank va banklar to'g'risidagi qonun")

    return candidates[:5]


def search_web_legal_case_references(
    query: str,
    jurisdiction: str | None = None,
    category: str | None = None,
    limit: int = 6,
    timeout_seconds: float | None = None,
) -> list[dict]:
    if not _env_bool("LEGAL_WEB_CASE_SEARCH_ENABLED", True):
        return []

    cleaned_query = (query or "").strip()
    if len(cleaned_query) < 2:
        return []

    timeout = max(3.0, float(timeout_seconds or os.getenv("LEGAL_WEB_SEARCH_TIMEOUT", "8")))
    max_results = max(1, min(int(limit), 12))
    domain_csv = os.getenv(
        "LEGAL_WEB_SEARCH_DOMAINS",
        "lex.uz,ilo.org,oecd.org,worldbank.org,unctad.org,ifrs.org,ec.europa.eu",
    )
    allowed_domains = {item.strip().lower() for item in domain_csv.split(",") if item.strip()}

    query_parts = [cleaned_query]
    if jurisdiction:
        query_parts.append(jurisdiction.strip())
    if category:
        query_parts.append(category.strip())
    query_parts.extend(["legal case", "compliance"])
    search_query = " ".join(part for part in query_parts if part)

    request_url = f"https://duckduckgo.com/html/?{urlencode({'q': search_query})}"
    req = Request(
        request_url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (compatible; BenelaLegalBot/1.0)",
        },
        method="GET",
    )

    try:
        with urlopen(req, timeout=timeout) as response:
            html = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return []

    snippets = [
        _clean_html(match.group("snippet_a") or match.group("snippet_b") or "")
        for match in _DDG_SNIPPET_RE.finditer(html)
    ]

    rows: list[dict] = []
    seen_urls: set[str] = set()
    for index, match in enumerate(_DDG_RESULT_RE.finditer(html), start=1):
        raw_url = match.group("href") or ""
        resolved_url = _decode_ddg_redirect(raw_url)
        title = _clean_html(match.group("title") or "")
        snippet = snippets[index - 1] if (index - 1) < len(snippets) else ""

        if not resolved_url.startswith("http"):
            continue
        if resolved_url in seen_urls:
            continue
        if not _domain_allowed(resolved_url, allowed_domains):
            continue
        if not _is_likely_legal_result(title, snippet):
            continue

        seen_urls.add(resolved_url)
        rows.append(
            {
                "id": None,
                "title": title or "External legal reference",
                "document_number": None,
                "jurisdiction": jurisdiction or "International",
                "category": category or "case_reference",
                "source": "web_case",
                "source_url": resolved_url,
                "published_at": None,
                "excerpt": snippet or None,
                "relevance_score": round(max(0.25, 0.95 - (index - 1) * 0.08), 3),
            }
        )
        if len(rows) >= max_results:
            break

    if rows:
        return rows

    # Fallback to direct lex.uz live web search when web index parsing has no usable hits.
    live_rows: list[dict] = []
    selected_live_query = cleaned_query
    live_provider = LiveLexUzSearchProvider(timeout_seconds=timeout)
    for candidate_query in _web_query_candidates(cleaned_query):
        try:
            live_rows = live_provider.search(
                query=candidate_query,
                jurisdiction=jurisdiction,
                category=category,
                source="lex_uz",
                limit=max_results,
            )
        except Exception:
            live_rows = []
        if live_rows:
            selected_live_query = candidate_query
            break

    fallback_rows: list[dict] = []
    query_keywords = {
        token
        for token in _NON_WORD_RE.sub(" ", selected_live_query.lower()).split(" ")
        if len(token) >= 4 and token not in _EN_STOPWORDS
    }

    filtered_live_rows: list[dict] = []
    if query_keywords:
        min_overlap = 2 if len(query_keywords) >= 3 else 1
        for item in live_rows:
            haystack = f"{item.get('title') or ''} {item.get('excerpt') or ''}".lower()
            overlap = sum(1 for token in query_keywords if token in haystack)
            if overlap >= min_overlap:
                filtered_live_rows.append(item)
        if filtered_live_rows:
            live_rows = filtered_live_rows

    for item in live_rows:
        fallback_rows.append(
            {
                "id": item.get("id"),
                "title": item.get("title") or "Lex.uz legal reference",
                "document_number": item.get("document_number"),
                "jurisdiction": item.get("jurisdiction") or jurisdiction or "Uzbekistan",
                "category": item.get("category") or category or "case_reference",
                "source": "web_case",
                "source_url": item.get("source_url"),
                "published_at": item.get("published_at"),
                "excerpt": item.get("excerpt"),
                "relevance_score": float(item.get("relevance_score") or 0.4),
            }
        )

    if fallback_rows:
        return fallback_rows[:max_results]

    return rows


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

    answer = str(raw.get("answer") or raw.get("recommendation") or raw.get("message") or "").strip()
    sources_raw = raw.get("sources") or raw.get("references") or raw.get("documents") or []
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
