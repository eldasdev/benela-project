from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.connection import get_db
from database import admin_crud
from database import admin_schemas

router = APIRouter(prefix="/platform", tags=["Platform"])


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
