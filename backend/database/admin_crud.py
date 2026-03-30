from datetime import datetime, timedelta
import hashlib
import html as html_lib
import json
import os
import re
import secrets
from typing import List, Optional

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from database.models import (
    ClientOrg,
    ClientWorkspaceAccount,
    Subscription,
    Payment,
    PaymentMethod,
    PaymentMethodType,
    AdminNotification,
    ClientActivity,
    PlanTier,
    PlanStatus,
    PaymentStatus,
    NotificationType,
    NotificationTarget,
    PlatformSettings,
    PlatformAboutPage,
    PlatformBlogPost,
    PlatformBlogComment,
    ClientBusinessDocument,
    ClientPlatformReport,
    AITrainerProfile,
    AITrainerSource,
    AITrainerChunk,
)
from database import admin_schemas

_PAYMENT_METHODS_SEEDED = False

_DEFAULT_PLATFORM_ABOUT = {
    "hero_eyebrow": "ABOUT BENELA",
    "hero_title": "A unified AI operating system for serious businesses.",
    "hero_subtitle": (
        "Benela brings finance, operations, collaboration, and AI execution into one platform so teams can run the "
        "company with fewer tools, faster decisions, and stronger control."
    ),
    "story_title": "Our Platform",
    "story_body": (
        "Benela is built for companies that have outgrown disconnected spreadsheets, chat threads, and point "
        "solutions. We combine ERP workflows, collaboration, reporting, and AI copilots into a single command layer."
    ),
    "platform_highlights": [
        {
            "title": "One operational layer",
            "description": "Finance, HR, projects, support, legal, procurement, and more in a single connected system.",
            "metric": "9 modules",
        },
        {
            "title": "Embedded AI execution",
            "description": "Assistants analyze context, generate reports, structure work, and trigger next actions.",
            "metric": "24/7 AI",
        },
        {
            "title": "Built for control",
            "description": "Real-time visibility, approval flows, audit trails, and configurable governance for leadership teams.",
            "metric": "Full traceability",
        },
    ],
    "mission_title": "Our Mission",
    "mission_body": (
        "We help ambitious teams run faster, with better visibility and stronger discipline, by turning operational "
        "complexity into one intelligent system."
    ),
    "mission_points": [
        {
            "title": "Replace fragmentation",
            "description": "Unify tools, workflows, and knowledge so teams stop losing time between disconnected systems.",
        },
        {
            "title": "Increase execution speed",
            "description": "Give managers and operators a live command layer for decisions, follow-through, and accountability.",
        },
        {
            "title": "Make AI operational",
            "description": "Use AI for actual business execution, not just chat, by grounding it in company context and workflows.",
        },
    ],
    "team_title": "Leadership Team",
    "team_body": (
        "Product, engineering, operations, and customer success leaders building the next generation of business infrastructure."
    ),
    "team_members": [
        {
            "name": "Shavkat M.",
            "role": "Founder & Product Lead",
            "bio": "Leads product direction, market strategy, and the operating model behind Benela.",
        },
        {
            "name": "Core Platform Team",
            "role": "Engineering & Infrastructure",
            "bio": "Builds the platform foundation across data, integrations, AI orchestration, and application performance.",
        },
        {
            "name": "Client Operations Team",
            "role": "Implementation & Success",
            "bio": "Works with clients on onboarding, rollout design, adoption, and measurable operational improvement.",
        },
    ],
    "faq_title": "Frequently Asked Questions",
    "faq_body": "Answers to the most important questions prospects and clients ask before rollout.",
    "faqs": [
        {
            "question": "Who is Benela built for?",
            "answer": "Benela is designed for growing and established companies that need one operating system across finance, operations, people, and AI-assisted execution.",
        },
        {
            "question": "Do you offer a free plan?",
            "answer": "No. Benela is sold on paid plans, with a limited trial window configured by platform policy for qualified new accounts.",
        },
        {
            "question": "Can Benela be tailored to our workflows?",
            "answer": "Yes. Modules, policies, AI trainers, internal assistants, and integrations can be configured around how your company actually operates.",
        },
        {
            "question": "How does the AI stay useful?",
            "answer": "Benela assistants use live platform context, trained knowledge sources, and module-specific workflows to provide grounded output and actions.",
        },
    ],
}

_DEFAULT_PLATFORM_BLOG_POSTS = [
    {
        "title": "Introducing the Benela Journal",
        "slug": "introducing-the-benela-journal",
        "excerpt": "A new editorial home for Benela news, industry analysis, operating insights, and product updates.",
        "cover_image_url": "",
        "category": "Company News",
        "author_name": "Benela Editorial Team",
        "tags": ["Benela", "News", "Operations"],
        "content_markdown": (
            "## A new publishing layer for serious operators\n\n"
            "The Benela Journal is where we publish product updates, operating insights, industry breakdowns, and "
            "practical guidance for business teams using AI-native systems.\n\n"
            "### What you can expect\n\n"
            "- Product launch notes and roadmap signals\n"
            "- Industry and business operations analysis\n"
            "- Implementation lessons from modern ERP rollouts\n"
            "- Perspectives on AI, governance, and company execution\n\n"
            "### Why this matters\n\n"
            "Benela is not only software. It is a point of view on how ambitious companies should run. The journal gives "
            "that point of view a permanent, searchable home.\n"
        ),
        "seo_title": "Introducing the Benela Journal",
        "seo_description": "Meet the new editorial home for Benela news, business insights, and industry analysis.",
        "is_published": True,
        "is_featured": True,
    }
]

_DEFAULT_PRICING_PLANS = [
    {
        "id": "starter",
        "name": "Starter",
        "description": "For small organizations building their ERP foundation.",
        "price_monthly": 49,
        "price_yearly": 490,
        "users": "Up to 10 users",
        "recommended": False,
        "features": [
            {"label": "Finance, HR, Sales, Support", "included": True},
            {"label": "AI copilots for all included modules", "included": True},
            {"label": "Marketplace app installs", "included": True},
            {"label": "Custom integrations", "included": False},
        ],
    },
    {
        "id": "pro",
        "name": "Pro",
        "description": "For scaling teams that need full operational visibility.",
        "price_monthly": 149,
        "price_yearly": 1490,
        "users": "Up to 50 users",
        "recommended": True,
        "features": [
            {"label": "All Benela core modules", "included": True},
            {"label": "Unlimited AI assistant prompts", "included": True},
            {"label": "Advanced analytics and forecasting", "included": True},
            {"label": "Dedicated success manager", "included": True},
        ],
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "description": "For regulated and multi-entity organizations with custom SLAs.",
        "price_monthly": 499,
        "price_yearly": 4990,
        "users": "Unlimited users",
        "recommended": False,
        "features": [
            {"label": "Private deployment options", "included": True},
            {"label": "SSO / SCIM and custom RBAC policies", "included": True},
            {"label": "24/7 priority support and SLA", "included": True},
            {"label": "Custom AI model routing", "included": True},
        ],
    },
]


def _normalize_pricing_plans(plans: Optional[list]) -> list[dict]:
    normalized: list[dict] = []
    for index, raw_plan in enumerate(plans or []):
        if not isinstance(raw_plan, dict):
            continue
        features = []
        for raw_feature in raw_plan.get("features") or []:
            if not isinstance(raw_feature, dict) or not str(raw_feature.get("label") or "").strip():
                continue
            features.append(
                {
                    "label": str(raw_feature.get("label") or "").strip(),
                    "included": bool(raw_feature.get("included", True)),
                }
            )
        plan_id = str(raw_plan.get("id") or "").strip().lower()
        name = str(raw_plan.get("name") or "").strip()
        if not plan_id or not name:
            continue
        normalized.append(
            {
                "id": plan_id,
                "name": name,
                "description": str(raw_plan.get("description") or "").strip(),
                "price_monthly": round(float(raw_plan.get("price_monthly") or 0), 2),
                "price_yearly": round(float(raw_plan.get("price_yearly") or 0), 2),
                "users": str(raw_plan.get("users") or "").strip(),
                "recommended": bool(raw_plan.get("recommended", False)),
                "features": features,
            }
        )
    return normalized or json.loads(json.dumps(_DEFAULT_PRICING_PLANS))


