from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas

router = APIRouter(prefix="/marketing", tags=["Marketing"])


@router.get("/summary")
def marketing_summary(db: Session = Depends(get_db)):
    return crud.get_marketing_summary(db)


@router.get("/funnel")
def marketing_funnel(db: Session = Depends(get_db)):
    return crud.get_marketing_funnel(db)


@router.get("/benchmarks")
def marketing_benchmarks():
    return crud.get_marketing_benchmarks()


@router.get("/campaigns", response_model=List[schemas.MarketingCampaignOut])
def list_campaigns(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_marketing_campaigns(db, skip, limit)


@router.post("/campaigns", response_model=schemas.MarketingCampaignOut)
def add_campaign(data: schemas.MarketingCampaignCreate, db: Session = Depends(get_db)):
    return crud.create_marketing_campaign(db, data)


@router.put("/campaigns/{id}", response_model=schemas.MarketingCampaignOut)
def edit_campaign(id: int, data: schemas.MarketingCampaignUpdate, db: Session = Depends(get_db)):
    campaign = crud.update_marketing_campaign(db, id, data)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.delete("/campaigns/{id}")
def remove_campaign(id: int, db: Session = Depends(get_db)):
    if not crud.delete_marketing_campaign(db, id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"ok": True}


@router.get("/content", response_model=List[schemas.MarketingContentOut])
def list_content(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_marketing_content(db, skip, limit)


@router.post("/content", response_model=schemas.MarketingContentOut)
def add_content(data: schemas.MarketingContentCreate, db: Session = Depends(get_db)):
    return crud.create_marketing_content(db, data)


@router.put("/content/{id}", response_model=schemas.MarketingContentOut)
def edit_content(id: int, data: schemas.MarketingContentUpdate, db: Session = Depends(get_db)):
    item = crud.update_marketing_content(db, id, data)
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")
    return item


@router.delete("/content/{id}")
def remove_content(id: int, db: Session = Depends(get_db)):
    if not crud.delete_marketing_content(db, id):
        raise HTTPException(status_code=404, detail="Content item not found")
    return {"ok": True}


@router.get("/leads", response_model=List[schemas.MarketingLeadOut])
def list_leads(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_marketing_leads(db, skip, limit)


@router.post("/leads", response_model=schemas.MarketingLeadOut)
def add_lead(data: schemas.MarketingLeadCreate, db: Session = Depends(get_db)):
    return crud.create_marketing_lead(db, data)


@router.put("/leads/{id}", response_model=schemas.MarketingLeadOut)
def edit_lead(id: int, data: schemas.MarketingLeadUpdate, db: Session = Depends(get_db)):
    lead = crud.update_marketing_lead(db, id, data)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.delete("/leads/{id}")
def remove_lead(id: int, db: Session = Depends(get_db)):
    if not crud.delete_marketing_lead(db, id):
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}


@router.get("/channels", response_model=List[schemas.MarketingChannelMetricOut])
def list_channels(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_marketing_channel_metrics(db, skip, limit)


@router.post("/channels", response_model=schemas.MarketingChannelMetricOut)
def add_channel(data: schemas.MarketingChannelMetricCreate, db: Session = Depends(get_db)):
    return crud.create_marketing_channel_metric(db, data)


@router.put("/channels/{id}", response_model=schemas.MarketingChannelMetricOut)
def edit_channel(id: int, data: schemas.MarketingChannelMetricUpdate, db: Session = Depends(get_db)):
    row = crud.update_marketing_channel_metric(db, id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Channel metric row not found")
    return row


@router.delete("/channels/{id}")
def remove_channel(id: int, db: Session = Depends(get_db)):
    if not crud.delete_marketing_channel_metric(db, id):
        raise HTTPException(status_code=404, detail="Channel metric row not found")
    return {"ok": True}
