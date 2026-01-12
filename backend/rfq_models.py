"""
RFQ (Request for Quotation) Models
Phase 5: RFQ & PO Flow
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid

class RFQLineCreate(BaseModel):
    rfq_id: str
    item_id: str
    item_type: str  # RAW or PACK
    job_number: Optional[str] = None
    product_name: Optional[str] = None
    packaging_type: Optional[str] = None
    net_weight_kg: Optional[float] = None
    qty_needed: float
    uom: str
    notes: Optional[str] = None

class RFQLine(RFQLineCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "PENDING"  # PENDING, QUOTED, REJECTED
    vendor_quote: Optional[float] = None
    vendor_notes: Optional[str] = None

class RFQCreate(BaseModel):
    vendor_id: str
    billing_company_id: str
    shipping_company_id: str
    delivery_date: str
    incoterms: str  # EXWORKS, FOB, CFR, CIF, DDP, etc.
    payment_terms: str  # LC, CAD, Cash, NET30, etc.
    notes: Optional[str] = None

class RFQ(RFQCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    rfq_number: str = ""
    status: str = "DRAFT"  # DRAFT, SENT, QUOTED, CONVERTED_TO_PO, CANCELLED
    created_by: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    sent_at: Optional[str] = None

class CompanyAddress(BaseModel):
    """Company address for billing/shipping"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_name: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: Optional[str] = None
    country: str
    postal_code: str
    tax_id: Optional[str] = None
    is_active: bool = True