# ── Platform summary ──────────────────────────────────
def get_platform_summary(db: Session):
    total_clients = db.query(func.count(ClientWorkspaceAccount.id)).scalar() or 0
    suspended = (
        db.query(func.count(ClientWorkspaceAccount.id))
        .outerjoin(ClientOrg, ClientOrg.id == ClientWorkspaceAccount.client_org_id)
        .filter(ClientOrg.is_suspended == True)
        .scalar()
        or 0
    )
    active_clients = max(0, total_clients - suspended)
    total_mrr = (
        db.query(func.sum(Subscription.price_monthly))
        .join(ClientWorkspaceAccount, ClientWorkspaceAccount.subscription_id == Subscription.id)
        .filter(Subscription.status.in_([PlanStatus.active, PlanStatus.trial]))
        .scalar()
        or 0
    )
    trial_count = (
        db.query(func.count(ClientWorkspaceAccount.id))
        .filter(
            ClientWorkspaceAccount.trial_ends_at.isnot(None),
            ClientWorkspaceAccount.trial_ends_at > datetime.utcnow(),
        )
        .scalar()
        or 0
    )
    payment_required_count = (
        db.query(func.count(ClientWorkspaceAccount.id))
        .filter(ClientWorkspaceAccount.payment_required == True)
        .scalar()
        or 0
    )
    setup_pending_count = (
        db.query(func.count(ClientWorkspaceAccount.id))
        .filter(ClientWorkspaceAccount.onboarding_completed == False)
        .scalar()
        or 0
    )
    open_reports_count = (
        db.query(func.count(ClientPlatformReport.id))
        .filter(ClientPlatformReport.status.notin_(["resolved", "dismissed"]))
        .scalar()
        or 0
    )
    pending_documents_count = (
        db.query(func.count(ClientBusinessDocument.id))
        .filter(ClientBusinessDocument.verification_status == "pending")
        .scalar()
        or 0
    )
    start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    paid_this_month = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.status == PaymentStatus.paid, Payment.paid_at >= start_of_month)
        .scalar()
        or 0
    )
    plan_breakdown = {}
    for tier in PlanTier:
        count = (
            db.query(func.count(ClientWorkspaceAccount.id))
            .filter(ClientWorkspaceAccount.plan_tier == tier)
            .scalar()
            or 0
        )
        plan_breakdown[tier.value] = count
    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "suspended": suspended,
        "monthly_recurring_revenue": round(float(total_mrr), 2),
        "paid_this_month": round(float(paid_this_month), 2),
        "trials_active": trial_count,
        "payment_required_count": payment_required_count,
        "setup_pending_count": setup_pending_count,
        "open_reports_count": open_reports_count,
        "pending_documents_count": pending_documents_count,
        "plan_breakdown": plan_breakdown,
    }


