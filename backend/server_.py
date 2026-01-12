from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import resend
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Resend Email Configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

app = FastAPI(title="Manufacturing ERP System")

# ==================== CORS CONFIGURATION (MUST BE FIRST) ====================
# Default allowed origins for local development
DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]

cors_origins_env = os.environ.get('CORS_ORIGINS', '')
if cors_origins_env:
    cors_origins = [origin.strip() for origin in cors_origins_env.split(',') if origin.strip()]
else:
    cors_origins = DEFAULT_CORS_ORIGINS

# CORS origins are logged at application startup

# CORS middleware configuration with explicit headers for axios/JSON
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
    ],
    expose_headers=["*"],
    max_age=600,  # Cache preflight for 10 minutes
)

# ==================== HEALTH ENDPOINT (ROOT LEVEL) ====================
@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring and CORS verification"""
    return {
        "ok": True,
        "time": datetime.now(timezone.utc).isoformat(),
        "service": "Manufacturing ERP API",
        "version": "1.0.0"
    }

@app.options("/api/health")
async def health_options():
    """Preflight handler for health endpoint"""
    return {}

api_router = APIRouter(prefix="/api")

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET', 'erp-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer()

# ==================== MODELS ====================

# User Roles
ROLES = ['admin', 'sales', 'finance', 'production', 'procurement', 'inventory', 'security', 'qc', 'shipping', 'transport', 'documentation']

class UserBase(BaseModel):
    email: str
    name: str
    role: str
    department: Optional[str] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_active: bool = True

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

# Customer Model
class CustomerCreate(BaseModel):
    name: str
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    tax_id: Optional[str] = None
    customer_type: str = "local"  # local or export

class Customer(CustomerCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Product Model
class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    unit: str = "KG"
    price_usd: float = 0
    price_aed: float = 0
    price_eur: float = 0
    category: str = "finished_product"  # raw_material, packaging, finished_product
    min_stock: float = 0
    type: str = "MANUFACTURED"  # MANUFACTURED or TRADED (for production scheduling)
    density_kg_per_l: Optional[float] = None  # For volume to weight conversion

class Product(ProductCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    current_stock: float = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Quotation/PFI Model
class QuotationItem(BaseModel):
    product_id: str
    product_name: str
    sku: Optional[str] = None  # Make optional for backwards compatibility
    quantity: float
    unit_price: float
    packaging: str = "Bulk"
    net_weight_kg: Optional[float] = None  # Net weight per unit for packaging
    weight_mt: Optional[float] = None  # Total weight in MT
    total: float = 0

class QuotationCreate(BaseModel):
    customer_id: str
    customer_name: str
    items: List[QuotationItem]
    currency: str = "USD"  # USD, AED, EUR
    order_type: str = "local"  # local or export
    incoterm: Optional[str] = None  # CFR, FOB, CIF, EXW, DDP
    container_type: Optional[str] = None  # 20ft, 40ft, iso_tank, bulk_tanker_45, etc.
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    delivery_place: Optional[str] = None
    country_of_origin: Optional[str] = "UAE"
    country_of_destination: Optional[str] = None
    payment_terms: str = "Cash"  # LC, CAD, Cash, TT, Net 30
    validity_days: int = 30
    notes: Optional[str] = None
    required_documents: List[str] = []  # List of document type IDs
    include_vat: bool = True
    vat_rate: float = 0.0
    vat_amount: float = 0.0
    total_weight_mt: float = 0.0

class Quotation(QuotationCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pfi_number: str = ""
    status: str = "pending"  # pending, approved, rejected, converted
    subtotal: float = 0
    tax: float = 0
    total: float = 0
    created_by: str = ""
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None  # Reason for rejection
    rejected_by: Optional[str] = None
    rejected_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Sales Order (SPA) Model
class SalesOrderCreate(BaseModel):
    quotation_id: str
    expected_delivery_date: Optional[str] = None
    notes: Optional[str] = None

class SalesOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quotation_id: str
    spa_number: str = ""
    customer_id: str = ""
    customer_name: str = ""
    items: List[QuotationItem] = []
    currency: str = "USD"
    total: float = 0
    payment_status: str = "pending"  # pending, partial, paid
    amount_paid: float = 0
    balance: float = 0
    status: str = "active"  # active, completed, cancelled
    expected_delivery_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Payment Model
class PaymentCreate(BaseModel):
    sales_order_id: str
    amount: float
    currency: str = "USD"
    payment_method: str = "bank_transfer"  # bank_transfer, lc, cad, cash
    reference: Optional[str] = None
    notes: Optional[str] = None

class Payment(PaymentCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    payment_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    recorded_by: str = ""

# Job Order Model
class BOMItem(BaseModel):
    model_config = ConfigDict(extra="allow")  # Allow extra fields
    # Support both old and new field names
    product_id: Optional[str] = None
    material_id: Optional[str] = None
    product_name: Optional[str] = None
    material_name: Optional[str] = None
    sku: Optional[str] = None
    required_qty: Optional[float] = None
    required_quantity: Optional[float] = None
    available_qty: Optional[float] = 0
    available_quantity: Optional[float] = 0
    unit: str = "KG"
    status: Optional[str] = None

class JobOrderItem(BaseModel):
    """Single product/item in a job order"""
    product_id: str
    product_name: str
    product_sku: Optional[str] = None
    quantity: float
    packaging: Optional[str] = "Bulk"
    bom: List[BOMItem] = []
    net_weight_kg: Optional[float] = None

class JobOrderCreate(BaseModel):
    sales_order_id: str
    # For backward compatibility, support single product fields
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    quantity: Optional[float] = None
    packaging: Optional[str] = "Bulk"
    net_weight_kg: Optional[float] = None  # Preserve from quotation
    # New: support multiple products in one job order
    items: List[JobOrderItem] = []
    delivery_date: Optional[str] = None
    bom: List[BOMItem] = []  # Deprecated, use items[].bom instead
    priority: str = "normal"  # low, normal, high, urgent
    notes: Optional[str] = None
    special_conditions: Optional[str] = None  # Special handling/production conditions
    procurement_required: bool = False
    material_shortages: List[Dict] = []
    schedule_date: Optional[str] = None  # Scheduled production date/time
    schedule_shift: Optional[str] = None  # Scheduled shift (Day/Night)

class JobOrder(JobOrderCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_number: str = ""
    spa_number: str = ""
    status: str = "pending"  # pending, approved, in_production, procurement, ready_for_dispatch, dispatched, Production_Completed, rescheduled
    procurement_status: str = "not_required"  # not_required, pending, complete
    production_start: Optional[str] = None
    production_end: Optional[str] = None
    completed_by: Optional[str] = None
    completed_at: Optional[str] = None
    reschedule_date: Optional[str] = None
    reschedule_reason: Optional[str] = None
    rescheduled_by: Optional[str] = None
    rescheduled_at: Optional[str] = None
    batch_number: Optional[str] = None
    blend_report: Optional[str] = None
    procurement_reason: Optional[str] = None
    incoterm: Optional[str] = None  # Copied from quotation for routing (EXW, FOB, DDP, CFR)
    schedule_date: Optional[str] = None  # Scheduled production date/time
    schedule_shift: Optional[str] = None  # Scheduled shift (Day/Night)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# GRN Model (Goods Received Note)
class GRNItem(BaseModel):
    product_id: str
    product_name: str
    sku: Optional[str] = None  # Make optional
    quantity: float
    unit: str = "KG"

class GRNCreate(BaseModel):
    supplier: str
    items: List[GRNItem]
    delivery_note: Optional[str] = None
    notes: Optional[str] = None

class GRN(GRNCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    grn_number: str = ""
    received_by: str = ""
    received_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # Phase 9: Payables review fields
    review_status: str = "PENDING_PAYABLES"  # PENDING_PAYABLES, APPROVED, HOLD, REJECTED
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_notes: Optional[str] = None
    po_id: Optional[str] = None  # Link to Purchase Order)

# Delivery Order Model
class DeliveryOrderCreate(BaseModel):
    job_order_id: str
    shipping_booking_id: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    notes: Optional[str] = None

class DeliveryOrder(DeliveryOrderCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    do_number: str = ""
    job_number: str = ""
    product_name: str = ""
    quantity: float = 0
    issued_by: str = ""
    issued_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Shipping Booking Model
class ShippingBookingCreate(BaseModel):
    job_order_ids: List[str]
    shipping_line: Optional[str] = None
    container_type: str = "20ft"  # 20ft, 40ft, 40ft_hc
    container_count: int = 1
    port_of_loading: str
    port_of_discharge: str
    cargo_description: Optional[str] = None
    cargo_weight: Optional[float] = None
    is_dg: bool = False  # Dangerous Goods
    dg_class: Optional[str] = None
    notes: Optional[str] = None

class ShippingBookingUpdate(BaseModel):
    cro_number: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_date: Optional[str] = None  # Vessel departure date
    cutoff_date: Optional[str] = None  # Container cutoff at port
    gate_cutoff: Optional[str] = None  # Gate cutoff time
    vgm_cutoff: Optional[str] = None  # VGM submission cutoff
    freight_rate: Optional[float] = None
    freight_currency: str = "USD"
    freight_charges: Optional[float] = None  # Total freight charges
    thc_charges: Optional[float] = None  # Terminal Handling Charge
    tluc_charges: Optional[float] = None  # Terminal Loading/Unloading Charge
    ed_charges: Optional[float] = None  # Export Declaration charges
    pull_out_date: Optional[str] = None  # Container pull out date
    si_cutoff: Optional[str] = None  # SI (Shipping Instructions) cutoff
    gate_in_date: Optional[str] = None  # Gate in date at port
    status: Optional[str] = None

class ShippingBooking(ShippingBookingCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    booking_number: str = ""
    cro_number: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_date: Optional[str] = None
    cutoff_date: Optional[str] = None
    gate_cutoff: Optional[str] = None
    vgm_cutoff: Optional[str] = None
    freight_rate: Optional[float] = None
    freight_currency: str = "USD"
    freight_charges: Optional[float] = None  # Total freight charges
    thc_charges: Optional[float] = None  # Terminal Handling Charge
    tluc_charges: Optional[float] = None  # Terminal Loading/Unloading Charge
    ed_charges: Optional[float] = None  # Export Declaration charges
    pull_out_date: Optional[str] = None  # Container pull out date
    si_cutoff: Optional[str] = None  # SI cutoff
    gate_in_date: Optional[str] = None  # Gate in date
    pickup_date: Optional[str] = None  # Auto-calculated: cutoff - 3 days
    status: str = "pending"  # pending, cro_received, transport_scheduled, loaded, shipped
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Transport Schedule Model
class TransportScheduleCreate(BaseModel):
    shipping_booking_id: str
    transporter: Optional[str] = None
    vehicle_type: str = "Container Chassis"
    pickup_date: str
    pickup_location: str = "Factory"
    notes: Optional[str] = None

class TransportSchedule(TransportScheduleCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    schedule_number: str = ""
    booking_number: str = ""
    cro_number: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_date: Optional[str] = None
    cutoff_date: Optional[str] = None
    container_type: str = ""
    container_count: int = 1
    port_of_loading: str = ""
    job_numbers: List[str] = []
    product_names: List[str] = []
    status: str = "pending"  # pending, assigned, dispatched, at_factory, loaded, delivered_to_port
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    created_by: str = ""
    auto_generated: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Dispatch Schedule Model (for Security to see incoming containers)
class DispatchSchedule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    transport_schedule_id: str
    schedule_number: str
    booking_number: str
    job_numbers: List[str]
    product_names: List[str]
    container_type: str
    container_count: int
    pickup_date: str
    expected_arrival: str  # At factory
    vessel_date: str
    cutoff_date: str
    transporter: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    status: str = "scheduled"  # scheduled, in_transit, arrived, loading, loaded, departed
    loading_start: Optional[str] = None
    loading_end: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Export Document Model
class ExportDocumentCreate(BaseModel):
    shipping_booking_id: str
    document_type: str  # invoice, packing_list, bill_of_lading, certificate_of_origin
    document_number: str
    notes: Optional[str] = None

class ExportDocument(ExportDocumentCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    booking_number: str = ""
    status: str = "draft"  # draft, issued, sent
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# QC Batch Model
class QCBatchCreate(BaseModel):
    job_order_id: str
    batch_number: str
    specifications: Dict[str, Any] = {}
    test_results: Dict[str, Any] = {}
    notes: Optional[str] = None

class QCBatch(QCBatchCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_number: str = ""
    product_name: str = ""
    status: str = "pending"  # pending, passed, failed, hold
    inspected_by: str = ""
    inspected_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Inventory Movement Model
class InventoryMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    product_name: str
    sku: str
    movement_type: str  # grn_add, do_deduct, adjustment
    quantity: float
    reference_type: str  # grn, delivery_order, adjustment
    reference_id: str
    reference_number: str
    previous_stock: float
    new_stock: float
    created_by: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_user_from_token(token: str):
    """Get user from token string (for PDF downloads via query param)"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def generate_sequence(prefix: str, collection: str) -> str:
    counter = await db.counters.find_one_and_update(
        {"collection": collection},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq = counter.get("seq", 1)
    return f"{prefix}-{str(seq).zfill(6)}"

async def ensure_dispatch_routing(job_id: str, job: dict) -> bool:
    """
    Ensures that a job with ready_for_dispatch status has proper transport/shipping routing.
    This is called automatically when:
    - A job status changes to ready_for_dispatch
    - A job is created with ready_for_dispatch status
    - Jobs are fetched and found to be missing routing
    
    Returns: True if routing was created, False if already exists or error
    """
    # Only process ready_for_dispatch jobs
    if job.get("status") != "ready_for_dispatch":
        return False
    
    # Check if already has routing
    if job.get("transport_outward_id") or job.get("shipping_booking_id"):
        return False
    
    # Get incoterm - try job first, then quotation
    incoterm = job.get("incoterm", "").upper()
    order_type = "local"  # default
    customer_name = "Unknown Customer"
    
    # Get sales order
    so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
    if so:
        customer_name = so.get("customer_name", customer_name)
        
        # If no incoterm on job, check quotation
        if not incoterm:
            quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
            if quotation:
                incoterm = quotation.get("incoterm", "").upper()
                order_type = quotation.get("order_type", "local")
    
    # If still no incoterm, cannot route
    if not incoterm:
        return False
    
    try:
        # For EXPORT orders (FOB, CFR, CIF, CIP) - Create shipping booking
        # Check incoterm first (priority over order_type) since incoterm is more specific
        if incoterm in ["FOB", "CFR", "CIF", "CIP"]:
            # Check if shipping booking already exists for this job
            existing_booking = await db.shipping_bookings.find_one(
                {"job_order_ids": job_id},
                {"_id": 0}
            )
            
            if not existing_booking:
                quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0}) if so else None
                booking_number = await generate_sequence("SHP", "shipping_bookings")
                shipping_booking = {
                    "id": str(uuid.uuid4()),
                    "booking_number": booking_number,
                    "job_order_ids": [job_id],
                    "customer_name": customer_name,
                    "port_of_loading": quotation.get("port_of_loading", "") if quotation else "",
                    "port_of_discharge": quotation.get("port_of_discharge", "") if quotation else "",
                    "incoterm": incoterm,
                    "status": "PENDING",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.shipping_bookings.insert_one(shipping_booking)
                
                # Update job order with shipping reference
                await db.job_orders.update_one(
                    {"id": job_id},
                    {"$set": {"shipping_booking_id": shipping_booking["id"]}}
                )
                
                # Create notification
                await create_notification(
                    event_type="EXPORT_BOOKING_READY",
                    title=f"Export Booking Ready: {job.get('job_number')}",
                    message=f"Job {job.get('job_number')} ready for export shipping to {customer_name}",
                    link="/shipping",
                    ref_type="JOB",
                    ref_id=job_id,
                    target_roles=["admin", "shipping", "export"],
                    notification_type="info"
                )
                return True
        
        # For LOCAL orders (EXW, DDP) - Create transport OUTWARD record
        elif order_type == "local" or incoterm in ["EXW", "DDP"]:
            transport_number = await generate_sequence("TOUT", "transport_outward")
            transport_outward = {
                "id": str(uuid.uuid4()),
                "transport_number": transport_number,
                "job_order_id": job_id,
                "job_number": job.get("job_number"),
                "customer_name": customer_name,
                "incoterm": incoterm,
                "transport_type": "LOCAL",
                "source": "JOB_LOCAL_AUTO",
                "status": "PENDING",
                "delivery_location": so.get("delivery_address", "") if so else "",
                "product_name": job.get("product_name"),
                "quantity": job.get("quantity"),
                "packaging": job.get("packaging"),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.transport_outward.insert_one(transport_outward)
            
            # Update job order with transport reference
            await db.job_orders.update_one(
                {"id": job_id},
                {"$set": {"transport_outward_id": transport_outward["id"], "transport_number": transport_number}}
            )
            
            # Create notification
            await create_notification(
                event_type="LOCAL_DISPATCH_READY",
                title=f"Local Dispatch Ready: {job.get('job_number')}",
                message=f"Job {job.get('job_number')} ready for local dispatch to {customer_name}",
                link="/transport-window",
                ref_type="JOB",
                ref_id=job_id,
                target_roles=["admin", "transport", "dispatch"],
                notification_type="info"
            )
            return True
    except Exception as e:
        print(f"Error creating dispatch routing for job {job_id}: {e}")
        return False
    
    return False

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    if user_data.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {ROLES}")
    
    user = User(**user_data.model_dump())
    user_dict = user.model_dump()
    user_dict["password"] = hash_password(user_data.password)
    
    await db.users.insert_one(user_dict)
    return user

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account disabled")
    
    access_token = create_access_token({"sub": user["id"]})
    user_response = {k: v for k, v in user.items() if k not in ["_id", "password"]}
    return Token(access_token=access_token, token_type="bearer", user=user_response)

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# ==================== CUSTOMER ROUTES ====================

@api_router.post("/customers", response_model=Customer)
async def create_customer(data: CustomerCreate, current_user: dict = Depends(get_current_user)):
    customer = Customer(**data.model_dump())
    await db.customers.insert_one(customer.model_dump())
    return customer

@api_router.get("/customers", response_model=List[Customer])
async def get_customers(current_user: dict = Depends(get_current_user)):
    customers = await db.customers.find({}, {"_id": 0}).to_list(1000)
    return customers

@api_router.get("/customers/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

# ==================== PRODUCT ROUTES ====================

@api_router.post("/products", response_model=Product)
async def create_product(data: ProductCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.products.find_one({"sku": data.sku})
    if existing:
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    product = Product(**data.model_dump())
    await db.products.insert_one(product.model_dump())
    return product

@api_router.get("/products", response_model=List[Product])
async def get_products(category: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get products - uses inventory_balances.on_hand as source of truth when available"""
    query = {}
    if category:
        query["category"] = category
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    
    # Enrich products with inventory_balances data if available
    enriched_products = []
    for product in products:
        product_id = product.get("id")
        
        # Check if this product has an inventory_balance record (more authoritative)
        balance = await db.inventory_balances.find_one({"item_id": product_id}, {"_id": 0})
        if balance:
            # Use inventory_balances.on_hand as source of truth
            on_hand = balance.get("on_hand", 0)
            product["current_stock"] = on_hand
        # If no balance record, use products.current_stock as fallback
        
        enriched_products.append(product)
    
    return enriched_products

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, data: ProductCreate, current_user: dict = Depends(get_current_user)):
    result = await db.products.update_one({"id": product_id}, {"$set": data.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return await db.products.find_one({"id": product_id}, {"_id": 0})

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a product"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can delete products")
    
    # Check if product exists
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Check if product is used in any job orders
    job_count = await db.job_orders.count_documents({"product_id": product_id})
    if job_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete product. It is used in {job_count} job order(s)"
        )
    
    # Check if product is used in any quotations
    quotation_count = await db.quotations.count_documents({"items.product_id": product_id})
    if quotation_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete product. It is used in {quotation_count} quotation(s)"
        )
    
    # Delete the product
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return {"success": True, "message": f"Product {product.get('name')} deleted successfully"}

# ==================== QUOTATION ROUTES ====================

@api_router.post("/quotations", response_model=Quotation)
async def create_quotation(data: QuotationCreate, current_user: dict = Depends(get_current_user)):
    pfi_number = await generate_sequence("PFI", "quotations")
    
    items_with_total = []
    subtotal = 0
    
    for item in data.items:
        item_dict = item.model_dump()
        
        # Calculate total based on packaging type
        # For packaged items: (net_weight_kg * qty) / 1000 = MT, then MT * unit_price
        # For Bulk: qty (assumed MT) * unit_price
        if item.packaging != "Bulk" and item.net_weight_kg:
            weight_mt = (item.net_weight_kg * item.quantity) / 1000
            item_total = weight_mt * item.unit_price
            item_dict["weight_mt"] = weight_mt
        else:
            # Bulk: quantity is in MT
            weight_mt = item.quantity
            item_total = item.quantity * item.unit_price
            item_dict["weight_mt"] = weight_mt
        
        item_dict["total"] = item_total
        items_with_total.append(item_dict)
        subtotal += item_total
    
    # Calculate VAT if applicable
    vat_amount = 0
    vat_rate = 0
    if data.order_type == "local" and data.include_vat:
        vat_rate = data.vat_rate if data.vat_rate > 0 else 0.05  # Default 5% VAT
        vat_amount = subtotal * vat_rate
    
    grand_total = subtotal + vat_amount
    
    quotation = Quotation(
        **data.model_dump(exclude={"items", "vat_amount", "vat_rate", "subtotal", "total"}),
        items=items_with_total,
        pfi_number=pfi_number,
        subtotal=subtotal,
        vat_amount=vat_amount,
        vat_rate=vat_rate,
        total=grand_total,
        created_by=current_user["id"]
    )
    await db.quotations.insert_one(quotation.model_dump())
    return quotation

@api_router.get("/quotations", response_model=List[Quotation])
async def get_quotations(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    quotations = await db.quotations.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return quotations

@api_router.get("/quotations/{quotation_id}", response_model=Quotation)
async def get_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return quotation

@api_router.put("/quotations/{quotation_id}/approve")
async def approve_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only finance can approve quotations")
    
    result = await db.quotations.update_one(
        {"id": quotation_id, "status": "pending"},
        {"$set": {
            "status": "approved",
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quotation not found or already processed")
    
    # Get quotation details
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if quotation:
        # Send email notification and create in-app notification
        asyncio.create_task(notify_quotation_approved(quotation))
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "title": "Quotation Approved",
            "message": f"Quotation {quotation.get('pfi_number')} for {quotation.get('customer_name')} has been approved",
            "type": "success",
            "link": "/quotations",
            "user_id": None,
            "is_read": False,
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        # PHASE 1: Check material availability and create shortages
        material_check = await check_material_availability_for_quotation(quotation)
        
        if material_check["has_shortages"]:
            # Create notification for procurement about shortages
            await create_notification(
                event_type="MATERIAL_SHORTAGE",
                title="Material Shortage Detected",
                message=f"Quotation {quotation.get('pfi_number')} approved but {len(material_check['shortages'])} materials need procurement",
                link="/procurement",
                target_roles=["admin", "procurement"],
                notification_type="warning"
            )
    
    return {"message": "Quotation approved", "material_check": material_check if quotation else None}


async def check_material_availability_for_quotation(quotation: dict) -> dict:
    """
    Check raw materials and packaging availability for a quotation.
    Creates RFQ suggestions for shortages.
    """
    shortages = []
    items = quotation.get("items", [])
    
    for item in items:
        product_id = item.get("product_id")
        quantity = item.get("quantity", 0)
        packaging = item.get("packaging", "Bulk")
        # Preserve net_weight_kg from quotation - only default to 200 if not provided and not Bulk
        net_weight_kg = item.get("net_weight_kg")
        if net_weight_kg is None and packaging != "Bulk":
            net_weight_kg = 200  # Default only when needed
        
        # Calculate total KG needed
        if packaging != "Bulk":
            total_kg = quantity * (net_weight_kg or 200)
        else:
            total_kg = quantity * 1000  # Assume quantity is in MT for bulk
        
        # Get active product BOM
        product_bom = await db.product_boms.find_one({
            "product_id": product_id,
            "is_active": True
        }, {"_id": 0})
        
        if product_bom:
            bom_items = await db.product_bom_items.find({
                "bom_id": product_bom["id"]
            }, {"_id": 0}).to_list(100)
            
            for bom_item in bom_items:
                material_id = bom_item.get("material_item_id")
                qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
                required_qty = total_kg * qty_per_kg
                
                material = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
                if not material:
                    continue
                
                balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                on_hand = balance.get("on_hand", 0) if balance else 0
                reserved = balance.get("reserved", 0) if balance else 0
                available = on_hand - reserved
                
                shortage = max(0, required_qty - available)
                
                if shortage > 0:
                    shortages.append({
                        "type": "RAW_MATERIAL",
                        "item_id": material_id,
                        "item_name": material.get("name"),
                        "item_sku": material.get("sku"),
                        "required_qty": required_qty,
                        "available": available,
                        "shortage": shortage,
                        "uom": material.get("uom", "KG"),
                        "product_name": item.get("product_name"),
                        "quotation_id": quotation.get("id"),
                        "pfi_number": quotation.get("pfi_number")
                    })
        
        # Check packaging availability (for non-bulk)
        if packaging != "Bulk":
            # Find packaging type
            packaging_type = await db.packaging.find_one({
                "name": {"$regex": packaging, "$options": "i"}
            }, {"_id": 0})
            
            if packaging_type:
                packaging_bom = await db.packaging_boms.find_one({
                    "packaging_id": packaging_type["id"],
                    "is_active": True
                }, {"_id": 0})
                
                if packaging_bom:
                    pack_items = await db.packaging_bom_items.find({
                        "packaging_bom_id": packaging_bom["id"]
                    }, {"_id": 0}).to_list(100)
                    
                    for pack_item in pack_items:
                        pack_id = pack_item.get("pack_item_id")
                        qty_per_drum = pack_item.get("qty_per_drum", 1)
                        required_qty = quantity * qty_per_drum
                        
                        pack_material = await db.inventory_items.find_one({"id": pack_id}, {"_id": 0})
                        if not pack_material:
                            continue
                        
                        balance = await db.inventory_balances.find_one({"item_id": pack_id}, {"_id": 0})
                        on_hand = balance.get("on_hand", 0) if balance else 0
                        reserved = balance.get("reserved", 0) if balance else 0
                        available = on_hand - reserved
                        
                        shortage = max(0, required_qty - available)
                        
                        if shortage > 0:
                            shortages.append({
                                "type": "PACKAGING",
                                "item_id": pack_id,
                                "item_name": pack_material.get("name"),
                                "item_sku": pack_material.get("sku"),
                                "required_qty": required_qty,
                                "available": available,
                                "shortage": shortage,
                                "uom": pack_material.get("uom", "EA"),
                                "product_name": item.get("product_name"),
                                "quotation_id": quotation.get("id"),
                                "pfi_number": quotation.get("pfi_number")
                            })
    
    # Store shortages in material_shortage collection for RFQ
    if shortages:
        for shortage in shortages:
            existing = await db.material_shortages.find_one({
                "item_id": shortage["item_id"],
                "quotation_id": shortage["quotation_id"],
                "status": "PENDING"
            })
            if not existing:
                shortage["id"] = str(uuid.uuid4())
                shortage["status"] = "PENDING"
                shortage["created_at"] = datetime.now(timezone.utc).isoformat()
                await db.material_shortages.insert_one(shortage)
    
    return {
        "has_shortages": len(shortages) > 0,
        "shortages": shortages,
        "total_shortage_items": len(shortages)
    }

@api_router.put("/quotations/{quotation_id}/reject")
async def reject_quotation(
    quotation_id: str, 
    rejection_reason: str = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only finance can reject quotations")
    
    update_data = {
        "status": "rejected",
        "rejected_by": current_user["id"],
        "rejected_at": datetime.now(timezone.utc).isoformat()
    }
    if rejection_reason:
        update_data["rejection_reason"] = rejection_reason
    
    result = await db.quotations.update_one(
        {"id": quotation_id, "status": "pending"},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quotation not found or already processed")
    return {"message": "Quotation rejected"}

@api_router.put("/quotations/{quotation_id}/revise")
async def revise_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    """Create a new quotation based on a rejected one"""
    if current_user["role"] not in ["admin", "finance", "sales"]:
        raise HTTPException(status_code=403, detail="Only admin/finance/sales can revise quotations")
    
    # Get the rejected quotation
    quotation = await db.quotations.find_one({"id": quotation_id, "status": "rejected"}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Rejected quotation not found")
    
    # Create new quotation with same data but new ID and PFI number
    pfi_number = await generate_sequence("PFI", "quotations")
    
    new_quotation = Quotation(
        **{k: v for k, v in quotation.items() if k not in ["id", "pfi_number", "status", "approved_by", "approved_at", "rejection_reason", "rejected_by", "rejected_at", "created_at"]},
        pfi_number=pfi_number,
        created_by=current_user["id"]
    )
    
    await db.quotations.insert_one(new_quotation.model_dump())
    return new_quotation

@api_router.put("/quotations/{quotation_id}/edit")
async def edit_rejected_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    """Allow editing a rejected quotation by changing status back to pending"""
    if current_user["role"] not in ["admin", "finance", "sales"]:
        raise HTTPException(status_code=403, detail="Only admin/finance/sales can edit quotations")
    
    result = await db.quotations.update_one(
        {"id": quotation_id, "status": "rejected"},
        {"$set": {
            "status": "pending",
            "rejection_reason": None,
            "rejected_by": None,
            "rejected_at": None
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rejected quotation not found")
    
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    return quotation

# ==================== SALES ORDER ROUTES ====================

@api_router.post("/sales-orders", response_model=SalesOrder)
async def create_sales_order(data: SalesOrderCreate, current_user: dict = Depends(get_current_user)):
    quotation = await db.quotations.find_one({"id": data.quotation_id, "status": "approved"}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=400, detail="Quotation not found or not approved")
    
    spa_number = await generate_sequence("SPA", "sales_orders")
    
    sales_order = SalesOrder(
        quotation_id=data.quotation_id,
        spa_number=spa_number,
        customer_id=quotation["customer_id"],
        customer_name=quotation["customer_name"],
        items=quotation["items"],
        currency=quotation["currency"],
        total=quotation["total"],
        balance=quotation["total"],
        expected_delivery_date=data.expected_delivery_date,
        notes=data.notes
    )
    
    await db.sales_orders.insert_one(sales_order.model_dump())
    await db.quotations.update_one({"id": data.quotation_id}, {"$set": {"status": "converted"}})
    return sales_order

@api_router.get("/sales-orders", response_model=List[SalesOrder])
async def get_sales_orders(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    orders = await db.sales_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@api_router.get("/sales-orders/{order_id}", response_model=SalesOrder)
async def get_sales_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.sales_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    return order

# ==================== PAYMENT ROUTES ====================

@api_router.post("/payments", response_model=Payment)
async def record_payment(data: PaymentCreate, current_user: dict = Depends(get_current_user)):
    order = await db.sales_orders.find_one({"id": data.sales_order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    
    payment = Payment(**data.model_dump(), recorded_by=current_user["id"])
    await db.payments.insert_one(payment.model_dump())
    
    new_paid = order["amount_paid"] + data.amount
    new_balance = order["total"] - new_paid
    payment_status = "paid" if new_balance <= 0 else ("partial" if new_paid > 0 else "pending")
    
    await db.sales_orders.update_one(
        {"id": data.sales_order_id},
        {"$set": {"amount_paid": new_paid, "balance": new_balance, "payment_status": payment_status}}
    )
    return payment

@api_router.get("/payments", response_model=List[Payment])
async def get_payments(sales_order_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if sales_order_id:
        query["sales_order_id"] = sales_order_id
    payments = await db.payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    return payments

# ==================== JOB ORDER ROUTES ====================

@api_router.post("/job-orders", response_model=JobOrder)
async def create_job_order(data: JobOrderCreate, current_user: dict = Depends(get_current_user)):
    order = await db.sales_orders.find_one({"id": data.sales_order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    
    # Get incoterm from quotation for routing
    incoterm = None
    quotation = await db.quotations.find_one({"id": order.get("quotation_id")}, {"_id": 0})
    if quotation:
        incoterm = quotation.get("incoterm", "").upper()
    
    job_number = await generate_sequence("JOB", "job_orders")
    
    # Handle multiple products (items array) vs single product (backward compatibility)
    if hasattr(data, 'items') and data.items and len(data.items) > 0:
        # Multiple products: Create separate job order for EACH product with same job number
        created_job_orders = []
        all_material_shortages_combined = []
        any_needs_procurement = False
        
        for item in data.items:
            # Process each item individually
            item_dict = item.model_dump() if hasattr(item, 'model_dump') else item
            
            finished_product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
            finished_product_stock = finished_product.get("current_stock", 0) if finished_product else 0
            
            item_procurement_reasons = []
            item_material_shortages = []
            item_needs_procurement = False
            item_status = "pending"  # Default status
            
            # REQUIREMENT 5: Check if finished product is available in stock
            # If available, set status to ready_for_dispatch automatically
            if finished_product_stock >= item.quantity:
                item_status = "ready_for_dispatch"
                item_needs_procurement = False
            else:
                # Check finished product stock
                if finished_product_stock < item.quantity:
                    item_procurement_reasons.append(f"Stock ({finished_product_stock}) < required ({item.quantity})")
                    item_needs_procurement = True
            
            # Check BOM for raw materials
            bom_with_stock = []
            product_bom = await db.product_boms.find_one({
                "product_id": item.product_id,
                "is_active": True
            }, {"_id": 0})
            
            if product_bom:
                bom_items = await db.product_bom_items.find({
                    "bom_id": product_bom["id"]
                }, {"_id": 0}).to_list(100)
                
                item_packaging = item.packaging or "Bulk"
                if item_packaging != "Bulk":
                    # Preserve net_weight_kg from quotation, only default to 200 if not provided
                    net_weight = item.net_weight_kg if item.net_weight_kg is not None else 200
                    finished_kg = item.quantity * net_weight
                else:
                    # Bulk: quantity is in MT, convert to KG
                    finished_kg = item.quantity * 1000
                
                for bom_item in bom_items:
                    material_id = bom_item.get("material_item_id")
                    qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
                    required_raw_qty = finished_kg * qty_per_kg
                    
                    material_item = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
                    if material_item:
                        balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                        on_hand = balance.get("on_hand", 0) if balance else 0
                        reserved = balance.get("reserved", 0) if balance else 0
                        available_raw = on_hand - reserved
                        shortage_qty = max(0, required_raw_qty - available_raw)
                        
                        bom_with_stock.append({
                            "product_id": material_id,
                            "product_name": material_item.get("name", "Unknown"),
                            "sku": material_item.get("sku", "-"),
                            "required_qty": required_raw_qty,
                            "available_qty": available_raw,
                            "shortage_qty": shortage_qty,
                            "unit": bom_item.get("uom", "KG"),
                        })
                        
                        if available_raw < required_raw_qty:
                            item_needs_procurement = True
                            shortage = required_raw_qty - available_raw
                            item_procurement_reasons.append(
                                f"{material_item.get('name', 'Unknown')}: "
                                f"available ({available_raw}) < required ({required_raw_qty})"
                            )
                            item_material_shortages.append({
                                "item_id": material_id,
                                "item_name": material_item.get("name", "Unknown"),
                                "item_sku": material_item.get("sku", "-"),
                                "required_qty": required_raw_qty,
                                "available": available_raw,
                                "shortage": shortage,
                                "status": "SHORTAGE",
                                "uom": bom_item.get("uom", "KG"),
                                "item_type": "RAW"  # From product BOM, so it's raw material
                            })
            
            # Use item's BOM if provided, otherwise use calculated bom_with_stock
            if hasattr(item, 'bom') and item.bom:
                bom_raw = item.bom
                bom_with_stock = []
                for bom_item in bom_raw:
                    if hasattr(bom_item, 'model_dump'):
                        bom_with_stock.append(bom_item.model_dump())
                    elif isinstance(bom_item, dict):
                        bom_with_stock.append(bom_item)
                    else:
                        bom_with_stock.append(dict(bom_item) if hasattr(bom_item, '__dict__') else bom_item)
            
            if item_needs_procurement:
                any_needs_procurement = True
                all_material_shortages_combined.extend(item_material_shortages)
            
            # Create separate job order document for this product
            # Preserve net_weight_kg from quotation (only default to 200 if not provided and not Bulk)
            item_net_weight = item.net_weight_kg if item.net_weight_kg is not None else (None if (item.packaging or "Bulk") == "Bulk" else 200)
            
            job_order_dict = {
                "id": str(uuid.uuid4()),
                "job_number": job_number,  # Same job number for all products
                "spa_number": order["spa_number"],
                "sales_order_id": data.sales_order_id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "product_sku": item.product_sku or item_dict.get("product_sku"),
                "quantity": item.quantity,
                "packaging": item.packaging or "Bulk",
                "net_weight_kg": item_net_weight,  # Preserve from quotation, only default if needed
                "delivery_date": data.delivery_date,
                "bom": bom_with_stock,
                "priority": data.priority or "normal",
                "notes": data.notes,
                "special_conditions": data.special_conditions,  # Store special conditions
                "status": item_status,  # Auto set to ready_for_dispatch if product available
                "procurement_status": "pending" if item_needs_procurement else "not_required",
                "procurement_required": item_needs_procurement,
                "procurement_reason": "; ".join(item_procurement_reasons) if item_procurement_reasons else None,
                "material_shortages": item_material_shortages,
                "incoterm": incoterm,  # Store incoterm for routing
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.job_orders.insert_one(job_order_dict)
            created_job_orders.append(job_order_dict["id"])
            
            # PHASE 8: Auto-route job to transport if ready_for_dispatch
            if item_status == "ready_for_dispatch":
                await ensure_dispatch_routing(job_order_dict["id"], job_order_dict)
        
        # Create notification if any product needs procurement
        if any_needs_procurement:
            await create_notification(
                event_type="PRODUCTION_BLOCKED",
                title=f"Procurement Required: {job_number}",
                message=f"Job {job_number} requires procurement. {len(all_material_shortages_combined)} material(s) need to be procured.",
                link="/job-orders",
                ref_type="JOB",
                ref_id=created_job_orders[0] if created_job_orders else None,
                target_roles=["admin", "procurement"],
                notification_type="warning"
            )
        
        # Return the first created job order (remove _id if present)
        job_order_from_db = await db.job_orders.find_one({"id": created_job_orders[0]}, {"_id": 0})
        return job_order_from_db
    
    # Backward compatibility: single product (existing logic)
    if not data.product_id or not data.quantity:
        raise HTTPException(status_code=400, detail="Either 'items' array or single product fields (product_id, quantity) must be provided")
    
    # STEP 1: First check if finished product is available in inventory
    finished_product = await db.products.find_one({"id": data.product_id}, {"_id": 0})
    finished_product_stock = finished_product.get("current_stock", 0) if finished_product else 0
    required_quantity = data.quantity
    
    needs_procurement = False
    procurement_reason = []
    material_shortages_list = []
    job_status = "pending"  # Default status
    
    # REQUIREMENT 5: Check if finished product is available in stock
    # If available, set status to ready_for_dispatch automatically
    if finished_product_stock >= required_quantity:
        job_status = "ready_for_dispatch"
        needs_procurement = False
    
    # STEP 2: Always check raw materials from BOM (even if finished product is available)
    # This ensures we can produce more if needed and identify procurement needs
    bom_with_stock = []
    raw_materials_insufficient = False
    
    # Get product BOM to check raw materials
    product_bom = await db.product_boms.find_one({
        "product_id": data.product_id,
        "is_active": True
    }, {"_id": 0})
    
    if product_bom:
        bom_items = await db.product_bom_items.find({
            "bom_id": product_bom["id"]
        }, {"_id": 0}).to_list(100)
        
        # Calculate required raw materials based on job quantity
        # Preserve net_weight_kg from data if provided, only default if needed
        packaging = data.packaging or "Bulk"
        net_weight_kg = data.net_weight_kg if hasattr(data, 'net_weight_kg') and data.net_weight_kg is not None else None
        
        if packaging != "Bulk":
            # Use provided net_weight_kg or default to 200
            net_weight = net_weight_kg if net_weight_kg is not None else 200
            finished_kg = required_quantity * net_weight
        else:
            finished_kg = required_quantity * 1000  # Bulk: quantity is in MT, convert to KG
        
        for bom_item in bom_items:
            material_id = bom_item.get("material_item_id")
            qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
            required_raw_qty = finished_kg * qty_per_kg
            
            # Check raw material availability
            material_item = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
            if material_item:
                balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                on_hand = balance.get("on_hand", 0) if balance else 0
                reserved = balance.get("reserved", 0) if balance else 0
                available_raw = on_hand - reserved
                
                shortage_qty = max(0, required_raw_qty - available_raw)
                
                if available_raw < required_raw_qty:
                    raw_materials_insufficient = True
                    shortage = required_raw_qty - available_raw
                    procurement_reason.append(
                        f"Raw material {material_item.get('name', 'Unknown')} "
                        f"available ({available_raw}) < required ({required_raw_qty}), shortage: {shortage}"
                    )
                    material_shortages_list.append({
                        "item_id": material_id,
                        "item_name": material_item.get("name", "Unknown"),
                        "item_sku": material_item.get("sku", "-"),
                        "required_qty": required_raw_qty,
                        "available": available_raw,
                        "shortage": shortage,
                        "status": "SHORTAGE",
                        "uom": bom_item.get("uom", "KG"),
                        "item_type": "RAW"  # From product BOM, so it's raw material
                    })
                
                # Build BOM with stock info
                bom_with_stock.append({
                    "product_id": material_id,
                    "product_name": material_item.get("name", "Unknown"),
                    "sku": material_item.get("sku", "-"),
                    "required_qty": required_raw_qty,
                    "available_qty": available_raw,
                    "shortage_qty": shortage_qty,
                    "unit": bom_item.get("uom", "KG"),
                })
    else:
        # No BOM found - cannot produce, need procurement
        raw_materials_insufficient = True
        procurement_reason.append("No BOM configured for this product")
        bom_with_stock = []
        for item in data.bom:
            item_dict = item.model_dump()
            item_dict["available_qty"] = 0
            bom_with_stock.append(item_dict)
    
    # Determine if procurement is needed (only if finished product not available)
    # If finished product stock is insufficient OR raw materials are insufficient, need procurement
    if job_status != "ready_for_dispatch":
        if finished_product_stock < required_quantity:
            procurement_reason.insert(0, f"Finished product stock ({finished_product_stock}) < required ({required_quantity})")
            needs_procurement = True
        elif raw_materials_insufficient:
            # Finished product is available, but raw materials are not - need procurement for raw materials
            procurement_reason.insert(0, f"Finished product available ({finished_product_stock} >= {required_quantity}), but raw materials insufficient")
            needs_procurement = True
    
    job_order = JobOrder(
        **data.model_dump(exclude={"bom", "procurement_required", "material_shortages"}), # Exclude calculated fields
        bom=bom_with_stock,
        job_number=job_number,
        spa_number=order["spa_number"],
        status=job_status,  # Use calculated status (ready_for_dispatch or pending)
        procurement_status="pending" if needs_procurement else "not_required",
        procurement_required=needs_procurement,
        incoterm=incoterm  # Store incoterm for routing
    )
    
    # Store procurement reason and material shortages if needed
    if needs_procurement:
        job_order_dict = job_order.model_dump()
        job_order_dict["procurement_reason"] = "; ".join(procurement_reason)
        job_order_dict["material_shortages"] = material_shortages_list
        await db.job_orders.insert_one(job_order_dict)
        
        # Create notification for procurement team
        await create_notification(
            event_type="PRODUCTION_BLOCKED",
            title=f"Procurement Required: {job_number}",
            message=f"Job {job_number} requires procurement. {len(material_shortages_list)} material(s) need to be procured.",
            link="/job-orders",
            ref_type="JOB",
            ref_id=job_order.id,
            target_roles=["admin", "procurement"],
            notification_type="warning"
        )
    else:
        await db.job_orders.insert_one(job_order.model_dump())
    
    # PHASE 8: Auto-route job to transport if ready_for_dispatch
    if job_status == "ready_for_dispatch":
        await ensure_dispatch_routing(job_order.id, job_order.model_dump())
    
    return job_order

@api_router.get("/job-orders", response_model=List[JobOrder])
async def get_job_orders(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    jobs = await db.job_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return jobs

@api_router.get("/job-orders/{job_id}", response_model=JobOrder)
async def get_job_order(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    return job

@api_router.delete("/job-orders/{job_id}")
async def delete_job_order(job_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a job order"""
    if current_user["role"] not in ["admin", "production"]:
        raise HTTPException(status_code=403, detail="Only admin/production can delete job orders")
    
    # Check if job order exists
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    result = await db.job_orders.delete_one({"id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    return {"message": "Job order deleted successfully"}

@api_router.put("/job-orders/{job_id}/status")
async def update_job_status(
    job_id: str, 
    status: str, 
    reschedule_date: Optional[str] = None,
    reschedule_reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # Normalize status name - accept both production_completed and Production_Completed
    if status == "production_completed":
        status = "Production_Completed"
    
    valid_statuses = ["pending", "approved", "in_production", "procurement", "ready_for_dispatch", "dispatched", "Production_Completed", "rescheduled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    # Validate reschedule date if status is rescheduled
    if status == "rescheduled" and not reschedule_date:
        raise HTTPException(status_code=400, detail="Reschedule date is required when status is 'rescheduled'")
    
    update_data = {"status": status}
    if status == "approved":
        update_data["approved_by"] = current_user["id"]
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "in_production":
        update_data["production_start"] = datetime.now(timezone.utc).isoformat()
    elif status == "Production_Completed":
        update_data["production_end"] = datetime.now(timezone.utc).isoformat()
        update_data["completed_by"] = current_user["id"]
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
        
        # Update inventory when production is completed
        job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
        if job:
            product_id = job.get("product_id")
            quantity = job.get("quantity", 0)
            product_name = job.get("product_name", "Unknown Product")
            
            # Update product inventory (finished goods)
            if product_id:
                product = await db.products.find_one({"id": product_id}, {"_id": 0})
                if product:
                    prev_stock = product.get("current_stock", 0)
                    new_stock = prev_stock + quantity
                    await db.products.update_one(
                        {"id": product_id}, 
                        {"$set": {"current_stock": new_stock}}
                    )
                    
                    # Create inventory movement record
                    movement = InventoryMovement(
                        product_id=product_id,
                        product_name=product_name,
                        sku=product.get("sku", ""),
                        movement_type="production_complete",
                        quantity=quantity,
                        reference_type="job_order",
                        reference_id=job_id,
                        reference_number=job.get("job_number", ""),
                        previous_stock=prev_stock,
                        new_stock=new_stock,
                        created_by=current_user["id"]
                    )
                    await db.inventory_movements.insert_one(movement.model_dump())
                    
                    # Also update inventory_balances (for consistency with inventory system)
                    await db.inventory_balances.update_one(
                        {"item_id": product_id},
                        {"$inc": {"on_hand": quantity}},
                        upsert=True
                    )
        
        # Automatically progress to ready_for_dispatch after 3 seconds
        async def auto_progress_to_dispatch():
            await asyncio.sleep(3)  # Wait 3 seconds
            # Verify job still exists and is still in Production_Completed status
            current_job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
            if current_job and current_job.get("status") == "Production_Completed":
                await db.job_orders.update_one(
                    {"id": job_id},
                    {"$set": {
                        "status": "ready_for_dispatch",
                        "production_end": datetime.now(timezone.utc).isoformat()
                    }}
                )
                # Create notification for ready for dispatch
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "title": "Ready for Dispatch",
                    "message": f"Job {current_job.get('job_number')} ({current_job.get('product_name')}) is ready for dispatch",
                    "type": "success",
                    "link": "/job-orders",
                    "user_id": None,
                    "is_read": False,
                    "created_by": "system",
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
        
        # Start background task to auto-progress after 3 seconds
        asyncio.create_task(auto_progress_to_dispatch())
    elif status == "ready_for_dispatch":
        update_data["production_end"] = datetime.now(timezone.utc).isoformat()
        
        # Update inventory when ready for dispatch (if not already updated)
        # Check if inventory was already updated for this job to avoid double-counting
        job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
        if job:
            # Check if there's already an inventory movement for this job
            existing_movement = await db.inventory_movements.find_one({
                "reference_type": "job_order",
                "reference_id": job_id,
                "movement_type": {"$in": ["production_complete", "ready_for_dispatch"]}
            }, {"_id": 0})
            
            # Only update inventory if it hasn't been updated yet
            if not existing_movement:
                product_id = job.get("product_id")
                quantity = job.get("quantity", 0)
                product_name = job.get("product_name", "Unknown Product")
                
                # Update product inventory (finished goods)
                if product_id:
                    product = await db.products.find_one({"id": product_id}, {"_id": 0})
                    if product:
                        prev_stock = product.get("current_stock", 0)
                        new_stock = prev_stock + quantity
                        await db.products.update_one(
                            {"id": product_id}, 
                            {"$set": {"current_stock": new_stock}}
                        )
                        
                        # Create inventory movement record
                        movement = InventoryMovement(
                            product_id=product_id,
                            product_name=product_name,
                            sku=product.get("sku", ""),
                            movement_type="ready_for_dispatch",
                            quantity=quantity,
                            reference_type="job_order",
                            reference_id=job_id,
                            reference_number=job.get("job_number", ""),
                            previous_stock=prev_stock,
                            new_stock=new_stock,
                            created_by=current_user["id"]
                        )
                        await db.inventory_movements.insert_one(movement.model_dump())
                        
                        # Also update inventory_balances (for consistency with inventory system)
                        await db.inventory_balances.update_one(
                            {"item_id": product_id},
                            {"$inc": {"on_hand": quantity}},
                            upsert=True
                        )
    elif status == "rescheduled":
        update_data["reschedule_date"] = reschedule_date
        update_data["reschedule_reason"] = reschedule_reason
        update_data["rescheduled_by"] = current_user["id"]
        update_data["rescheduled_at"] = datetime.now(timezone.utc).isoformat()
        # Reset scheduled_start to new date
        update_data["scheduled_start"] = reschedule_date
    
    result = await db.job_orders.update_one({"id": job_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Get job for routing logic
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    
    # If approved, check incoterm from sales order and route appropriately
    if status == "approved" and job:
        so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
        if so:
            quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
            if quotation:
                incoterm = quotation.get("incoterm", "").upper()
                order_type = quotation.get("order_type", "local")
                
                # Route based on incoterm
                if order_type == "export" and incoterm in ["FOB", "CFR", "CIF"]:
                    # Will need shipping booking
                    update_data["next_step"] = "SHIPPING"
                elif order_type == "local" or incoterm in ["EXW", "DDP"]:
                    # Will need transport booking
                    update_data["next_step"] = "TRANSPORT"
                
                await db.job_orders.update_one({"id": job_id}, {"$set": update_data})
    
    # ROUTING LOGIC FOR READY_FOR_DISPATCH: Create transport/shipping records automatically
    if status == "ready_for_dispatch" and job:
        await ensure_dispatch_routing(job_id, job)
    
    # Send email notification and create in-app notification
    if job:
        asyncio.create_task(notify_job_order_status_change(job, status))
        # Create in-app notification
        notification_types = {
            "approved": ("success", "Job Order Approved"),
            "in_production": ("info", "Production Started"),
            "ready_for_dispatch": ("success", "Ready for Dispatch"),
            "dispatched": ("success", "Job Dispatched"),
            "procurement": ("warning", "Procurement Needed")
        }
        ntype, ntitle = notification_types.get(status, ("info", "Status Updated"))
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "title": ntitle,
            "message": f"Job {job.get('job_number')} ({job.get('product_name')}) - {status.replace('_', ' ').title()}",
            "type": ntype,
            "link": "/job-orders",
            "user_id": None,
            "is_read": False,
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    return {"message": f"Job status updated to {status}"}

@api_router.put("/job-orders/{job_id}/reschedule")
async def reschedule_job_order(
    job_id: str,
    reschedule_date: str,
    reschedule_reason: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Reschedule a job order to a new date"""
    # Validate job exists
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Update job with reschedule information
    update_data = {
        "status": "rescheduled",
        "reschedule_date": reschedule_date,
        "reschedule_reason": reschedule_reason,
        "rescheduled_by": current_user["id"],
        "rescheduled_at": datetime.now(timezone.utc).isoformat(),
        "scheduled_start": reschedule_date  # Update the scheduled start to new date
    }
    
    result = await db.job_orders.update_one({"id": job_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Create notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "title": "Job Order Rescheduled",
        "message": f"Job {job.get('job_number')} ({job.get('product_name')}) rescheduled to {reschedule_date}. Reason: {reschedule_reason}",
        "type": "warning",
        "link": "/job-orders",
        "user_id": None,
        "is_read": False,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Job order rescheduled successfully", "reschedule_date": reschedule_date}

@api_router.get("/job-orders/{job_number}/transport-debug")
async def debug_job_transport(job_number: str):
    """Debug endpoint to check transport routing for a specific job"""
    job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    transport = None
    if job.get("transport_outward_id"):
        transport = await db.transport_outward.find_one(
            {"id": job["transport_outward_id"]}, 
            {"_id": 0}
        )
    
    shipping = None
    if job.get("shipping_booking_id"):
        shipping = await db.shipping_bookings.find_one(
            {"id": job["shipping_booking_id"]},
            {"_id": 0}
        )
    
    return {
        "job": job,
        "transport_outward": transport,
        "shipping_booking": shipping



        }
    }
    
    # Check if DO exists
    do = await db.delivery_orders.find_one({"job_order_id": job_id}, {"_id": 0})
    if do:
        documents["delivery_order"] = {"status": "GENERATED", "number": do.get("do_number")}
    
    return {
        "job_number": job.get("job_number"),
        "is_export": is_export,
        "customer_type": quotation.get("order_type") if quotation else "local",
        "documents": documents
    }

# ==================== SETTINGS MANAGEMENT ====================

@api_router.get("/settings/all")
async def get_all_settings(current_user: dict = Depends(get_current_user)):
    """Get all system settings (payment terms, document templates, container types, companies)"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can access settings")
    
    # Get payment terms
    payment_terms_doc = await db.settings.find_one({"type": "payment_terms"}, {"_id": 0})
    if not payment_terms_doc:
        default_payment_terms = [
            {"id": "1", "name": "Net 30", "days": 30, "description": "Payment due in 30 days"},
            {"id": "2", "name": "Net 60", "days": 60, "description": "Payment due in 60 days"},
            {"id": "3", "name": "Advance", "days": 0, "description": "Payment in advance"},
            {"id": "4", "name": "LC", "days": 0, "description": "Letter of Credit"},
            {"id": "5", "name": "COD", "days": 0, "description": "Cash on Delivery"}
        ]
        await db.settings.insert_one({"type": "payment_terms", "data": default_payment_terms})
        payment_terms = default_payment_terms
    else:
        payment_terms = payment_terms_doc.get("data", [])
    
    # Get document templates
    doc_templates_doc = await db.settings.find_one({"type": "document_templates"}, {"_id": 0})
    if not doc_templates_doc:
        default_doc_templates = [
            {"id": "1", "name": "Commercial Invoice", "required_for": "export"},
            {"id": "2", "name": "Packing List", "required_for": "all"},
            {"id": "3", "name": "Certificate of Origin", "required_for": "export"},
            {"id": "4", "name": "Certificate of Analysis", "required_for": "all"},
            {"id": "5", "name": "Bill of Lading", "required_for": "export"},
            {"id": "6", "name": "Delivery Note", "required_for": "local"},
            {"id": "7", "name": "Tax Invoice", "required_for": "local"}
        ]
        await db.settings.insert_one({"type": "document_templates", "data": default_doc_templates})
        doc_templates = default_doc_templates
    else:
        doc_templates = doc_templates_doc.get("data", [])
    
    # Get container types
    container_types_doc = await db.settings.find_one({"type": "container_types"}, {"_id": 0})
    if not container_types_doc:
        default_container_types = [
            {"id": "1", "value": "20ft", "label": "20ft Container", "max_mt": 28},
            {"id": "2", "value": "40ft", "label": "40ft Container", "max_mt": 28},
            {"id": "3", "value": "iso_tank", "label": "ISO Tank", "max_mt": 25},
            {"id": "4", "value": "bulk_tanker_45", "label": "Bulk Tanker 45T", "max_mt": 45},
            {"id": "5", "value": "bulk_tanker_25", "label": "Bulk Tanker 25T", "max_mt": 25}
        ]
        await db.settings.insert_one({"type": "container_types", "data": default_container_types})
        container_types = default_container_types
    else:
        container_types = container_types_doc.get("data", [])
    
    # Get packaging types
    packaging_types_doc = await db.settings.find_one({"type": "packaging_types"}, {"_id": 0})
    if not packaging_types_doc:
        default_packaging_types = [
            {"id": "1", "name": "200L Drum", "description": "Standard 200 liter drum"},
            {"id": "2", "name": "IBC", "description": "Intermediate Bulk Container"},
            {"id": "3", "name": "Bulk", "description": "Bulk tanker delivery"}
        ]
        await db.settings.insert_one({"type": "packaging_types", "data": default_packaging_types})
        packaging_types = default_packaging_types
    else:
        packaging_types = packaging_types_doc.get("data", [])
    
    # Get companies
    companies = await db.companies.find({}, {"_id": 0}).to_list(100)
    if not companies:
        companies = [
            {"id": "1", "name": "Main Factory", "address": "Industrial Area, UAE", "type": "billing"},
            {"id": "2", "name": "Warehouse A", "address": "Free Zone, UAE", "type": "shipping"}
        ]
    
    return {
        "payment_terms": payment_terms,
        "document_templates": doc_templates,
        "container_types": container_types,
        "packaging_types": packaging_types,
        "companies": companies
    }

@api_router.post("/settings/payment-terms")
async def create_payment_term(data: dict, current_user: dict = Depends(get_current_user)):
    """Add a new payment term"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    doc = await db.settings.find_one({"type": "payment_terms"})
    if not doc:
        doc = {"type": "payment_terms", "data": []}
        await db.settings.insert_one(doc)
    
    new_term = {
        "id": str(uuid.uuid4()),
        "name": data.get("name"),
        "days": data.get("days", 0),
        "description": data.get("description", "")
    }
    await db.settings.update_one(
        {"type": "payment_terms"},
        {"$push": {"data": new_term}}
    )
    return new_term

@api_router.put("/settings/payment-terms/{term_id}")
async def update_payment_term(term_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a payment term"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    await db.settings.update_one(
        {"type": "payment_terms", "data.id": term_id},
        {"$set": {
            "data.$.name": data.get("name"),
            "data.$.days": data.get("days"),
            "data.$.description": data.get("description", "")
        }}
    )
    return {"success": True}

@api_router.delete("/settings/payment-terms/{term_id}")
async def delete_payment_term(term_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a payment term"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    await db.settings.update_one(
        {"type": "payment_terms"},
        {"$pull": {"data": {"id": term_id}}}
    )
    return {"success": True}

@api_router.post("/settings/document-templates")
async def create_document_template(data: dict, current_user: dict = Depends(get_current_user)):
    """Add a new document template"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    doc = await db.settings.find_one({"type": "document_templates"})
    if not doc:
        doc = {"type": "document_templates", "data": []}
        await db.settings.insert_one(doc)
    
    new_template = {
        "id": str(uuid.uuid4()),
        "name": data.get("name"),
        "required_for": data.get("required_for", "all")
    }
    await db.settings.update_one(
        {"type": "document_templates"},
        {"$push": {"data": new_template}}
    )
    return new_template

@api_router.put("/settings/document-templates/{template_id}")
async def update_document_template(template_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a document template"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    await db.settings.update_one(
        {"type": "document_templates", "data.id": template_id},
        {"$set": {
            "data.$.name": data.get("name"),
            "data.$.required_for": data.get("required_for")
        }}
    )
    return {"success": True}

@api_router.delete("/settings/document-templates/{template_id}")
async def delete_document_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a document template"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    await db.settings.update_one(
        {"type": "document_templates"},
        {"$pull": {"data": {"id": template_id}}}
    )
    return {"success": True}

@api_router.post("/settings/container-types")
async def create_container_type(data: dict, current_user: dict = Depends(get_current_user)):
    """Add a new container type"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    doc = await db.settings.find_one({"type": "container_types"})
    if not doc:
        doc = {"type": "container_types", "data": []}
        await db.settings.insert_one(doc)
    
    new_container = {
        "id": str(uuid.uuid4()),
        "name": data.get("name"),
        "capacity": data.get("capacity", "")
    }
    await db.settings.update_one(
        {"type": "container_types"},
        {"$push": {"data": new_container}}
    )
    return new_container

@api_router.put("/settings/container-types/{container_id}")
async def update_container_type(container_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a container type"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    await db.settings.update_one(
        {"type": "container_types", "data.id": container_id},
        {"$set": {
            "data.$.name": data.get("name"),
            "data.$.capacity": data.get("capacity")
        }}
    )
    return {"success": True}

@api_router.delete("/settings/container-types/{container_id}")
async def delete_container_type(container_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a container type"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    await db.settings.update_one(
        {"type": "container_types"},
        {"$pull": {"data": {"id": container_id}}}
    )
    return {"success": True}

@api_router.post("/settings/packaging-types")
async def create_packaging_type(data: dict, current_user: dict = Depends(get_current_user)):
    """Add a new packaging type"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    doc = await db.settings.find_one({"type": "packaging_types"})
    if not doc:
        doc = {"type": "packaging_types", "data": []}
        await db.settings.insert_one(doc)
    
    new_packaging = {
        "id": str(uuid.uuid4()),
        "name": data.get("name"),
        "description": data.get("description", "")
    }
    await db.settings.update_one(
        {"type": "packaging_types"},
        {"$push": {"data": new_packaging}}
    )
    return new_packaging

@api_router.put("/settings/packaging-types/{packaging_id}")
async def update_packaging_type(packaging_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a packaging type"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    await db.settings.update_one(
        {"type": "packaging_types", "data.id": packaging_id},
        {"$set": {
            "data.$.name": data.get("name"),
            "data.$.description": data.get("description")
        }}
    )
    return {"success": True}

@api_router.delete("/settings/packaging-types/{packaging_id}")
async def delete_packaging_type(packaging_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a packaging type"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can manage settings")
    
    await db.settings.update_one(
        {"type": "packaging_types"},
        {"$pull": {"data": {"id": packaging_id}}}
    )
    return {"success": True}

@api_router.post("/settings/companies")
async def create_company(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new company"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can create companies")
    
    company = {
        "id": str(uuid.uuid4()),
        "name": data.get("name"),
        "address": data.get("address", ""),
        "type": data.get("type", "billing")
    }
    await db.companies.insert_one(company)
    return company

@api_router.put("/settings/companies/{company_id}")
async def update_company(company_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a company"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can update companies")
    
    update_data = {}
    if "name" in data:
        update_data["name"] = data["name"]
    if "address" in data:
        update_data["address"] = data["address"]
    if "type" in data:
        update_data["type"] = data["type"]
    
    result = await db.companies.update_one({"id": company_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    return company

@api_router.delete("/settings/companies/{company_id}")
async def delete_company(company_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a company"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can delete companies")
    
    result = await db.companies.delete_one({"id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    
    return {"success": True}


app.include_router(api_router)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Background task to check for orphaned ready_for_dispatch jobs
async def check_orphaned_dispatch_routing():
    """
    Background task that periodically checks for ready_for_dispatch jobs without routing.
    Runs every 5 minutes to catch any jobs that slipped through.
    """
    while True:
        try:
            await asyncio.sleep(300)  # Run every 5 minutes
            
            # Find all ready_for_dispatch jobs without transport or shipping records
            orphaned_jobs = await db.job_orders.find(
                {
                    "status": "ready_for_dispatch",
                    "transport_outward_id": {"$exists": False},
                    "shipping_booking_id": {"$exists": False}
                },
                {"_id": 0}
            ).to_list(100)
            
            if orphaned_jobs:
                logger.info(f"Found {len(orphaned_jobs)} orphaned ready_for_dispatch jobs, creating routing...")
                
                for job in orphaned_jobs:
                    try:
                        created = await ensure_dispatch_routing(job["id"], job)
                        if created:
                            logger.info(f"Created routing for orphaned job {job.get('job_number')}")
                    except Exception as e:
                        logger.error(f"Error creating routing for job {job.get('job_number')}: {e}")
        except Exception as e:
            logger.error(f"Error in orphaned dispatch routing check: {e}")

@app.on_event("startup")
async def startup_event():
    """Start background tasks"""
    # Start the orphaned dispatch routing checker
    asyncio.create_task(check_orphaned_dispatch_routing())
    logger.info("Started orphaned dispatch routing background task")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
