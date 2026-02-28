from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database.models import TransactionType, TransactionStatus

class TransactionCreate(BaseModel):
    description: str
    category:    str
    amount:      float
    type:        TransactionType
    status:      TransactionStatus = TransactionStatus.pending
    notes:       Optional[str] = None

class TransactionOut(BaseModel):
    id:          int
    date:        datetime
    description: str
    category:    str
    amount:      float
    type:        TransactionType
    status:      TransactionStatus
    notes:       Optional[str]
    created_at:  datetime

    class Config:
        from_attributes = True

class InvoiceCreate(BaseModel):
    invoice_number: str
    client_name:    str
    client_email:   Optional[str] = None
    amount:         float
    tax:            float = 0
    status:         str = "draft"
    notes:          Optional[str] = None

class InvoiceOut(BaseModel):
    id:             int
    invoice_number: str
    client_name:    str
    client_email:   Optional[str]
    amount:         float
    tax:            float
    status:         str
    issue_date:     datetime
    created_at:     datetime

    class Config:
        from_attributes = True