def get_revenue_chart(db: Session, months: int = 12) -> List[dict]:
    result = []
    today = datetime.now()
    for i in range(months - 1, -1, -1):
        # i months ago
        year = today.year
        month = today.month - (i + 1)
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1, 0, 0, 0, 0)
        if month == 12:
            end = datetime(year + 1, 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        else:
            end = datetime(year, month + 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        revenue = (
            db.query(func.sum(Payment.amount))
            .filter(
                Payment.status == PaymentStatus.paid,
                Payment.paid_at >= start,
                Payment.paid_at <= end,
            )
            .scalar()
            or 0
        )
        result.append({
            "month": start.strftime("%b %Y"),
            "revenue": round(float(revenue), 2),
        })
    return result


def get_clients_with_subscriptions(db: Session) -> List[dict]:
    clients = db.query(ClientOrg).order_by(ClientOrg.created_at.desc()).all()
    result = []
    for c in clients:
        sub = (
            db.query(Subscription)
            .filter(Subscription.client_id == c.id)
            .order_by(Subscription.created_at.desc())
            .first()
        )
        result.append({"client": c, "subscription": sub})
    return result


# ── Platform Settings ─────────────────────────────────
def _ensure_platform_settings(db: Session):
    settings = db.query(PlatformSettings).first()
    if settings:
        if settings.pricing_plans is None:
            settings.pricing_plans = json.loads(json.dumps(_DEFAULT_PRICING_PLANS))
            db.commit()
            db.refresh(settings)
        return settings
    settings = PlatformSettings(
        platform_name="Benela AI",
        default_currency="USD",
        default_trial_days=14,
        default_tax_rate=0,
        invoice_prefix="BNL",
        maintenance_mode=False,
        allow_new_signups=True,
        enforce_admin_mfa=False,
        session_timeout_minutes=60,
        allow_marketplace=True,
        allow_plugin_purchases=True,
        pricing_plans=json.loads(json.dumps(_DEFAULT_PRICING_PLANS)),
        webhook_signing_secret=f"whsec_{secrets.token_urlsafe(24)}",
        platform_api_key=f"bnl_{secrets.token_urlsafe(24)}",
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def get_platform_settings(db: Session):
    return _ensure_platform_settings(db)


def update_platform_settings(db: Session, data: admin_schemas.PlatformSettingsUpdate):
    settings = _ensure_platform_settings(db)
    updates = data.model_dump(exclude_unset=True)

    if "default_currency" in updates and updates["default_currency"] is not None:
        updates["default_currency"] = updates["default_currency"].upper().strip()
    if "invoice_prefix" in updates and updates["invoice_prefix"] is not None:
        updates["invoice_prefix"] = updates["invoice_prefix"].upper().strip()

    if "default_trial_days" in updates:
        days = updates["default_trial_days"]
        if days is not None and (days < 0 or days > 365):
            raise ValueError("default_trial_days must be between 0 and 365")

    if "default_tax_rate" in updates:
        tax = updates["default_tax_rate"]
        if tax is not None and (tax < 0 or tax > 100):
            raise ValueError("default_tax_rate must be between 0 and 100")

    if "session_timeout_minutes" in updates:
        timeout = updates["session_timeout_minutes"]
        if timeout is not None and (timeout < 5 or timeout > 1440):
            raise ValueError("session_timeout_minutes must be between 5 and 1440")

    if "pricing_plans" in updates and updates["pricing_plans"] is not None:
        updates["pricing_plans"] = _normalize_pricing_plans(updates["pricing_plans"])

    for key, value in updates.items():
        setattr(settings, key, value)

    db.commit()
    db.refresh(settings)
    return settings


def get_platform_pricing_plans(db: Session) -> list[dict]:
    settings = _ensure_platform_settings(db)
    settings.pricing_plans = _normalize_pricing_plans(settings.pricing_plans)
    db.commit()
    db.refresh(settings)
    return settings.pricing_plans


def update_platform_pricing_plans(db: Session, plans: list[dict]) -> list[dict]:
    settings = _ensure_platform_settings(db)
    settings.pricing_plans = _normalize_pricing_plans(plans)
    db.commit()
    db.refresh(settings)
    return settings.pricing_plans


def set_maintenance_mode(db: Session, enabled: bool):
    settings = _ensure_platform_settings(db)
    settings.maintenance_mode = enabled
    db.commit()
    db.refresh(settings)
    return settings


def emergency_lockdown(db: Session):
    settings = _ensure_platform_settings(db)
    settings.maintenance_mode = True
    settings.allow_new_signups = False
    settings.allow_plugin_purchases = False
    db.commit()
    db.refresh(settings)
    return settings


def rotate_platform_api_key(db: Session):
    settings = _ensure_platform_settings(db)
    settings.platform_api_key = f"bnl_{secrets.token_urlsafe(24)}"
    db.commit()
    db.refresh(settings)
    return settings.platform_api_key


def rotate_webhook_signing_secret(db: Session):
    settings = _ensure_platform_settings(db)
    settings.webhook_signing_secret = f"whsec_{secrets.token_urlsafe(24)}"
    db.commit()
    db.refresh(settings)
    return settings.webhook_signing_secret


def _ensure_platform_about_page(db: Session):
    page = db.query(PlatformAboutPage).first()
    if page:
        return page

    page = PlatformAboutPage(**_DEFAULT_PLATFORM_ABOUT)
    db.add(page)
    db.commit()
    db.refresh(page)
    return page


def get_platform_about_page(db: Session):
    return _ensure_platform_about_page(db)


def update_platform_about_page(db: Session, data: admin_schemas.PlatformAboutPageUpdate):
    page = _ensure_platform_about_page(db)
    updates = data.model_dump(exclude_unset=True)

    for key, value in updates.items():
        setattr(page, key, value)

    db.commit()
    db.refresh(page)
    return page


def _slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9\\s-]", "", (value or "").strip().lower())
    value = re.sub(r"[\\s_-]+", "-", value)
    value = re.sub(r"^-+|-+$", "", value)
    return value or f"post-{secrets.token_hex(4)}"


def _normalize_blog_tags(tags: Optional[list[str]]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for item in tags or []:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(cleaned[:40])
    return normalized


def _blog_category_slug(category: Optional[str]) -> str:
    return _slugify(category or "general") or "general"


def _blog_tag_slugs(tags: Optional[list[str]]) -> list[str]:
    slugs: list[str] = []
    seen: set[str] = set()
    for tag in tags or []:
        slug = _slugify(tag or "")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        slugs.append(slug)
    return slugs


def _strip_markdown(content: str) -> str:
    text = re.sub(r"`{1,3}.*?`{1,3}", " ", content or "", flags=re.S)
    text = re.sub(r"!\\[[^\\]]*\\]\\([^\\)]*\\)", " ", text)
    text = re.sub(r"\\[[^\\]]*\\]\\([^\\)]*\\)", " ", text)
    text = re.sub(r"[#>*_~\\-]{1,}", " ", text)
    text = re.sub(r"\\s+", " ", text)
    return html_lib.unescape(text).strip()


def _estimate_read_time_minutes(content: str) -> int:
    words = len((_strip_markdown(content) or "").split())
    if words <= 0:
        return 1
    return max(1, int(round(words / 220.0)))


def _build_blog_excerpt(excerpt: Optional[str], content: str) -> str:
    cleaned = (excerpt or "").strip()
    if cleaned:
        return cleaned[:320]
    generated = _strip_markdown(content)
    return generated[:280].strip()


def _build_unique_blog_slug(db: Session, title: str, requested_slug: Optional[str] = None, exclude_id: Optional[int] = None) -> str:
    base = _slugify(requested_slug or title)
    slug = base
    suffix = 2
    while True:
        query = db.query(PlatformBlogPost).filter(PlatformBlogPost.slug == slug)
        if exclude_id is not None:
            query = query.filter(PlatformBlogPost.id != exclude_id)
        if not query.first():
            return slug
        slug = f"{base}-{suffix}"
        suffix += 1


def _ensure_platform_blog_seed(db: Session):
    if os.getenv("SEED_DEFAULT_BLOG_POSTS", "").strip().lower() not in {"1", "true", "yes", "on"}:
        return
    existing = db.query(PlatformBlogPost).first()
    if existing:
        return

    for item in _DEFAULT_PLATFORM_BLOG_POSTS:
        post = PlatformBlogPost(
            title=item["title"],
            slug=item["slug"],
            excerpt=item["excerpt"],
            cover_image_url=item["cover_image_url"] or None,
            category=item["category"],
            author_name=item["author_name"],
            tags=item["tags"],
            content_markdown=item["content_markdown"],
            seo_title=item["seo_title"],
            seo_description=item["seo_description"],
            is_published=bool(item["is_published"]),
            is_featured=bool(item["is_featured"]),
            read_time_minutes=_estimate_read_time_minutes(item["content_markdown"]),
            published_at=datetime.utcnow() if item["is_published"] else None,
        )
        db.add(post)
    db.commit()


def _serialize_public_blog_comment(comment: PlatformBlogComment):
    return admin_schemas.PublicBlogCommentOut(
        id=comment.id,
        author_name=comment.author_name,
        body=comment.body,
        created_at=comment.created_at,
    )


def _serialize_admin_blog_comment(comment: PlatformBlogComment, post: PlatformBlogPost):
    return admin_schemas.AdminBlogCommentOut(
        id=comment.id,
        post_id=comment.post_id,
        post_title=post.title,
        post_slug=post.slug,
        post_category_slug=_blog_category_slug(post.category),
        author_name=comment.author_name,
        author_email=comment.author_email,
        body=comment.body,
        status=comment.status,
        created_at=comment.created_at,
        reviewed_at=comment.reviewed_at,
    )


def _serialize_admin_blog_post(
    post: PlatformBlogPost,
    comments_total: int = 0,
    comments_pending: int = 0,
):
    return admin_schemas.AdminBlogPostListOut(
        id=post.id,
        title=post.title,
        slug=post.slug,
        category_slug=_blog_category_slug(post.category),
        excerpt=post.excerpt,
        cover_image_url=post.cover_image_url,
        category=post.category,
        author_name=post.author_name,
        tags=list(post.tags or []),
        tag_slugs=_blog_tag_slugs(list(post.tags or [])),
        is_published=bool(post.is_published),
        is_featured=bool(post.is_featured),
        read_time_minutes=post.read_time_minutes,
        comments_total=comments_total,
        comments_pending=comments_pending,
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _serialize_public_blog_post(post: PlatformBlogPost):
    return admin_schemas.PublicBlogPostSummaryOut(
        id=post.id,
        title=post.title,
        slug=post.slug,
        category_slug=_blog_category_slug(post.category),
        excerpt=post.excerpt,
        cover_image_url=post.cover_image_url,
        category=post.category,
        author_name=post.author_name,
        tags=list(post.tags or []),
        tag_slugs=_blog_tag_slugs(list(post.tags or [])),
        read_time_minutes=post.read_time_minutes,
        is_featured=bool(post.is_featured),
        published_at=post.published_at,
    )


def get_platform_blog_summary(db: Session):
    _ensure_platform_blog_seed(db)
    total_posts = db.query(func.count(PlatformBlogPost.id)).scalar() or 0
    published_posts = db.query(func.count(PlatformBlogPost.id)).filter(PlatformBlogPost.is_published == True).scalar() or 0
    featured_posts = db.query(func.count(PlatformBlogPost.id)).filter(PlatformBlogPost.is_featured == True).scalar() or 0
    pending_comments = db.query(func.count(PlatformBlogComment.id)).filter(PlatformBlogComment.status == "pending").scalar() or 0
    approved_comments = db.query(func.count(PlatformBlogComment.id)).filter(PlatformBlogComment.status == "approved").scalar() or 0
    return admin_schemas.AdminBlogSummaryOut(
        total_posts=total_posts,
        published_posts=published_posts,
        draft_posts=max(0, total_posts - published_posts),
        featured_posts=featured_posts,
        pending_comments=pending_comments,
        approved_comments=approved_comments,
    )


def list_platform_blog_posts(
    db: Session,
    q: Optional[str] = None,
    status: str = "all",
    limit: int = 200,
):
    _ensure_platform_blog_seed(db)
    query = db.query(PlatformBlogPost).order_by(
        PlatformBlogPost.is_featured.desc(),
        PlatformBlogPost.published_at.desc().nullslast(),
        PlatformBlogPost.updated_at.desc(),
    )
    if status == "published":
        query = query.filter(PlatformBlogPost.is_published == True)
    elif status == "draft":
        query = query.filter(PlatformBlogPost.is_published == False)
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(PlatformBlogPost.title).like(term)
            | func.lower(func.coalesce(PlatformBlogPost.excerpt, "")).like(term)
            | func.lower(func.coalesce(PlatformBlogPost.category, "")).like(term)
        )
    posts = query.limit(limit).all()
    post_ids = [item.id for item in posts]
    comment_counts = {
        post_id: {"total": total, "pending": pending}
        for post_id, total, pending in (
            db.query(
                PlatformBlogComment.post_id,
                func.count(PlatformBlogComment.id),
                func.sum(case((PlatformBlogComment.status == "pending", 1), else_=0)),
            )
            .filter(PlatformBlogComment.post_id.in_(post_ids))
            .group_by(PlatformBlogComment.post_id)
            .all()
            if post_ids
            else []
        )
    }
    return [
        _serialize_admin_blog_post(
            post,
            comments_total=int(comment_counts.get(post.id, {}).get("total") or 0),
            comments_pending=int(comment_counts.get(post.id, {}).get("pending") or 0),
        )
        for post in posts
    ]


def get_platform_blog_post(db: Session, post_id: int):
    _ensure_platform_blog_seed(db)
    post = db.query(PlatformBlogPost).filter(PlatformBlogPost.id == post_id).first()
    if not post:
        return None
    comments = (
        db.query(PlatformBlogComment)
        .filter(PlatformBlogComment.post_id == post.id)
        .order_by(PlatformBlogComment.created_at.desc(), PlatformBlogComment.id.desc())
        .all()
    )
    comments_total = len(comments)
    comments_pending = sum(1 for item in comments if item.status == "pending")
    row = _serialize_admin_blog_post(post, comments_total=comments_total, comments_pending=comments_pending)
    return admin_schemas.AdminBlogPostDetailOut(
        **row.model_dump(),
        content_markdown=post.content_markdown,
        seo_title=post.seo_title,
        seo_description=post.seo_description,
        comments=[_serialize_admin_blog_comment(comment, post) for comment in comments],
    )


def create_platform_blog_post(db: Session, data: admin_schemas.AdminBlogPostCreate):
    _ensure_platform_blog_seed(db)
    payload = data.model_dump()
    slug = _build_unique_blog_slug(db, payload["title"], payload.get("slug"))
    is_published = bool(payload.get("is_published"))
    post = PlatformBlogPost(
        title=payload["title"].strip(),
        slug=slug,
        excerpt=_build_blog_excerpt(payload.get("excerpt"), payload.get("content_markdown", "")),
        cover_image_url=(payload.get("cover_image_url") or "").strip() or None,
        category=(payload.get("category") or "Insights").strip(),
        author_name=(payload.get("author_name") or "Benela Team").strip(),
        tags=_normalize_blog_tags(payload.get("tags")),
        content_markdown=payload.get("content_markdown", "").strip(),
        seo_title=(payload.get("seo_title") or "").strip() or None,
        seo_description=(payload.get("seo_description") or "").strip() or None,
        is_published=is_published,
        is_featured=bool(payload.get("is_featured")),
        read_time_minutes=_estimate_read_time_minutes(payload.get("content_markdown", "")),
        published_at=payload.get("published_at") or (datetime.utcnow() if is_published else None),
    )
    if post.is_featured:
        db.query(PlatformBlogPost).update({"is_featured": False})
    db.add(post)
    db.commit()
    db.refresh(post)
    return get_platform_blog_post(db, post.id)


def update_platform_blog_post(db: Session, post_id: int, data: admin_schemas.AdminBlogPostUpdate):
    post = db.query(PlatformBlogPost).filter(PlatformBlogPost.id == post_id).first()
    if not post:
        return None
    payload = data.model_dump(exclude_unset=True)
    if "title" in payload and payload["title"] is not None:
        post.title = payload["title"].strip()
    if "slug" in payload:
        post.slug = _build_unique_blog_slug(db, post.title, payload.get("slug"), exclude_id=post.id)
    if "category" in payload and payload["category"] is not None:
        post.category = payload["category"].strip()
    if "author_name" in payload and payload["author_name"] is not None:
        post.author_name = payload["author_name"].strip()
    if "tags" in payload and payload["tags"] is not None:
        post.tags = _normalize_blog_tags(payload["tags"])
    if "cover_image_url" in payload:
        post.cover_image_url = (payload.get("cover_image_url") or "").strip() or None
    if "content_markdown" in payload and payload["content_markdown"] is not None:
        post.content_markdown = payload["content_markdown"].strip()
    if "excerpt" in payload:
        post.excerpt = _build_blog_excerpt(payload.get("excerpt"), post.content_markdown)
    if "seo_title" in payload:
        post.seo_title = (payload.get("seo_title") or "").strip() or None
    if "seo_description" in payload:
        post.seo_description = (payload.get("seo_description") or "").strip() or None
    if "is_published" in payload and payload["is_published"] is not None:
        post.is_published = bool(payload["is_published"])
        if post.is_published and not post.published_at:
            post.published_at = datetime.utcnow()
        if not post.is_published:
            post.published_at = None
    if "published_at" in payload:
        post.published_at = payload.get("published_at")
    if "is_featured" in payload and payload["is_featured"] is not None:
        post.is_featured = bool(payload["is_featured"])
        if post.is_featured:
            db.query(PlatformBlogPost).filter(PlatformBlogPost.id != post.id).update({"is_featured": False})
    post.read_time_minutes = _estimate_read_time_minutes(post.content_markdown)
    db.commit()
    db.refresh(post)
    return get_platform_blog_post(db, post.id)


def delete_platform_blog_post(db: Session, post_id: int) -> bool:
    post = db.query(PlatformBlogPost).filter(PlatformBlogPost.id == post_id).first()
    if not post:
        return False
    db.delete(post)
    db.commit()
    return True


def list_platform_blog_comments(
    db: Session,
    status: str = "all",
    post_id: Optional[int] = None,
    limit: int = 300,
):
    _ensure_platform_blog_seed(db)
    query = db.query(PlatformBlogComment, PlatformBlogPost).join(
        PlatformBlogPost, PlatformBlogPost.id == PlatformBlogComment.post_id
    )
    if status != "all":
        query = query.filter(PlatformBlogComment.status == status)
    if post_id is not None:
        query = query.filter(PlatformBlogComment.post_id == post_id)
    rows = query.order_by(PlatformBlogComment.created_at.desc(), PlatformBlogComment.id.desc()).limit(limit).all()
    return [_serialize_admin_blog_comment(comment, post) for comment, post in rows]


def update_platform_blog_comment_status(db: Session, comment_id: int, status: str):
    comment = db.query(PlatformBlogComment).filter(PlatformBlogComment.id == comment_id).first()
    if not comment:
        return None
    comment.status = status
    comment.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(comment)
    post = db.query(PlatformBlogPost).filter(PlatformBlogPost.id == comment.post_id).first()
    if not post:
        return None
    return _serialize_admin_blog_comment(comment, post)


def list_public_blog_posts(db: Session, featured_only: bool = False, limit: int = 24):
    _ensure_platform_blog_seed(db)
    query = db.query(PlatformBlogPost).filter(PlatformBlogPost.is_published == True)
    if featured_only:
        query = query.filter(PlatformBlogPost.is_featured == True)
    posts = (
        query.order_by(
            PlatformBlogPost.is_featured.desc(),
            PlatformBlogPost.published_at.desc().nullslast(),
            PlatformBlogPost.updated_at.desc(),
        )
        .limit(limit)
        .all()
    )
    return [_serialize_public_blog_post(post) for post in posts]


def get_public_blog_post_by_slug(db: Session, slug: str):
    _ensure_platform_blog_seed(db)
    post = (
        db.query(PlatformBlogPost)
        .filter(PlatformBlogPost.slug == slug, PlatformBlogPost.is_published == True)
        .first()
    )
    if not post:
        return None
    comments = (
        db.query(PlatformBlogComment)
        .filter(
            PlatformBlogComment.post_id == post.id,
            PlatformBlogComment.status == "approved",
        )
        .order_by(PlatformBlogComment.created_at.desc(), PlatformBlogComment.id.desc())
        .all()
    )
    summary = _serialize_public_blog_post(post)
    return admin_schemas.PublicBlogPostDetailOut(
        **summary.model_dump(),
        content_markdown=post.content_markdown,
        seo_title=post.seo_title,
        seo_description=post.seo_description,
        comments=[_serialize_public_blog_comment(comment) for comment in comments],
    )


def get_public_blog_post_by_category_and_slug(db: Session, category_slug: str, slug: str):
    post = get_public_blog_post_by_slug(db, slug)
    if not post:
        return None
    if _blog_category_slug(post.category) != _slugify(category_slug or ""):
        return None
    return post


def create_public_blog_comment(db: Session, slug: str, data: admin_schemas.PublicBlogCommentCreate):
    post = db.query(PlatformBlogPost).filter(PlatformBlogPost.slug == slug, PlatformBlogPost.is_published == True).first()
    if not post:
        return None
    comment = PlatformBlogComment(
        post_id=post.id,
        author_name=data.author_name.strip(),
        author_email=data.author_email.strip().lower(),
        body=data.body.strip(),
        status="pending",
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return admin_schemas.PublicBlogCommentSubmissionOut(
        id=comment.id,
        status=comment.status,
        message="Comment submitted and waiting for review.",
    )


def create_public_blog_comment_by_category_and_slug(
    db: Session,
    category_slug: str,
    slug: str,
    data: admin_schemas.PublicBlogCommentCreate,
):
    post = db.query(PlatformBlogPost).filter(PlatformBlogPost.slug == slug, PlatformBlogPost.is_published == True).first()
    if not post or _blog_category_slug(post.category) != _slugify(category_slug or ""):
        return None
    comment = PlatformBlogComment(
        post_id=post.id,
        author_name=data.author_name.strip(),
        author_email=data.author_email.strip().lower(),
        body=data.body.strip(),
        status="pending",
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return admin_schemas.PublicBlogCommentSubmissionOut(
        id=comment.id,
        status=comment.status,
        message="Comment submitted and waiting for review.",
    )


# ── ClientOrg CRUD ────────────────────────────────────
def get_client(db: Session, id: int):
    return db.query(ClientOrg).filter(ClientOrg.id == id).first()


def create_client(db: Session, data: admin_schemas.ClientCreate):
    c = ClientOrg(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def update_client(db: Session, id: int, data: admin_schemas.ClientUpdate):
    c = db.query(ClientOrg).filter(ClientOrg.id == id).first()
    if not c:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


def delete_client(db: Session, id: int) -> bool:
    c = db.query(ClientOrg).filter(ClientOrg.id == id).first()
    if not c:
        return False
    db.delete(c)
    db.commit()
    return True


def suspend_client(db: Session, id: int):
    c = db.query(ClientOrg).filter(ClientOrg.id == id).first()
    if not c:
        return None
    c.is_suspended = True
    c.is_active = False
    db.commit()
    db.refresh(c)
    return c


def unsuspend_client(db: Session, id: int):
    c = db.query(ClientOrg).filter(ClientOrg.id == id).first()
    if not c:
        return None
    c.is_suspended = False
    c.is_active = True
    db.commit()
    db.refresh(c)
    return c


# ── Subscription CRUD ─────────────────────────────────
def get_subscriptions(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(Subscription)
        .order_by(Subscription.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_subscription(db: Session, id: int):
    return db.query(Subscription).filter(Subscription.id == id).first()


def get_subscription_by_client(db: Session, client_id: int):
    return (
        db.query(Subscription)
        .filter(Subscription.client_id == client_id)
        .order_by(Subscription.created_at.desc())
        .first()
    )


def create_subscription(db: Session, data: admin_schemas.SubscriptionCreate):
    s = Subscription(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def update_subscription(db: Session, id: int, data: admin_schemas.SubscriptionUpdate):
    s = db.query(Subscription).filter(Subscription.id == id).first()
    if not s:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


def cancel_subscription(db: Session, id: int, reason: Optional[str] = None):
    s = db.query(Subscription).filter(Subscription.id == id).first()
    if not s:
        return None
    s.status = PlanStatus.cancelled
    s.cancelled_at = datetime.now()
    s.cancel_reason = reason
    db.commit()
    db.refresh(s)
    return s


# ── Payment CRUD ───────────────────────────────────────
def _seed_payment_methods_if_empty(db: Session):
    global _PAYMENT_METHODS_SEEDED
    if _PAYMENT_METHODS_SEEDED:
        return
    count = db.query(func.count(PaymentMethod.id)).scalar() or 0
    if count > 0:
        _PAYMENT_METHODS_SEEDED = True
        return
    methods = [
        PaymentMethod(
            name="Primary Card Processor",
            provider="Stripe",
            method_type=PaymentMethodType.card,
            details="Visa/Mastercard",
            fee_percent=2.9,
            fee_fixed=0.3,
            supports_refunds=True,
            is_active=True,
            is_default=True,
        ),
        PaymentMethod(
            name="Bank Transfer",
            provider="Bank",
            method_type=PaymentMethodType.bank,
            details="ACH / Wire",
            fee_percent=1.0,
            fee_fixed=0,
            supports_refunds=False,
            is_active=True,
            is_default=False,
        ),
        PaymentMethod(
            name="Manual Invoice",
            provider="Internal",
            method_type=PaymentMethodType.manual,
            details="Offline settlement",
            fee_percent=0,
            fee_fixed=0,
            supports_refunds=False,
            is_active=True,
            is_default=False,
        ),
    ]
    for m in methods:
        db.add(m)
    db.commit()
    _PAYMENT_METHODS_SEEDED = True


def _validate_payment_method_values(fee_percent: Optional[float], fee_fixed: Optional[float]):
    if fee_percent is not None and (fee_percent < 0 or fee_percent > 100):
        raise ValueError("fee_percent must be between 0 and 100")
    if fee_fixed is not None and fee_fixed < 0:
        raise ValueError("fee_fixed cannot be negative")


def _ensure_single_default(db: Session, method_id: Optional[int] = None):
    query = db.query(PaymentMethod)
    if method_id is not None:
        query = query.filter(PaymentMethod.id != method_id)
    query.update({PaymentMethod.is_default: False}, synchronize_session=False)


def _ensure_any_default(db: Session):
    has_default = (
        db.query(func.count(PaymentMethod.id))
        .filter(PaymentMethod.is_default == True, PaymentMethod.is_active == True)
        .scalar()
        or 0
    )
    if has_default:
        return
    fallback = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.is_active == True)
        .order_by(PaymentMethod.created_at.asc())
        .first()
    )
    if fallback:
        fallback.is_default = True


def get_payment_summary(db: Session):
    total_payments = db.query(func.count(Payment.id)).scalar() or 0
    paid_count = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.paid)
        .scalar()
        or 0
    )
    pending_count = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.pending)
        .scalar()
        or 0
    )
    failed_count = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.failed)
        .scalar()
        or 0
    )
    refunded_count = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.refunded)
        .scalar()
        or 0
    )
    paid_volume = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.status == PaymentStatus.paid)
        .scalar()
        or 0
    )
    pending_volume = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.status == PaymentStatus.pending)
        .scalar()
        or 0
    )
    return {
        "total_payments": total_payments,
        "paid_count": paid_count,
        "pending_count": pending_count,
        "failed_count": failed_count,
        "refunded_count": refunded_count,
        "paid_volume": round(float(paid_volume), 2),
        "pending_volume": round(float(pending_volume), 2),
    }


