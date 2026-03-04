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

    summary = _empty_legal_summary()
    if provider_hint in {"database", "db", "local"}:
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
        f"Write the full recommendation only in {response_language_label}."
    )

    if lex_advice_error:
        context = (
            f"{context}\n\n"
            f"INTEGRATION NOTE: Lex miner advice endpoint is unavailable: {lex_advice_error}. "
            "Proceed with local recommendation generation."
        )

    if not settings.ANTHROPIC_API_KEY:
        if lex_advice_error:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Lex miner advice is unavailable and local Claude API key is not configured. "
                    f"Lex error: {lex_advice_error}"
                ),
            )
        raise HTTPException(status_code=503, detail="Claude API key is not configured.")

    agent = BaseAgent(
        name="Legal Advisory Agent",
        system_prompt=(
            "You are a senior legal operations advisor for enterprise clients using Benela AI. "
            "Use provided legal references and workspace metrics to give practical guidance. "
            "Do not present this as formal legal advice. "
            f"Always answer in {response_language_label}. "
            "Never use markdown syntax. No headings, bullets, or numbered lists. Plain text only. "
            "Structure output in clear plain text sections: Situation, Risks, Recommended Actions, Next Evidence Needed. "
            "Always cite reference numbers like [1], [2] where relevant."
        ),
    )

    try:
        recommendation = agent.run(prompt, context=context, model=payload.model)
    except Exception as exc:
        message = str(exc).lower()
        if "401" in message or "authentication" in message:
            raise HTTPException(status_code=401, detail="Claude authentication failed.")
        if "429" in message or "rate" in message:
            raise HTTPException(status_code=429, detail="Claude rate limit reached. Retry shortly.")
        if "529" in message or "overloaded" in message:
            raise HTTPException(status_code=503, detail="Claude is temporarily overloaded. Retry shortly.")
        raise HTTPException(status_code=503, detail="Could not generate legal recommendation right now.")

    result_provider = provider_name
    if lex_advice_error:
        result_provider = f"{provider_name} (lex advice fallback: local)"

    return schemas.LegalRecommendationResponse(
        query=query,
        provider=result_provider,
        recommendation=recommendation,
        references=[schemas.LegalSearchDocument(**row) for row in references],
        model=payload.model,
        confidence="medium",
        disclaimer=(
            "This response is informational and grounded on workspace metrics plus matched legal references. "
            "For binding legal interpretation, consult a licensed legal professional."
        ),
        generated_at=datetime.utcnow(),
    )
