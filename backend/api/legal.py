from datetime import datetime
import os
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from agents.base_agent import BaseAgent
from core.config import settings
from database.connection import get_db
from database import crud, schemas
from services.legal_provider import (
    DatabaseLegalSearchProvider,
    LexMinerIntegrationError,
    build_legal_search_provider,
    get_lex_miner_integration_status,
    request_lex_miner_advice,
    search_web_legal_case_references,
)

router = APIRouter(prefix="/legal", tags=["Legal"])


def _parse_datetime(value):
    if value is None or isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate:
        return None
    try:
        return datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_search_rows(rows: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for row in rows:
        normalized.append(
            {
                "id": row.get("id"),
                "title": row.get("title") or "Untitled legal document",
                "document_number": row.get("document_number"),
                "jurisdiction": row.get("jurisdiction") or "Uzbekistan",
                "category": row.get("category") or "general",
                "source": row.get("source") or "internal",
                "source_url": row.get("source_url"),
                "published_at": _parse_datetime(row.get("published_at")),
                "excerpt": row.get("excerpt"),
                "relevance_score": float(row.get("relevance_score") or 0),
            }
        )
    return normalized


def _run_legal_search(
    db: Session,
    query: str,
    jurisdiction: str | None = None,
    category: str | None = None,
    source: str | None = None,
    limit: int = 20,
    provider_hint: str | None = None,
):
    allow_db_fallback = os.getenv("LEGAL_DB_FALLBACK_ON_REMOTE_FAILURE", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    provider = build_legal_search_provider(db, provider_hint=provider_hint)
    provider_name = getattr(provider, "name", "unknown")

    try:
        rows = provider.search(
            query=query,
            jurisdiction=jurisdiction,
            category=category,
            source=source,
            limit=limit,
        )
    except Exception:
        if isinstance(provider, DatabaseLegalSearchProvider):
            raise
        if not allow_db_fallback:
            rows = []
            provider_name = f"{provider_name} (fallback disabled)"
            normalized = _normalize_search_rows(rows)
            return provider_name, normalized
        fallback_provider = DatabaseLegalSearchProvider(db)
        try:
            rows = fallback_provider.search(
                query=query,
                jurisdiction=jurisdiction,
                category=category,
                source=source,
                limit=limit,
            )
            provider_name = f"{provider_name} (fallback: database)"
        except Exception:
            rows = []
            provider_name = f"{provider_name} (fallback unavailable)"

    normalized = _normalize_search_rows(rows)
    if provider_name == "lex_miner" and any(item.get("source") == "lex_uz_live" for item in normalized):
        provider_name = "lex_miner (live lex.uz fallback)"
    return provider_name, normalized


def _build_recommendation_context(
    db: Session,
    references: list[dict],
    summary: dict | None = None,
) -> str:
    if summary is None:
        try:
            summary = crud.get_legal_summary(db)
        except Exception:
            summary = _empty_legal_summary()

    reference_lines = []
    for idx, row in enumerate(references, start=1):
        ref = (
            f"[{idx}] {row.get('title')} | Doc No: {row.get('document_number') or 'N/A'} | "
            f"Category: {row.get('category')} | Jurisdiction: {row.get('jurisdiction')} | "
            f"Source: {row.get('source')}\n"
            f"Excerpt: {(row.get('excerpt') or 'N/A').strip()}\n"
            f"URL: {row.get('source_url') or 'N/A'}"
        )
        reference_lines.append(ref)

    return (
        "LEGAL OPERATIONS CONTEXT (live from Benela legal workspace):\n"
        f"- Documents total: {summary.get('documents_total', 0)}\n"
        f"- Active documents: {summary.get('active_documents', 0)}\n"
        f"- Lex documents: {summary.get('lex_documents', 0)}\n"
        f"- Review due docs: {summary.get('review_due_documents', 0)}\n"
        f"- Contracts total: {summary.get('contracts_total', 0)}\n"
        f"- Active contracts: {summary.get('active_contracts', 0)}\n"
        f"- Expiring contracts (30d): {summary.get('expiring_contracts_30d', 0)}\n"
        f"- Open compliance tasks: {summary.get('open_tasks', 0)}\n"
        f"- Overdue compliance tasks: {summary.get('overdue_tasks', 0)}\n"
        f"- High-risk contracts: {summary.get('high_risk_contracts', 0)}\n"
        f"- High-risk compliance tasks: {summary.get('high_risk_tasks', 0)}\n\n"
        "LEGAL REFERENCES FROM SEARCH:\n"
        f"{chr(10).join(reference_lines) if reference_lines else 'No matching legal references found.'}"
    )


def _build_company_context(summary: dict, instructions: str) -> str:
    lines = [
        f"Documents total: {summary.get('documents_total', 0)}",
        f"Active documents: {summary.get('active_documents', 0)}",
        f"Lex source documents: {summary.get('lex_documents', 0)}",
        f"Review due documents: {summary.get('review_due_documents', 0)}",
        f"Contracts total: {summary.get('contracts_total', 0)}",
        f"Active contracts: {summary.get('active_contracts', 0)}",
        f"Expiring contracts (30d): {summary.get('expiring_contracts_30d', 0)}",
        f"Open compliance tasks: {summary.get('open_tasks', 0)}",
        f"Overdue tasks: {summary.get('overdue_tasks', 0)}",
        f"High-risk contracts: {summary.get('high_risk_contracts', 0)}",
        f"High-risk tasks: {summary.get('high_risk_tasks', 0)}",
    ]
    if instructions:
        lines.append(f"Additional user instructions: {instructions}")
    return "\n".join(lines)


def _empty_legal_summary() -> dict:
    return {
        "documents_total": 0,
        "active_documents": 0,
        "lex_documents": 0,
        "review_due_documents": 0,
        "contracts_total": 0,
        "active_contracts": 0,
        "expiring_contracts_30d": 0,
        "open_tasks": 0,
        "overdue_tasks": 0,
        "high_risk_contracts": 0,
        "high_risk_tasks": 0,
    }


def _keyword_query(text: str, max_terms: int = 3) -> str:
    stopwords = {
        "uchun",
        "boyicha",
        "boyicha",
        "bo",
        "asosiy",
        "haqida",
        "togrisidagi",
        "togrisida",
        "to",
        "g",
        "qonun",
        "qonuni",
        "compliance",
        "risk",
        "risklar",
        "mchj",
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
        "requirement",
        "requirements",
        "contract",
        "contracts",
    }
    tokens = [
        t.strip().lower()
        for t in re.split(r"[\s,.;:!?()\"'`’“”«»\\/_-]+", text or "")
        if len(t.strip()) >= 3
    ]
    deduped: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        if token in stopwords:
            continue
        deduped.append(token)
        if len(deduped) >= max_terms:
            break
    return " ".join(deduped)


def _language_label(code: str) -> str:
    labels = {"uz": "Uzbek", "ru": "Russian", "en": "English"}
    return labels.get(code, "Uzbek")


def _merge_reference_rows(primary: list[dict], extra: list[dict], limit: int) -> list[dict]:
    merged: list[dict] = []
    seen: set[str] = set()

    def add_row(row: dict):
        key = (str(row.get("source_url") or "").strip() or str(row.get("title") or "").strip()).lower()
        if not key or key in seen:
            return
        seen.add(key)
        merged.append(row)

    for row in primary:
        add_row(row)
        if len(merged) >= limit:
            return merged[:limit]
    for row in extra:
        add_row(row)
        if len(merged) >= limit:
            return merged[:limit]
    return merged[:limit]


def _provider_for_model(model: str | None) -> str:
    normalized = (model or "").strip().lower()
    if normalized.startswith("gpt-"):
        return "openai"
    return "anthropic"


def _provider_configured(provider: str) -> bool:
    if provider == "openai":
        return bool(settings.OPENAI_API_KEY)
    return bool(settings.ANTHROPIC_API_KEY)


def _default_model_for_provider(provider: str) -> str:
    if provider == "openai":
        return os.getenv("LEGAL_OPENAI_FALLBACK_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"
    return "claude-haiku-4-5-20251001"


def _recommendation_attempts(requested_model: str | None) -> list[tuple[str, str]]:
    primary_provider = _provider_for_model(requested_model)
    primary_model = (requested_model or "").strip() or _default_model_for_provider(primary_provider)

    attempts: list[tuple[str, str]] = [(primary_provider, primary_model)]
    if primary_provider != "anthropic":
        attempts.append(("anthropic", _default_model_for_provider("anthropic")))
    if primary_provider != "openai":
        attempts.append(("openai", _default_model_for_provider("openai")))

    deduped: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in attempts:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
    return deduped


def _build_deterministic_recommendation(
    query: str,
    references: list[dict],
    summary: dict,
    response_language: str,
    instructions: str,
) -> str:
    language = response_language if response_language in {"uz", "ru", "en"} else "uz"
    has_refs = len(references) > 0
    top_refs = "; ".join(str(row.get("title") or "").strip() for row in references[:4] if row.get("title"))
    if not top_refs:
        top_refs = (
            "Mos hujjatlar topilmadi."
            if language == "uz"
            else "Подходящие документы не найдены."
            if language == "ru"
            else "No matching documents found."
        )

    high_risk_contracts = int(summary.get("high_risk_contracts", 0) or 0)
    high_risk_tasks = int(summary.get("high_risk_tasks", 0) or 0)
    overdue_tasks = int(summary.get("overdue_tasks", 0) or 0)
    expiring_contracts = int(summary.get("expiring_contracts_30d", 0) or 0)
    review_due = int(summary.get("review_due_documents", 0) or 0)
    open_tasks = int(summary.get("open_tasks", 0) or 0)
    active_contracts = int(summary.get("active_contracts", 0) or 0)

    if language == "ru":
        return (
            f"Анализ кейса: Запрос: {query}. Источники: {top_refs}.\n"
            f"Риск-профиль: высокий риск контрактов={high_risk_contracts}, высокий риск задач={high_risk_tasks}, "
            f"просроченные задачи={overdue_tasks}, истекающие контракты 30 дней={expiring_contracts}, "
            f"документы с просроченным review={review_due}.\n"
            "Рекомендация 1 (Юридическая защита и комплаенс):\n"
            "Шаги: 1) Сформировать реестр обязательных норм по теме запроса и привязать к внутренним политикам. "
            "2) Провести gap-анализ по текущим процессам и договорам. "
            "3) Зафиксировать корректирующие меры с владельцами и сроками до 30 дней.\n"
            "Рекомендация 2 (Операционная модель и контроль):\n"
            "Шаги: 1) Ввести еженедельный legal-risk review по активным контрактам и открытым задачам. "
            "2) Установить SLA: эскалация просрочек в течение 24 часов. "
            "3) Встроить обязательный юридический чек перед запуском новых сделок.\n"
            "Рекомендация 3 (Финансовая и кадровая оптимизация):\n"
            "Шаги: 1) Рассчитать стоимость правового риска и резерв на потенциальные претензии. "
            "2) Перераспределить бюджет в пользу preventive legal controls. "
            "3) Если нарушения повторяются, провести performance-review ответственных ролей и обновить RACI.\n"
            "Заключение: Приоритетно закрыть просроченные и высокорисковые элементы, затем закрепить постоянный контроль. "
            "Это снижает вероятность споров и финансовых потерь в ближайшем цикле отчетности."
            f"{' Дополнительные инструкции учтены.' if instructions else ''}"
        ).strip()

    if language == "en":
        return (
            f"Case Analysis: Query: {query}. Sources: {top_refs}.\n"
            f"Risk profile: high-risk contracts={high_risk_contracts}, high-risk tasks={high_risk_tasks}, "
            f"overdue tasks={overdue_tasks}, expiring contracts in 30 days={expiring_contracts}, "
            f"review-due legal documents={review_due}.\n"
            "Recommendation 1 (Legal Defense and Compliance Control):\n"
            "Steps: 1) Build a clause-level legal obligations matrix for this case. "
            "2) Run a gap assessment against current workflows and contracts. "
            "3) Execute remediation actions with owners and 30-day deadlines.\n"
            "Recommendation 2 (Operational Governance and Escalation):\n"
            "Steps: 1) Launch a weekly legal risk review for active contracts and open compliance items. "
            "2) Enforce a 24-hour escalation SLA for overdue items. "
            "3) Add mandatory legal checkpoint before approving new commercial commitments.\n"
            "Recommendation 3 (Financial and Workforce Optimization):\n"
            "Steps: 1) Quantify legal exposure and set a reserve for potential claims. "
            "2) Shift budget toward preventive controls and policy automation. "
            "3) If repeated non-compliance persists, run role-level performance review and adjust accountability structure.\n"
            "Conclusion: Close overdue/high-risk items first, then lock in recurring controls. "
            "This reduces dispute probability and improves financial predictability."
            f"{' Additional instructions were considered.' if instructions else ''}"
        ).strip()

    uz_case_line = (
        f"Vaziyat tahlili: So'rov: {query}. Manbalar: {top_refs}."
        if has_refs
        else f"Vaziyat tahlili: So'rov: {query}. Joriy ifoda bo'yicha aniq manbalar yetarli emas."
    )
    uz_extra_note = " Qo'shimcha ko'rsatmalar inobatga olindi." if instructions else ""
    return (
        f"{uz_case_line}\n"
        f"Risk profili: yuqori xavfli shartnomalar={high_risk_contracts}, yuqori xavfli vazifalar={high_risk_tasks}, "
        f"kechikkan vazifalar={overdue_tasks}, 30 kun ichida tugaydigan shartnomalar={expiring_contracts}, "
        f"review muddati o'tgan hujjatlar={review_due}, faol shartnomalar={active_contracts}, ochiq vazifalar={open_tasks}.\n"
        "Tavsiya 1 (Huquqiy himoya va compliance nazorati):\n"
        "Qadamlar: 1) So'rov bo'yicha majburiy huquqiy talablar matritsasini tuzing. "
        "2) Amaldagi jarayon va shartnomalarda gap-analiz o'tkazing. "
        "3) 30 kunlik aniq muddatlar bilan tuzatish rejasini ijroga kiriting.\n"
        "Tavsiya 2 (Operatsion boshqaruv va eskalatsiya):\n"
        "Qadamlar: 1) Har hafta legal-risk review uchrashuvini yo'lga qo'ying. "
        "2) Kechikkan holatlar uchun 24 soatlik eskalatsiya SLA joriy qiling. "
        "3) Yangi bitimlar oldidan majburiy legal check-point qo'shing.\n"
        "Tavsiya 3 (Moliyaviy va kadrlar bo'yicha optimizatsiya):\n"
        "Qadamlar: 1) Potensial huquqiy yo'qotishlar bo'yicha zaxira summasini hisoblang. "
        "2) Budjetning bir qismini preventiv nazorat va policy avtomatizatsiyasiga yo'naltiring. "
        "3) Takroriy buzilishlar bo'lsa, mas'ul rollar performance-review qilinib accountability modeli yangilansin.\n"
        "Xulosa: Avval kechikkan va yuqori xavfli elementlarni yoping, keyin doimiy nazorat konturlarini mustahkamlang. "
        "Bu nizolar ehtimolini va kutilmagan moliyaviy yo'qotishlarni kamaytiradi."
        f"{uz_extra_note}"
    ).strip()


def _recommendation_meets_quality_bar(text: str, language: str) -> bool:
    candidate = (text or "").strip()
    if len(candidate) < 420:
        return False
    lowered = candidate.lower()
    if language == "ru":
        return (
            "рекомендация 1" in lowered
            and "рекомендация 2" in lowered
            and "рекомендация 3" in lowered
            and ("заключение" in lowered or "вывод" in lowered)
            and ("шаг" in lowered or "steps" in lowered)
        )
    if language == "en":
        return (
            "recommendation 1" in lowered
            and "recommendation 2" in lowered
            and "recommendation 3" in lowered
            and "conclusion" in lowered
            and "steps" in lowered
        )
    return (
        "tavsiya 1" in lowered
        and "tavsiya 2" in lowered
        and "tavsiya 3" in lowered
        and "xulosa" in lowered
        and ("qadam" in lowered or "steps" in lowered)
    )


@router.get("/summary")
def legal_summary(db: Session = Depends(get_db)):
    return crud.get_legal_summary(db)


@router.get("/benchmarks")
def legal_benchmarks():
    return crud.get_legal_benchmarks()


@router.get("/documents", response_model=List[schemas.LegalDocumentOut])
def list_documents(
    skip: int = 0,
    limit: int = 200,
    jurisdiction: str | None = None,
    category: str | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
):
    return crud.get_legal_documents(
        db,
        skip=skip,
        limit=limit,
        jurisdiction=jurisdiction,
        category=category,
        source=source,
    )


@router.post("/documents", response_model=schemas.LegalDocumentOut)
def add_document(data: schemas.LegalDocumentCreate, db: Session = Depends(get_db)):
    return crud.create_legal_document(db, data)


@router.put("/documents/{id}", response_model=schemas.LegalDocumentOut)
def edit_document(id: int, data: schemas.LegalDocumentUpdate, db: Session = Depends(get_db)):
    row = crud.update_legal_document(db, id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return row


@router.delete("/documents/{id}")
def remove_document(id: int, db: Session = Depends(get_db)):
    if not crud.delete_legal_document(db, id):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}


@router.get("/contracts", response_model=List[schemas.LegalContractOut])
def list_contracts(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_legal_contracts(db, skip=skip, limit=limit)


@router.post("/contracts", response_model=schemas.LegalContractOut)
def add_contract(data: schemas.LegalContractCreate, db: Session = Depends(get_db)):
    return crud.create_legal_contract(db, data)


@router.put("/contracts/{id}", response_model=schemas.LegalContractOut)
def edit_contract(id: int, data: schemas.LegalContractUpdate, db: Session = Depends(get_db)):
    row = crud.update_legal_contract(db, id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    return row


@router.delete("/contracts/{id}")
def remove_contract(id: int, db: Session = Depends(get_db)):
    if not crud.delete_legal_contract(db, id):
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"ok": True}


@router.get("/tasks", response_model=List[schemas.LegalComplianceTaskOut])
def list_tasks(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_legal_compliance_tasks(db, skip=skip, limit=limit)


@router.post("/tasks", response_model=schemas.LegalComplianceTaskOut)
def add_task(data: schemas.LegalComplianceTaskCreate, db: Session = Depends(get_db)):
    return crud.create_legal_compliance_task(db, data)


@router.put("/tasks/{id}", response_model=schemas.LegalComplianceTaskOut)
def edit_task(id: int, data: schemas.LegalComplianceTaskUpdate, db: Session = Depends(get_db)):
    row = crud.update_legal_compliance_task(db, id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Compliance task not found")
    return row


@router.delete("/tasks/{id}")
def remove_task(id: int, db: Session = Depends(get_db)):
    if not crud.delete_legal_compliance_task(db, id):
        raise HTTPException(status_code=404, detail="Compliance task not found")
    return {"ok": True}


@router.get("/search", response_model=schemas.LegalSearchResponse)
def search_documents(
    query: str = Query(..., min_length=2),
    jurisdiction: str | None = None,
    category: str | None = None,
    source: str | None = None,
    provider: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    provider_name, rows = _run_legal_search(
        db,
        query=query,
        jurisdiction=jurisdiction,
        category=category,
        source=source,
        limit=limit,
        provider_hint=provider,
    )
    if not rows:
        try:
            web_rows = search_web_legal_case_references(
                query=query,
                jurisdiction=jurisdiction,
                category=category,
                limit=min(limit, 12),
            )
        except Exception:
            web_rows = []
        if web_rows:
            rows = web_rows
            provider_name = f"{provider_name} (internet case fallback)"

    logging_enabled = os.getenv("LEGAL_SEARCH_LOGGING_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if logging_enabled:
        try:
            crud.create_legal_search_log(
                db,
                query_text=query,
                jurisdiction=jurisdiction,
                category=category,
                source=source,
                provider=provider_name,
                results_count=len(rows),
            )
        except Exception:
            pass
    return schemas.LegalSearchResponse(
        query=query,
        provider=provider_name,
        total=len(rows),
        documents=[schemas.LegalSearchDocument(**row) for row in rows],
        generated_at=datetime.utcnow(),
    )


@router.get("/integration/status", response_model=schemas.LegalIntegrationStatusResponse)
def legal_integration_status():
    status = get_lex_miner_integration_status()
    return schemas.LegalIntegrationStatusResponse(**status)


@router.post("/recommendation", response_model=schemas.LegalRecommendationResponse)
def legal_recommendation(payload: schemas.LegalRecommendationRequest, db: Session = Depends(get_db)):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    provider_hint = (payload.provider or "").strip().lower() or None
    if provider_hint == "auto":
        provider_hint = None

    top_k = max(1, min(payload.top_k, 10))
    provider_name, rows = _run_legal_search(
        db,
        query=query,
        jurisdiction=payload.jurisdiction,
        category=payload.category,
        source=payload.source,
        limit=max(5, min(top_k * 3, 40)),
        provider_hint=provider_hint,
    )
    references = rows[:top_k]
    if not references and provider_hint != "database":
        refined_query = _keyword_query(query)
        if refined_query and refined_query != query.lower():
            _, refined_rows = _run_legal_search(
                db,
                query=refined_query,
                jurisdiction=payload.jurisdiction,
                category=payload.category,
                source=payload.source,
                limit=max(5, min(top_k * 3, 40)),
                provider_hint=provider_hint,
            )
            references = refined_rows[:top_k]

    # Internet augmentation for case-style recommendations.
    web_case_limit = max(0, top_k - len(references))
    if web_case_limit > 0 and len(references) == 0:
        try:
            web_case_rows = search_web_legal_case_references(
                query=query,
                jurisdiction=payload.jurisdiction,
                category=payload.category,
                limit=max(web_case_limit, min(3, top_k)),
            )
        except Exception:
            web_case_rows = []
        if web_case_rows:
            references = _merge_reference_rows(references, web_case_rows, top_k)

    summary = _empty_legal_summary()
    try:
        summary = crud.get_legal_summary(db)
    except Exception:
        summary = _empty_legal_summary()
    instructions = (payload.instructions or "").strip()
    response_language = (payload.response_language or "uz").strip().lower()
    if response_language not in {"uz", "ru", "en"}:
        response_language = "uz"
    response_language_label = _language_label(response_language)

    lex_advice_error = ""
    if provider_hint != "database":
        lex_question = query if not instructions else f"{query}\n\nAdditional instructions: {instructions}"
        try:
            lex_response = request_lex_miner_advice(
                question=lex_question,
                company_context=_build_company_context(summary, instructions),
                response_language=response_language,
                max_documents=max(8, top_k + 3),
            )
            lex_answer = str(lex_response.get("recommendation") or "").strip()
            lex_references = _normalize_search_rows(lex_response.get("references") or [])[:top_k]
            if lex_answer:
                return schemas.LegalRecommendationResponse(
                    query=query,
                    provider=str(lex_response.get("provider") or "lex_miner_advice"),
                    recommendation=lex_answer,
                    references=[schemas.LegalSearchDocument(**row) for row in (lex_references or references)],
                    model=lex_response.get("model"),
                    confidence=lex_response.get("confidence"),
                    disclaimer=lex_response.get("disclaimer"),
                    generated_at=datetime.utcnow(),
                )
        except LexMinerIntegrationError as exc:
            lex_advice_error = str(exc)

    context = _build_recommendation_context(db, references, summary=summary)
    prompt = query if not instructions else f"{query}\n\nAdditional instructions: {instructions}"
    prompt = (
        f"{prompt}\n\n"
        f"Response language: {response_language_label}. "
        f"Write the full recommendation only in {response_language_label}. "
        "Return plain text in this exact logical flow: Case Analysis, Recommendation 1 with Steps, "
        "Recommendation 2 with Steps, Recommendation 3 with Steps, Conclusion."
    )

    if lex_advice_error:
        context = (
            f"{context}\n\n"
            f"INTEGRATION NOTE: Lex miner advice endpoint is unavailable: {lex_advice_error}. "
            "Proceed with local recommendation generation."
        )

    agent = BaseAgent(
        name="Legal Advisory Agent",
        system_prompt=(
            "You are a senior legal operations advisor for enterprise clients using Benela AI. "
            "Act like experienced legal counsel with practical enterprise portfolio experience. "
            "Use provided legal references, internet case references, and workspace metrics to give practical guidance. "
            "Do not present this as formal legal advice. "
            f"Always answer in {response_language_label}. "
            "Never use markdown syntax. No headings, bullets, or numbered lists. Plain text only. "
            "Output must include at least 3 distinct recommendations. "
            "For each recommendation include: strategy name, why it fits this case, and explicit implementation steps. "
            "Always include one operational recommendation and one financial/risk-cost recommendation; include workforce/process-change recommendation only if evidence supports it. "
            "Avoid generic advice; tie every action to current case facts and references. "
            "End with a clear conclusion that selects the recommended priority path and expected business impact. "
            "Cite reference numbers like [1], [2] where relevant."
        ),
    )

    recommendation = ""
    used_provider = ""
    used_model = ""
    local_errors: list[str] = []

    for provider_name_for_ai, model_name in _recommendation_attempts(payload.model):
        if not _provider_configured(provider_name_for_ai):
            continue
        try:
            recommendation = agent.run(
                prompt,
                context=context,
                model=model_name,
                provider=provider_name_for_ai,
            ).strip()
            if recommendation:
                if not _recommendation_meets_quality_bar(recommendation, response_language):
                    recommendation = _build_deterministic_recommendation(
                        query=query,
                        references=references,
                        summary=summary,
                        response_language=response_language,
                        instructions=instructions,
                    )
                    used_provider = "deterministic"
                    used_model = model_name
                    break
                used_provider = provider_name_for_ai
                used_model = model_name
                break
        except Exception as exc:
            local_errors.append(f"{provider_name_for_ai}:{str(exc)}")

    if not recommendation:
        recommendation = _build_deterministic_recommendation(
            query=query,
            references=references,
            summary=summary,
            response_language=response_language,
            instructions=instructions,
        )
        used_provider = "deterministic"

    result_provider = provider_name
    if lex_advice_error:
        result_provider = f"{provider_name} (lex advice fallback: {used_provider})"
    elif used_provider and used_provider != "anthropic":
        result_provider = f"{provider_name} ({used_provider})"

    confidence = "medium"
    if used_provider == "deterministic":
        confidence = "low"
    elif used_provider == "openai":
        confidence = "medium"

    if local_errors and used_provider != "deterministic":
        result_provider = f"{result_provider} (resilient)"

    return schemas.LegalRecommendationResponse(
        query=query,
        provider=result_provider,
        recommendation=recommendation,
        references=[schemas.LegalSearchDocument(**row) for row in references],
        model=used_model or payload.model,
        confidence=confidence,
        disclaimer=(
            "This response is informational and grounded on workspace metrics plus matched legal references. "
            "For binding legal interpretation, consult a licensed legal professional."
        ),
        generated_at=datetime.utcnow(),
    )