def get_payments(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    client_id: Optional[int] = None,
    status: Optional[str] = None,
):
    q = db.query(Payment).order_by(Payment.created_at.desc())
    if client_id is not None:
        q = q.filter(Payment.client_id == client_id)
    if status is not None:
        q = q.filter(Payment.status == status)
    return q.offset(skip).limit(limit).all()


def get_payment(db: Session, id: int):
    return db.query(Payment).filter(Payment.id == id).first()


def get_payment_methods(db: Session, active_only: Optional[bool] = None):
    _seed_payment_methods_if_empty(db)
    query = db.query(PaymentMethod)
    if active_only is not None:
        query = query.filter(PaymentMethod.is_active == active_only)
    return (
        query.order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.asc())
        .all()
    )


def create_payment_method(db: Session, data: admin_schemas.PaymentMethodCreate):
    _validate_payment_method_values(data.fee_percent, data.fee_fixed)
    payload = data.model_dump()
    method = PaymentMethod(**payload)

    if payload.get("is_default"):
        _ensure_single_default(db)

    db.add(method)
    db.commit()
    _ensure_any_default(db)
    db.commit()
    db.refresh(method)
    return method


def update_payment_method(db: Session, method_id: int, data: admin_schemas.PaymentMethodUpdate):
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        return None

    updates = data.model_dump(exclude_unset=True)
    _validate_payment_method_values(updates.get("fee_percent"), updates.get("fee_fixed"))

    if updates.get("is_default") is True:
        _ensure_single_default(db, method_id=method.id)

    for key, value in updates.items():
        setattr(method, key, value)

    if updates.get("is_active") is False and method.is_default:
        method.is_default = False

    _ensure_any_default(db)
    db.commit()
    db.refresh(method)
    return method


