from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from database.connection import get_db
from database import admin_crud
from database import admin_schemas
from core.platform_media import resolve_platform_image_path

router = APIRouter(prefix="/platform", tags=["Platform"])


def _missing_image_placeholder(file_path: str) -> Response:
    label = (file_path or "image").split("/", 1)[0].strip() or "image"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="{label}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#eef4ff"/>
      <stop offset="100%" stop-color="#dbe7ff"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect x="120" y="120" width="1360" height="660" rx="42" fill="#f8fbff" stroke="#b9cbef" stroke-width="8"/>
  <circle cx="330" cy="340" r="88" fill="#d4e2ff"/>
  <path d="M260 560l162-160 142 118 116-96 266 238H260z" fill="#8aa7e6"/>
  <text x="800" y="372" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#2f4f87">Benela Media</text>
  <text x="800" y="450" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#5a76a8">Image unavailable in current deployment</text>
</svg>"""
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "public, max-age=300",
            "x-benela-media-fallback": "1",
        },
    )


@router.get("/about", response_model=admin_schemas.PlatformAboutPageOut)
def get_about_page(db: Session = Depends(get_db)):
    return admin_crud.get_platform_about_page(db)


@router.get("/pricing-plans", response_model=list[admin_schemas.PricingPlanConfigOut])
def get_pricing_plans(db: Session = Depends(get_db)):
    return admin_crud.get_platform_pricing_plans(db)


@router.get("/runtime", response_model=admin_schemas.PlatformRuntimeStatusOut)
def get_platform_runtime_status(db: Session = Depends(get_db)):
    settings = admin_crud.get_platform_settings(db)
    return admin_schemas.PlatformRuntimeStatusOut(
        platform_name=settings.platform_name,
        support_email=settings.support_email,
        status_page_url=settings.status_page_url,
        maintenance_mode=settings.maintenance_mode,
        allow_new_signups=settings.allow_new_signups,
        allow_marketplace=settings.allow_marketplace,
        allow_plugin_purchases=settings.allow_plugin_purchases,
        updated_at=settings.updated_at,
    )


@router.get("/blog/posts", response_model=list[admin_schemas.PublicBlogPostSummaryOut])
def list_blog_posts(
    featured_only: bool = False,
    limit: int = 24,
    db: Session = Depends(get_db),
):
    return admin_crud.list_public_blog_posts(db, featured_only=featured_only, limit=limit)


@router.get("/blog/posts/{slug}", response_model=admin_schemas.PublicBlogPostDetailOut)
def get_blog_post(slug: str, db: Session = Depends(get_db)):
    post = admin_crud.get_public_blog_post_by_slug(db, slug)
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return post


@router.get("/blog/posts/{category_slug}/{slug}", response_model=admin_schemas.PublicBlogPostDetailOut)
def get_blog_post_by_category(category_slug: str, slug: str, db: Session = Depends(get_db)):
    post = admin_crud.get_public_blog_post_by_category_and_slug(db, category_slug, slug)
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return post


@router.post("/blog/posts/{slug}/comments", response_model=admin_schemas.PublicBlogCommentSubmissionOut)
def create_blog_comment(slug: str, data: admin_schemas.PublicBlogCommentCreate, db: Session = Depends(get_db)):
    comment = admin_crud.create_public_blog_comment(db, slug, data)
    if not comment:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return comment


@router.post("/blog/posts/{category_slug}/{slug}/comments", response_model=admin_schemas.PublicBlogCommentSubmissionOut)
def create_blog_comment_by_category(
    category_slug: str,
    slug: str,
    data: admin_schemas.PublicBlogCommentCreate,
    db: Session = Depends(get_db),
):
    comment = admin_crud.create_public_blog_comment_by_category_and_slug(db, category_slug, slug, data)
    if not comment:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return comment


@router.get("/media/images/{file_path:path}")
def get_platform_image(file_path: str):
    absolute_path = resolve_platform_image_path(file_path)
    if not absolute_path or not absolute_path.exists() or not absolute_path.is_file():
        return _missing_image_placeholder(file_path)
    return FileResponse(
        absolute_path,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