def set_default_payment_method(db: Session, method_id: int):
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        return None
    if not method.is_active:
        raise ValueError("Cannot set an inactive payment method as default")

    _ensure_single_default(db, method_id=method.id)
    method.is_default = True
    db.commit()
    db.refresh(method)
    return method


def set_payment_method_status(db: Session, method_id: int, is_active: bool):
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        return None

    method.is_active = is_active
    if not is_active and method.is_default:
        method.is_default = False
    _ensure_any_default(db)
    db.commit()
    db.refresh(method)
    return method


def create_payment(db: Session, data: admin_schemas.PaymentCreate):
    p = Payment(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def update_payment_status(db: Session, id: int, status: PaymentStatus, paid_at: Optional[datetime] = None):
    p = db.query(Payment).filter(Payment.id == id).first()
    if not p:
        return None
    p.status = status
    if paid_at is not None:
        p.paid_at = paid_at
    elif status == PaymentStatus.paid:
        p.paid_at = p.paid_at or datetime.now()
    db.commit()
    db.refresh(p)
    return p


# ── Notifications ─────────────────────────────────────
def get_notifications(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(AdminNotification)
        .order_by(AdminNotification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_notification(db: Session, id: int):
    return db.query(AdminNotification).filter(AdminNotification.id == id).first()


def create_notification(db: Session, data: admin_schemas.NotificationCreate):
    n = AdminNotification(**data.model_dump())
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def delete_notification(db: Session, id: int) -> bool:
    n = db.query(AdminNotification).filter(AdminNotification.id == id).first()
    if not n:
        return False
    db.delete(n)
    db.commit()
    return True


def send_notification(db: Session, id: int, recipient_count: int):
    n = db.query(AdminNotification).filter(AdminNotification.id == id).first()
    if not n:
        return None
    n.is_sent = True
    n.sent_at = datetime.now()
    n.recipient_count = recipient_count
    db.commit()
    db.refresh(n)
    return n


def get_client_notifications(
    db: Session,
    workspace_id: Optional[str] = None,
    limit: int = 50,
):
    query = (
        db.query(AdminNotification)
        .filter(AdminNotification.is_sent == True)
        .order_by(AdminNotification.sent_at.desc(), AdminNotification.created_at.desc())
    )

    # Pull a wider slice first, then apply Python-side targeting filters.
    candidates = query.limit(max(limit * 3, limit)).all()
    filtered: List[AdminNotification] = []

    for notif in candidates:
        if notif.target == NotificationTarget.all:
            filtered.append(notif)
            continue

        if notif.target == NotificationTarget.specific:
            if not workspace_id or not notif.target_value:
                continue
            targets = {item.strip() for item in notif.target_value.split(",") if item.strip()}
            if workspace_id in targets:
                filtered.append(notif)
            continue

        # Plan-tier targeting is currently not mapped to tenant identity in client session.
        # Keep these visible until plan context is wired.
        if notif.target == NotificationTarget.plan_tier:
            filtered.append(notif)

    return filtered[:limit]


# ── Activity ───────────────────────────────────────────
def log_activity(
    db: Session,
    client_id: int,
    action: str,
    actor: Optional[str] = None,
    metadata: Optional[str] = None,
):
    a = ClientActivity(client_id=client_id, action=action, actor=actor, extra_data=metadata)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def get_activity(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(ClientActivity)
        .order_by(ClientActivity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_activity_by_client(db: Session, client_id: int, skip: int = 0, limit: int = 50):
    return (
        db.query(ClientActivity)
        .filter(ClientActivity.client_id == client_id)
        .order_by(ClientActivity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ── Analytics ──────────────────────────────────────────
def get_analytics_growth(db: Session, months: int = 12) -> List[dict]:
    result = []
    today = datetime.now()
    cumulative = 0
    for i in range(months - 1, -1, -1):
        year = today.year
        month = today.month - (i + 1)
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1, 0, 0, 0, 0)
        if month == 12:
            end = datetime(year + 1, 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        else:
            end = datetime(year, month + 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        new_count = (
            db.query(func.count(ClientWorkspaceAccount.id))
            .filter(ClientWorkspaceAccount.created_at >= start, ClientWorkspaceAccount.created_at <= end)
            .scalar()
            or 0
        )
        cumulative += new_count
        result.append({
            "month": start.strftime("%b %Y"),
            "new_clients": new_count,
            "cumulative": cumulative,
        })
    return result


def get_analytics_churn(db: Session, months: int = 12) -> List[dict]:
    result = []
    today = datetime.now()
    for i in range(months - 1, -1, -1):
        year = today.year
        month = today.month - (i + 1)
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1, 0, 0, 0, 0)
        if month == 12:
            end = datetime(year + 1, 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        else:
            end = datetime(year, month + 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        churned = (
            db.query(func.count(Subscription.id))
            .filter(
                Subscription.status == PlanStatus.cancelled,
                Subscription.cancelled_at >= start,
                Subscription.cancelled_at <= end,
            )
            .scalar()
            or 0
        )
        result.append({
            "month": start.strftime("%b %Y"),
            "churned": churned,
        })
    return result


# ── AI Trainer ────────────────────────────────────────
_AI_TRAINER_SECTIONS = (
    "dashboard",
    "projects",
    "finance",
    "hr",
    "sales",
    "support",
    "legal",
    "marketing",
    "supply_chain",
    "procurement",
    "insights",
    "settings",
    "marketplace",
    "admin",
)
_AI_TRAINER_PROVIDERS = {"auto", "anthropic", "openai"}
_TEXT_EXTENSIONS = {"txt", "md", "csv", "json", "xml", "html", "htm", "log", "yaml", "yml"}
_DOCX_EXTENSIONS = {"docx"}
_STOPWORDS = {
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "have",
    "your",
    "are",
    "you",
    "our",
    "into",
    "about",
    "will",
    "was",
    "were",
    "shall",
    "should",
    "would",
    "could",
    "they",
    "their",
    "them",
    "been",
    "where",
    "when",
    "what",
    "which",
    "how",
    "why",
}


def _tokenize_text(value: str) -> list[str]:
    return [token for token in re.split(r"\W+", (value or "").lower()) if len(token) > 2]


def _normalize_section(section: str) -> str:
    normalized = (section or "").strip().lower()
    if normalized not in _AI_TRAINER_SECTIONS:
        raise ValueError("Unknown section for AI trainer.")
    return normalized


def _normalize_provider(provider: str | None) -> str:
    if provider is None:
        return "auto"
    normalized = provider.strip().lower()
    if normalized not in _AI_TRAINER_PROVIDERS:
        raise ValueError("Provider must be one of: auto, anthropic, openai.")
    return normalized


def _strip_html(raw_html: str) -> str:
    no_script = re.sub(r"<script.*?>.*?</script>", " ", raw_html, flags=re.IGNORECASE | re.DOTALL)
    no_style = re.sub(r"<style.*?>.*?</style>", " ", no_script, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", no_style)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_pdf_text(payload: bytes) -> str:
    from io import BytesIO
    from pypdf import PdfReader  # type: ignore

    reader = PdfReader(BytesIO(payload))
    parts: list[str] = []
    for page in reader.pages:
        value = (page.extract_text() or "").strip()
        if value:
            parts.append(value)
    return "\n".join(parts).strip()


def _extract_docx_text(payload: bytes) -> str:
    import zipfile
    from io import BytesIO

    with zipfile.ZipFile(BytesIO(payload)) as archive:
        xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
    text = re.sub(r"</w:p>", "\n", xml)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_text_from_file(payload: bytes, file_name: str, mime_type: str | None) -> str:
    if not payload:
        raise ValueError("Uploaded file is empty.")

    normalized_mime = (mime_type or "").lower()
    extension = file_name.lower().split(".")[-1] if "." in file_name else ""

    if normalized_mime == "application/pdf" or extension == "pdf":
        text = _extract_pdf_text(payload)
        if text:
            return text
        raise ValueError("PDF was uploaded, but no readable text was found.")

    if extension in _DOCX_EXTENSIONS:
        text = _extract_docx_text(payload)
        if text:
            return text
        raise ValueError("DOCX was uploaded, but no readable text was found.")

    if (
        normalized_mime.startswith("text/")
        or normalized_mime in {"application/json", "application/xml", "application/csv"}
        or extension in _TEXT_EXTENSIONS
    ):
        decoded = payload.decode("utf-8", errors="ignore").strip()
        if not decoded:
            decoded = payload.decode("latin-1", errors="ignore").strip()
        if not decoded:
            raise ValueError("Text file is empty.")
        if extension in {"html", "htm"} or "html" in normalized_mime:
            return _strip_html(decoded)
        return decoded

    raise ValueError(
        "Unsupported file format for AI training. Supported: PDF, DOCX, TXT, MD, CSV, JSON, XML, HTML."
    )


def _chunk_text(text: str, max_chars: int = 1200, overlap: int = 180) -> list[str]:
    normalized = re.sub(r"\s+", " ", (text or "").strip())
    if not normalized:
        return []

    # Split on punctuation/newline boundaries to keep chunks semantically coherent.
    pieces = re.split(r"(?<=[\.\!\?\;\:])\s+", normalized)
    chunks: list[str] = []
    current = ""

    for piece in pieces:
        piece = piece.strip()
        if not piece:
            continue
        candidate = f"{current} {piece}".strip() if current else piece
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            chunks.append(current)
        if len(piece) <= max_chars:
            current = piece
        else:
            # Hard split very long sentences.
            start = 0
            while start < len(piece):
                end = min(len(piece), start + max_chars)
                chunks.append(piece[start:end].strip())
                start = max(0, end - overlap)
            current = ""

    if current:
        chunks.append(current)

    return [chunk for chunk in chunks if chunk]


def _extract_keywords(text: str, limit: int = 12) -> list[str]:
    counts: dict[str, int] = {}
    for token in _tokenize_text(text):
        if token in _STOPWORDS:
            continue
        counts[token] = counts.get(token, 0) + 1
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [token for token, _ in ordered[:limit]]


def _estimate_token_count(text: str) -> int:
    return max(1, int(len(text) / 4))


def _source_summary(text: str, fallback_title: str) -> str:
    normalized = re.sub(r"\s+", " ", (text or "").strip())
    if not normalized:
        return fallback_title
    return normalized[:260] + ("..." if len(normalized) > 260 else "")


def _word_count(text: str) -> int:
    return len([word for word in re.split(r"\s+", (text or "").strip()) if word])


def _mark_profile_trained(db: Session, section: str) -> None:
    profile = _ensure_ai_trainer_profile(db, section)
    profile.last_trained_at = datetime.now()


def _rebuild_source_chunks(db: Session, source: AITrainerSource, text: str) -> AITrainerSource:
    db.query(AITrainerChunk).filter(AITrainerChunk.source_id == source.id).delete(synchronize_session=False)

    chunks = _chunk_text(text)
    source.chunk_count = len(chunks)
    source.word_count = _word_count(text)
    source.raw_text = text
    source.summary = _source_summary(text, source.title)
    source.content_hash = hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()

    for idx, chunk in enumerate(chunks):
        keywords = _extract_keywords(chunk)
        db.add(
            AITrainerChunk(
                source_id=source.id,
                section=source.section,
                chunk_index=idx,
                content=chunk,
                keywords=",".join(keywords),
                token_estimate=_estimate_token_count(chunk),
            )
        )

    source.status = "ready"
    source.error_message = None
    source.updated_at = datetime.now()
    _mark_profile_trained(db, source.section)
    return source


def _ensure_ai_trainer_profile(db: Session, section: str) -> AITrainerProfile:
    normalized_section = _normalize_section(section)
    profile = (
        db.query(AITrainerProfile)
        .filter(AITrainerProfile.section == normalized_section)
        .first()
    )
    if profile:
        return profile

    profile = AITrainerProfile(
        section=normalized_section,
        provider="auto",
        model=None,
        system_instructions="",
        temperature=0.2,
        max_context_chars=12000,
        is_enabled=True,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def get_ai_trainer_profile(db: Session, section: str) -> AITrainerProfile:
    return _ensure_ai_trainer_profile(db, section)


def get_ai_trainer_profiles(db: Session) -> List[dict]:
    for section in _AI_TRAINER_SECTIONS:
        _ensure_ai_trainer_profile(db, section)

    profiles = (
        db.query(AITrainerProfile)
        .order_by(AITrainerProfile.section.asc())
        .all()
    )

    source_rows = (
        db.query(
            AITrainerSource.section,
            func.count(AITrainerSource.id),
        )
        .group_by(AITrainerSource.section)
        .all()
    )
    ready_rows = (
        db.query(
            AITrainerSource.section,
            func.count(AITrainerSource.id),
        )
        .filter(AITrainerSource.status == "ready")
        .group_by(AITrainerSource.section)
        .all()
    )
    chunk_rows = (
        db.query(AITrainerChunk.section, func.count(AITrainerChunk.id))
        .group_by(AITrainerChunk.section)
        .all()
    )

    source_totals = {row[0]: int(row[1] or 0) for row in source_rows}
    source_ready = {row[0]: int(row[1] or 0) for row in ready_rows}
    chunk_stats = {row[0]: int(row[1] or 0) for row in chunk_rows}

    response: list[dict] = []
    for profile in profiles:
        stats = {
            "total": source_totals.get(profile.section, 0),
            "ready": source_ready.get(profile.section, 0),
        }
        response.append(
            {
                **admin_schemas.AITrainerProfileOut.model_validate(profile).model_dump(),
                "sources_total": stats["total"],
                "sources_ready": stats["ready"],
                "chunks_total": chunk_stats.get(profile.section, 0),
            }
        )
    return response


def update_ai_trainer_profile(
    db: Session,
    section: str,
    data: admin_schemas.AITrainerProfileUpdate,
) -> AITrainerProfile:
    profile = _ensure_ai_trainer_profile(db, section)
    updates = data.model_dump(exclude_unset=True)

    if "provider" in updates:
        updates["provider"] = _normalize_provider(updates["provider"])
    if "model" in updates and updates["model"] is not None:
        updates["model"] = updates["model"].strip() or None
    if "system_instructions" in updates and updates["system_instructions"] is not None:
        updates["system_instructions"] = updates["system_instructions"].strip()
    if "temperature" in updates and updates["temperature"] is not None:
        value = float(updates["temperature"])
        if value < 0 or value > 1:
            raise ValueError("temperature must be between 0 and 1.")
        updates["temperature"] = value
    if "max_context_chars" in updates and updates["max_context_chars"] is not None:
        value = int(updates["max_context_chars"])
        if value < 2000 or value > 80000:
            raise ValueError("max_context_chars must be between 2000 and 80000.")
        updates["max_context_chars"] = value

    for key, value in updates.items():
        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return profile


def list_ai_trainer_sources(db: Session, section: str, limit: int = 200) -> List[AITrainerSource]:
    normalized_section = _normalize_section(section)
    return (
        db.query(AITrainerSource)
        .filter(AITrainerSource.section == normalized_section)
        .order_by(AITrainerSource.updated_at.desc(), AITrainerSource.id.desc())
        .limit(limit)
        .all()
    )


def create_ai_trainer_source_from_text(
    db: Session,
    data: admin_schemas.AITrainerSourceCreateText,
) -> AITrainerSource:
    section = _normalize_section(data.section)
    title = (data.title or "").strip() or f"{section.title()} training note"
    text = (data.text or "").strip()
    if len(text) < 30:
        raise ValueError("Text source must be at least 30 characters.")

    source = AITrainerSource(
        section=section,
        source_type="text",
        title=title,
        status="processing",
    )
    db.add(source)
    db.flush()
    _rebuild_source_chunks(db, source, text)
    db.commit()
    db.refresh(source)
    return source


def create_ai_trainer_source_from_url(
    db: Session,
    data: admin_schemas.AITrainerSourceCreateURL,
) -> AITrainerSource:
    section = _normalize_section(data.section)
    url = (data.url or "").strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise ValueError("URL must start with http:// or https://")

    title = (data.title or "").strip() or url
    source = AITrainerSource(
        section=section,
        source_type="url",
        title=title,
        source_url=url,
        status="processing",
    )
    db.add(source)
    db.flush()

    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            response = client.get(
                url,
                headers={"User-Agent": "Benela-AI-Trainer/1.0 (+https://benela.dev)"},
            )
            response.raise_for_status()
            body = response.text
    except Exception as exc:
        source.status = "failed"
        source.error_message = f"Could not fetch website: {exc}"
        db.commit()
        db.refresh(source)
        return source

    extracted_title = ""
    title_match = re.search(r"<title[^>]*>(.*?)</title>", body, flags=re.IGNORECASE | re.DOTALL)
    if title_match:
        extracted_title = re.sub(r"\s+", " ", html_lib.unescape(title_match.group(1))).strip()

    text = _strip_html(body)
    if len(text) < 80:
        source.status = "failed"
        source.error_message = "Website fetched, but no readable text content was extracted."
        db.commit()
        db.refresh(source)
        return source

    if not data.title and extracted_title:
        source.title = extracted_title[:255]
    source.metadata_json = json.dumps({"source_url": str(response.url), "status_code": response.status_code})
    _rebuild_source_chunks(db, source, text)
    db.commit()
    db.refresh(source)
    return source


def create_ai_trainer_source_from_file(
    db: Session,
    section: str,
    file_name: str,
    mime_type: str | None,
    payload: bytes,
    title: str | None = None,
) -> AITrainerSource:
    normalized_section = _normalize_section(section)
    source = AITrainerSource(
        section=normalized_section,
        source_type="file",
        title=(title or "").strip() or file_name,
        file_name=file_name,
        mime_type=(mime_type or "").strip() or None,
        status="processing",
    )
    db.add(source)
    db.flush()

    try:
        text = _extract_text_from_file(payload, file_name=file_name, mime_type=mime_type)
        _rebuild_source_chunks(db, source, text)
    except Exception as exc:
        source.status = "failed"
        source.error_message = str(exc)

    db.commit()
    db.refresh(source)
    return source


def reindex_ai_trainer_source(db: Session, source_id: int) -> AITrainerSource | None:
    source = db.query(AITrainerSource).filter(AITrainerSource.id == source_id).first()
    if not source:
        return None
    if not source.raw_text:
        source.status = "failed"
        source.error_message = "No raw text content found to reindex."
        db.commit()
        db.refresh(source)
        return source

    _rebuild_source_chunks(db, source, source.raw_text)
    db.commit()
    db.refresh(source)
    return source


def delete_ai_trainer_source(db: Session, source_id: int) -> bool:
    source = db.query(AITrainerSource).filter(AITrainerSource.id == source_id).first()
    if not source:
        return False
    section = source.section
    db.delete(source)
    _mark_profile_trained(db, section)
    db.commit()
    return True


def get_ai_trainer_runtime_profile(db: Session, section: str) -> AITrainerProfile | None:
    normalized_section = (section or "").strip().lower()
    if normalized_section not in _AI_TRAINER_SECTIONS:
        return None
    return (
        db.query(AITrainerProfile)
        .filter(AITrainerProfile.section == normalized_section)
        .first()
    )


def _score_chunk_relevance(content: str, query_tokens: list[str], full_query: str) -> int:
    if not content:
        return 0
    content_lower = content.lower()
    score = 0
    if full_query and full_query in content_lower:
        score += 10
    for token in query_tokens:
        hits = content_lower.count(token)
        if hits:
            score += min(5, hits)
    return score


def get_ai_trainer_training_context(
    db: Session,
    section: str,
    query: str,
    max_context_chars: int = 12000,
    max_chunks: int = 8,
) -> str:
    normalized_section = (section or "").strip().lower()
    if normalized_section not in _AI_TRAINER_SECTIONS:
        return ""

    query_tokens = [token for token in _tokenize_text(query) if token not in _STOPWORDS]
    query_phrase = " ".join(query_tokens).strip()

    rows = (
        db.query(
            AITrainerChunk.content,
            AITrainerChunk.created_at,
            AITrainerSource.title,
            AITrainerSource.source_url,
        )
        .join(AITrainerSource, AITrainerSource.id == AITrainerChunk.source_id)
        .filter(
            AITrainerChunk.section == normalized_section,
            AITrainerSource.status == "ready",
        )
        .all()
    )

    ranked: list[tuple[int, str, str, str | None, datetime | None]] = []
    for content, created_at, title, source_url in rows:
        score = _score_chunk_relevance(content, query_tokens, query_phrase)
        if score > 0:
            ranked.append((score, content, title, source_url, created_at))

    if not ranked:
        # Fallback: most recent chunks when no lexical match.
        fallback_rows = (
            db.query(
                AITrainerChunk.content,
                AITrainerChunk.created_at,
                AITrainerSource.title,
                AITrainerSource.source_url,
            )
            .join(AITrainerSource, AITrainerSource.id == AITrainerChunk.source_id)
            .filter(
                AITrainerChunk.section == normalized_section,
                AITrainerSource.status == "ready",
            )
            .order_by(AITrainerChunk.created_at.desc(), AITrainerChunk.id.desc())
            .limit(max_chunks)
            .all()
        )
        ranked = [(1, content, title, source_url, created_at) for content, created_at, title, source_url in fallback_rows]
    else:
        ranked.sort(key=lambda item: item[0], reverse=True)

    selected = ranked[:max_chunks]
    if not selected:
        return ""

    lines = [
        "SECTION TRAINING KNOWLEDGE (curated by super admin; prioritize this when relevant):"
    ]
    current_len = len(lines[0])
    for _, content, title, source_url, _created_at in selected:
        citation = title
        if source_url:
            citation = f"{citation} ({source_url})"
        block = f"\n[Source: {citation}]\n{content}\n"
        if current_len + len(block) > max_context_chars:
            break
        lines.append(block)
        current_len += len(block)

    return "\n".join(lines).strip()
