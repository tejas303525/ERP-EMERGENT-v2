from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, Body, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import re
import time
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from math import ceil
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

# File upload directory
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Helper function to extract country from port name or get country of destination
def get_country_of_destination(quotation: Optional[Dict], customer: Optional[Dict] = None) -> Optional[str]:
    """
    Extract country of destination from quotation.
    Priority:
    1. country_of_destination field (if explicitly set)
    2. Extract from port_of_discharge (if contains country name or abbreviation)
    3. Customer's country (as fallback)
    """
    if not quotation:
        return customer.get("country") if customer else None
    
    # First priority: explicit country_of_destination
    if quotation.get("country_of_destination"):
        return quotation.get("country_of_destination")
    
    # Second priority: try to extract from port_of_discharge
    port_of_discharge = quotation.get("port_of_discharge", "")
    if port_of_discharge:
        # Port abbreviation to country mapping
        port_abbreviations = {
            'AD': 'UAE',  # Abu Dhabi
            'DXB': 'UAE',  # Dubai
            'AUH': 'UAE',  # Abu Dhabi airport
            'JED': 'Saudi Arabia',  # Jeddah
            'RUH': 'Saudi Arabia',  # Riyadh
            'DMM': 'Saudi Arabia',  # Dammam
            'DOH': 'Qatar',  # Doha
            'KWI': 'Kuwait',  # Kuwait
            'BAH': 'Bahrain',  # Bahrain
            'MCT': 'Oman',  # Muscat
            'BOM': 'India',  # Mumbai
            'DEL': 'India',  # Delhi
            'CGK': 'Indonesia',  # Jakarta
            'SIN': 'Singapore',  # Singapore
            'KUL': 'Malaysia',  # Kuala Lumpur
        }
        
        port_upper = port_of_discharge.upper().strip()
        
        # Check abbreviations first
        if port_upper in port_abbreviations:
            return port_abbreviations[port_upper]
        
        # UAE emirates and ports (common local destinations)
        uae_locations = {
            'DUBAI', 'DXB', 'JEBEL ALI', 'JEBEL ALI PORT', 'JAFZA', 'JAFZ',
            'SHJ', 'SHARJAH', 'SHARJAH PORT',
            'AUH', 'ABU DHABI', 'ABU DHABI PORT',
            'AJMAN', 'AJMAN PORT',
            'RAK', 'RAS AL KHAIMAH', 'RAS AL KHAIMAH PORT',
            'UAQ', 'UMM AL QUWAIN', 'UMM AL QUWAIN PORT',
            'FUJAIRAH', 'FUJAIRAH PORT', 'FJR'
        }
        
        # Check if port matches UAE location
        for uae_loc in uae_locations:
            if uae_loc in port_upper:
                return 'UAE'
        
        # Common country names to look for in port names
        countries = [
            'UAE', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
            'India', 'Pakistan', 'China', 'USA', 'United States', 'UK', 'United Kingdom',
            'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Singapore', 'Malaysia',
            'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'South Africa', 'Nigeria',
            'Egypt', 'Kenya', 'Australia', 'New Zealand', 'Brazil', 'Mexico', 'Canada',
            'Japan', 'South Korea', 'Turkey', 'Russia', 'Guinea', 'Conakry'
        ]
        
        # Check if any country name appears in the port name
        for country in countries:
            if country.upper() in port_upper:
                return country
    
    # Third priority: customer's country
    if customer and customer.get("country"):
        return customer.get("country")
    
    return None

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
    role_id: Optional[str] = None  # Reference to roles collection
    allowed_pages: List[str] = []  # Direct permission override

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

# Role Management Models
class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    allowed_pages: List[str] = []  # List of page paths/routes

class Role(RoleCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_system_role: bool = False  # True for admin, cannot be deleted
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    allowed_pages: Optional[List[str]] = None

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
    uom: Optional[str] = "per_mt"  # Unit of Measure: "per_unit", "per_liter", "per_mt"
    packaging: str = "Bulk"
    net_weight_kg: Optional[float] = None  # Net weight per unit for packaging
    weight_mt: Optional[float] = None  # Total weight in MT
    total: float = 0
    # Container grouping and export details
    container_number: Optional[int] = None  # Which container this item belongs to (1, 2, 3, etc.)
    container_count_per_item: Optional[int] = None  # Number of containers allocated to this item (e.g., 5, 12)
    brand: Optional[str] = None  # Product brand (e.g., "MOTRIX", "WILL BE ANNOUNCED LATER")
    color: Optional[str] = None  # Product color (e.g., "RED WITH BLACK CAP", "BLUE")
    detailed_packing: Optional[str] = None  # Detailed packing description (e.g., "PACKED IN 12X1 LTR CARTON")
    fcl_breakdown: Optional[str] = None  # FCL breakdown (e.g., "TOTAL 1600 CARTONS/ 1X20 FCL")
    quantity_in_units: Optional[float] = None  # Quantity in units (e.g., 8000 cartons, 15960 pails)
    unit_type: Optional[str] = None  # Unit type (e.g., "CRTN" for cartons, "PAILS", "DRUMS")
    item_country_of_origin: Optional[str] = None  # Country of origin for this specific item
    packing_display: Optional[str] = None  # Packing display format (e.g., "5X 20 FCL", "12X 20 FCL")
    palletized: Optional[bool] = None  # Whether the item is palletized

class QuotationCreate(BaseModel):
    customer_id: str
    customer_name: str
    items: List[QuotationItem]
    currency: str = "USD"  # USD, AED, EUR
    order_type: str = "local"  # local or export
    incoterm: Optional[str] = None  # CFR, FOB, CIF, EXW, DDP
    container_type: Optional[str] = None  # 20ft, 40ft, iso_tank, bulk_tanker_45, etc.
    container_count: int = 1  # Total number of containers
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    delivery_place: Optional[str] = None
    country_of_origin: Optional[str] = "UAE"
    country_of_destination: Optional[str] = None
    payment_terms: str = "Cash"  # LC, CAD, Cash, TT, Net 30
    validity_days: int = 30
    expected_delivery_date: Optional[str] = None  # Expected delivery date for production scheduling
    notes: Optional[str] = None
    required_documents: List[str] = []  # List of document type IDs
    include_vat: bool = True
    vat_rate: float = 0.0
    vat_amount: float = 0.0
    total_weight_mt: float = 0.0
    bank_id: Optional[str] = None  # Selected bank account ID
    transport_mode: Optional[str] = None  # "ocean", "road", "air"
    local_type: Optional[str] = None  # "direct_to_customer", "bulk_to_plant", "packaged_to_plant"
    is_dg: Optional[bool] = False  # Dangerous goods flag
    # Additional freight charges (for CFR quotations)
    additional_freight_rate_per_fcl: Optional[float] = None  # Freight rate per FCL (e.g., 2175)
    additional_freight_currency: str = "USD"  # Currency for additional freight
    cfr_amount: Optional[float] = None  # CFR product amount (before additional freight)
    additional_freight_amount: Optional[float] = None  # Additional freight (rate × FCL count)
    total_receivable: Optional[float] = None  # CFR amount + additional freight

# Product Packaging Configuration Model
class ProductPackagingConfigCreate(BaseModel):
    product_id: str
    product_name: str  # Denormalized for easier queries
    packaging_type: str  # "Drum", "Carton", "Flexi/ISO", "Bulk", "IBC"
    packaging_name: str  # e.g., "200L Drum", "210L Drum", "IBC 1000L"
    
    # Specific filling fields by packaging type
    drum_carton_filling_kg: Optional[float] = None  # Drum/Carton fillings in KG
    ibc_filling_kg: Optional[float] = None  # IBC fillings in KG
    flexi_iso_filling_mt: Optional[float] = None  # Flexi/ISO fillings in MT
    
    # 20ft Container configurations
    container_20ft_palletised: Optional[int] = None  # Total units palletised in 20ft
    container_20ft_non_palletised: Optional[int] = None  # Total units non-palletised in 20ft
    container_20ft_ibc: Optional[int] = None  # Total IBC units in 20ft
    container_20ft_total_nw_mt: Optional[float] = None  # Total net weight in MT for 20ft
    
    # 40ft Container configurations
    container_40ft_palletised: Optional[int] = None  # Total units palletised in 40ft
    container_40ft_non_palletised: Optional[int] = None  # Total units non-palletised in 40ft
    container_40ft_ibc: Optional[int] = None  # Total IBC units in 40ft
    container_40ft_total_nw_mt: Optional[float] = None  # Total net weight in MT for 40ft
    
    # Product classification
    hscode: Optional[str] = None  # HS Code for customs/tariff classification
    origin: Optional[str] = None  # Country of origin (e.g., "UAE", "USA")
    
    is_active: bool = True

class ProductPackagingConfig(ProductPackagingConfigCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Quotation(QuotationCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pfi_number: str = ""
    revision_number: Optional[int] = None  # Revision number for REV-xxx format
    original_quotation_id: Optional[str] = None  # Reference to original quotation if this is a revision
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
    # Costing fields
    costing_id: Optional[str] = None  # Reference to costing_calculations
    cost_confirmed: bool = False
    margin_amount: Optional[float] = None  # Cached from costing
    margin_percentage: Optional[float] = None  # Cached from costing
    costing_rejection_reason: Optional[str] = None
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
    total_weight_mt: float = 0.0  # Total weight in MT from quotation
    payment_status: str = "pending"  # pending, partial, paid
    amount_paid: float = 0
    balance: float = 0
    status: str = "active"  # active, completed, cancelled
    expected_delivery_date: Optional[str] = None
    notes: Optional[str] = None
    country_of_destination: Optional[str] = None
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
    customer_name: Optional[str] = None  # Customer name from quotation via sales order
    total_weight_mt: float = 0.0  # Total weight in MT from quotation/sales order
    status: str = "pending"  # pending, approved, in_production, procurement, ready_for_dispatch, dispatched, Production_Completed, rescheduled
    procurement_status: str = "not_required"  # not_required, pending, complete
    procurement_required: bool = False
    procurement_reason: Optional[str] = None
    material_shortages: List[Dict] = []
    incoterm: Optional[str] = None  # EXW, FOB, DDP, CFR for routing
    country_of_destination: Optional[str] = None  # Country of destination from quotation
    # Costing fields
    costing_id: Optional[str] = None  # Reference to costing_calculations
    cost_confirmed: bool = False
    margin_amount: Optional[float] = None  # Cached from costing
    margin_percentage: Optional[float] = None  # Cached from costing
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class JobOrderReschedule(BaseModel):
    new_date: str
    new_shift: Optional[str] = None
    reason: Optional[str] = ""
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

# Costing & Margin Validation Models
class CostingCalculationCreate(BaseModel):
    reference_type: str  # "QUOTATION" or "JOB_ORDER"
    reference_id: str
    costing_type: str  # "EXPORT_CONTAINERIZED", "EXPORT_BULK", "LOCAL_DISPATCH"
    raw_material_cost: float = 0.0
    raw_material_cost_source: str = "INVENTORY_AVG"  # "INVENTORY_AVG", "LATEST_PO", "MANUAL"
    raw_material_source: Optional[str] = "SYSTEM"  # "SYSTEM" or "MANUAL" - whether to calculate from system or enter manually
    packaging_cost: float = 0.0
    packaging_cost_source: Optional[str] = None  # "LATEST_PO", "MANUAL"
    packaging_type: Optional[str] = None  # "BULK" or "DRUM" - affects packaging cost calculation
    inland_transport_cost: float = 0.0
    thc_cost: float = 0.0
    isps_cost: float = 0.0
    documentation_cost: float = 0.0
    bl_cost: float = 0.0
    ocean_freight_cost: float = 0.0
    ocean_freight_entered_by: Optional[str] = None
    port_charges: float = 0.0
    local_transport_cost: float = 0.0
    container_count: int = 1
    is_dg: bool = False  # Dangerous goods flag
    incoterm_type: Optional[str] = None  # "EXW" or "DELIVERED" - for display and future calculation logic
    # Optional detailed breakdown for custom costing sheets (e.g. GCC by road)
    custom_breakdown: Optional[Dict[str, Any]] = None

class CostingCalculation(CostingCalculationCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cost_confirmed: bool = False
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    total_cost: float = 0.0
    selling_price: float = 0.0
    margin_amount: float = 0.0
    margin_percentage: float = 0.0
    unit_cost: float = 0.0
    unit_margin: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: str = ""
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_by: str = ""

# Transport Master Model
class TransportRouteCreate(BaseModel):
    route_name: str
    origin: str
    destination: str
    vehicle_type: str
    rate: float
    currency: str = "USD"
    effective_date: str
    is_active: bool = True
    auto_update_from_bookings: bool = False  # If True, automatically update rate from booking charges

class TransportRoute(TransportRouteCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Fixed Charges Master Model
class FixedChargeCreate(BaseModel):
    charge_type: str  # "THC", "ISPS", "DOCUMENTATION", "BL_FEES", etc.
    charge_name: str
    amount: float
    currency: str = "USD"
    effective_date: str
    is_active: bool = True
    container_type: Optional[str] = None  # "20ft", "40ft", None for all
    is_dg: Optional[bool] = None  # true for DG, false for non-DG, None for both
    applicable_to: Optional[str] = None  # "export", "local", "both"

class FixedCharge(FixedChargeCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Production Log Model
class ProductionLogCreate(BaseModel):
    job_order_id: str
    job_number: str
    product_id: str
    product_name: str
    production_date: str
    required_qty: float
    quantity_produced: float
    batch_number: str
    production_type: str = "drummed"  # Production type: 'drummed' or 'bulk'

class ProductionLog(ProductionLogCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: str = ""

# GRN Model (Goods Received Note)
class GRNItem(BaseModel):
    product_id: str
    product_name: str
    sku: Optional[str] = None  # Make optional
    quantity: float = Field(gt=0, description="Quantity must be greater than 0")
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
    po_id: Optional[str] = None  # Link to Purchase Order
    po_number: Optional[str] = None  # Enriched from PO
    qc_inspection_id: Optional[str] = None  # Link to QC Inspection
    qc_number: Optional[str] = None  # Enriched from QC Inspection

# Delivery Order Model
class DeliveryOrderCreate(BaseModel):
    job_order_id: str
    shipping_booking_id: Optional[str] = None
    vehicle_type: Optional[str] = None
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
    job_order_ids: List[str] = []  # Empty for PO imports
    po_ids: List[str] = []  # PO IDs for import bookings
    shipping_line: Optional[str] = None
    container_type: Optional[str] = "20ft"  # 20ft, 40ft, 40ft_hc
    container_count: Optional[int] = 1
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    cargo_description: Optional[str] = None
    cargo_weight: Optional[float] = None
    is_dg: bool = False  # Dangerous Goods
    dg_class: Optional[str] = None
    notes: Optional[str] = None
    incoterm: Optional[str] = None
    # CRO fields (for FOB - customer provides these upfront)
    cro_number: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_date: Optional[str] = None  # Vessel departure date
    cutoff_date: Optional[str] = None  # Container cutoff at port
    gate_cutoff: Optional[str] = None  # Gate cutoff time
    vgm_cutoff: Optional[str] = None  # VGM submission cutoff
    freight_rate: Optional[float] = None
    freight_currency: str = "USD"
    freight_charges: Optional[float] = None  # Total freight charges
    pull_out_date: Optional[str] = None  # Container pull out date
    si_cutoff: Optional[str] = None  # SI (Shipping Instructions) cutoff
    gate_in_date: Optional[str] = None  # Gate in date at port
    booking_source: str = "SELLER"  # "SELLER" or "CUSTOMER" (FOB)

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
    pull_out_date: Optional[str] = None  # Container pull out date
    si_cutoff: Optional[str] = None  # SI (Shipping Instructions) cutoff
    gate_in_date: Optional[str] = None  # Gate in date at port
    status: Optional[str] = None
    incoterm: Optional[str] = None  # FOB, CFR, CIF, CIP, DDP, EXW, etc.
    incoterm: Optional[str] = None

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
    pull_out_date: Optional[str] = None  # Container pull out date
    si_cutoff: Optional[str] = None  # SI cutoff
    gate_in_date: Optional[str] = None  # Gate in date
    pickup_date: Optional[str] = None  # Auto-calculated: cutoff - 3 days
    status: str = "pending"  # pending, cro_received, transport_scheduled, loaded, shipped
    ref_type: Optional[str] = None  # "PO_IMPORT" for PO imports, None for exports
    po_id: Optional[str] = None  # Single PO ID (for backward compatibility)
    po_number: Optional[str] = None  # Enriched from PO
    supplier_name: Optional[str] = None  # Enriched from PO
    incoterm: Optional[str] = None  # FOB, CFR, CIF, CIP, DDP, EXW, etc.
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
        
        allowed_pages = []
        
        # Priority 1: Check if user has a custom role assigned
        if user.get("role_id"):
            role = await db.roles.find_one({"id": user.get("role_id")}, {"_id": 0, "allowed_pages": 1})
            if role:
                allowed_pages = role.get("allowed_pages", [])
        # Priority 2: Fall back to old standard role system if no custom role
        elif user.get("role") == "admin":
            allowed_pages = ["all"]
        else:
            # For users without custom roles, get from user's allowed_pages field
            allowed_pages = user.get("allowed_pages", [])
        
        user["allowed_pages"] = allowed_pages
        
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

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    token: Optional[str] = Query(None, description="Authentication token (alternative to Authorization header)")
):
    """Get current user from Authorization header or query parameter token (for PDF downloads)"""
    # Try Authorization header first
    if credentials:
        try:
            auth_token = credentials.credentials
            payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
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
    
    # If no Authorization header, try query parameter token
    if token:
        return await get_user_from_token(token)
    
    # If neither is provided, raise 401
    raise HTTPException(status_code=401, detail="Authentication required")

def has_permission(user: dict, required_roles: List[str] = None, required_page: str = None) -> bool:
    """
    Check if user has permission based on custom roles or standard roles.
    
    Args:
        user: Current user dict with role and allowed_pages
        required_roles: List of standard role names (e.g., ['admin', 'security'])
        required_page: Page path to check in custom role permissions (e.g., '/security-qc')
    
    Returns:
        True if user has permission, False otherwise
    """
    # Check custom role permissions first
    allowed_pages = user.get("allowed_pages", [])
    
    # Admin via custom role (has "all" pages)
    if "all" in allowed_pages:
        return True
    
    # Check if specific page is allowed in custom role
    if required_page and required_page in allowed_pages:
        return True
    
    # Fall back to standard role check
    if required_roles and user.get("role") in required_roles:
        return True
    
    return False

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
    # Prefer customer_name from job order if already stored, otherwise get from sales order
    customer_name = job.get("customer_name", "Unknown Customer")
    
    # Get sales order
    so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
    if so:
        # Only use sales order customer_name if job doesn't have it
        if not customer_name or customer_name == "Unknown Customer":
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
        # For EXPORT orders (FOB, CFR, CIF, CIP)
        # Check incoterm first (priority over order_type) since incoterm is more specific
        if incoterm in ["FOB", "CFR", "CIF", "CIP"]:
            # Check if shipping booking already exists for this job
            existing_booking = await db.shipping_bookings.find_one(
                {"job_order_ids": job_id},
                {"_id": 0}
            )
            
            if not existing_booking:
                # For FOB: Customer is responsible for booking shipping
                # Don't auto-create booking - wait for customer to provide CRO details
                if incoterm == "FOB":
                    quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0}) if so else None
                    
                    # Mark job as awaiting customer booking
                    await db.job_orders.update_one(
                        {"id": job_id},
                        {"$set": {
                            "shipping_booking_required": True,
                            "shipping_booking_status": "AWAITING_CUSTOMER"
                        }}
                    )
                    
                    # Create notification - Customer booking required
                    await create_notification(
                        event_type="CUSTOMER_BOOKING_REQUIRED",
                        title=f"📧 Customer Shipping Booking Required: {job.get('job_number')}",
                        message=f"Job {job.get('job_number')} (FOB incoterm) requires customer to book shipping and provide CRO details. Awaiting customer booking information.",
                        link="/shipping",
                        ref_type="JOB",
                        ref_id=job_id,
                        target_roles=["admin", "shipping", "export"],
                        notification_type="info"
                    )
                    return True
                
                # For CFR, CIF, CIP: Seller handles booking (existing behavior)
                else:
                    # CHECK: Don't create duplicate booking if one already exists
                    existing_booking = await db.shipping_bookings.find_one({
                        "job_order_ids": job_id,
                        "status": {"$nin": ["cancelled", "deleted"]}  # Exclude cancelled bookings
                    }, {"_id": 0, "id": 1, "booking_number": 1})
                    
                    if existing_booking:
                        # Booking already exists, just update job order reference if needed
                        await db.job_orders.update_one(
                            {"id": job_id},
                            {"$set": {"shipping_booking_id": existing_booking["id"]}}
                        )
                        # Don't create notification - booking already exists
                        return True  # Don't create duplicate
                    
                    # Only create if no existing booking
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
                    
                    # Create notification - Ship booking required (pop-up priority)
                    await create_notification(
                        event_type="SHIP_BOOKING_REQUIRED",
                        title=f"🚢 Ship Booking Required: {job.get('job_number')}",
                        message=f"URGENT: Job {job.get('job_number')} requires shipping booking for export to {customer_name}. Please create booking immediately.",
                        link="/shipping",
                        ref_type="JOB",
                        ref_id=job_id,
                        target_roles=["admin", "shipping", "export"],
                        notification_type="warning"
                    )
                    return True
        
        # For LOCAL orders (EXW, DDP, DAP) - Mark as ready for transport booking
        # DO NOT auto-create transport record - must be booked through Transport Planner first
        elif order_type == "local" or incoterm in ["EXW", "DDP", "DAP"]:
            # Just mark the job as needing transport booking
            await db.job_orders.update_one(
                {"id": job_id},
                {"$set": {
                    "transport_required": True,
                    "transport_booked": False,
                    "delivery_location": so.get("delivery_address", "") if so else ""
                }}
            )
            
            # Create notification to book transport through Transport Planner
            await create_notification(
                event_type="LOCAL_DISPATCH_READY",
                title=f"Transport Booking Required: {job.get('job_number')}",
                message=f"Job {job.get('job_number')} ready for dispatch to {customer_name}. Please book transport via Transport Planner.",
                link="/transport-planner",
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
    
    # Get user's allowed pages from role if role_id is set
    allowed_pages = user.get("allowed_pages", [])
    if user.get("role_id"):
        role = await db.roles.find_one({"id": user["role_id"]}, {"_id": 0})
        if role:
            allowed_pages = role.get("allowed_pages", [])
    
    # Admin gets all pages
    if user.get("role") == "admin":
        allowed_pages = ["all"]
    
    access_token = create_access_token({"sub": user["id"]})
    user_response = {k: v for k, v in user.items() if k not in ["_id", "password"]}
    user_response["allowed_pages"] = allowed_pages
    
    return Token(access_token=access_token, token_type="bearer", user=user_response)

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# Helper function to check if user has access to a page/endpoint
async def has_page_access(current_user: dict, page_path: str, fallback_roles: List[str] = None) -> bool:
    """
    Check if user has access to a page based on:
    1. Admin role (always has access)
    2. allowed_pages containing "all" or the specific page_path
    3. Fallback to role-based check if fallback_roles provided
    
    Args:
        current_user: The current user dict from get_current_user
        page_path: The page path to check (e.g., "/finance-approval")
        fallback_roles: List of role names that should have access (for backward compatibility)
    
    Returns:
        bool: True if user has access, False otherwise
    """
    # Admin always has access
    if current_user.get("role") == "admin":
        return True
    
    # Check allowed_pages
    allowed_pages = current_user.get("allowed_pages", [])
    
    # If user has "all" in allowed_pages, they have access to everything
    if "all" in allowed_pages:
        return True
    
    # Check if the specific page_path is in allowed_pages
    if page_path in allowed_pages:
        return True
    
    # Fallback to role-based check for backward compatibility
    if fallback_roles and current_user.get("role") in fallback_roles:
        return True
    
    return False

# ==================== ROLE MANAGEMENT ROUTES ====================

@api_router.get("/roles", response_model=List[Role])
async def get_roles(current_user: dict = Depends(get_current_user)):
    """Get all roles"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/roles"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    roles = await db.roles.find({}, {"_id": 0}).to_list(1000)
    return roles

@api_router.post("/roles", response_model=Role)
async def create_role(role_data: RoleCreate, current_user: dict = Depends(get_current_user)):
    """Create a new role"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/roles"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check for duplicate role name
    existing = await db.roles.find_one({"name": {"$regex": f"^{role_data.name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Role with this name already exists")
    
    role = Role(**role_data.model_dump(), created_by=current_user.get("id"))
    await db.roles.insert_one(role.model_dump())
    return role

@api_router.get("/roles/{role_id}", response_model=Role)
async def get_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific role"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/roles"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    role = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role

@api_router.put("/roles/{role_id}", response_model=Role)
async def update_role(role_id: str, role_data: RoleUpdate, current_user: dict = Depends(get_current_user)):
    """Update a role"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/roles"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    role = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Prevent modification of system roles
    if role.get("is_system_role"):
        raise HTTPException(status_code=400, detail="Cannot modify system roles")
    
    # Check for duplicate name if name is being changed
    if role_data.name and role_data.name != role.get("name"):
        existing = await db.roles.find_one({
            "name": {"$regex": f"^{role_data.name}$", "$options": "i"},
            "id": {"$ne": role_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Role with this name already exists")
    
    update_dict = {k: v for k, v in role_data.model_dump().items() if v is not None}
    await db.roles.update_one({"id": role_id}, {"$set": update_dict})
    
    updated_role = await db.roles.find_one({"id": role_id}, {"_id": 0})
    return updated_role

@api_router.delete("/roles/{role_id}")
async def delete_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a role"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/roles"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    role = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Prevent deletion of system roles
    if role.get("is_system_role"):
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
    
    # Check if any users are using this role
    users_with_role = await db.users.count_documents({"role_id": role_id})
    if users_with_role > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role. {users_with_role} user(s) are assigned to this role"
        )
    
    await db.roles.delete_one({"id": role_id})
    return {"message": "Role deleted successfully"}

@api_router.get("/pages/available")
async def get_available_pages(current_user: dict = Depends(get_current_user)):
    """Get list of all available pages in the system"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/roles"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Define all available pages
    pages = [
        {"path": "/dashboard", "label": "Dashboard", "category": "General"},
        {"path": "/quotations", "label": "Commercial Contracts (Quotations)", "category": "Sales"},
        {"path": "/sales-orders", "label": "Contracts (Sales Orders)", "category": "Sales"},
        {"path": "/job-orders", "label": "Order Fulfillment (Job Orders)", "category": "Operations"},
        {"path": "/production-schedule", "label": "Production (Production Window)", "category": "Production"},
        {"path": "/procurement", "label": "Procurement Window", "category": "Procurement"},
        {"path": "/import-window", "label": "Logistics Inwards (Imports)", "category": "Logistics"},
        {"path": "/shipping", "label": "Shipping Window", "category": "Shipping"},
        {"path": "/transport-window", "label": "Transport Window", "category": "Transport"},
        {"path": "/security-qc", "label": "Security & Q.C.", "category": "Security"},
        {"path": "/inventory", "label": "Inventory", "category": "Inventory"},
        {"path": "/grn", "label": "GRN", "category": "Inventory"},
        {"path": "/delivery-orders", "label": "Delivery Orders", "category": "Shipping"},
        {"path": "/security", "label": "Security Gate", "category": "Security"},
        {"path": "/qc-inspection", "label": "QC Inspection", "category": "Quality"},
        {"path": "/documentation", "label": "Documentation", "category": "Compliance"},
        {"path": "/finance-approval", "label": "Finance Approval", "category": "Finance"},
        {"path": "/payables", "label": "Payables (AP)", "category": "Finance"},
        {"path": "/receivables", "label": "Receivables (AR)", "category": "Finance"},
        {"path": "/customers", "label": "Customers", "category": "Sales"},
        {"path": "/products", "label": "Products", "category": "Inventory"},
        {"path": "/bom-management", "label": "BOM Management", "category": "Production"},
        {"path": "/stock-management", "label": "Stock Management", "category": "Inventory"},
        {"path": "/settings", "label": "Settings", "category": "Admin"},
        {"path": "/users", "label": "User Management", "category": "Admin"},
        {"path": "/roles", "label": "Role Management", "category": "Admin"},
    ]
    return pages

# ==================== CUSTOMER ROUTES ====================

@api_router.post("/customers", response_model=Customer)
async def create_customer(data: CustomerCreate, current_user: dict = Depends(get_current_user)):
    # Check for duplicate customer by name, email, or company
    # Name is required, so always check it. Also check email and company if provided.
    query = {"$or": []}
    query["$or"].append({"name": {"$regex": f"^{data.name.strip()}$", "$options": "i"}})
    if data.email and data.email.strip():
        query["$or"].append({"email": {"$regex": f"^{data.email.strip()}$", "$options": "i"}})
    if data.company and data.company.strip():
        query["$or"].append({"company": {"$regex": f"^{data.company.strip()}$", "$options": "i"}})
    
    existing = await db.customers.find_one(query, {"_id": 0})
    if existing:
        # Determine which field is the duplicate
        if existing.get("name", "").strip().lower() == data.name.strip().lower():
            duplicate_field = "name"
        elif data.email and data.email.strip() and existing.get("email", "").strip().lower() == data.email.strip().lower():
            duplicate_field = "email"
        elif data.company and data.company.strip() and existing.get("company", "").strip().lower() == data.company.strip().lower():
            duplicate_field = "company"
        else:
            duplicate_field = "name"  # Default to name
        raise HTTPException(status_code=400, detail=f"Customer with this {duplicate_field} already exists")
    
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

@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, data: CustomerCreate, current_user: dict = Depends(get_current_user)):
    # Check if customer exists
    existing = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Check for duplicate customer by name, email, or company (excluding current customer)
    # Name is required, so always check it. Also check email and company if provided.
    query = {"$or": [], "id": {"$ne": customer_id}}
    query["$or"].append({"name": {"$regex": f"^{data.name.strip()}$", "$options": "i"}})
    if data.email and data.email.strip():
        query["$or"].append({"email": {"$regex": f"^{data.email.strip()}$", "$options": "i"}})
    if data.company and data.company.strip():
        query["$or"].append({"company": {"$regex": f"^{data.company.strip()}$", "$options": "i"}})
    
    duplicate = await db.customers.find_one(query, {"_id": 0})
    if duplicate:
        # Determine which field is the duplicate
        if duplicate.get("name", "").strip().lower() == data.name.strip().lower():
            duplicate_field = "name"
        elif data.email and data.email.strip() and duplicate.get("email", "").strip().lower() == data.email.strip().lower():
            duplicate_field = "email"
        elif data.company and data.company.strip() and duplicate.get("company", "").strip().lower() == data.company.strip().lower():
            duplicate_field = "company"
        else:
            duplicate_field = "name"  # Default to name
        raise HTTPException(status_code=400, detail=f"Customer with this {duplicate_field} already exists")
    
    # Update customer (preserve id and created_at)
    updated_data = data.model_dump()
    updated_data["id"] = customer_id
    updated_data["created_at"] = existing.get("created_at")
    updated_customer = Customer(**updated_data)
    
    await db.customers.update_one({"id": customer_id}, {"$set": updated_customer.model_dump()})
    return updated_customer

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Check if customer is used in quotations, sales orders, or receivables
    quotation_count = await db.quotations.count_documents({"customer_id": customer_id})
    sales_order_count = await db.sales_orders.count_documents({"customer_id": customer_id})
    receivable_count = await db.receivables.count_documents({"customer_id": customer_id})
    
    if quotation_count > 0 or sales_order_count > 0 or receivable_count > 0:
        detail_parts = []
        if quotation_count > 0:
            detail_parts.append(f"{quotation_count} quotation(s)")
        if sales_order_count > 0:
            detail_parts.append(f"{sales_order_count} sales order(s)")
        if receivable_count > 0:
            detail_parts.append(f"{receivable_count} receivable invoice(s)")
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete customer. Customer is referenced in {', '.join(detail_parts)}."
        )
    
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {"message": "Customer deleted successfully"}

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
    if not has_permission(current_user, required_roles=["admin"], required_page="/products"):
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
        
        # Calculate total based on U.O.M (Unit of Measure)
        uom = item.uom or "per_mt"  # Default to per_mt for backward compatibility
        
        # If U.O.M is not set, infer from packaging (only if not explicitly set)
        if not item.uom:
            packaging = str(item.packaging or "").lower()
            packaging_type = str(getattr(item, 'packaging_type', None) or "").lower()
            
            if any(keyword in packaging for keyword in ["drum", "carton", "pail", "ibc", "bag", "box"]):
                uom = "per_unit"
            elif any(keyword in packaging_type for keyword in ["drum", "carton", "pail", "ibc"]):
                uom = "per_unit"
            elif any(keyword in packaging for keyword in ["flexi", "iso", "tank"]):
                uom = "per_liter"
            elif packaging == "bulk" or packaging_type == "bulk":
                uom = "per_mt"
        
        if uom == "per_unit":
            # For cartons, pails, drums, IBC: quantity × unit_price
            item_total = item.quantity * item.unit_price
            # Calculate weight for container capacity checking
            if item.net_weight_kg:
                weight_mt = (item.net_weight_kg * item.quantity) / 1000
            else:
                weight_mt = 0
        elif uom == "per_liter":
            # For liquid products: quantity (liters) × unit_price
            item_total = item.quantity * item.unit_price
            # Approximate weight (1 liter ≈ 1 kg for most liquids)
            weight_mt = item.quantity / 1000
        else:  # per_mt (for pricing per metric ton)
            # Calculate weight from quantity of units and net weight
            if item.net_weight_kg:
                # For packaged products: calculate weight from quantity × net_weight_kg
                weight_mt = (item.net_weight_kg * item.quantity) / 1000
            else:
                # For bulk (no net weight): assume quantity is in MT
                weight_mt = item.quantity
            # IMPORTANT: Total is always weight_mt × unit_price when UOM is per_mt
            item_total = weight_mt * item.unit_price
        
        item_dict["weight_mt"] = weight_mt
        item_dict["total"] = item_total
        items_with_total.append(item_dict)
        subtotal += item_total
    
    # Calculate total weight in MT (sum of all item weights)
    total_weight_mt = sum(item.get("weight_mt", 0) for item in items_with_total)
    
    # Calculate VAT if applicable
    vat_amount = 0
    vat_rate = 0
    if data.order_type == "local" and data.include_vat:
        vat_rate = data.vat_rate if data.vat_rate > 0 else 0.05  # Default 5% VAT
        vat_amount = subtotal * vat_rate
    
    grand_total = subtotal + vat_amount
    
    # Auto-set transport_mode based on order_type
    quotation_data = data.model_dump(exclude={"items", "vat_amount", "vat_rate", "subtotal", "total", "total_weight_mt"})
    if not quotation_data.get("transport_mode"):
        if data.order_type == "export":
            quotation_data["transport_mode"] = "SEA"
        elif data.order_type == "local":
            quotation_data["transport_mode"] = "ROAD"
    
    # Auto-populate country_of_destination if not provided
    if not quotation_data.get("country_of_destination"):
        customer = None
        if data.customer_id:
            customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
        
        country_of_destination = get_country_of_destination(quotation_data, customer)
        if country_of_destination:
            quotation_data["country_of_destination"] = country_of_destination
    
    quotation = Quotation(
        **quotation_data,
        items=items_with_total,
        pfi_number=pfi_number,
        subtotal=subtotal,
        vat_amount=vat_amount,
        total_weight_mt=total_weight_mt,
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
    
    # Enrich quotations with country_of_destination if missing
    enriched_quotations = []
    for quotation in quotations:
        if not quotation.get("country_of_destination"):
            customer = None
            if quotation.get("customer_id"):
                customer = await db.customers.find_one({"id": quotation.get("customer_id")}, {"_id": 0})
            
            country_of_destination = get_country_of_destination(quotation, customer)
            if country_of_destination:
                # Update the quotation in database
                await db.quotations.update_one(
                    {"id": quotation.get("id")},
                    {"$set": {"country_of_destination": country_of_destination}}
                )
                quotation["country_of_destination"] = country_of_destination
        
        enriched_quotations.append(quotation)
    
    return enriched_quotations

@api_router.get("/quotations/pending-finance-approval")
async def get_quotations_pending_finance_approval(current_user: dict = Depends(get_current_user)):
    """Get all quotations pending finance approval"""
    if not await has_page_access(current_user, "/finance-approval", fallback_roles=["finance"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    quotations = await db.quotations.find({
        "status": {"$in": ["pending", "approved"]},
        "$or": [
            {"finance_approved": {"$exists": False}},
            {"finance_approved": False}
        ]
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Return quotations without enrichment to avoid N+1 queries
    return quotations

@api_router.get("/quotations/{quotation_id}", response_model=Quotation)
async def get_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Enrich with customer data
    customer_id = quotation.get("customer_id")
    if customer_id:
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if customer:
            quotation["customer_name"] = customer.get("name", quotation.get("customer_name", ""))
            quotation["customer_address"] = customer.get("address", "")
            quotation["customer_city"] = customer.get("city", "")
            quotation["customer_country"] = customer.get("country", "")
            quotation["customer_phone"] = customer.get("phone", "")
            quotation["customer_email"] = customer.get("email", "")
    
    # Auto-set transport_mode if not present
    if not quotation.get("transport_mode"):
        order_type = quotation.get("order_type", "").lower()
        if order_type == "export":
            quotation["transport_mode"] = "SEA"
        elif order_type == "local":
            quotation["transport_mode"] = "ROAD"
    
    return quotation

@api_router.put("/quotations/{quotation_id}")
async def update_quotation(quotation_id: str, data: QuotationCreate, current_user: dict = Depends(get_current_user)):
    """Update an existing quotation"""
    # Check if user has access to quotations page
    if not await has_page_access(current_user, "/quotations", fallback_roles=["admin", "finance", "sales"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get existing quotation
    existing_quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not existing_quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Only allow editing if status is pending or rejected
    if existing_quotation.get("status") not in ["pending", "rejected"]:
        raise HTTPException(status_code=400, detail="Can only edit pending or rejected quotations")
    
    # Calculate totals
    items_with_total = []
    subtotal = 0
    
    for item in data.items:
        item_dict = item.model_dump()
        
        # Calculate total based on U.O.M (Unit of Measure)
        uom = item.uom or "per_mt"  # Default to per_mt for backward compatibility
        
        # If U.O.M is not set, infer from packaging (only if not explicitly set)
        if not item.uom:
            packaging = str(item.packaging or "").lower()
            packaging_type = str(getattr(item, 'packaging_type', None) or "").lower()
            
            if any(keyword in packaging for keyword in ["drum", "carton", "pail", "ibc", "bag", "box"]):
                uom = "per_unit"
            elif any(keyword in packaging_type for keyword in ["drum", "carton", "pail", "ibc"]):
                uom = "per_unit"
            elif any(keyword in packaging for keyword in ["flexi", "iso", "tank"]):
                uom = "per_liter"
            elif packaging == "bulk" or packaging_type == "bulk":
                uom = "per_mt"
        
        if uom == "per_unit":
            # For cartons, pails, drums, IBC: quantity × unit_price
            item_total = item.quantity * item.unit_price
            # Calculate weight for container capacity checking
            if item.net_weight_kg:
                weight_mt = (item.net_weight_kg * item.quantity) / 1000
            else:
                weight_mt = 0
        elif uom == "per_liter":
            # For liquid products: quantity (liters) × unit_price
            item_total = item.quantity * item.unit_price
            # Approximate weight (1 liter ≈ 1 kg for most liquids)
            weight_mt = item.quantity / 1000
        else:  # per_mt (for pricing per metric ton)
            # Calculate weight from quantity of units and net weight
            if item.net_weight_kg:
                # For packaged products: calculate weight from quantity × net_weight_kg
                weight_mt = (item.net_weight_kg * item.quantity) / 1000
            else:
                # For bulk (no net weight): assume quantity is in MT
                weight_mt = item.quantity
            # IMPORTANT: Total is always weight_mt × unit_price when UOM is per_mt
            item_total = weight_mt * item.unit_price
        
        item_dict["weight_mt"] = weight_mt
        item_dict["total"] = item_total
        item_dict["uom"] = uom  # Ensure U.O.M is stored in item
        items_with_total.append(item_dict)
        subtotal += item_total
    
    # Calculate total_weight_mt from all items
    total_weight_mt = sum(item.get("weight_mt", 0) for item in items_with_total)
    
    # Calculate VAT if applicable
    vat_amount = 0
    vat_rate = 0
    if data.order_type == "local" and data.include_vat:
        vat_rate = data.vat_rate if data.vat_rate > 0 else 0.05
        vat_amount = subtotal * vat_rate
    
    grand_total = subtotal + vat_amount
    
    # If this is a rejected quotation being edited, generate REV number
    update_data = data.model_dump(exclude={"items", "vat_amount", "vat_rate", "subtotal", "total", "total_weight_mt"})
    
    # Auto-set transport_mode based on order_type if not provided
    if not update_data.get("transport_mode"):
        if data.order_type == "export":
            update_data["transport_mode"] = "SEA"
        elif data.order_type == "local":
            update_data["transport_mode"] = "ROAD"
    
    # Auto-populate country_of_destination if not provided
    if not update_data.get("country_of_destination"):
        customer = None
        if data.customer_id:
            customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
        
        country_of_destination = get_country_of_destination(update_data, customer)
        if country_of_destination:
            update_data["country_of_destination"] = country_of_destination
    
    update_data["items"] = items_with_total
    update_data["subtotal"] = subtotal
    update_data["vat_amount"] = vat_amount
    update_data["vat_rate"] = vat_rate
    update_data["total"] = grand_total
    update_data["total_weight_mt"] = total_weight_mt
    
    # Generate REV number if editing a rejected quotation
    if existing_quotation.get("status") == "rejected":
        # Get the highest revision number for this quotation or its original
        original_id = existing_quotation.get("original_quotation_id") or quotation_id
        revisions = await db.quotations.find(
            {"$or": [{"id": original_id}, {"original_quotation_id": original_id}]},
            {"_id": 0, "revision_number": 1}
        ).to_list(1000)
        
        max_revision = 0
        for rev in revisions:
            rev_num = rev.get("revision_number", 0)
            if rev_num and rev_num > max_revision:
                max_revision = rev_num
        
        new_revision = max_revision + 1
        update_data["revision_number"] = new_revision
        update_data["original_quotation_id"] = original_id
        update_data["pfi_number"] = f"REV-{str(new_revision).zfill(3)}"
        update_data["status"] = "pending"
        update_data["rejection_reason"] = None
        update_data["rejected_by"] = None
        update_data["rejected_at"] = None
    
    result = await db.quotations.update_one(
        {"id": quotation_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    updated_quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    return updated_quotation

@api_router.put("/quotations/{quotation_id}/approve")
async def approve_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    if not await has_page_access(current_user, "/finance-approval", fallback_roles=["finance"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get quotation first to check costing
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # COSTING VALIDATION: Check if costing is confirmed
    if not quotation.get("cost_confirmed", False):
        raise HTTPException(
            status_code=400,
            detail="Costing must be confirmed before approval. Please click 'Check Cost' and confirm the costing."
        )
    
    # COSTING VALIDATION: Check margin
    costing = await db.costing_calculations.find_one({
        "reference_id": quotation_id,
        "reference_type": "QUOTATION"
    }, {"_id": 0})
    
    if costing:
        margin_amount = costing.get("margin_amount", 0)
        if margin_amount < 0:
            # Auto-reject with negative margin
            await db.quotations.update_one(
                {"id": quotation_id},
                {"$set": {
                    "status": "rejected",
                    "costing_rejection_reason": f"Negative margin: {margin_amount:.2f}. Approval blocked by system.",
                    "rejected_by": "system",
                    "rejected_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            raise HTTPException(
                status_code=400,
                detail=f"Approval blocked: Negative margin of {margin_amount:.2f}. Quotation has been automatically rejected."
            )
    
    # Proceed with approval
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
    
    # Get quotation details (refresh after update)
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if quotation:
        # Send email notification and create in-app notification
        asyncio.create_task(notify_quotation_approved(quotation))
        
        # Create notification using helper function
        await create_notification(
            event_type="QUOTATION_APPROVED",
            title="Quotation Approved",
            message=f"Quotation {quotation.get('pfi_number')} for {quotation.get('customer_name')} has been approved",
            link="/quotations",
            ref_type="QUOTATION",
            ref_id=quotation_id,
            target_roles=["admin", "sales", "production"],
            notification_type="success"
        )
        
        # PHASE 1: Check material availability and create shortages
        material_check = await check_material_availability_for_quotation(quotation)
        
        if material_check["has_shortages"]:
            # Create notification for procurement about shortages
            await create_notification(
                event_type="PRODUCTION_BLOCKED",
                title="Material Shortage Detected",
                message=f"Quotation {quotation.get('pfi_number')} approved but {len(material_check['shortages'])} materials need procurement",
                link="/procurement",
                ref_type="QUOTATION",
                ref_id=quotation_id,
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
        # Use weight_mt from quotation item (correct value in MT) instead of quantity (number of units)
        weight_mt = item.get("weight_mt", 0)
        quantity = item.get("quantity", 0)
        packaging = item.get("packaging", "Bulk")
        # Preserve net_weight_kg from quotation - only default to 200 if not provided and not Bulk
        net_weight_kg = item.get("net_weight_kg")
        if net_weight_kg is None and packaging != "Bulk":
            net_weight_kg = 200  # Default only when needed
        
        # Calculate total KG needed - prioritize weight_mt (correct value)
        if weight_mt > 0:
            # Use weight_mt from quotation item (e.g., 14.8 MT = 14,800 KG)
            total_kg = weight_mt * 1000
        elif packaging != "Bulk":
            # Fallback: calculate from quantity and net_weight_kg if weight_mt not available
            total_kg = quantity * (net_weight_kg or 200)
        else:
            # Fallback: assume quantity is in MT for bulk
            total_kg = quantity * 1000
        
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
    rejection_reason: str = Query(..., description="Rejection reason is required"),
    current_user: dict = Depends(get_current_user)
):
    if not await has_page_access(current_user, "/finance-approval", fallback_roles=["finance"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not rejection_reason or not rejection_reason.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    
    # Get quotation to find creator
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    update_data = {
        "status": "rejected",
        "rejected_by": current_user["id"],
        "rejected_at": datetime.now(timezone.utc).isoformat(),
        "rejection_reason": rejection_reason.strip()
    }
    
    result = await db.quotations.update_one(
        {"id": quotation_id, "status": "pending"},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quotation not found or already processed")
    
    # Create notification for PFI creator
    creator_id = quotation.get("created_by")
    if creator_id:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "title": f"Quotation {quotation.get('pfi_number', '')} Rejected",
            "message": f"Your quotation has been rejected. Reason: {rejection_reason.strip()}",
            "type": "warning",
            "link": "/quotations",
            "event_type": "QUOTATION_REJECTED",
            "ref_type": "QUOTATION",
            "ref_id": quotation_id,
            "user_id": creator_id,  # User-specific notification
            "is_read": False,
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    return {"message": "Quotation rejected", "rejection_reason": rejection_reason.strip()}

@api_router.put("/quotations/{quotation_id}/revise")
async def revise_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    """Create a new quotation based on a rejected one with REV-xxx numbering"""
    if not await has_page_access(current_user, "/quotations", fallback_roles=["admin", "finance", "sales"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get the rejected quotation
    quotation = await db.quotations.find_one({"id": quotation_id, "status": "rejected"}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Rejected quotation not found")
    
    # Get the highest revision number for this quotation or its original
    original_id = quotation.get("original_quotation_id") or quotation_id
    revisions = await db.quotations.find(
        {"$or": [{"id": original_id}, {"original_quotation_id": original_id}]},
        {"_id": 0, "revision_number": 1}
    ).to_list(1000)
    
    max_revision = 0
    for rev in revisions:
        rev_num = rev.get("revision_number", 0)
        if rev_num and rev_num > max_revision:
            max_revision = rev_num
    
    new_revision = max_revision + 1
    pfi_number = f"REV-{str(new_revision).zfill(3)}"
    
    # Create new quotation with same data but new ID and REV number
    new_quotation = Quotation(
        **{k: v for k, v in quotation.items() if k not in ["id", "pfi_number", "revision_number", "original_quotation_id", "status", "approved_by", "approved_at", "rejection_reason", "rejected_by", "rejected_at", "created_at"]},
        pfi_number=pfi_number,
        revision_number=new_revision,
        original_quotation_id=original_id,
        created_by=current_user["id"]
    )
    
    await db.quotations.insert_one(new_quotation.model_dump())
    return new_quotation

@api_router.put("/quotations/{quotation_id}/edit")
async def edit_rejected_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    """Allow editing a rejected quotation by changing status back to pending with REV-xxx numbering"""
    if not await has_page_access(current_user, "/quotations", fallback_roles=["admin", "finance", "sales"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    quotation = await db.quotations.find_one({"id": quotation_id, "status": "rejected"}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Rejected quotation not found")
    
    # Get the highest revision number for this quotation or its original
    original_id = quotation.get("original_quotation_id") or quotation_id
    revisions = await db.quotations.find(
        {"$or": [{"id": original_id}, {"original_quotation_id": original_id}]},
        {"_id": 0, "revision_number": 1}
    ).to_list(1000)
    
    max_revision = 0
    for rev in revisions:
        rev_num = rev.get("revision_number", 0)
        if rev_num and rev_num > max_revision:
            max_revision = rev_num
    
    new_revision = max_revision + 1
    pfi_number = f"REV-{str(new_revision).zfill(3)}"
    
    result = await db.quotations.update_one(
        {"id": quotation_id, "status": "rejected"},
        {"$set": {
            "status": "pending",
            "pfi_number": pfi_number,
            "revision_number": new_revision,
            "original_quotation_id": original_id,
            "rejection_reason": None,
            "rejected_by": None,
            "rejected_at": None
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rejected quotation not found")
    
    updated_quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    return updated_quotation

@api_router.put("/quotations/{quotation_id}/finance-approve")
async def finance_approve_quotation(quotation_id: str, current_user: dict = Depends(get_current_user)):
    """Finance approves a quotation - enables stamp and signature on PDF and marks as Proforma Invoice"""
    if not await has_page_access(current_user, "/finance-approval", fallback_roles=["finance"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    result = await db.quotations.update_one(
        {"id": quotation_id},
        {"$set": {
            "finance_approved": True,
            "finance_approved_by": current_user["id"],
            "finance_approved_at": datetime.now(timezone.utc).isoformat(),
            "status": "approved"
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Create notification
    await create_notification(
        event_type="QUOTATION_FINANCE_APPROVED",
        title="Proforma Invoice Approved",
        message=f"PFI {quotation.get('pfi_number')} for {quotation.get('customer_name')} has been approved by finance",
        link="/quotations",
        ref_type="QUOTATION",
        ref_id=quotation_id,
        target_roles=["admin", "sales"],
        notification_type="success"
    )
    
    return {"success": True, "message": "Quotation approved by finance - stamp and signature will appear on PDF"}

# ==================== SALES ORDER ROUTES ====================

@api_router.post("/sales-orders", response_model=SalesOrder)
async def create_sales_order(data: SalesOrderCreate, current_user: dict = Depends(get_current_user)):
    quotation = await db.quotations.find_one({"id": data.quotation_id, "status": "approved"}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=400, detail="Quotation not found or not approved")
    
    # Get customer for country extraction
    customer = None
    if quotation.get("customer_id"):
        customer = await db.customers.find_one({"id": quotation.get("customer_id")}, {"_id": 0})
    
    # Get country of destination from quotation
    country_of_destination = get_country_of_destination(quotation, customer)
    
    spa_number = await generate_sequence("SPA", "sales_orders")
    
    # Use quotation's expected_delivery_date if not provided in sales order
    expected_delivery_date = data.expected_delivery_date or quotation.get("expected_delivery_date")
    
    sales_order = SalesOrder(
        quotation_id=data.quotation_id,
        spa_number=spa_number,
        customer_id=quotation["customer_id"],
        customer_name=quotation["customer_name"],
        items=quotation["items"],
        currency=quotation["currency"],
        total=quotation["total"],
        total_weight_mt=quotation.get("total_weight_mt", 0.0),
        balance=quotation["total"],
        expected_delivery_date=expected_delivery_date,
        notes=data.notes,
        country_of_destination=country_of_destination
    )
    
    await db.sales_orders.insert_one(sales_order.model_dump())
    await db.quotations.update_one({"id": data.quotation_id}, {"$set": {"status": "converted"}})
    
    # Create notification for production/job order team
    await create_notification(
        event_type="SALES_ORDER_CREATED",
        title="New Sales Order Created",
        message=f"Sales Order {spa_number} for {quotation.get('customer_name')} has been created. Job order required.",
        link="/sales-orders",
        ref_type="SALES_ORDER",
        ref_id=sales_order.id,
        target_roles=["admin", "production", "sales"],
        notification_type="info"
    )
    
    return sales_order

@api_router.get("/sales-orders", response_model=List[SalesOrder])
async def get_sales_orders(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    orders = await db.sales_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with country_of_destination from quotation
    enriched_orders = []
    for order in orders:
        if not order.get("country_of_destination") and order.get("quotation_id"):
            quotation = await db.quotations.find_one({"id": order.get("quotation_id")}, {"_id": 0})
            customer = None
            if quotation and quotation.get("customer_id"):
                customer = await db.customers.find_one({"id": quotation.get("customer_id")}, {"_id": 0})
            country_of_destination = get_country_of_destination(quotation, customer)
            if country_of_destination:
                # Update the sales order in database
                await db.sales_orders.update_one(
                    {"id": order.get("id")},
                    {"$set": {"country_of_destination": country_of_destination}}
                )
                order["country_of_destination"] = country_of_destination
        enriched_orders.append(order)
    
    return enriched_orders

@api_router.get("/sales-orders/{order_id}", response_model=SalesOrder)
async def get_sales_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.sales_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    
    # Enrich with country_of_destination from quotation if missing
    if not order.get("country_of_destination") and order.get("quotation_id"):
        quotation = await db.quotations.find_one({"id": order.get("quotation_id")}, {"_id": 0})
        customer = None
        if quotation and quotation.get("customer_id"):
            customer = await db.customers.find_one({"id": quotation.get("customer_id")}, {"_id": 0})
        country_of_destination = get_country_of_destination(quotation, customer)
        if country_of_destination:
            # Update the sales order in database
            await db.sales_orders.update_one(
                {"id": order_id},
                {"$set": {"country_of_destination": country_of_destination}}
            )
            order["country_of_destination"] = country_of_destination
    
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

async def find_or_create_packaging_item(packaging_string: str) -> Optional[str]:
    """
    Find or create a packaging inventory item based on packaging string from quotation.
    Maps quotation packaging strings (e.g., "200L Drum", "210L Drum", "IBC 1000L") to inventory_items.
    Returns the inventory_item id if found or created, None otherwise.
    """
    if not packaging_string or packaging_string == "Bulk":
        return None
    
    packaging_lower = packaging_string.lower()
    
    # Mapping of packaging strings to inventory item names/SKUs
    packaging_mappings = {
        # Drums
        "200l drum": ("New Drums - 8 mm", "PACK-DRUM-200L-8MM"),
        "200l": ("New Drums - 8 mm", "PACK-DRUM-200L-8MM"),
        "210l drum": ("HDPE Drums 210ltrs", "PACK-DRUM-210L-HDPE"),
        "210l": ("HDPE Drums 210ltrs", "PACK-DRUM-210L-HDPE"),
        "250l drum": ("HDPE Drums 250 litre", "PACK-DRUM-250L-HDPE"),
        "250l": ("HDPE Drums 250 litre", "PACK-DRUM-250L-HDPE"),
        "recon drum": ("Recon Drums", "PACK-DRUM-RECON"),
        "reconditioned drum": ("Recon Drums", "PACK-DRUM-RECON"),
        # IBCs - CHECK RECON FIRST before generic patterns
        "ibc 1000l recon": ("IBCS Recon", "PACK-IBC-1000L-RECON"),
        "ibc recon": ("IBCS Recon", "PACK-IBC-1000L-RECON"),
        "ibcs recon": ("IBCS Recon", "PACK-IBC-1000L-RECON"),
        "reconditioned ibc": ("IBCS Recon", "PACK-IBC-1000L-RECON"),
        "ibc 1000l": ("IBCS New", "PACK-IBC-1000L-NEW"),
        "ibc": ("IBCS New", "PACK-IBC-1000L-NEW"),
        "ibcs new": ("IBCS New", "PACK-IBC-1000L-NEW"),
        # Flexi bags
        "flexi bag": ("Flexi Bags", "PACK-FLEXI-BAG"),
        "flexitank": ("Flexi Bags", "PACK-FLEXI-BAG"),
        "flexi": ("Flexi Bags", "PACK-FLEXI-BAG"),
        # Lubricant packaging
        "1 litre": ("Lubricant packaging 1 litre", "PACK-LUBE-1L"),
        "4 litre": ("Lubricant packaging 4 litre", "PACK-LUBE-4L"),
        "5 litre": ("Lubricant packaging 5 litre", "PACK-LUBE-5L"),
        "20 litre": ("Lubricant packaging 20 litre", "PACK-LUBE-20L"),
        #pallets
        "pallets": ("pallets","PACK-PALLET")
    }
    
    # Try to find matching packaging item
    matched_name = None
    matched_sku = None
    
    for key, (name, sku) in packaging_mappings.items():
        if key in packaging_lower:
            matched_name = name
            matched_sku = sku
            break
    
    # If no match found, try to find by name similarity
    if not matched_name:
        # Try to find existing inventory item with similar name
        all_pack_items = await db.inventory_items.find(
            {"item_type": "PACK", "is_active": True},
            {"_id": 0}
        ).to_list(1000)
        
        for pack_item in all_pack_items:
            item_name_lower = pack_item.get("name", "").lower()
            if packaging_lower in item_name_lower or item_name_lower in packaging_lower:
                return pack_item.get("id")
        
        # If still no match, create a generic packaging item
        matched_name = packaging_string
        matched_sku = f"PACK-{packaging_string.upper().replace(' ', '-')}"
    
    # Try to find existing inventory item by name or SKU
    existing_item = await db.inventory_items.find_one(
        {
            "$or": [
                {"name": matched_name, "item_type": "PACK"},
                {"sku": matched_sku, "item_type": "PACK"}
            ],
            "is_active": True
        },
        {"_id": 0}
    )
    
    if existing_item:
        return existing_item.get("id")
    
    # Create new packaging inventory item if not found
    new_packaging_item = {
        "id": str(uuid.uuid4()),
        "sku": matched_sku,
        "name": matched_name,
        "item_type": "PACK",
        "uom": "EA",  # Default unit of measure for packaging
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.inventory_items.insert_one(new_packaging_item)
    
    # Initialize inventory balance for new packaging item
    await db.inventory_balances.insert_one({
        "item_id": new_packaging_item["id"],
        "on_hand": 0,
        "reserved": 0,
        "available": 0,
        "last_updated": datetime.now(timezone.utc).isoformat()
    })
    
    return new_packaging_item["id"]

@api_router.post("/job-orders", response_model=JobOrder)
async def create_job_order(data: JobOrderCreate, current_user: dict = Depends(get_current_user)):
    order = await db.sales_orders.find_one({"id": data.sales_order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    
    # Get customer_name from sales order (which comes from quotation)
    customer_name = order.get("customer_name", "")
    
    # Get incoterm from quotation for routing
    incoterm = None
    quotation = await db.quotations.find_one({"id": order.get("quotation_id")}, {"_id": 0})
    customer = None
    if quotation:
        incoterm = quotation.get("incoterm", "").upper()
        # Ensure customer_name is set from quotation if not in sales order
        if not customer_name:
            customer_name = quotation.get("customer_name", "")
        # Get customer for country extraction
        if quotation.get("customer_id"):
            customer = await db.customers.find_one({"id": quotation.get("customer_id")}, {"_id": 0})
    
    # Get country of destination from quotation (port of discharge or explicit field)
    country_of_destination = get_country_of_destination(quotation, customer)
    
    # Get total_weight_mt from quotation or sales order
    total_weight_mt = 0.0
    if quotation:
        total_weight_mt = quotation.get("total_weight_mt", 0.0)
    elif order.get("total_weight_mt"):
        total_weight_mt = order.get("total_weight_mt", 0.0)
    
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
            product_type = finished_product.get("type", "MANUFACTURED") if finished_product else "MANUFACTURED"
            
            item_procurement_reasons = []
            item_material_shortages = []
            item_needs_procurement = False
            item_status = "pending"  # Default status
            bom_with_stock = []
            
            # Get packaging info for ALL products (TRADED and MANUFACTURED)
            item_packaging = item.packaging or "Bulk"
            
            # Get U.O.M from item or infer from packaging (only if not explicitly set)
            uom = item.uom if hasattr(item, 'uom') else None
            if not uom:
                packaging_lower = item_packaging.lower()
                if any(keyword in packaging_lower for keyword in ["drum", "carton", "pail", "ibc", "bag", "box"]):
                    uom = "per_unit"
                elif any(keyword in packaging_lower for keyword in ["flexi", "iso", "tank"]):
                    uom = "per_liter"
                elif packaging_lower == "bulk":
                    uom = "per_mt"
                else:
                    uom = "per_mt"  # Default
            
            # Calculate finished_kg based on UOM and available data
            if uom == "per_unit":
                # For cartons, drums, pails: quantity is number of units
                net_weight = item.net_weight_kg if item.net_weight_kg is not None else 200
                finished_kg = item.quantity * net_weight
            elif uom == "per_liter":
                # For liters: 1 liter ≈ 1 kg
                finished_kg = item.quantity
            else:  # per_mt
                # For bulk: quantity is in MT, convert to KG
                finished_kg = item.quantity * 1000
            
            # Handle trading products differently - skip BOM checks
            if product_type == "TRADED":
                # For trading products: only check finished product availability
                if finished_product_stock >= item.quantity:
                    item_status = "ready_for_dispatch"  # Auto go to dispatch if available
                    item_needs_procurement = False
                else:
                    # Need to procure the finished product itself
                    item_status = "procurement"  # Changed: trading products go to procurement if material not available
                    item_needs_procurement = True
                    shortage = item.quantity - finished_product_stock
                    item_procurement_reasons.append(
                        f"Trading product stock ({finished_product_stock}) < required ({item.quantity})"
                    )
                    item_material_shortages.append({
                        "item_id": item.product_id,  # The finished product itself
                        "item_name": finished_product.get("name", "Unknown") if finished_product else "Unknown",
                        "item_sku": finished_product.get("sku", "-") if finished_product else "-",
                        "required_qty": item.quantity,
                        "available": finished_product_stock,
                        "shortage": shortage,
                        "status": "SHORTAGE",
                        "uom": finished_product.get("unit", "KG") if finished_product else "KG",
                        "item_type": "TRADED"  # Mark as trading product
                    })
            else:
                # Manufacturing products: check finished product and BOM
                # Manufacturing products should automatically go to procurement if materials not available
                # Then after procurement, go to production or dispatch
                item_status = "procurement"  # Default for manufacturing - will be updated if materials available
                if finished_product_stock >= item.quantity:
                    # Finished product available - check raw materials
                    # If raw materials are available, can go to ready_for_dispatch
                    # If raw materials are not available, need procurement first
                    item_status = "ready_for_dispatch"  # Will be changed to procurement if raw materials insufficient
                else:
                    # Finished product not available - need to produce it
                    # Check if raw materials are available for production
                    # If raw materials available, will go to in_production after procurement
                    # If raw materials not available, will go to procurement first
                    item_status = "procurement"  # Manufacturing products go to procurement if materials not available
                    item_procurement_reasons.append(f"Stock ({finished_product_stock}) < required ({item.quantity})")
                    item_needs_procurement = True
                
                # Check BOM for raw materials (ALWAYS check, even if finished product is available)
                product_bom = await db.product_boms.find_one({
                    "product_id": item.product_id,
                    "is_active": True
                }, {"_id": 0})
                
                if product_bom:
                    bom_items = await db.product_bom_items.find({
                        "bom_id": product_bom["id"]
                    }, {"_id": 0}).to_list(100)
                    
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
                                # For manufacturing products, if raw materials insufficient, set status to procurement
                                if product_type != "TRADED":
                                    item_status = "procurement"  # Manufacturing products go to procurement
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
            
            # ========== PACKAGING AVAILABILITY CHECK (FOR ALL PRODUCTS - TRADED AND MANUFACTURED) ==========
            # Extract packaging material from quotation and create packaging shortage if needed
            if item_packaging and item_packaging != "Bulk" and finished_kg > 0:
                packaging_check_failed = False
                packaging_error_reason = None
                
                # Map packaging string to packaging inventory item
                try:
                    packaging_item_id = await find_or_create_packaging_item(item_packaging)
                    
                    if not packaging_item_id:
                        packaging_check_failed = True
                        packaging_error_reason = f"Could not map packaging '{item_packaging}' to inventory item"
                        logger.error(f"⚠️ PACKAGING CHECK FAILED for job {job_number}: {packaging_error_reason}")
                        
                except Exception as e:
                    packaging_check_failed = True
                    packaging_error_reason = f"Error finding/creating packaging item: {str(e)}"
                    logger.error(f"⚠️ PACKAGING CHECK FAILED for job {job_number}: {packaging_error_reason}")
                    packaging_item_id = None
                
                # If packaging check failed, FORCE job to procurement
                if packaging_check_failed:
                    item_material_shortages.append({
                        "item_id": "UNKNOWN_PACKAGING",
                        "item_name": f"⚠️ {item_packaging} (CHECK FAILED)",
                        "item_sku": "-",
                        "required_qty": 0,
                        "available": 0,
                        "shortage": 999999,  # Large number to indicate critical issue
                        "status": "ERROR",
                        "uom": "EA",
                        "item_type": "PACK",
                        "error": packaging_error_reason
                    })
                    item_needs_procurement = True
                    item_status = "procurement"
                    item_procurement_reasons.append(
                        f"⚠️ PACKAGING CHECK FAILED: {packaging_error_reason}"
                    )
                    
                elif packaging_item_id:
                    # Calculate required packaging quantity
                    packaging_qty = 0
                    packaging_lower = item_packaging.lower()
                    
                    if "drum" in packaging_lower:
                        # Use net_weight_kg from item instead of hardcoded calculation
                        net_weight_per_drum = item.net_weight_kg if item.net_weight_kg is not None else 200
                        packaging_qty = max(1, ceil(finished_kg / net_weight_per_drum))
                    elif "ibc" in packaging_lower:
                        net_weight_per_ibc = 1000 * 0.85
                        packaging_qty = max(1, ceil(finished_kg / net_weight_per_ibc))
                    elif "flexi" in packaging_lower or "flexitank" in packaging_lower:
                        packaging_qty = 1
                    else:
                        net_weight = item.net_weight_kg if item.net_weight_kg else 200
                        packaging_qty = max(1, ceil(finished_kg / net_weight))
                    
                    # Check packaging availability
                    packaging_balance = await db.inventory_balances.find_one({"item_id": packaging_item_id}, {"_id": 0})
                    packaging_on_hand = packaging_balance.get("on_hand", 0) if packaging_balance else 0
                    packaging_reservations = await db.inventory_reservations.find({"item_id": packaging_item_id}, {"_id": 0}).to_list(1000)
                    packaging_reserved = sum(r.get("qty", 0) for r in packaging_reservations)
                    packaging_available = packaging_on_hand - packaging_reserved
                    packaging_shortage = max(0, packaging_qty - packaging_available)
                    
                    # ALWAYS add packaging info (even if no shortage) for tracking
                    packaging_item = await db.inventory_items.find_one({"id": packaging_item_id}, {"_id": 0})
                    if packaging_item:
                        packaging_info = {
                            "item_id": packaging_item_id,
                            "item_name": packaging_item.get("name", item_packaging),
                            "item_sku": packaging_item.get("sku", "-"),
                            "required_qty": packaging_qty,
                            "available": packaging_available,
                            "shortage": packaging_shortage,
                            "status": "SHORTAGE" if packaging_shortage > 0 else "AVAILABLE",
                            "uom": packaging_item.get("uom", "EA"),
                            "item_type": "PACK"
                        }
                        
                        # Always add to material_shortages for visibility
                        item_material_shortages.append(packaging_info)
                        
                        # If there's a shortage, mark for procurement
                        if packaging_shortage > 0:
                            item_needs_procurement = True
                            item_status = "procurement"
                            item_procurement_reasons.append(
                                f"Packaging ({item_packaging}): "
                                f"available ({packaging_available}) < required ({packaging_qty})"
                            )
                            logger.warning(f"📦 Packaging shortage for {job_number}: {item_packaging} - need {packaging_qty}, have {packaging_available}")
                        else:
                            logger.info(f"📦 Packaging available for {job_number}: {item_packaging} - {packaging_available} EA")
            
            # Use item's BOM if provided, otherwise use calculated bom_with_stock
            # Note: For trading products, bom_with_stock will be empty
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
            
            # Always check for material shortages, even if finished product is available
            # This ensures raw material shortages (including packaging) are tracked for procurement
            if item_material_shortages:
                any_needs_procurement = True
                all_material_shortages_combined.extend(item_material_shortages)
                # Ensure item_needs_procurement is set if there are shortages
                if not item_needs_procurement:
                    item_needs_procurement = True
                # Set status to procurement for ANY product with material shortages (including packaging)
                item_status = "procurement"
            elif item_needs_procurement:
                any_needs_procurement = True
                all_material_shortages_combined.extend(item_material_shortages)
            
            # Final status determination
            # If no material shortages and finished product available, go to ready_for_dispatch
            if not item_needs_procurement and finished_product_stock >= item.quantity:
                item_status = "ready_for_dispatch"
            elif item_needs_procurement:
                item_status = "procurement"
            
            # ⚠️ SAFETY CHECK: Never allow ready_for_dispatch if packaging required but not checked
            if item_status == "ready_for_dispatch" and item_packaging and item_packaging != "Bulk":
                # Verify packaging was actually checked
                has_packaging_info = any(s.get("item_type") == "PACK" for s in item_material_shortages)
                if not has_packaging_info:
                    logger.error(f"🚨 CRITICAL: Job {job_number} marked ready but packaging not verified! Forcing to procurement.")
                    item_status = "procurement"
                    item_needs_procurement = True
                    item_procurement_reasons.append("⚠️ SAFETY CHECK: Packaging verification missing")
                    # Add error entry to material_shortages
                    item_material_shortages.append({
                        "item_id": "PACKAGING_NOT_VERIFIED",
                        "item_name": f"⚠️ {item_packaging} (NOT VERIFIED)",
                        "item_sku": "-",
                        "required_qty": 0,
                        "available": 0,
                        "shortage": 999999,
                        "status": "ERROR",
                        "uom": "EA",
                        "item_type": "PACK",
                        "error": "Safety check failed: Packaging verification missing"
                    })
            
            # Create separate job order document for this product
            # Preserve net_weight_kg from quotation (only default to 200 if not provided and not Bulk)
            item_net_weight = item.net_weight_kg if item.net_weight_kg is not None else (None if (item.packaging or "Bulk") == "Bulk" else 200)
            
            job_order_dict = {
                "id": str(uuid.uuid4()),
                "job_number": job_number,  # Same job number for all products
                "spa_number": order["spa_number"],
                "sales_order_id": data.sales_order_id,
                "customer_name": customer_name,  # Store customer_name from quotation
                "product_id": item.product_id,
                "product_name": item.product_name,
                "product_sku": item.product_sku or item_dict.get("product_sku"),
                "quantity": item.quantity,
                "packaging": item.packaging or "Bulk",
                "net_weight_kg": item_net_weight,  # Preserve from quotation, only default if needed
                "total_weight_mt": total_weight_mt,  # Total weight in MT from quotation
                "delivery_date": data.delivery_date,
                "bom": bom_with_stock,
                "priority": data.priority or "normal",
                "notes": data.notes,
                "special_conditions": data.special_conditions,  # Store special conditions
                "schedule_date": data.schedule_date if hasattr(data, 'schedule_date') else None,  # Scheduled production date/time
                "schedule_shift": data.schedule_shift if hasattr(data, 'schedule_shift') else None,  # Scheduled shift
                "status": item_status,  # Auto set to ready_for_dispatch if product available
                "procurement_status": "pending" if item_needs_procurement else "not_required",
                "procurement_required": item_needs_procurement,
                "procurement_reason": "; ".join(item_procurement_reasons) if item_procurement_reasons else None,
                "material_shortages": item_material_shortages,
                "incoterm": incoterm,  # Store incoterm for routing
                "country_of_destination": country_of_destination,  # Store country of destination (from port of discharge or explicit field)
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.job_orders.insert_one(job_order_dict)
            created_job_orders.append(job_order_dict["id"])
            
            # PHASE 8: Auto-route job to transport if ready_for_dispatch
            if item_status == "ready_for_dispatch":
                await ensure_dispatch_routing(job_order_dict["id"], job_order_dict)
            # Notify when job is ready for production scheduling (pending status without procurement needs)
            elif item_status == "pending" and not item_needs_procurement:
                await create_notification(
                    event_type="PRODUCTION_SCHEDULED",
                    title=f"Production Scheduled: {job_number}",
                    message=f"Job {job_number} ({item.product_name}) has been scheduled for production.",
                    link="/production-schedule",
                    ref_type="JOB",
                    ref_id=job_order_dict["id"],
                    target_roles=["admin", "production"],
                    notification_type="info"
                )
        
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
    product_type = finished_product.get("type", "MANUFACTURED") if finished_product else "MANUFACTURED"
    required_quantity = data.quantity
    
    needs_procurement = False
    procurement_reason = []
    material_shortages_list = []
    job_status = "pending"  # Default status
    bom_with_stock = []
    raw_materials_insufficient = False
    
    # Handle trading products differently - skip BOM checks
    if product_type == "TRADED":
        # For trading products: only check finished product availability
        if finished_product_stock >= required_quantity:
            job_status = "ready_for_dispatch"  # Auto go to dispatch if available
            needs_procurement = False
        else:
            # Need to procure the finished product itself
            job_status = "procurement"  # Changed: trading products go to procurement if material not available
            needs_procurement = True
            shortage = required_quantity - finished_product_stock
            procurement_reason.append(
                f"Trading product stock ({finished_product_stock}) < required ({required_quantity})"
            )
            material_shortages_list.append({
                "item_id": data.product_id,  # The finished product itself
                "item_name": finished_product.get("name", "Unknown") if finished_product else "Unknown",
                "item_sku": finished_product.get("sku", "-") if finished_product else "-",
                "required_qty": required_quantity,
                "available": finished_product_stock,
                "shortage": shortage,
                "status": "SHORTAGE",
                "uom": finished_product.get("unit", "KG") if finished_product else "KG",
                "item_type": "TRADED"  # Mark as trading product
            })
    else:
        # Manufacturing products: check finished product and BOM
        # Manufacturing products should automatically go to procurement if materials not available
        job_status = "procurement"  # Default for manufacturing - will be updated if materials available
        if finished_product_stock >= required_quantity:
            # Finished product available - check raw materials
            # If raw materials are available, can go to ready_for_dispatch
            job_status = "ready_for_dispatch"  # Will be changed to procurement if raw materials insufficient
        
        # STEP 2: Always check raw materials from BOM (even if finished product is available)
        # This ensures we can produce more if needed and identify procurement needs
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
        
        # Get U.O.M from data or infer from packaging (only if not explicitly set)
        uom = data.uom if hasattr(data, 'uom') and data.uom else None
        if not uom:
            packaging_lower = packaging.lower()
            if any(keyword in packaging_lower for keyword in ["drum", "carton", "pail", "ibc", "bag", "box"]):
                uom = "per_unit"
            elif any(keyword in packaging_lower for keyword in ["flexi", "iso", "tank"]):
                uom = "per_liter"
            elif packaging_lower == "bulk":
                uom = "per_mt"
            else:
                uom = "per_mt"  # Default
        
        # Calculate finished_kg based on U.O.M
        if uom == "per_unit":
            # For cartons, drums, pails: quantity is number of units
            net_weight = net_weight_kg if net_weight_kg is not None else 200
            finished_kg = required_quantity * net_weight
        elif uom == "per_liter":
            # For liters: 1 liter ≈ 1 kg
            finished_kg = required_quantity
        else:  # per_mt
            # For bulk: quantity is in MT, convert to KG
            finished_kg = required_quantity * 1000
        
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
                    # For manufacturing products, if raw materials insufficient, set status to procurement
                    job_status = "procurement"  # Manufacturing products go to procurement
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
            if hasattr(data, 'bom') and data.bom:
                for item in data.bom:
                    item_dict = item.model_dump() if hasattr(item, 'model_dump') else item
                    item_dict["available_qty"] = 0
                    bom_with_stock.append(item_dict)
        
        # Determine if procurement is needed
        # Check both finished product AND raw materials, even if finished product is available
        if finished_product_stock < required_quantity:
            procurement_reason.insert(0, f"Finished product stock ({finished_product_stock}) < required ({required_quantity})")
            needs_procurement = True
            job_status = "procurement"  # Manufacturing products go to procurement
        elif raw_materials_insufficient:
            # Finished product is available, but raw materials are not - need procurement for raw materials
            procurement_reason.insert(0, f"Finished product available ({finished_product_stock} >= {required_quantity}), but raw materials insufficient")
            needs_procurement = True
            job_status = "procurement"  # Manufacturing products go to procurement
        elif finished_product_stock >= required_quantity and not raw_materials_insufficient:
            # Both finished product and raw materials available
            job_status = "ready_for_dispatch"
            needs_procurement = False
    
    # Get customer_name from sales order (which comes from quotation)
    customer_name = order.get("customer_name", "")
    if not customer_name and quotation:
        customer_name = quotation.get("customer_name", "")
    
    # Get country of destination from quotation (port of discharge or explicit field)
    # Note: quotation and customer are already fetched at the beginning of the function
    country_of_destination = get_country_of_destination(quotation, customer)
    
    # Get total_weight_mt from quotation or sales order (for single product case)
    total_weight_mt_single = 0.0
    if quotation:
        total_weight_mt_single = quotation.get("total_weight_mt", 0.0)
    elif order.get("total_weight_mt"):
        total_weight_mt_single = order.get("total_weight_mt", 0.0)
    
    job_order = JobOrder(
        **data.model_dump(exclude={"bom", "procurement_required", "material_shortages"}), # Exclude calculated fields
        bom=bom_with_stock,
        job_number=job_number,
        spa_number=order["spa_number"],
        customer_name=customer_name,  # Store customer_name from quotation
        total_weight_mt=total_weight_mt_single,  # Total weight in MT from quotation
        status=job_status,  # Use calculated status (ready_for_dispatch or pending)
        procurement_status="pending" if needs_procurement else "not_required",
        procurement_required=needs_procurement,
        incoterm=incoterm,  # Store incoterm for routing
        country_of_destination=country_of_destination  # Store country of destination from quotation
    )
    
    # Store procurement reason and material shortages - ALWAYS save material_shortages if they exist
    # This ensures raw material shortages are tracked even when finished product is available
    job_order_dict = job_order.model_dump()
    job_order_dict["country_of_destination"] = country_of_destination  # Store country of destination (from port of discharge or explicit field)
    job_order_dict["total_weight_mt"] = total_weight_mt_single  # Ensure total_weight_mt is included
    
    # Always save material_shortages and procurement_reason if they exist, even if needs_procurement is False
    if material_shortages_list:
        job_order_dict["material_shortages"] = material_shortages_list
    if procurement_reason:
        job_order_dict["procurement_reason"] = "; ".join(procurement_reason)
    
    await db.job_orders.insert_one(job_order_dict)
    
    # Create notification for procurement team if procurement is needed
    if needs_procurement:
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
        
        # Notify when job is ready for production scheduling (pending status without procurement needs)
        if job_status == "pending" and not needs_procurement:
            await create_notification(
                event_type="PRODUCTION_SCHEDULED",
                title=f"Production Scheduled: {job_number}",
                message=f"Job {job_number} ({job_order.product_name}) has been scheduled for production.",
                link="/production-schedule",
                ref_type="JOB",
                ref_id=job_order.id,
                target_roles=["admin", "production"],
                notification_type="info"
            )
    
    # PHASE 8: Auto-route job to transport if ready_for_dispatch
    if job_status == "ready_for_dispatch":
        await ensure_dispatch_routing(job_order.id, job_order.model_dump())
    
    return job_order

@api_router.get("/job-orders")
async def get_job_orders(
    status: Optional[str] = None, 
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    
    # Calculate skip and limit
    skip = (page - 1) * page_size
    
    # Get total count for pagination metadata
    total_count = await db.job_orders.count_documents(query)
    
    # Fetch paginated jobs
    jobs = await db.job_orders.find(query, {"_id": 0})\
        .sort("created_at", -1)\
        .skip(skip)\
        .limit(page_size)\
        .to_list(page_size)
    
    # Enrich with customer_name, incoterm, and country_of_destination from sales order/quotation
    enriched_jobs = []
    for job in jobs:
        sales_order_id = job.get("sales_order_id")
        if sales_order_id:
            sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
            if sales_order:
                job["customer_name"] = sales_order.get("customer_name", "")
                
                # Enrich incoterm if missing - first try from job, then sales order, then quotation
                if not job.get("incoterm"):
                    # Try from sales order first
                    if sales_order.get("incoterm"):
                        incoterm = sales_order.get("incoterm", "").upper()
                        # Update the job order in database
                        await db.job_orders.update_one(
                            {"id": job.get("id")},
                            {"$set": {"incoterm": incoterm}}
                        )
                        job["incoterm"] = incoterm
                    # If not in sales order, try to get from quotation
                    elif sales_order.get("quotation_id"):
                        quotation = await db.quotations.find_one({"id": sales_order.get("quotation_id")}, {"_id": 0})
                        if quotation and quotation.get("incoterm"):
                            incoterm = quotation.get("incoterm", "").upper()
                            # Update the job order in database
                            await db.job_orders.update_one(
                                {"id": job.get("id")},
                                {"$set": {"incoterm": incoterm}}
                            )
                            job["incoterm"] = incoterm
                
                # Enrich country_of_destination if missing - first try from sales order, then from quotation
                if not job.get("country_of_destination"):
                    # First, try to get from sales order directly
                    if sales_order.get("country_of_destination"):
                        country_of_destination = sales_order.get("country_of_destination")
                        # Update the job order in database
                        await db.job_orders.update_one(
                            {"id": job.get("id")},
                            {"$set": {"country_of_destination": country_of_destination}}
                        )
                        job["country_of_destination"] = country_of_destination
                    # If not in sales order, try to get from quotation
                    elif sales_order.get("quotation_id"):
                        quotation = await db.quotations.find_one({"id": sales_order.get("quotation_id")}, {"_id": 0})
                        customer = None
                        if quotation and quotation.get("customer_id"):
                            customer = await db.customers.find_one({"id": quotation.get("customer_id")}, {"_id": 0})
                        country_of_destination = get_country_of_destination(quotation, customer)
                        if country_of_destination:
                            # Update the job order in database
                            await db.job_orders.update_one(
                                {"id": job.get("id")},
                                {"$set": {"country_of_destination": country_of_destination}}
                            )
                            job["country_of_destination"] = country_of_destination
        enriched_jobs.append(job)
    
    # Calculate total pages
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0
    
    return {
        "data": enriched_jobs,
        "pagination": {
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_previous": page > 1
        }
    }

@api_router.get("/job-orders/{job_id}", response_model=JobOrder)
async def get_job_order(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Enrich with customer_name from sales order if missing
    if not job.get("customer_name") and job.get("sales_order_id"):
        sales_order = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
        if sales_order:
            job["customer_name"] = sales_order.get("customer_name", "")
    
    # Enrich incoterm if missing
    if not job.get("incoterm") and job.get("sales_order_id"):
        sales_order = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
        if sales_order:
            if sales_order.get("incoterm"):
                incoterm = sales_order.get("incoterm", "").upper()
                await db.job_orders.update_one(
                    {"id": job_id},
                    {"$set": {"incoterm": incoterm}}
                )
                job["incoterm"] = incoterm
            elif sales_order.get("quotation_id"):
                quotation = await db.quotations.find_one({"id": sales_order.get("quotation_id")}, {"_id": 0})
                if quotation and quotation.get("incoterm"):
                    incoterm = quotation.get("incoterm", "").upper()
                    await db.job_orders.update_one(
                        {"id": job_id},
                        {"$set": {"incoterm": incoterm}}
                    )
                    job["incoterm"] = incoterm
    
    # Enrich with country_of_destination from quotation if missing
    if not job.get("country_of_destination") and job.get("sales_order_id"):
        sales_order = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
        if sales_order and sales_order.get("quotation_id"):
            quotation = await db.quotations.find_one({"id": sales_order.get("quotation_id")}, {"_id": 0})
            customer = None
            if quotation and quotation.get("customer_id"):
                customer = await db.customers.find_one({"id": quotation.get("customer_id")}, {"_id": 0})
            country_of_destination = get_country_of_destination(quotation, customer)
            if country_of_destination:
                # Update the job order in database
                await db.job_orders.update_one(
                    {"id": job_id},
                    {"$set": {"country_of_destination": country_of_destination}}
                )
                job["country_of_destination"] = country_of_destination
    
    return job

@api_router.post("/job-orders/{job_id}/check-availability", response_model=dict)
async def check_job_order_availability(job_id: str, current_user: dict = Depends(get_current_user)):
    """
    Re-check availability for a job order with priority:
    1. Check finished product stock first
    2. If not available, check raw materials from BOM
    3. Update status accordingly (ready_for_dispatch, pending, or procurement)
    """
    from inventory_service import InventoryService
    
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    inventory_service = InventoryService(db)
    
    # Get job details
    product_id = job.get("product_id")
    quantity = job.get("quantity", 0)
    packaging = job.get("packaging", "Bulk")
    net_weight_kg = job.get("net_weight_kg")
    material_shortages = job.get("material_shortages", [])
    
    # Calculate required quantity in MT/KG
    if packaging != "Bulk" and net_weight_kg:
        required_mt = (quantity * net_weight_kg) / 1000
    elif packaging == "Bulk":
        required_mt = quantity  # Already in MT
    else:
        # Default calculation if net_weight_kg missing
        required_mt = (quantity * 200) / 1000 if packaging != "Bulk" else quantity
    
    # STEP 1: Check finished product stock first
    finished_product_available = False
    if product_id:
        finished_avail = await inventory_service.get_finished_product_availability(product_id)
        finished_stock = finished_avail.get("available", 0)
        # Convert stock to MT for comparison (assuming stock is in same unit as requirement)
        # For finished products, check if we have enough stock
        if finished_stock >= required_mt:
            finished_product_available = True
    
    # If finished product is available, no need for production or procurement
    if finished_product_available:
        # Update job to ready_for_dispatch
        await db.job_orders.update_one(
            {"id": job_id},
            {"$set": {
                "status": "ready_for_dispatch",
                "procurement_status": "complete",
                "material_shortages": [],
                "procurement_required": False
            }}
        )
        
        # Auto-route to transport
        await ensure_dispatch_routing(job_id, job)
        
        # Create notification
        await create_notification(
            event_type="JOB_READY",
            title=f"Job Ready: {job.get('job_number')}",
            message=f"Finished product available in stock. Job {job.get('job_number')} ({job.get('product_name')}) is ready for dispatch.",
            link="/transport-planner",
            ref_type="JOB",
            ref_id=job_id,
            target_roles=["admin", "transport"],
            notification_type="success"
        )
        
        return {
            "job_id": job_id,
            "job_number": job.get("job_number"),
            "status": "finished_product_available",
            "new_status": "ready_for_dispatch",
            "message": f"Finished product is available in stock. Job status updated to ready_for_dispatch. No production needed."
        }
    
    # STEP 2: Finished product not available - check raw materials from BOM
    # Check if all materials are now available
    all_materials_available = True
    all_raw_materials_available = True
    updated_shortages = []
    
    # If no shortages listed, check BOM requirements
    if not material_shortages:
        if net_weight_kg is None and packaging != "Bulk":
            net_weight_kg = 200  # Default only when needed
        
        if product_id and quantity > 0:
            # Get product BOM
            product_bom = await db.product_boms.find_one({
                "product_id": product_id,
                "is_active": True
            }, {"_id": 0})
            
            if product_bom:
                bom_items = await db.product_bom_items.find({
                    "bom_id": product_bom["id"]
                }, {"_id": 0}).to_list(100)
                
                # Calculate total KG needed
                if packaging != "Bulk":
                    total_kg = quantity * (net_weight_kg or 200)
                else:
                    total_kg = quantity * 1000
                
                # Check each material
                for bom_item in bom_items:
                    material_id = bom_item.get("material_item_id")
                    qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
                    required_qty = total_kg * qty_per_kg
                    item_type = bom_item.get("item_type", "RAW")
                    
                    # Check inventory balance
                    avail_result = await inventory_service.get_available_quantity(material_id)
                    available = avail_result.get("available", 0)
                    
                    if available < required_qty:
                        all_materials_available = False
                        if item_type == "RAW":
                            all_raw_materials_available = False
                        
                        shortage = required_qty - available
                        updated_shortages.append({
                            "item_id": material_id,
                            "item_name": bom_item.get("material_name", "Unknown"),
                            "item_sku": bom_item.get("material_sku", "-"),
                            "required_qty": required_qty,
                            "available": available,
                            "shortage": shortage,
                            "item_type": item_type,
                            "uom": bom_item.get("uom", "KG")
                        })
                if packaging != "Bulk":
                    from math import ceil
                    
                    # Find packaging item
                    packaging_item_id = await find_or_create_packaging_item(packaging)
                    
                    if packaging_item_id:
                        # Calculate required packaging quantity
                        finished_kg = quantity * net_weight_kg
                        packaging_qty = 0
                        packaging_lower = packaging.lower()
                        
                        if "drum" in packaging_lower:
                            capacity_liters = 200
                            if "210" in packaging or "210l" in packaging_lower:
                                capacity_liters = 210
                            elif "250" in packaging or "250l" in packaging_lower:
                                capacity_liters = 250
                            net_weight_per_drum = capacity_liters * 0.85
                            packaging_qty = max(1, ceil(finished_kg / net_weight_per_drum))
                        elif "ibc" in packaging_lower:
                            net_weight_per_ibc = 1000 * 0.85
                            packaging_qty = max(1, ceil(finished_kg / net_weight_per_ibc))
                        elif "flexi" in packaging_lower or "flexitank" in packaging_lower:
                            packaging_qty = 1
                        else:
                            packaging_qty = max(1, ceil(finished_kg / net_weight_kg))
                        
                        # Check packaging availability
                        avail_result = await inventory_service.get_available_quantity(packaging_item_id)
                        packaging_available = avail_result.get("available", 0)
                        
                        if packaging_available < packaging_qty:
                            all_materials_available = False
                            
                            packaging_shortage = packaging_qty - packaging_available
                            
                            # Get packaging item details
                            packaging_item = await db.inventory_items.find_one({"id": packaging_item_id}, {"_id": 0})
                            
                            if packaging_item:
                                updated_shortages.append({
                                    "item_id": packaging_item_id,
                                    "item_name": packaging_item.get("name", packaging),
                                    "item_sku": packaging_item.get("sku", "-"),
                                    "required_qty": packaging_qty,
                                    "available": packaging_available,
                                    "shortage": packaging_shortage,
                                    "item_type": "PACK",
                                    "uom": packaging_item.get("uom", "EA")
                                })
                # ===== END OF PACKAGING CHECK SECTION =====
    else:
        # Check each existing shortage
        for shortage in material_shortages:
            item_id = shortage.get("item_id")
            required_qty = shortage.get("required_qty", shortage.get("shortage", 0))
            item_type = shortage.get("item_type", "RAW")
            
            # Check inventory balance
            avail_result = await inventory_service.get_available_quantity(item_id)
            available = avail_result.get("available", 0)
            
            if available < required_qty:
                all_materials_available = False
                if item_type == "RAW":
                    all_raw_materials_available = False
                
                shortage_qty = required_qty - available
                updated_shortages.append({
                    "item_id": item_id,
                    "item_name": shortage.get("item_name", "Unknown"),
                    "item_sku": shortage.get("item_sku", "-"),
                    "required_qty": required_qty,
                    "available": available,
                    "shortage": shortage_qty,
                    "item_type": item_type,
                    "uom": shortage.get("uom", "KG")
                })
            # If available, don't add to updated_shortages (material is now available)
    
    # Check if job needs procurement update
    # Also check if status is "procurement" to handle cases where procurement was completed but status wasn't updated
    needs_procurement_update = (
        (material_shortages and len(material_shortages) > 0)
        or job.get("procurement_required", False)
        or job.get("procurement_status") in ["pending", "in_progress", "complete"]
        or job.get("status") == "procurement"
    )
    
    # Check if this is a trading product job
    is_trading_product = False
    if material_shortages:
        all_traded_shortages = all(s.get("item_type") == "TRADED" for s in material_shortages)
        if all_traded_shortages and len(material_shortages) > 0:
            is_trading_product = True
    else:
        product_id = job.get("product_id")
        if product_id:
            product = await db.products.find_one({"id": product_id}, {"_id": 0})
            if product and product.get("type") == "TRADED":
                is_trading_product = True
    
    # Update job if all materials are now available (raw materials check)
    if all_materials_available and needs_procurement_update:
        # For trading products: set to ready_for_dispatch (no production needed)
        # For manufacturing products: set to pending (needs production scheduling)
        if is_trading_product:
            new_status = "ready_for_dispatch"
        else:
            new_status = "pending"  # Raw materials available - needs production
        
        # Update job status
        await db.job_orders.update_one(
            {"id": job_id},
            {"$set": {
                "status": new_status,
                "procurement_status": "complete",
                "material_shortages": [],
                "procurement_required": False
            }}
        )
        
        # Auto-route to transport if ready_for_dispatch
        if new_status == "ready_for_dispatch":
            await ensure_dispatch_routing(job_id, job)
        
        # Create notification
        if is_trading_product:
            notification_message = f"Trading product procured. Job {job.get('job_number')} ({job.get('product_name')}) is ready for dispatch."
            notification_link = "/transport-planner"
            target_roles = ["admin", "transport"]
        else:
            notification_message = f"Raw materials available. Job {job.get('job_number')} ({job.get('product_name')}) is ready for production scheduling."
            notification_link = "/production-schedule"
            target_roles = ["admin", "production"]
        
        await create_notification(
            event_type="JOB_READY",
            title=f"Job Ready: {job.get('job_number')}",
            message=notification_message,
            link=notification_link,
            ref_type="JOB",
            ref_id=job_id,
            target_roles=target_roles,
            notification_type="success"
        )
        
        return {
            "job_id": job_id,
            "job_number": job.get("job_number"),
            "status": "materials_available",
            "new_status": new_status,
            "message": f"Raw materials are available. Job status updated to {new_status}. Production needed."
        }
    elif len(updated_shortages) < len(material_shortages):
        # Some materials became available but not all
        await db.job_orders.update_one(
            {"id": job_id},
            {"$set": {
                "material_shortages": updated_shortages,
                "procurement_required": len(updated_shortages) > 0
            }}
        )
        return {
            "job_id": job_id,
            "job_number": job.get("job_number"),
            "status": "partial_availability",
            "shortages_remaining": len(updated_shortages),
            "message": f"Some materials are now available. {len(updated_shortages)} shortage(s) remaining."
        }
    else:
        # No change in availability
        return {
            "job_id": job_id,
            "job_number": job.get("job_number"),
            "status": "still_shortage",
            "shortages_remaining": len(updated_shortages),
            "message": f"Materials still not available. {len(updated_shortages)} shortage(s) remaining."
        }

@api_router.put("/job-orders/{job_id}/check-procurement-status")
async def check_and_update_procurement_status(job_id: str, current_user: dict = Depends(get_current_user)):
    """Check material availability and update job status after procurement completion"""
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Check if materials are available
    material_shortages = job.get("material_shortages", [])
    all_materials_available = True
    
    for shortage in material_shortages:
        item_id = shortage.get("item_id")
        required_qty = shortage.get("required_qty", 0)
        
        balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        reserved = balance.get("reserved", 0) if balance else 0
        available = on_hand - reserved
        
        if available < required_qty:
            all_materials_available = False
            break
    
    # If no shortages listed, check BOM requirements
    if not material_shortages:
        product_id = job.get("product_id")
        quantity = job.get("quantity", 0)
        packaging = job.get("packaging", "Bulk")
        net_weight_kg = job.get("net_weight_kg")
        if net_weight_kg is None and packaging != "Bulk":
            net_weight_kg = 200
        
        if product_id and quantity > 0:
            product_bom = await db.product_boms.find_one({
                "product_id": product_id,
                "is_active": True
            }, {"_id": 0})
            
            if product_bom:
                bom_items = await db.product_bom_items.find({
                    "bom_id": product_bom["id"]
                }, {"_id": 0}).to_list(100)
                
                if packaging != "Bulk":
                    total_kg = quantity * (net_weight_kg or 200)
                else:
                    total_kg = quantity * 1000
                
                for bom_item in bom_items:
                    material_id = bom_item.get("material_item_id")
                    qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
                    required_qty = total_kg * qty_per_kg
                    
                    balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                    available = (balance.get("on_hand", 0) - balance.get("reserved", 0)) if balance else 0
                    
                    if available < required_qty:
                        all_materials_available = False
                        break
    
    # Check if this is a trading product
    is_trading_product = False
    product_id = job.get("product_id")
    if product_id:
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if product and product.get("type") == "TRADED":
            is_trading_product = True
    
    # Update status if materials are available
    if all_materials_available:
        if is_trading_product:
            new_status = "ready_for_dispatch"
            notification_message = f"Trading product procured. Job {job.get('job_number')} ({job.get('product_name')}) is ready for dispatch."
            notification_link = "/transport-planner"
            target_roles = ["admin", "transport"]
        else:
            new_status = "pending"
            notification_message = f"Materials procured. Job {job.get('job_number')} ({job.get('product_name')}) is ready for production scheduling."
            notification_link = "/production-schedule"
            target_roles = ["admin", "production"]
        
        await db.job_orders.update_one(
            {"id": job_id},
            {"$set": {
                "status": new_status,
                "procurement_status": "complete",
                "material_shortages": [],
                "procurement_required": False
            }}
        )
        
        if new_status == "ready_for_dispatch":
            await ensure_dispatch_routing(job_id, job)
        
        await create_notification(
            event_type="JOB_READY",
            title=f"Job Ready: {job.get('job_number')}",
            message=notification_message,
            link=notification_link,
            ref_type="JOB",
            ref_id=job_id,
            target_roles=target_roles,
            notification_type="success"
        )
        
        return {
            "job_id": job_id,
            "job_number": job.get("job_number"),
            "status": "updated",
            "new_status": new_status,
            "message": f"Job status updated to {new_status}"
        }
    else:
        return {
            "job_id": job_id,
            "job_number": job.get("job_number"),
            "status": "materials_still_short",
            "message": "Materials are still not fully available"
        }

@api_router.delete("/job-orders/{job_id}")
async def delete_job_order(job_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a job order"""
    if not has_permission(current_user, required_roles=["admin", "production"], required_page="/job-orders"):
        raise HTTPException(status_code=403, detail="Only admin/production can delete job orders")
    
    # Check if job order exists
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    result = await db.job_orders.delete_one({"id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    return {"message": "Job order deleted successfully"}

@api_router.post("/job-orders/{job_id}/recalculate-bom-shortages")
async def recalculate_bom_shortages(job_id: str, current_user: dict = Depends(get_current_user)):
    """
    Recalculate raw material shortages from BOM for a job order.
    This will repopulate the material_shortages array with RAW materials from the active BOM.
    """
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    product_id = job.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="Job has no product_id")
    
    # Get product to check if it's manufactured
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if product.get("type") == "TRADED":
        return {
            "success": False,
            "message": "This is a trading product - no BOM shortages to calculate"
        }
    
    # Get active BOM
    product_bom = await db.product_boms.find_one({
        "product_id": product_id,
        "is_active": True
    }, {"_id": 0})
    
    if not product_bom:
        return {
            "success": False,
            "message": "No active BOM found for this product"
        }
    
    # Get BOM items
    bom_items = await db.product_bom_items.find({
        "bom_id": product_bom["id"]
    }, {"_id": 0}).to_list(100)
    
    if not bom_items:
        return {
            "success": False,
            "message": "BOM has no items"
        }
    
    # Calculate total KG needed
    total_weight_mt = job.get("total_weight_mt", 0)
    quantity = job.get("quantity", 0)
    packaging = job.get("packaging", "Bulk")
    net_weight_kg = job.get("net_weight_kg")
    
    if total_weight_mt > 0:
        total_kg = total_weight_mt * 1000
    elif packaging != "Bulk" and net_weight_kg:
        total_kg = quantity * net_weight_kg
    elif packaging != "Bulk":
        total_kg = quantity * 200  # Default
    else:
        total_kg = quantity * 1000
    
    if total_kg <= 0:
        return {
            "success": False,
            "message": "Cannot calculate - job quantity is zero"
        }
    
    # Get existing material_shortages and keep only PACK items
    existing_shortages = job.get("material_shortages", [])
    pack_shortages = [s for s in existing_shortages if s.get("item_type") == "PACK"]
    
    # Calculate new RAW material shortages
    new_raw_shortages = []
    for bom_item in bom_items:
        material_id = bom_item.get("material_item_id")
        qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
        required_qty = total_kg * qty_per_kg
        
        # Get material details
        material = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
        if not material:
            continue
        
        # Check availability
        balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        reservations = await db.inventory_reservations.find({"item_id": material_id}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        available = on_hand - reserved
        
        shortage_qty = max(0, required_qty - available)
        if shortage_qty > 0:
            uom = material.get("uom", "KG")
            if uom.upper() in ["MT", "METRIC TON", "TONNE"]:
                uom = "KG"
            
            new_raw_shortages.append({
                "item_id": material_id,
                "item_name": material.get("name", "Unknown"),
                "item_sku": material.get("sku", "-"),
                "required_qty": required_qty,
                "available": available,
                "shortage": shortage_qty,
                "status": "SHORTAGE",
                "uom": uom,
                "item_type": "RAW",
                "source": "BOM_RECALCULATION"
            })
    
    # Combine RAW and PACK shortages
    all_shortages = new_raw_shortages + pack_shortages
    
    # Update job order
    update_data = {
        "material_shortages": all_shortages,
        "procurement_required": len(all_shortages) > 0
    }
    
    if len(all_shortages) > 0 and job.get("status") in ["pending", "approved"]:
        update_data["status"] = "procurement"
    
    await db.job_orders.update_one(
        {"id": job_id},
        {"$set": update_data}
    )
    
    return {
        "success": True,
        "message": f"BOM shortages recalculated successfully",
        "raw_shortages_found": len(new_raw_shortages),
        "pack_shortages_kept": len(pack_shortages),
        "total_shortages": len(all_shortages),
        "shortages": all_shortages
    }

@api_router.post("/job-orders/{job_id}/sync-packaging")
async def sync_job_packaging(job_id: str, current_user: dict = Depends(get_current_user)):
    """
    Sync/recalculate packaging requirements for a job order.
    This will update the material_shortages array with packaging information.
    """
    from math import ceil
    
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    packaging = job.get("packaging", "Bulk")
    quantity = job.get("quantity", 0)
    net_weight_kg = job.get("net_weight_kg", 200)
    material_shortages = job.get("material_shortages", [])
    
    # Skip if Bulk or no packaging
    if not packaging or packaging == "Bulk":
        return {
            "success": True,
            "message": "No packaging required for bulk orders",
            "packaging_added": False
        }
    
    # Calculate finished product weight in KG
    finished_kg = quantity * net_weight_kg
    
    # Remove any existing packaging entries from material_shortages
    material_shortages = [s for s in material_shortages if s.get("item_type") != "PACK"]
    
    try:
        # Find or create packaging inventory item
        packaging_item_id = await find_or_create_packaging_item(packaging)
        
        if not packaging_item_id:
            return {
                "success": False,
                "message": f"Could not map packaging '{packaging}' to inventory item",
                "packaging_added": False
            }
        
        # Calculate required packaging quantity
        packaging_qty = 0
        packaging_lower = packaging.lower()
        
        if "drum" in packaging_lower:
            # Use net_weight_kg from job order instead of hardcoded calculation
            net_weight_per_drum = net_weight_kg
            packaging_qty = max(1, ceil(finished_kg / net_weight_per_drum))
        elif "ibc" in packaging_lower:
            net_weight_per_ibc = 1000 * 0.85
            packaging_qty = max(1, ceil(finished_kg / net_weight_per_ibc))
        elif "flexi" in packaging_lower or "flexitank" in packaging_lower:
            packaging_qty = 1
        else:
            packaging_qty = max(1, ceil(finished_kg / net_weight_kg))
        
        # Check packaging availability
        packaging_balance = await db.inventory_balances.find_one({"item_id": packaging_item_id}, {"_id": 0})
        packaging_on_hand = packaging_balance.get("on_hand", 0) if packaging_balance else 0
        packaging_reservations = await db.inventory_reservations.find({"item_id": packaging_item_id}, {"_id": 0}).to_list(1000)
        packaging_reserved = sum(r.get("qty", 0) for r in packaging_reservations)
        packaging_available = packaging_on_hand - packaging_reserved
        packaging_shortage = max(0, packaging_qty - packaging_available)
        
        # Get packaging item details
        packaging_item = await db.inventory_items.find_one({"id": packaging_item_id}, {"_id": 0})
        if not packaging_item:
            return {
                "success": False,
                "message": f"Packaging item not found in inventory",
                "packaging_added": False
            }
        
        # Add packaging info to material_shortages
        packaging_info = {
            "item_id": packaging_item_id,
            "item_name": packaging_item.get("name", packaging),
            "item_sku": packaging_item.get("sku", "-"),
            "required_qty": packaging_qty,
            "available": packaging_available,
            "shortage": packaging_shortage,
            "status": "SHORTAGE" if packaging_shortage > 0 else "AVAILABLE",
            "uom": packaging_item.get("uom", "EA"),
            "item_type": "PACK"
        }
        
        material_shortages.append(packaging_info)
        
        # Update job order
        update_data = {"material_shortages": material_shortages}
        
        # If packaging has shortage, ensure procurement status is set
        if packaging_shortage > 0:
            update_data["procurement_required"] = True
            if job.get("status") == "ready_for_dispatch":
                # Don't allow ready_for_dispatch if packaging shortage exists
                update_data["status"] = "procurement"
        
        await db.job_orders.update_one(
            {"id": job_id},
            {"$set": update_data}
        )
        
        return {
            "success": True,
            "message": "Packaging requirements synced successfully",
            "packaging_added": True,
            "packaging_info": {
                "item_name": packaging_info["item_name"],
                "required": packaging_qty,
                "available": packaging_available,
                "shortage": packaging_shortage,
                "status": packaging_info["status"]
            }
        }
        
    except Exception as e:
        logger.error(f"Error syncing packaging for job {job_id}: {str(e)}")
        return {
            "success": False,
            "message": f"Error syncing packaging: {str(e)}",
            "packaging_added": False
        }

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
            # Reduce packaging stock when production is completed
            packaging = job.get("packaging", "Bulk")
            if packaging and packaging != "Bulk":
                try:
                    from math import ceil
                    # Get packaging item ID
                    packaging_item_id = await find_or_create_packaging_item(packaging)
                    
                    if packaging_item_id:
                        # Calculate packaging quantity needed
                        net_weight_kg = job.get("net_weight_kg", 200)
                        quantity = job.get("quantity", 0)
                        finished_kg = quantity * net_weight_kg
                        
                        # Calculate required packaging quantity
                        packaging_qty = 0
                        packaging_lower = packaging.lower()
                        
                        if "drum" in packaging_lower:
                            # Use net_weight_kg from job order
                            net_weight_per_drum = net_weight_kg
                            packaging_qty = max(1, ceil(finished_kg / net_weight_per_drum))
                        elif "ibc" in packaging_lower:
                            net_weight_per_ibc = 1000 * 0.85
                            packaging_qty = max(1, ceil(finished_kg / net_weight_per_ibc))
                        elif "flexi" in packaging_lower or "flexitank" in packaging_lower:
                            packaging_qty = 1
                        else:
                            packaging_qty = max(1, ceil(finished_kg / net_weight_kg))
                        
                        # Reduce packaging stock
                        packaging_balance = await db.inventory_balances.find_one({"item_id": packaging_item_id}, {"_id": 0})
                        packaging_prev_stock = packaging_balance.get("on_hand", 0) if packaging_balance else 0
                        packaging_new_stock = max(0, packaging_prev_stock - packaging_qty)
                        
                        # Update inventory_balances for packaging
                        await db.inventory_balances.update_one(
                            {"item_id": packaging_item_id},
                            {"$inc": {"on_hand": -packaging_qty}},
                            upsert=True
                        )
                        
                        # Create inventory movement for packaging
                        packaging_item = await db.inventory_items.find_one({"id": packaging_item_id}, {"_id": 0})
                        if packaging_item:
                            packaging_movement = InventoryMovement(
                                product_id=packaging_item_id,
                                product_name=packaging_item.get("name", packaging),
                                sku=packaging_item.get("sku", ""),
                                movement_type="production_packaging_deduct",
                                quantity=packaging_qty,
                                reference_type="job_order",
                                reference_id=job_id,
                                reference_number=job.get("job_number", ""),
                                previous_stock=packaging_prev_stock,
                                new_stock=packaging_new_stock,
                                created_by=current_user["id"]
                            )
                            await db.inventory_movements.insert_one(packaging_movement.model_dump())
                except Exception as e:
                    # Log error but don't fail production completion
                    print(f"Error reducing packaging stock for job {job.get('job_number', job_id)}: {str(e)}")
            
            # Create notification for production completion
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "title": "Production Completed",
                "message": f"Job {job.get('job_number')} ({job.get('product_name')}) production has been completed",
                "type": "success",
                "link": "/job-orders",
                "user_id": None,
                "is_read": False,
                "created_by": "system",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
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
            # Create notification for ready for dispatch when status is directly set
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "title": "Ready for Dispatch",
                "message": f"Job {job.get('job_number')} ({job.get('product_name')}) is ready for dispatch",
                "type": "success",
                "link": "/job-orders",
                "user_id": None,
                "is_read": False,
                "created_by": "system",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
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
    
    # Un-reserve quantities when status changes to dispatched
    if status == "dispatched":
        # Clear all reservations for this job order (bulk production)
        await db.inventory_reservations.delete_many({
            "job_order_id": job_id,
            "reserved_for": "production_filling_complete"
        })
    
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
            "Production_Completed": ("success", "Production Completed"),
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
    data: JobOrderReschedule,
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
        "reschedule_date": data.new_date,
        "reschedule_reason": data.reason or "",
        "rescheduled_by": current_user["id"],
        "rescheduled_at": datetime.now(timezone.utc).isoformat(),
        "scheduled_start": data.new_date  # Update the scheduled start to new date
    }
    
    # Add shift if provided
    if data.new_shift:
        update_data["scheduled_shift"] = data.new_shift
    
    result = await db.job_orders.update_one({"id": job_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Create notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "title": "Job Order Rescheduled",
        "message": f"Job {job.get('job_number')} ({job.get('product_name')}) rescheduled to {data.new_date}. Reason: {data.reason or 'No reason provided'}",
        "type": "warning",
        "link": "/job-orders",
        "user_id": None,
        "is_read": False,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Job order rescheduled successfully", "reschedule_date": data.new_date}

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

@api_router.post("/job-orders/migrate-dispatch-routing")
async def migrate_dispatch_routing():
    """
    Migration endpoint: Create transport/shipping records for existing ready_for_dispatch jobs.
    This is needed for jobs that were already in ready_for_dispatch status before the routing logic was added.
    NOTE: This endpoint is temporarily public for migration purposes only.
    """
    # Temporarily disabled auth check for migration
    # if current_user["role"] not in ["admin"]:
    #     raise HTTPException(status_code=403, detail="Only admin can run migrations")
    
    # FIRST: Update ALL existing transport_outward records that are missing transport_type
    # We'll set transport_type based on the presence of job_order_id (LOCAL) vs container/shipping info
    update_result = await db.transport_outward.update_many(
        {
            "transport_type": {"$exists": False},
            "job_order_id": {"$exists": True}  # Has job order = LOCAL dispatch
        },
        {"$set": {"transport_type": "LOCAL"}}
    )
    updated_count = update_result.modified_count
    
    # Get all ready_for_dispatch jobs without transport routing
    ready_jobs = await db.job_orders.find(
        {"status": "ready_for_dispatch"},
        {"_id": 0}
    ).to_list(1000)
    
    processed = 0
    local_transport_created = 0
    export_bookings_created = 0
    skipped = 0
    
    for job in ready_jobs:
        job_id = job.get("id")
        
        # Check if already has transport record
        if job.get("transport_outward_id") or job.get("shipping_booking_id"):
            skipped += 1
            continue
        
        # Try to get incoterm - first from job itself, then from quotation
        incoterm = job.get("incoterm", "").upper()
        order_type = "local"  # default
        # Prefer customer_name from job order if already stored, otherwise get from sales order
        customer_name = job.get("customer_name", "Unknown Customer")
        
        # Get sales order for customer name
        so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
        if so:
            # Only use sales order customer_name if job doesn't have it
            if not customer_name or customer_name == "Unknown Customer":
                customer_name = so.get("customer_name", "Unknown Customer")
            
            # Get quotation for additional details if needed
            quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
            if quotation:
                # Use quotation incoterm if job doesn't have one
                if not incoterm:
                    incoterm = quotation.get("incoterm", "").upper()
                order_type = quotation.get("order_type", "local")
        
        # If we still don't have an incoterm, skip this job
        if not incoterm:
            skipped += 1
            continue
        
        # For LOCAL orders (EXW, DDP) - Create transport OUTWARD record
        if order_type == "local" or incoterm in ["EXW", "DDP"]:
            # Create transport_outward for local dispatch
            transport_number = await generate_sequence("TOUT", "transport_outward")
            transport_outward = {
                "id": str(uuid.uuid4()),
                "transport_number": transport_number,
                "job_order_id": job_id,
                "job_number": job.get("job_number"),
                "customer_name": customer_name,
                "incoterm": incoterm,
                "transport_type": "LOCAL",
                "source": "JOB_LOCAL_MIGRATION",
                "status": "PENDING",
                "delivery_location": so.get("delivery_address", ""),
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
            
            local_transport_created += 1
            processed += 1
        
        # For EXPORT orders (FOB, CFR, CIF) - Handle based on incoterm
        elif order_type == "export" and incoterm in ["FOB", "CFR", "CIF", "CIP"]:
            # Check if shipping booking already exists for this job
            existing_booking = await db.shipping_bookings.find_one(
                {"job_order_ids": job_id},
                {"_id": 0}
            )
            
            if not existing_booking:
                # For FOB: Mark as awaiting customer booking (don't create booking)
                if incoterm == "FOB":
                    await db.job_orders.update_one(
                        {"id": job_id},
                        {"$set": {
                            "shipping_booking_required": True,
                            "shipping_booking_status": "AWAITING_CUSTOMER"
                        }}
                    )
                    processed += 1
                else:
                    # For CFR, CIF, CIP: Create shipping booking (seller books)
                    booking_number = await generate_sequence("SHP", "shipping_bookings")
                    shipping_booking = {
                        "id": str(uuid.uuid4()),
                        "booking_number": booking_number,
                        "job_order_ids": [job_id],
                        "customer_name": customer_name,
                        "port_of_loading": quotation.get("port_of_loading", "") if quotation else "",
                        "port_of_discharge": quotation.get("port_of_discharge", "") if quotation else "",
                        "incoterm": incoterm,
                        "status": "pending",
                        "booking_source": "SELLER",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.shipping_bookings.insert_one(shipping_booking)
                    
                    # Update job order
                    await db.job_orders.update_one(
                        {"id": job_id},
                        {"$set": {"shipping_booking_id": shipping_booking["id"], "booking_number": booking_number}}
                    )
                    
                    export_bookings_created += 1
                    processed += 1
    
    return {
        "success": True,
        "message": f"Migration completed successfully",
        "existing_records_updated": updated_count,
        "total_ready_for_dispatch": len(ready_jobs),
        "processed": processed,
        "local_transport_created": local_transport_created,
        "export_bookings_created": export_bookings_created,
        "skipped": skipped
    }

@api_router.post("/quotations/migrate-transport-mode")
async def migrate_quotations_transport_mode():
    """
    Migration endpoint: Set transport_mode for all quotations based on order_type
    Previously the system was setting 'mode_of_transport' which was ignored
    """
    # Temporarily disabled auth check for migration
    # if current_user["role"] not in ["admin"]:
    #     raise HTTPException(status_code=403, detail="Only admin can run migrations")
    
    updated_count = 0
    skipped_count = 0
    
    # Get all quotations
    quotations = await db.quotations.find(
        {},
        {"_id": 0, "id": 1, "pfi_number": 1, "order_type": 1, "transport_mode": 1}
    ).to_list(None)
    
    for quotation in quotations:
        quotation_id = quotation.get("id")
        pfi_number = quotation.get("pfi_number", "")
        order_type = quotation.get("order_type", "").lower()
        current_transport_mode = quotation.get("transport_mode")
        
        # Skip if transport_mode is already set
        if current_transport_mode:
            skipped_count += 1
            continue
        
        # Determine transport_mode based on order_type
        new_transport_mode = None
        if order_type == "export":
            new_transport_mode = "SEA"
        elif order_type == "local":
            new_transport_mode = "ROAD"
        
        if new_transport_mode:
            # Update the quotation
            await db.quotations.update_one(
                {"id": quotation_id},
                {"$set": {"transport_mode": new_transport_mode}}
            )
            updated_count += 1
            print(f"✓ Updated {pfi_number}: transport_mode={new_transport_mode}")
    
    return {
        "success": True,
        "message": "Migration complete",
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "total_processed": updated_count + skipped_count
    }

# ==================== GRN ROUTES ====================

async def find_inventory_item_id(product_id: str, product_name: str = None, sku: str = None) -> str:
    """
    Helper function to find the correct inventory_item.id for a given product_id.
    Tries multiple lookup strategies to ensure we find the right item.
    
    Returns: The inventory_item.id if found, otherwise returns product_id as fallback
    """
    # Strategy 1: Direct ID match
    inventory_item = await db.inventory_items.find_one({"id": product_id}, {"_id": 0})
    if inventory_item:
        return inventory_item["id"]
    
    # Strategy 2: Get product and try to find inventory_item by name or SKU
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if product:
        # Use provided name/SKU or get from product
        search_name = product_name or product.get("name")
        search_sku = sku or product.get("sku")
        
        # Try exact name match (case-insensitive)
        if search_name:
            inventory_item = await db.inventory_items.find_one({
                "name": {"$regex": f"^{search_name}$", "$options": "i"}
            }, {"_id": 0})
            if inventory_item:
                return inventory_item["id"]
        
        # Try SKU match (case-insensitive)
        if search_sku:
            inventory_item = await db.inventory_items.find_one({
                "sku": {"$regex": f"^{search_sku}$", "$options": "i"}
            }, {"_id": 0})
            if inventory_item:
                return inventory_item["id"]
        
        # Try partial name match (case-insensitive) - more lenient
        if search_name:
            inventory_item = await db.inventory_items.find_one({
                "name": {"$regex": search_name, "$options": "i"}
            }, {"_id": 0})
            if inventory_item:
                return inventory_item["id"]
    
    # Strategy 3: Fallback - use product_id (will create new balance record if needed)
    return product_id

@api_router.post("/grn", response_model=GRN)
async def create_grn(data: GRNCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "security", "inventory"], required_page="/grn"):
        raise HTTPException(status_code=403, detail="Only security/inventory can create GRN")
    
    # Validate all items have positive quantities
    for item in data.items:
        if item.quantity <= 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Item '{item.product_name}' has invalid quantity: {item.quantity}. Quantity must be greater than 0."
            )
    
    grn_number = await generate_sequence("GRN", "grn")
    
    # Enrich GRN items with SKU if missing
    enriched_items = []
    for item in data.items:
        enriched_item = item.model_dump() if hasattr(item, 'model_dump') else dict(item)
        
        # If SKU is missing or empty, look it up from inventory_item or product
        if not enriched_item.get("sku") or enriched_item.get("sku") == "-" or enriched_item.get("sku") == "":
            # Try to get from inventory_item first
            inventory_item = await db.inventory_items.find_one({"id": item.product_id}, {"_id": 0})
            if inventory_item and inventory_item.get("sku"):
                enriched_item["sku"] = inventory_item.get("sku")
            else:
                # Fallback to product
                product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
                if product and product.get("sku"):
                    enriched_item["sku"] = product.get("sku")
                else:
                    enriched_item["sku"] = "-"  # Keep as "-" if not found
        
        enriched_items.append(enriched_item)
    
    # Create GRN with enriched items
    grn_data = data.model_dump()
    grn_data["items"] = enriched_items
    grn = GRN(**grn_data, grn_number=grn_number, received_by=current_user["id"])
    await db.grn.insert_one(grn.model_dump())
    
    # If GRN is linked to a PO, mark the PO as RECEIVED
    if grn.po_id:
        await db.purchase_orders.update_one(
            {"id": grn.po_id},
            {"$set": {"status": "RECEIVED", "received_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    # Get PO lines if GRN is linked to a PO to check for packaging requirements
    po_lines = []
    if grn.po_id:
        po_lines = await db.purchase_order_lines.find({"po_id": grn.po_id}, {"_id": 0}).to_list(1000)
    
    # Update inventory - ADD
    for item in data.items:
        # Find the correct inventory_item_id using improved lookup
        item_id_for_balance = await find_inventory_item_id(
            item.product_id, 
            item.product_name, 
            item.sku
        )
        
        # Get inventory item and product for unit conversion
        inventory_item = await db.inventory_items.find_one({"id": item_id_for_balance}, {"_id": 0})
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        
        # Determine the inventory item's unit (from inventory_items.uom or products.unit)
        if inventory_item:
            inventory_item_unit = inventory_item.get("uom", "KG").upper()
        elif product:
            inventory_item_unit = product.get("unit", "KG").upper()
        else:
            inventory_item_unit = "KG"  # Default
        
        # Convert GRN quantity to match inventory item's unit
        grn_unit = item.unit.upper() if item.unit else "KG"
        
        # Define count/volume units that should NOT have weight conversions applied
        non_weight_units = ["EA", "EACH", "PCS", "PIECES", "UNITS", "LITERS", "L", "ML"]
        
        if inventory_item_unit == "KG":
            if grn_unit == "MT":
                quantity_to_add = item.quantity * 1000  # Convert MT to KG
            else:  # GRN is already in KG
                quantity_to_add = item.quantity
        elif inventory_item_unit == "MT":
            if grn_unit == "KG":
                quantity_to_add = item.quantity / 1000  # Convert KG to MT
            else:  # GRN is already in MT
                quantity_to_add = item.quantity
        else:
            # For non-weight units (EA, PCS, LITERS, etc.), use quantity as-is
            # Only apply weight conversion if both units are weight-based
            if grn_unit in non_weight_units or inventory_item_unit in non_weight_units:
                # Count/volume units - no conversion needed
                quantity_to_add = item.quantity
            elif grn_unit == "MT" and inventory_item_unit == "KG":
                # Weight conversion: MT to KG
                quantity_to_add = item.quantity * 1000
            elif grn_unit == "KG" and inventory_item_unit == "MT":
                # Weight conversion: KG to MT
                quantity_to_add = item.quantity / 1000
            else:
                # Same unit or unknown units - use as-is
                quantity_to_add = item.quantity
        
        # Update products table if it exists
        if product:
            prev_stock = product.get("current_stock", 0)
            new_stock = prev_stock + quantity_to_add
            await db.products.update_one({"id": item.product_id}, {"$set": {"current_stock": new_stock}})
            
            movement = InventoryMovement(
                product_id=item.product_id,
                product_name=item.product_name,
                sku=item.sku,
                movement_type="grn_add",
                quantity=quantity_to_add,  # Use converted quantity
                reference_type="grn",
                reference_id=grn.id,
                reference_number=grn_number,
                previous_stock=prev_stock,
                new_stock=new_stock,
                created_by=current_user["id"]
            )
            await db.inventory_movements.insert_one(movement.model_dump())
        
        # Update inventory_balances.on_hand (CRITICAL - ensures sync between Inventory and Stock Management pages)
        # Update using item_id_for_balance (which may be inventory_item.id or product.id)
        await db.inventory_balances.update_one(
            {"item_id": item_id_for_balance},
            {"$inc": {"on_hand": quantity_to_add}},  # Use converted quantity
            upsert=True
        )
        
        # ALSO update inventory_balances using product_id directly if different from item_id_for_balance
        # This ensures products.current_stock and inventory_balances are always in sync
        if product and item.product_id != item_id_for_balance:
            await db.inventory_balances.update_one(
                {"item_id": item.product_id},
                {"$inc": {"on_hand": quantity_to_add}},
                upsert=True
            )
        
        # If this item was procured as "Drummed", also update packaging material stock
        # Find matching PO line for this item
        matching_po_line = None
        for po_line in po_lines:
            if po_line.get("item_id") == item.product_id or po_line.get("item_id") == item_id_for_balance:
                matching_po_line = po_line
                break
        
        if matching_po_line and matching_po_line.get("procurement_type") == "Drummed":
            packaging_item_id = matching_po_line.get("packaging_item_id")
            packaging_qty = matching_po_line.get("packaging_qty", 0)
            
            if packaging_item_id and packaging_qty > 0:
                # Update packaging material stock
                packaging_balance = await db.inventory_balances.find_one({"item_id": packaging_item_id}, {"_id": 0})
                packaging_prev_stock = packaging_balance.get("on_hand", 0) if packaging_balance else 0
                packaging_new_stock = packaging_prev_stock + packaging_qty
                
                await db.inventory_balances.update_one(
                    {"item_id": packaging_item_id},
                    {"$inc": {"on_hand": packaging_qty}},
                    upsert=True
                )
                
                # Get packaging item details for movement record
                packaging_item = await db.inventory_items.find_one({"id": packaging_item_id}, {"_id": 0})
                packaging_name = packaging_item.get("name", "Packaging Material") if packaging_item else "Packaging Material"
                packaging_sku = packaging_item.get("sku", "-") if packaging_item else "-"
                
                # Create inventory movement for packaging material
                packaging_movement = InventoryMovement(
                    product_id=packaging_item_id,
                    product_name=packaging_name,
                    sku=packaging_sku,
                    movement_type="grn_add",
                    quantity=packaging_qty,
                    reference_type="grn",
                    reference_id=grn.id,
                    reference_number=grn_number,
                    previous_stock=packaging_prev_stock,
                    new_stock=packaging_new_stock,
                    created_by=current_user["id"]
                )
                await db.inventory_movements.insert_one(packaging_movement.model_dump())
    
    # Check if any jobs waiting for procurement now have sufficient stock
    # Check jobs with procurement status or jobs that need procurement
    jobs_waiting_procurement = await db.job_orders.find(
        {
            "$or": [
                {"status": "procurement"},
                {"procurement_required": True},
                {"procurement_status": "pending"},
                {"procurement_status": "in_progress"},
                {"status": {"$in": ["pending", "approved"]}, "procurement_required": True},
                {"material_shortages": {"$exists": True, "$ne": []}}
            ]
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Track which raw materials were received in this GRN
    received_product_ids = [item.product_id for item in data.items]
    
    for job in jobs_waiting_procurement:
        # Check if all materials are now available using inventory_balances
        all_materials_available = True
        all_raw_materials_available = True
        material_shortages = job.get("material_shortages", [])
        raw_material_received = False  # Track if any raw material from this job was received
        
        if not material_shortages:
            # If no shortages listed, check BOM requirements
            product_id = job.get("product_id")
            quantity = job.get("quantity", 0)
            packaging = job.get("packaging", "Bulk")
            # Use stored net_weight_kg from job order, only default if not provided and not Bulk
            net_weight_kg = job.get("net_weight_kg")
            if net_weight_kg is None and packaging != "Bulk":
                net_weight_kg = 200  # Default only when needed
            
            if product_id and quantity > 0:
                # Get product BOM
                product_bom = await db.product_boms.find_one({
                    "product_id": product_id,
                    "is_active": True
                }, {"_id": 0})
                
                if product_bom:
                    bom_items = await db.product_bom_items.find({
                        "bom_id": product_bom["id"]
                    }, {"_id": 0}).to_list(100)
                    
                    # Calculate total KG needed
                    if packaging != "Bulk":
                        total_kg = quantity * (net_weight_kg or 200)
                    else:
                        total_kg = quantity * 1000
                    
                    # Check each material
                    for bom_item in bom_items:
                        material_id = bom_item.get("material_item_id")
                        qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
                        required_qty = total_kg * qty_per_kg
                        item_type = bom_item.get("item_type", "RAW")
                        
                        # Check if this material was received in current GRN
                        if material_id in received_product_ids:
                            raw_material_received = True
                        
                        # Check inventory balance
                        balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                        on_hand = balance.get("on_hand", 0) if balance else 0
                        
                        reservations = await db.inventory_reservations.find({"item_id": material_id}, {"_id": 0}).to_list(1000)
                        reserved = sum(r.get("qty", 0) for r in reservations)
                        available = on_hand - reserved
                        
                        if available < required_qty:
                            all_materials_available = False
                            if item_type == "RAW":
                                all_raw_materials_available = False
                            break
        else:
            # Check each shortage
            for shortage in material_shortages:
                item_id = shortage.get("item_id")
                required_qty = shortage.get("required_qty", shortage.get("shortage", 0))
                item_type = shortage.get("item_type", "RAW")
                
                # Check if this material was received in current GRN
                if item_id in received_product_ids:
                    raw_material_received = True
                
                # Check inventory balance
                balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
                on_hand = balance.get("on_hand", 0) if balance else 0
                
                reservations = await db.inventory_reservations.find({"item_id": item_id}, {"_id": 0}).to_list(1000)
                reserved = sum(r.get("qty", 0) for r in reservations)
                available = on_hand - reserved
                
                if available < required_qty:
                    all_materials_available = False
                    if item_type == "RAW":
                        all_raw_materials_available = False
        
        # If all materials are now available, update job status
        # Check if job needs procurement update (either has shortages, procurement_required flag, procurement_status is pending/in_progress, or status is procurement)
        needs_procurement_update = (
            (material_shortages and len(material_shortages) > 0)
            or job.get("procurement_required", False)
            or job.get("procurement_status") in ["pending", "in_progress", "complete"]
            or job.get("status") == "procurement"
        )
        
        # Check if this is a trading product job
        # Trading products have shortages with item_type "TRADED"
        is_trading_product = False
        if material_shortages:
            # Check if all shortages are for trading products
            all_traded_shortages = all(s.get("item_type") == "TRADED" for s in material_shortages)
            if all_traded_shortages and len(material_shortages) > 0:
                is_trading_product = True
        else:
            # Check product type directly if no shortages listed
            product_id = job.get("product_id")
            if product_id:
                product = await db.products.find_one({"id": product_id}, {"_id": 0})
                if product and product.get("type") == "TRADED":
                    is_trading_product = True
        
        if all_materials_available and needs_procurement_update:
            # For trading products: set to ready_for_dispatch (no production needed)
            # For manufacturing products: set to pending (needs production scheduling)
            if is_trading_product:
                new_status = "ready_for_dispatch"
                notification_message = f"Trading product procured. Job {job.get('job_number')} ({job.get('product_name')}) is ready for dispatch."
                notification_link = "/transport-planner"
            else:
                new_status = "pending"
                notification_message = f"Materials procured. Job {job.get('job_number')} ({job.get('product_name')}) is ready for production scheduling."
                notification_link = "/production-schedule"
            
            # Update job status
            await db.job_orders.update_one(
                {"id": job["id"]},
                {"$set": {
                    "status": new_status,
                    "procurement_status": "complete",
                    "material_shortages": [],
                    "procurement_required": False
                }}
            )
            
            # Auto-route to transport if ready_for_dispatch
            if new_status == "ready_for_dispatch":
                await ensure_dispatch_routing(job["id"], job)
            
            # Notify about job ready
            await create_notification(
                event_type="JOB_READY",
                title=f"Job Ready: {job.get('job_number')}",
                message=notification_message,
                link=notification_link,
                ref_type="JOB",
                ref_id=job["id"],
                target_roles=["admin", "production"] if not is_trading_product else ["admin", "transport"],
                notification_type="success"
            )
        elif raw_material_received and all_raw_materials_available and not all_materials_available:
            # Raw materials now available, but packaging may still be missing
            # Notify that raw materials are available
            await create_notification(
                event_type="RAW_MATERIALS_AVAILABLE",
                title=f"Raw Materials Available: {job.get('job_number')}",
                message=f"Raw materials received for Job {job.get('job_number')} ({job.get('product_name')}). Checking packaging availability.",
                link="/production-schedule",
                ref_type="JOB",
                ref_id=job["id"],
                target_roles=["admin", "production"],
                notification_type="info"
            )
    
    # Phase 9: Create notification for GRN pending payables review
    await create_notification(
        event_type="GRN_PAYABLES_REVIEW",
        title=f"GRN Pending Review: {grn_number}",
        message=f"New GRN from {data.supplier} with {len(data.items)} items requires payables review",
        link="/grn",
        ref_type="GRN",
        ref_id=grn.id,
        target_roles=["admin", "finance"],
        notification_type="warning"
    )
    
    return grn

@api_router.get("/grn")
async def get_grns(current_user: dict = Depends(get_current_user)):
    grns = await db.grn.find({}, {"_id": 0}).sort("received_at", -1).to_list(1000)
    
    # Enrich GRNs with PO number and QC number if linked
    for grn in grns:
        if grn.get("po_id"):
            po = await db.purchase_orders.find_one({"id": grn["po_id"]}, {"_id": 0})
            if po:
                grn["po_number"] = po.get("po_number")
        
        # Enrich with QC number if linked
        if grn.get("qc_inspection_id"):
            qc_inspection = await db.qc_inspections.find_one({"id": grn["qc_inspection_id"]}, {"_id": 0})
            if qc_inspection:
                grn["qc_number"] = qc_inspection.get("qc_number")
    
    return grns

# ==================== PHASE 9: GRN PAYABLES REVIEW ====================

@api_router.get("/grn/pending-payables")
async def get_grns_pending_payables(current_user: dict = Depends(get_current_user)):
    """Get GRNs pending payables review with PO details and calculated amounts"""
    grns = await db.grn.find(
        {"review_status": {"$in": ["PENDING_PAYABLES", None]}},
        {"_id": 0}
    ).sort("received_at", -1).to_list(1000)
    
    # Enrich GRNs with PO details and calculate amounts
    for grn in grns:
        # Get PO if linked
        if grn.get("po_id"):
            po = await db.purchase_orders.find_one({"id": grn["po_id"]}, {"_id": 0})
            if po:
                grn["po_number"] = po.get("po_number")
                grn["po_currency"] = po.get("currency", "USD")
                grn["po_total_amount"] = po.get("total_amount", 0)
                
                # Get PO lines to calculate amount for GRN items
                po_lines = await db.purchase_order_lines.find({"po_id": grn["po_id"]}, {"_id": 0}).to_list(1000)
                
                # Calculate amount based on GRN items received
                total_amount = 0
                for grn_item in grn.get("items", []):
                    # Find matching PO line by item_id
                    for po_line in po_lines:
                        if po_line.get("item_id") == grn_item.get("product_id"):
                            unit_price = po_line.get("unit_price", 0)
                            quantity = grn_item.get("quantity", 0)
                            total_amount += unit_price * quantity
                            break
                
                grn["calculated_amount"] = total_amount
                grn["currency"] = po.get("currency", "USD")
            else:
                grn["calculated_amount"] = 0
                grn["currency"] = "USD"
        else:
            grn["calculated_amount"] = 0
            grn["currency"] = "USD"
        
        # Enrich with QC number if linked
        if grn.get("qc_inspection_id"):
            qc_inspection = await db.qc_inspections.find_one({"id": grn["qc_inspection_id"]}, {"_id": 0})
            if qc_inspection:
                grn["qc_number"] = qc_inspection.get("qc_number")
    
    return grns

@api_router.put("/grn/{grn_id}/payables-approve")
async def payables_approve_grn(grn_id: str, notes: str = "", current_user: dict = Depends(get_current_user)):
    """Payables approves a GRN for AP posting"""
    if not has_permission(current_user, required_roles=["admin", "finance"], required_page="/grn"):
        raise HTTPException(status_code=403, detail="Only admin/finance can approve GRN for payables")
    
    grn = await db.grn.find_one({"id": grn_id}, {"_id": 0})
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    
    await db.grn.update_one(
        {"id": grn_id},
        {"$set": {
            "review_status": "APPROVED",
            "reviewed_by": current_user["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "review_notes": notes
        }}
    )
    
    return {"success": True, "message": "GRN approved for payables"}

@api_router.put("/grn/{grn_id}/payables-hold")
async def payables_hold_grn(grn_id: str, reason: str = "", current_user: dict = Depends(get_current_user)):
    """Payables puts a GRN on hold"""
    if not has_permission(current_user, required_roles=["admin", "finance"], required_page="/grn"):
        raise HTTPException(status_code=403, detail="Only admin/finance can hold GRN")
    
    await db.grn.update_one(
        {"id": grn_id},
        {"$set": {
            "review_status": "HOLD",
            "reviewed_by": current_user["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "review_notes": reason
        }}
    )
    
    return {"success": True, "message": "GRN put on hold"}

@api_router.put("/grn/{grn_id}/payables-reject")
async def payables_reject_grn(grn_id: str, reason: str = "", current_user: dict = Depends(get_current_user)):
    """Payables rejects a GRN"""
    if not has_permission(current_user, required_roles=["admin", "finance"], required_page="/grn"):
        raise HTTPException(status_code=403, detail="Only admin/finance can reject GRN")
    
    await db.grn.update_one(
        {"id": grn_id},
        {"$set": {
            "review_status": "REJECTED",
            "reviewed_by": current_user["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "review_notes": reason
        }}
    )
    
    return {"success": True, "message": "GRN rejected by payables"}

@api_router.get("/grn/production")
async def get_production_completed_jobs(current_user: dict = Depends(get_current_user)):
    """Get jobs with Production_Completed status ready for GRN"""
    jobs = await db.job_orders.find(
        {"status": "Production_Completed"},
        {"_id": 0}
    ).sort("production_end", -1).to_list(1000)
    
    # Enrich with product details
    for job in jobs:
        product = await db.products.find_one({"id": job.get("product_id")}, {"_id": 0})
        if product:
            job["product_current_stock"] = product.get("current_stock", 0)
    
    return jobs

# ==================== DELIVERY ORDER ROUTES ====================

@api_router.post("/delivery-orders", response_model=DeliveryOrder)
async def create_delivery_order(data: DeliveryOrderCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "security"], required_page="/delivery-orders"):
        raise HTTPException(status_code=403, detail="Only security can create delivery orders")
    
    # Validate that all vehicle-related fields are filled
    missing_fields = []
    if not data.vehicle_type or not data.vehicle_type.strip():
        missing_fields.append("vehicle_type")
    if not data.vehicle_number or not data.vehicle_number.strip():
        missing_fields.append("vehicle_number")
    if not data.driver_name or not data.driver_name.strip():
        missing_fields.append("driver_name")
    
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"All vehicle-related fields must be filled. Missing: {', '.join(missing_fields)}"
        )
    
    job = await db.job_orders.find_one({"id": data.job_order_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # #region agent log
    import json
    with open(r'c:\ERPemergent\.cursor\debug.log', 'a') as f: f.write(json.dumps({"location":"server.py:2481","message":"DO creation - job order fetched","data":{"job_number":job.get("job_number"),"product_id":job.get("product_id"),"quantity":job.get("quantity"),"unit":job.get("unit"),"packaging":job.get("packaging")},"timestamp":datetime.now(timezone.utc).timestamp()*1000,"sessionId":"debug-session","runId":"initial","hypothesisId":"D,E,H"})+'\n')
    # #endregion
    
    do_number = await generate_sequence("DO", "delivery_orders")
    delivery_order = DeliveryOrder(
        **data.model_dump(),
        do_number=do_number,
        job_number=job["job_number"],
        product_name=job["product_name"],
        quantity=job["quantity"],
        issued_by=current_user["id"]
    )
    await db.delivery_orders.insert_one(delivery_order.model_dump())
    
    # Update job status
    await db.job_orders.update_one({"id": data.job_order_id}, {"$set": {"status": "dispatched"}})
    
    # Update inventory - DEDUCT (for finished product)
    # Validate that job has product_id
    if not job.get("product_id"):
        # #region agent log
        with open(r'c:\ERPemergent\.cursor\debug.log', 'a') as f: f.write(json.dumps({"location":"server.py:2501","message":"DO creation - product_id missing","data":{"job_number":job.get("job_number")},"timestamp":datetime.now(timezone.utc).timestamp()*1000,"sessionId":"debug-session","runId":"initial","hypothesisId":"D"})+'\n')
        # #endregion
        raise HTTPException(
            status_code=400, 
            detail=f"Job order {job.get('job_number', 'unknown')} is missing product_id. Cannot deduct stock."
        )
    
    product = await db.products.find_one({"id": job["product_id"]}, {"_id": 0})
    if not product:
        # #region agent log
        with open(r'c:\ERPemergent\.cursor\debug.log', 'a') as f: f.write(json.dumps({"location":"server.py:2507","message":"DO creation - product not found","data":{"product_id":job["product_id"],"job_number":job.get("job_number")},"timestamp":datetime.now(timezone.utc).timestamp()*1000,"sessionId":"debug-session","runId":"initial","hypothesisId":"D"})+'\n')
        # #endregion
        # Raise exception instead of silently failing - this ensures stock deduction always happens
        raise HTTPException(
            status_code=404, 
            detail=f"Product {job['product_id']} not found. Cannot deduct stock for delivery order {do_number}. Please ensure the product exists in the system."
        )
    
    # #region agent log
    with open(r'c:\ERPemergent\.cursor\debug.log', 'a') as f: f.write(json.dumps({"location":"server.py:2516","message":"DO creation - product found","data":{"product_id":product.get("id"),"product_name":product.get("name"),"current_stock":product.get("current_stock"),"unit":product.get("unit")},"timestamp":datetime.now(timezone.utc).timestamp()*1000,"sessionId":"debug-session","runId":"initial","hypothesisId":"D,E"})+'\n')
    # #endregion
    
    # Use .get() with default to handle missing current_stock field safely
    prev_stock = product.get("current_stock", 0)
    new_stock = max(0, prev_stock - job["quantity"])
    
    # #region agent log
    with open(r'c:\ERPemergent\.cursor\debug.log', 'a') as f: f.write(json.dumps({"location":"server.py:2518","message":"DO creation - stock calculation","data":{"prev_stock":prev_stock,"job_quantity":job["quantity"],"new_stock":new_stock,"deduction_amount":job["quantity"]},"timestamp":datetime.now(timezone.utc).timestamp()*1000,"sessionId":"debug-session","runId":"initial","hypothesisId":"E,H"})+'\n')
    # #endregion
    
    # Update products collection
    products_result = await db.products.update_one({"id": job["product_id"]}, {"$set": {"current_stock": new_stock}})
    
    # #region agent log
    with open(r'c:\ERPemergent\.cursor\debug.log', 'a') as f: f.write(json.dumps({"location":"server.py:2520","message":"DO creation - products update result","data":{"matched_count":products_result.matched_count,"modified_count":products_result.modified_count},"timestamp":datetime.now(timezone.utc).timestamp()*1000,"sessionId":"debug-session","runId":"initial","hypothesisId":"F"})+'\n')
    # #endregion
    
    # ALSO update inventory_balances (CRITICAL - ensures sync with Inventory page)
    balances_result = await db.inventory_balances.update_one(
        {"item_id": job["product_id"]},
        {"$inc": {"on_hand": -job["quantity"]}},
        upsert=True
    )
    
    # #region agent log
    with open(r'c:\ERPemergent\.cursor\debug.log', 'a') as f: f.write(json.dumps({"location":"server.py:2527","message":"DO creation - inventory_balances update result","data":{"matched_count":balances_result.matched_count,"modified_count":balances_result.modified_count,"upserted_id":str(balances_result.upserted_id) if balances_result.upserted_id else None},"timestamp":datetime.now(timezone.utc).timestamp()*1000,"sessionId":"debug-session","runId":"initial","hypothesisId":"F"})+'\n')
    # #endregion
    
    # Create inventory movement record
    movement = InventoryMovement(
        product_id=job["product_id"],
        product_name=job.get("product_name", "Unknown"),
        sku=product.get("sku", ""),
        movement_type="do_deduct",
        quantity=job["quantity"],
        reference_type="delivery_order",
        reference_id=delivery_order.id,
        reference_number=do_number,
        previous_stock=prev_stock,
        new_stock=new_stock,
        created_by=current_user["id"]
    )
    await db.inventory_movements.insert_one(movement.model_dump())
    
    # Reduce packaging stock when delivery order is created
    packaging = job.get("packaging", "Bulk")
    if packaging and packaging != "Bulk":
        try:
            from math import ceil
            # Get packaging item ID
            packaging_item_id = await find_or_create_packaging_item(packaging)
            
            if packaging_item_id:
                # Calculate packaging quantity needed (same logic as job order creation)
                net_weight_kg = job.get("net_weight_kg", 200)
                quantity = job.get("quantity", 0)
                finished_kg = quantity * net_weight_kg
                
                # Calculate required packaging quantity
                packaging_qty = 0
                packaging_lower = packaging.lower()
                
                if "drum" in packaging_lower:
                    # Use net_weight_kg from job order
                    net_weight_per_drum = net_weight_kg
                    packaging_qty = max(1, ceil(finished_kg / net_weight_per_drum))
                elif "ibc" in packaging_lower:
                    net_weight_per_ibc = 1000 * 0.85
                    packaging_qty = max(1, ceil(finished_kg / net_weight_per_ibc))
                elif "flexi" in packaging_lower or "flexitank" in packaging_lower:
                    packaging_qty = 1
                else:
                    packaging_qty = max(1, ceil(finished_kg / net_weight_kg))
                
                # Reduce packaging stock
                packaging_balance = await db.inventory_balances.find_one({"item_id": packaging_item_id}, {"_id": 0})
                packaging_prev_stock = packaging_balance.get("on_hand", 0) if packaging_balance else 0
                packaging_new_stock = max(0, packaging_prev_stock - packaging_qty)
                
                # Update inventory_balances for packaging
                await db.inventory_balances.update_one(
                    {"item_id": packaging_item_id},
                    {"$inc": {"on_hand": -packaging_qty}},
                    upsert=True
                )
                
                # Create inventory movement for packaging
                packaging_item = await db.inventory_items.find_one({"id": packaging_item_id}, {"_id": 0})
                if packaging_item:
                    packaging_movement = InventoryMovement(
                        product_id=packaging_item_id,
                        product_name=packaging_item.get("name", packaging),
                        sku=packaging_item.get("sku", ""),
                        movement_type="do_packaging_deduct",
                        quantity=packaging_qty,
                        reference_type="delivery_order",
                        reference_id=delivery_order.id,
                        reference_number=do_number,
                        previous_stock=packaging_prev_stock,
                        new_stock=packaging_new_stock,
                        created_by=current_user["id"]
                    )
                    await db.inventory_movements.insert_one(packaging_movement.model_dump())
        except Exception as e:
            # Log error but don't fail delivery order creation
            print(f"Error reducing packaging stock for delivery order {do_number}: {str(e)}")
    
    # Auto-generate invoice from delivery order
    await auto_generate_invoice_from_do(delivery_order.id, do_number, job, current_user)
    
    return delivery_order

@api_router.get("/delivery-orders", response_model=List[DeliveryOrder])
async def get_delivery_orders(current_user: dict = Depends(get_current_user)):
    orders = await db.delivery_orders.find({}, {"_id": 0}).sort("issued_at", -1).to_list(1000)
    
    # Enrich delivery orders with vehicle data from transport_outward if missing
    for order in orders:
        # If vehicle fields are missing/empty, try to get from related transport
        if not order.get("vehicle_type") or not order.get("vehicle_number") or not order.get("driver_name"):
            job_order_id = order.get("job_order_id")
            if job_order_id:
                transport = await db.transport_outward.find_one(
                    {"job_order_id": job_order_id},
                    {"_id": 0, "vehicle_type": 1, "vehicle_number": 1, "driver_name": 1}
                )
                if transport:
                    # Only fill in missing fields, don't overwrite existing ones
                    if not order.get("vehicle_type") and transport.get("vehicle_type"):
                        order["vehicle_type"] = transport.get("vehicle_type")
                    if not order.get("vehicle_number") and transport.get("vehicle_number"):
                        order["vehicle_number"] = transport.get("vehicle_number")
                    if not order.get("driver_name") and transport.get("driver_name"):
                        order["driver_name"] = transport.get("driver_name")
    
    return orders

@api_router.post("/delivery-orders/from-security")
async def create_do_from_security(
    job_order_id: str = Body(...),
    batch_number: str = Body(...),
    exit_empty_weight: float = Body(...),
    exit_gross_weight: float = Body(...),
    exit_net_weight: float = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """Create delivery order from security QC with exit weighment and stock reduction"""
    if not has_permission(current_user, required_roles=["admin", "security", "qc"], required_page="/security-qc"):
        raise HTTPException(status_code=403, detail="Only security/QC can issue delivery orders")
    
    # Get job order
    job = await db.job_orders.find_one({"id": job_order_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Get transport outward for vehicle details
    transport = await db.transport_outward.find_one({"job_order_id": job_order_id}, {"_id": 0})
    
    # Get security checklist for additional details
    checklist = await db.security_checklists.find_one({
        "ref_type": "OUTWARD",
        "ref_id": transport["id"] if transport else job_order_id
    }, {"_id": 0})
    
    # Generate DO number
    do_number = await generate_sequence("DO", "delivery_orders")
    
    # Create delivery order with exit weighment
    delivery_order = {
        "id": str(uuid.uuid4()),
        "do_number": do_number,
        "job_order_id": job_order_id,
        "job_number": job.get("job_number"),
        "product_name": job.get("product_name"),
        "quantity": job.get("quantity"),
        "batch_number": batch_number,
        "exit_empty_weight": exit_empty_weight,
        "exit_gross_weight": exit_gross_weight,
        "exit_net_weight": exit_net_weight,
        "vehicle_type": transport.get("vehicle_type") if transport else checklist.get("vehicle_type") if checklist else "Unknown",
        "vehicle_number": checklist.get("vehicle_number") if checklist else transport.get("vehicle_number") if transport else "Unknown",
        "driver_name": checklist.get("driver_name") if checklist else transport.get("driver_name") if transport else "Unknown",
        "issued_by": current_user["id"],
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.delivery_orders.insert_one(delivery_order)
    
    # Remove MongoDB's _id field for JSON serialization
    delivery_order.pop("_id", None)
    
    # Update job status
    await db.job_orders.update_one({"id": job_order_id}, {"$set": {"status": "dispatched"}})
    
    # Update transport outward if exists
    if transport:
        await db.transport_outward.update_one(
            {"id": transport["id"]},
            {"$set": {
                "do_number": do_number,
                "do_created": True,
                "status": "DISPATCHED"
            }}
        )
    
    # Stock reduction based on packaging type - Comprehensive solution for all packaging types
    packaging = job.get("packaging", "Bulk")
    packaging_type = job.get("packaging_type", "BULK")
    product_id = job.get("product_id")
    
    if not product_id:
        raise HTTPException(status_code=400, detail="Job order missing product_id")
    
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    quantity = job.get("quantity", 0)
    prev_stock = product.get("current_stock", 0)
    
    # Normalize packaging type for comparison
    packaging_lower = packaging.lower() if packaging else "bulk"
    packaging_type_upper = packaging_type.upper() if packaging_type else "BULK"
    
    # Determine if this is unit-based packaging or bulk/flexi
    is_unit_based = any(keyword in packaging_lower for keyword in [
        "drum", "carton", "pail", "ibc", "bag", "box"
    ]) or packaging_type_upper in ["DRUMS", "CARTON", "PAIL", "IBC"]
    
    is_flexi_bulk = any(keyword in packaging_lower for keyword in [
        "flexi", "iso", "tank"
    ]) or packaging_type_upper in ["FLEXI", "ISO", "FLEXITANK"]
    
    if packaging_type_upper == "BULK" or (packaging_lower == "bulk" and not is_unit_based and not is_flexi_bulk):
        # ========== CASE 1: BULK (No packaging) ==========
        # For bulk, quantity is in MT, no packaging reduction
        new_stock = max(0, prev_stock - quantity)
        
        await db.products.update_one(
            {"id": product_id},
            {"$set": {"current_stock": new_stock}}
        )
        
        await db.inventory_balances.update_one(
            {"item_id": product_id},
            {"$inc": {"on_hand": -quantity}},
            upsert=True
        )
        
        # Create inventory movement
        movement = InventoryMovement(
            product_id=product_id,
            product_name=job.get("product_name", "Unknown"),
            sku=product.get("sku", ""),
            movement_type="do_deduct",
            quantity=quantity,
            reference_type="delivery_order",
            reference_id=delivery_order["id"],
            reference_number=do_number,
            previous_stock=prev_stock,
            new_stock=new_stock,
            created_by=current_user["id"]
        )
        await db.inventory_movements.insert_one(movement.model_dump())
        
    elif is_flexi_bulk:
        # ========== CASE 2: FLEXI BAGS / ISO TANKS ==========
        # quantity = number of flexi bags/tanks
        # product is measured in MT (from job.get("total_weight_mt") or calculated)
        
        # Get the total MT from job order
        total_product_mt = job.get("total_weight_mt") or job.get("weight_mt", 0)
        
        # If not available, calculate from quantity and net weight
        if not total_product_mt:
            net_weight_kg = job.get("net_weight_kg", 20000)  # Default 20 MT per flexi bag
            total_product_mt = (quantity * net_weight_kg) / 1000
        
        # Reduce product stock in MT
        new_stock = max(0, prev_stock - total_product_mt)
        await db.products.update_one(
            {"id": product_id},
            {"$set": {"current_stock": new_stock}}
        )
        
        await db.inventory_balances.update_one(
            {"item_id": product_id},
            {"$inc": {"on_hand": -total_product_mt}},
            upsert=True
        )
        
        # Create product movement
        movement = InventoryMovement(
            product_id=product_id,
            product_name=job.get("product_name", "Unknown"),
            sku=product.get("sku", ""),
            movement_type="do_deduct",
            quantity=total_product_mt,
            reference_type="delivery_order",
            reference_id=delivery_order["id"],
            reference_number=do_number,
            previous_stock=prev_stock,
            new_stock=new_stock,
            created_by=current_user["id"]
        )
        await db.inventory_movements.insert_one(movement.model_dump())
        
        # Reduce packaging stock (flexi bags/ISO tanks)
        if packaging and packaging.lower() != "bulk":
            packaging_item_id = await find_or_create_packaging_item(packaging)
            if packaging_item_id:
                await db.inventory_balances.update_one(
                    {"item_id": packaging_item_id},
                    {"$inc": {"on_hand": -quantity}},  # Reduce by number of flexi bags
                    upsert=True
                )
    
    elif is_unit_based:
        # ========== CASE 3: UNIT-BASED PACKAGING (Drums, Cartons, Pails, IBCs, etc.) ==========
        # quantity = number of units (drums/cartons/pails/IBCs)
        
        # Get net weight per unit
        net_weight_kg = job.get("net_weight_kg", 200)  # Default 200 kg per unit
        
        # Special defaults for different packaging types
        if "ibc" in packaging_lower:
            net_weight_kg = job.get("net_weight_kg", 850)  # 850 kg default for IBC
        elif "pail" in packaging_lower:
            net_weight_kg = job.get("net_weight_kg", 20)  # 20 kg default for pail
        elif "carton" in packaging_lower:
            net_weight_kg = job.get("net_weight_kg", 25)  # 25 kg default for carton
        
        # Calculate total product in MT
        total_product_kg = quantity * net_weight_kg
        total_product_mt = total_product_kg / 1000
        
        # Reduce product stock in MT
        new_stock = max(0, prev_stock - total_product_mt)
        await db.products.update_one(
            {"id": product_id},
            {"$set": {"current_stock": new_stock}}
        )
        
        await db.inventory_balances.update_one(
            {"item_id": product_id},
            {"$inc": {"on_hand": -total_product_mt}},
            upsert=True
        )
        
        # Create product movement
        movement = InventoryMovement(
            product_id=product_id,
            product_name=job.get("product_name", "Unknown"),
            sku=product.get("sku", ""),
            movement_type="do_deduct",
            quantity=total_product_mt,
            reference_type="delivery_order",
            reference_id=delivery_order["id"],
            reference_number=do_number,
            previous_stock=prev_stock,
            new_stock=new_stock,
            created_by=current_user["id"]
        )
        await db.inventory_movements.insert_one(movement.model_dump())
        
        # Reduce packaging stock (drums/cartons/pails/IBCs)
        if packaging and packaging.lower() != "bulk":
            packaging_item_id = await find_or_create_packaging_item(packaging)
            if packaging_item_id:
                await db.inventory_balances.update_one(
                    {"item_id": packaging_item_id},
                    {"$inc": {"on_hand": -quantity}},  # Reduce by number of units
                    upsert=True
                )
    
    else:
        # ========== FALLBACK: Treat as BULK ==========
        # If packaging type cannot be determined, default to bulk behavior
        new_stock = max(0, prev_stock - quantity)
        
        await db.products.update_one(
            {"id": product_id},
            {"$set": {"current_stock": new_stock}}
        )
        
        await db.inventory_balances.update_one(
            {"item_id": product_id},
            {"$inc": {"on_hand": -quantity}},
            upsert=True
        )
        
        movement = InventoryMovement(
            product_id=product_id,
            product_name=job.get("product_name", "Unknown"),
            sku=product.get("sku", ""),
            movement_type="do_deduct",
            quantity=quantity,
            reference_type="delivery_order",
            reference_id=delivery_order["id"],
            reference_number=do_number,
            previous_stock=prev_stock,
            new_stock=new_stock,
            created_by=current_user["id"]
        )
        await db.inventory_movements.insert_one(movement.model_dump())
    
    # Notify receivables
    await create_notification(
        event_type="DO_ISSUED",
        title=f"Delivery Order Issued: {do_number}",
        message=f"DO {do_number} issued for {job.get('job_number')}. Ready for invoicing.",
        link="/delivery-orders",
        ref_type="DELIVERY_ORDER",
        ref_id=delivery_order["id"],
        target_roles=["finance", "receivables"],
        notification_type="success"
    )
    
    return {"success": True, "do_number": do_number, "delivery_order": delivery_order}

# ==================== SHIPPING ROUTES ====================

async def auto_create_transport_from_cro(booking_id: str, cro_data, booking_dict: dict, job_numbers: list, customer_name: str, current_user_id: str):
    """Helper function to create transport schedules and dispatch schedules from CRO data"""
    existing_schedule = await db.transport_schedules.find_one({"shipping_booking_id": booking_id})
    
    if existing_schedule:
        # Fix existing transport_outward records that might be missing job_order_id
        job_order_ids = booking_dict.get("job_order_ids", [])
        primary_job_id = job_order_ids[0] if job_order_ids and len(job_order_ids) > 0 else None
        
        if primary_job_id:
            # Update transport_outward records for this booking if they're missing job_order_id
            await db.transport_outward.update_many(
                {"shipping_booking_id": booking_id, "job_order_id": None},
                {"$set": {"job_order_id": primary_job_id}}
            )
        
        return existing_schedule  # Already created
    
    # Get product names from jobs
    product_names = []
    for job_id in booking_dict.get("job_order_ids", []):
        job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
        if job:
            if job.get("product_name"):
                product_names.append(job["product_name"])
            elif job.get("items") and len(job["items"]) > 0:
                product_name_list = [
                    item.get("product_name") 
                    for item in job["items"] 
                    if item.get("product_name")
                ]
                if product_name_list:
                    product_names.extend(product_name_list)
    
    # Extract CRO data - handle both Pydantic models and dicts
    if hasattr(cro_data, 'cutoff_date'):
        cutoff_date_str = cro_data.cutoff_date
        cro_number = cro_data.cro_number
        vessel_name = cro_data.vessel_name
        vessel_date = cro_data.vessel_date
    else:
        cutoff_date_str = cro_data.get('cutoff_date', '')
        cro_number = cro_data.get('cro_number', '')
        vessel_name = cro_data.get('vessel_name', '')
        vessel_date = cro_data.get('vessel_date', '')
    
    # Create transport schedule
    schedule_number = await generate_sequence("TRN", "transport_schedules")
    try:
        date_str = cutoff_date_str.split('T')[0] if 'T' in cutoff_date_str else cutoff_date_str
        pickup_date = (datetime.fromisoformat(date_str) - timedelta(days=3)).strftime("%Y-%m-%d")
    except (ValueError, AttributeError) as e:
        logging.error(f"Failed to parse cutoff_date for transport schedule: {e}")
        return None
    
    transport_schedule = TransportSchedule(
        shipping_booking_id=booking_id,
        transporter=None,
        vehicle_type="Container Chassis",
        pickup_date=pickup_date,
        pickup_location="Factory",
        schedule_number=schedule_number,
        booking_number=booking_dict.get("booking_number", ""),
        cro_number=cro_number,
        vessel_name=vessel_name,
        vessel_date=vessel_date,
        cutoff_date=cutoff_date_str,
        container_type=booking_dict.get("container_type", "20ft"),
        container_count=booking_dict.get("container_count", 1),
        port_of_loading=booking_dict.get("port_of_loading", ""),
        job_numbers=job_numbers,
        product_names=product_names,
        auto_generated=True,
        created_by=current_user_id
    )
    await db.transport_schedules.insert_one(transport_schedule.model_dump())
    
    # Create dispatch schedule for security
    dispatch_schedule = DispatchSchedule(
        transport_schedule_id=transport_schedule.id,
        schedule_number=schedule_number,
        booking_number=booking_dict.get("booking_number", ""),
        job_numbers=job_numbers,
        product_names=product_names,
        container_type=booking_dict.get("container_type", "20ft"),
        container_count=booking_dict.get("container_count", 1),
        pickup_date=pickup_date,
        expected_arrival=pickup_date,
        vessel_date=vessel_date or "",
        cutoff_date=cutoff_date_str
    )
    await db.dispatch_schedules.insert_one(dispatch_schedule.model_dump())
    
    # Update booking status
    await db.shipping_bookings.update_one({"id": booking_id}, {"$set": {"status": "transport_scheduled"}})
    
    # Create transport_outward record for Transport Window
    transport_out_number = await generate_sequence("TOUT", "transport_outward")
    
    # Get job_order_ids from booking
    job_order_ids = booking_dict.get("job_order_ids", [])
    # If single job, use first job_order_id for job_order_id field
    primary_job_id = job_order_ids[0] if job_order_ids and len(job_order_ids) > 0 else None
    
    transport_outward = {
        "id": str(uuid.uuid4()),
        "transport_number": transport_out_number,
        "shipping_booking_id": booking_id,
        "booking_number": booking_dict.get("booking_number", ""),
        "cro_number": cro_number,
        "job_numbers": job_numbers,
        "job_order_id": primary_job_id,  # Add job_order_id for frontend matching
        "customer_name": customer_name,
        "transport_type": "CONTAINER",
        "container_number": None,
        "container_type": booking_dict.get("container_type", "20ft"),
        "destination": booking_dict.get("port_of_discharge", ""),
        "dispatch_date": None,
        "delivery_date": None,
        "status": "PENDING",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.transport_outward.insert_one(transport_outward)
    
    return transport_schedule

@api_router.post("/shipping-bookings", response_model=ShippingBooking)
async def create_shipping_booking(data: ShippingBookingCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "shipping"], required_page="/shipping"):
        raise HTTPException(status_code=403, detail="Only shipping can create bookings")
    
    # ========== VALIDATION: Check for duplicate PO bookings ==========
    if data.po_ids and len(data.po_ids) > 0:
        for po_id in data.po_ids:
            # Verify PO exists
            po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
            if not po:
                raise HTTPException(status_code=404, detail=f"Purchase Order {po_id} not found")
            
            # Verify PO is APPROVED
            if po.get("status") != "APPROVED":
                po_number = po.get("po_number", po_id)
                raise HTTPException(
                    status_code=400,
                    detail=f"PO {po_number} is not APPROVED. Current status: {po.get('status')}. Only APPROVED POs can have shipping bookings."
                )
            
            # Check if PO already has an active booking
            po_number = po.get("po_number", "")
            # Build query conditions
            query_conditions = [
                {"po_id": po_id},
                {"po_ids": {"$in": [po_id]}}  # Check if po_id is in the po_ids array
            ]
            # Only add po_number check if po_number exists and is not empty
            if po_number:
                query_conditions.append({"po_number": po_number})
            
            existing_booking = await db.shipping_bookings.find_one({
                "$or": query_conditions,
                "status": {"$nin": ["cancelled", "deleted"]}  # Exclude cancelled bookings
            }, {"_id": 0, "booking_number": 1, "id": 1, "status": 1, "po_id": 1, "po_ids": 1, "po_number": 1})
            
            if existing_booking:
                po_number = po.get("po_number", po_id)
                existing_booking_num = existing_booking.get("booking_number", existing_booking.get("id", "Unknown"))
                existing_status = existing_booking.get("status", "unknown")
                # Determine which field matched
                matched_field = "unknown"
                if existing_booking.get("po_id") == po_id:
                    matched_field = "po_id"
                elif existing_booking.get("po_ids") and po_id in existing_booking.get("po_ids", []):
                    matched_field = "po_ids array"
                elif existing_booking.get("po_number") == po_number:
                    matched_field = "po_number"
                
                raise HTTPException(
                    status_code=400,
                    detail=f"PO {po_number} (ID: {po_id}) already has an active shipping booking: {existing_booking_num} (status: {existing_status}, matched by: {matched_field}). Please use the existing booking or cancel it first."
                )
    
    # ========== VALIDATION: Check for duplicate job order bookings ==========
    if data.job_order_ids and len(data.job_order_ids) > 0:
        for job_id in data.job_order_ids:
            # Verify job order exists
            job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
            if not job:
                raise HTTPException(status_code=404, detail=f"Job Order {job_id} not found")
            
            # Check if job order already has an active booking
            existing_booking = await db.shipping_bookings.find_one({
                "job_order_ids": job_id,
                "status": {"$nin": ["cancelled", "deleted"]}  # Exclude cancelled bookings
            }, {"_id": 0, "booking_number": 1, "id": 1, "status": 1})
            
            if existing_booking:
                job_number = job.get("job_number", job_id)
                existing_booking_num = existing_booking.get("booking_number", existing_booking.get("id", "Unknown"))
                existing_status = existing_booking.get("status", "unknown")
                raise HTTPException(
                    status_code=400,
                    detail=f"Job Order {job_number} already has an active shipping booking: {existing_booking_num} (status: {existing_status}). Please use the existing booking or cancel it first."
                )
    
    booking_number = await generate_sequence("SHP", "shipping_bookings")
    booking_data = data.model_dump()
    
    # Detect PO import bookings (when po_ids is provided and job_order_ids is empty)
    is_po_import = len(data.po_ids) > 0 and len(data.job_order_ids) == 0
    
    if is_po_import:
        # Set ref_type for PO imports
        booking_data["ref_type"] = "PO_IMPORT"
        # Get first PO ID (for backward compatibility with po_id field)
        if data.po_ids and len(data.po_ids) > 0:
            booking_data["po_id"] = data.po_ids[0]
            # Enrich with PO details
            po = await db.purchase_orders.find_one({"id": data.po_ids[0]}, {"_id": 0})
            if po:
                booking_data["po_number"] = po.get("po_number", "")
                booking_data["supplier_name"] = po.get("supplier_name", "")
                booking_data["incoterm"] = po.get("incoterm", "FOB")
    
    # Determine status based on whether CRO is provided upfront (FOB customer booking)
    is_customer_booking = data.booking_source == "CUSTOMER" or (data.cro_number and data.cutoff_date)
    
    if is_customer_booking and data.cro_number and data.cutoff_date:
        # Customer provided CRO upfront (FOB) - set status to cro_received
        booking_data["status"] = "cro_received"
        # Calculate pickup date (3 days before cutoff)
        try:
            date_str = data.cutoff_date.split('T')[0] if 'T' in data.cutoff_date else data.cutoff_date
            cutoff = datetime.fromisoformat(date_str)
            pickup = cutoff - timedelta(days=3)
            booking_data["pickup_date"] = pickup.strftime("%Y-%m-%d")
        except (ValueError, AttributeError):
            pass
    else:
        # Seller booking (CFR/CIF) - pending until CRO received
        booking_data["status"] = "pending"
    
    booking = ShippingBooking(**booking_data, booking_number=booking_number, created_by=current_user["id"])
    booking_dict = booking.model_dump()
    await db.shipping_bookings.insert_one(booking_dict)
    
    # For PO imports with CRO already provided, create import record immediately
    if is_po_import and data.cro_number:
        po_id = data.po_ids[0] if data.po_ids else None
        if po_id:
            # Check if import record already exists
            existing_import = await db.imports.find_one({"po_id": po_id}, {"_id": 0})
            if not existing_import:
                import_number = await generate_sequence("IMP", "imports")
                po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
                checklist_list = get_default_import_checklist()
                incoterm = booking_data.get("incoterm") or (po.get("incoterm", "FOB") if po else "FOB")
                
                import_record = {
                    "id": str(uuid.uuid4()),
                    "import_number": import_number,
                    "po_id": po_id,
                    "po_number": po.get("po_number", "") if po else booking_data.get("po_number", ""),
                    "supplier_name": booking_data.get("supplier_name", "") or (po.get("supplier_name", "") if po else ""),
                    "incoterm": incoterm,
                    "status": "PENDING_DOCS",
                    "shipping_booking_id": booking.id,
                    "document_checklist": checklist_list,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.imports.insert_one(import_record)
    
    # Update job orders with shipping booking reference and clear awaiting status
    for job_id in data.job_order_ids:
        await db.job_orders.update_one(
            {"id": job_id},
            {
                "$set": {
                    "shipping_booking_id": booking.id,
                    "shipping_booking_status": None,
                    "shipping_booking_required": False
                }
            }
        )
    
    # Get job order details for notification
    job_numbers = []
    customer_name = "Customer"
    incoterm = None
    for job_id in data.job_order_ids:
        job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
        if job:
            job_numbers.append(job.get("job_number", ""))
            if not incoterm:
                incoterm = job.get("incoterm", "").upper()
            # Get customer name from sales order
            if not customer_name or customer_name == "Customer":
                so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
                if so:
                    customer_name = so.get("customer_name", "Customer")
    
    # Save incoterm to booking record for display
    if incoterm and not is_po_import:
        await db.shipping_bookings.update_one(
            {"id": booking.id},
            {"$set": {"incoterm": incoterm}}
        )
    
        # Create notification based on booking source
        if is_customer_booking:
            await create_notification(
                event_type="SHIPPING_BOOKING_CREATED",
                title=f"Shipping Booking Created from Customer CRO: {booking_number}",
                message=f"Shipping booking {booking_number} created from customer-provided CRO for {len(data.job_order_ids)} job order(s) ({', '.join(job_numbers[:3])}{'...' if len(job_numbers) > 3 else ''}). Please add CRO details to complete booking.",
                link="/shipping",
                ref_type="SHIPPING_BOOKING",
                ref_id=booking.id,
                target_roles=["admin", "shipping", "export"],
                notification_type="success"
            )
            
            # REMOVED: Auto-creation of transport schedule on booking creation
            # Transport schedules should only be created when CRO is updated via update_cro endpoint
            # This prevents premature transport creation before all details are confirmed
    else:
        await create_notification(
            event_type="SHIPPING_BOOKING_CREATED",
            title=f"Shipping Booking Created: {booking_number}",
            message=f"New shipping booking {booking_number} created for {len(data.job_order_ids)} job order(s) ({', '.join(job_numbers[:3])}{'...' if len(job_numbers) > 3 else ''}). CRO details needed from shipping line.",
            link="/shipping",
            ref_type="SHIPPING_BOOKING",
            ref_id=booking.id,
            target_roles=["admin", "shipping", "export"],
            notification_type="info"
        )
    
    return booking

@api_router.get("/shipping-bookings", response_model=List[ShippingBooking])
async def get_shipping_bookings(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    bookings = await db.shipping_bookings.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return bookings

@api_router.post("/shipping-bookings/cleanup-orphaned")
async def cleanup_orphaned_bookings(current_user: dict = Depends(get_current_user)):
    """Clean up bookings that reference non-existent POs or job orders"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/shipping"):
        raise HTTPException(status_code=403, detail="Only admin can cleanup bookings")
    
    all_bookings = await db.shipping_bookings.find({}, {"_id": 0}).to_list(1000)
    orphaned = []
    
    for booking in all_bookings:
        issues = []
        
        # Check PO references
        if booking.get("po_id") or booking.get("po_ids"):
            po_ids = []
            if booking.get("po_id"):
                po_ids.append(booking.get("po_id"))
            if booking.get("po_ids") and isinstance(booking.get("po_ids"), list):
                po_ids.extend(booking.get("po_ids"))
            
            for po_id in po_ids:
                if po_id:
                    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
                    if not po:
                        issues.append(f"PO {po_id} not found")
        
        # Check job order references
        if booking.get("job_order_ids") and isinstance(booking.get("job_order_ids"), list):
            for job_id in booking.get("job_order_ids", []):
                if job_id:
                    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
                    if not job:
                        issues.append(f"Job Order {job_id} not found")
        
        if issues:
            orphaned.append({
                "booking_number": booking.get("booking_number", "Unknown"),
                "booking_id": booking.get("id"),
                "status": booking.get("status", "unknown"),
                "issues": issues
            })
    
    return {
        "orphaned_count": len(orphaned),
        "orphaned_bookings": orphaned,
        "message": f"Found {len(orphaned)} booking(s) with orphaned references"
    }

@api_router.get("/shipping-bookings/{booking_id}")
async def get_shipping_booking(booking_id: str, current_user: dict = Depends(get_current_user)):
    booking = await db.shipping_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Get linked job orders details
    job_orders = []
    for job_id in booking.get("job_order_ids", []):
        job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
        if job:
            job_orders.append(job)
    
    return {**booking, "job_orders": job_orders}

@api_router.put("/shipping-bookings/{booking_id}/cro")
async def update_shipping_cro(booking_id: str, data: ShippingBookingUpdate, current_user: dict = Depends(get_current_user)):
    """Update CRO details and auto-generate transport schedules"""
    if not has_permission(current_user, required_roles=["admin", "shipping"], required_page="/shipping"):
        raise HTTPException(status_code=403, detail="Only shipping can update bookings")
    
    booking = await db.shipping_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Include all fields from the update, including empty strings (for clearing fields)
    # But exclude None values to avoid overwriting existing data unintentionally
    update_data = {}
    for k, v in data.model_dump().items():
        # Include the field if it's not None (including empty strings, 0, False, etc.)
        if v is not None:
            update_data[k] = v
    
    # Calculate pickup date (3 days before cutoff)
    # Use cutoff_date from update data, or fall back to existing booking cutoff_date
    cutoff_date_to_use = data.cutoff_date or booking.get("cutoff_date")
    if cutoff_date_to_use:
        try:
            # Handle date format - remove timezone if present for ISO format
            date_str = cutoff_date_to_use.split('T')[0] if 'T' in cutoff_date_to_use else cutoff_date_to_use
            cutoff = datetime.fromisoformat(date_str)
            pickup = cutoff - timedelta(days=3)
            update_data["pickup_date"] = pickup.strftime("%Y-%m-%d")
        except (ValueError, AttributeError) as e:
            # Log error but don't fail the update if date parsing fails
            logging.warning(f"Failed to parse cutoff_date '{cutoff_date_to_use}': {e}")
    
    # CRITICAL: Detect PO import BEFORE updating booking - check ref_type OR if booking has po_id/po_ids but no job_order_ids
    # This must be done BEFORE any updates to ensure correct detection and prevent transport schedule creation
    is_po_import = booking.get("ref_type") == "PO_IMPORT" or (
        (booking.get("po_id") or (booking.get("po_ids") and len(booking.get("po_ids")) > 0)) 
        and (not booking.get("job_order_ids") or len(booking.get("job_order_ids")) == 0)
    )
    
    # If booking doesn't have ref_type but is detected as PO import, update it
    if is_po_import and not booking.get("ref_type"):
        update_data["ref_type"] = "PO_IMPORT"
        booking["ref_type"] = "PO_IMPORT"
    
    # Update status to cro_received if CRO number provided
    # IMPORTANT: For PO imports, status should stay as "cro_received" and NOT change to "transport_scheduled"
    # Transport schedules are ONLY for export bookings (job orders), NOT for PO imports
    if data.cro_number and booking.get("status") == "pending":
        update_data["status"] = "cro_received"
    
    # CRITICAL: Ensure si_cutoff, pull_out_date, and gate_in_date are explicitly saved
    # This handles cases where they might be empty strings or need to be cleared
    if hasattr(data, 'si_cutoff') and data.si_cutoff is not None:
        update_data["si_cutoff"] = data.si_cutoff
    if hasattr(data, 'pull_out_date') and data.pull_out_date is not None:
        update_data["pull_out_date"] = data.pull_out_date
    if hasattr(data, 'gate_in_date') and data.gate_in_date is not None:
        update_data["gate_in_date"] = data.gate_in_date
    
    # Update booking with all changes (including ref_type if needed)
    await db.shipping_bookings.update_one({"id": booking_id}, {"$set": update_data})
    
    # CRITICAL: If this is a PO import that was incorrectly set to "transport_scheduled", fix it
    # Also clean up any incorrectly created transport schedules
    if is_po_import:
        # Get transport schedule IDs before deleting them (for cleaning up dispatch schedules)
        transport_schedules = await db.transport_schedules.find({"shipping_booking_id": booking_id}, {"_id": 0, "id": 1}).to_list(100)
        transport_schedule_ids = [s["id"] for s in transport_schedules]
        
        # Ensure status is NOT "transport_scheduled" for PO imports
        if booking.get("status") == "transport_scheduled" or update_data.get("status") == "transport_scheduled":
            await db.shipping_bookings.update_one(
                {"id": booking_id},
                {"$set": {"status": "cro_received"}}
            )
            booking["status"] = "cro_received"
        
        # Delete any incorrectly created transport schedules for this PO import booking
        if transport_schedule_ids:
            await db.transport_schedules.delete_many({"shipping_booking_id": booking_id})
            # Delete associated dispatch schedules
            await db.dispatch_schedules.delete_many({"transport_schedule_id": {"$in": transport_schedule_ids}})
        
        # Also delete transport_outward records that were incorrectly created
        await db.transport_outward.delete_many({"shipping_booking_id": booking_id})
    
    # IMPORTANT: For PO imports, status should remain "cro_received" and NOT change to "transport_scheduled"
    # Transport schedules are ONLY for export bookings (job orders), NOT for PO imports
    # PO imports should only create import records, not transport schedules
    
    # CRITICAL: Only create transport schedules for EXPORT bookings (job orders), NOT for PO imports
    # PO imports should NOT create transport schedules - they only create import records
    if data.cro_number and data.cutoff_date and not is_po_import:
        # Verify this is actually an export booking (has job_order_ids)
        if booking.get("job_order_ids") and len(booking.get("job_order_ids")) > 0:
            # Get job order details for notifications (export bookings only)
            job_numbers = []
            customer_name = ""
            for job_id in booking.get("job_order_ids", []):
                job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
                if job:
                    if job.get("job_number"):
                        job_numbers.append(job["job_number"])
                    if not customer_name:
                        so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
                        if so:
                            customer_name = so.get("customer_name", "")
            
            # Use helper function to create transport/dispatch schedules (for export bookings ONLY)
            transport_schedule_obj = await auto_create_transport_from_cro(booking_id, data, booking, job_numbers, customer_name, current_user["id"])
        else:
            transport_schedule_obj = None
        
        # Create notifications (only for export bookings with transport schedules)
        if transport_schedule_obj:
            # Handle both dict and Pydantic object formats
            if isinstance(transport_schedule_obj, dict):
                schedule_num = transport_schedule_obj.get("schedule_number")
                pickup_date = transport_schedule_obj.get("pickup_date")
                schedule_id = transport_schedule_obj.get("id")
            else:
                schedule_num = transport_schedule_obj.schedule_number
                pickup_date = transport_schedule_obj.pickup_date
                schedule_id = transport_schedule_obj.id
            
            await create_notification(
                event_type="CRO_RECEIVED",
                title=f"CRO Received: {data.cro_number}",
                message=f"CRO {data.cro_number} received for booking {booking['booking_number']}. Vessel: {data.vessel_name or 'TBD'}, Cutoff: {data.cutoff_date}",
                link="/shipping",
                ref_type="SHIPPING_BOOKING",
                ref_id=booking_id,
                target_roles=["admin", "shipping", "export"],
                notification_type="success"
            )
            
            await create_notification(
                event_type="TRANSPORT_BOOKING_REQUIRED",
                title=f"Transport Booking Required: {schedule_num}",
                message=f"CRO {data.cro_number} received. Transport booking required for pickup on {pickup_date}. Please assign transporter and vehicle via Transport Planner.",
                link="/transport-planner",
                ref_type="TRANSPORT_SCHEDULE",
                ref_id=schedule_id,
                target_roles=["admin", "transport", "dispatch"],
                notification_type="info"
            )
            
            dispatch_schedule = await db.dispatch_schedules.find_one({"transport_schedule_id": schedule_id}, {"_id": 0, "id": 1})
            if dispatch_schedule:
                await create_notification(
                    event_type="CONTAINER_LOADING_SCHEDULED",
                    title="Container Loading Scheduled",
                    message=f"Container loading scheduled: {schedule_num} - Pickup on {pickup_date}. {len(job_numbers)} job order(s) to load.",
                    link="/loading-unloading",
                    ref_type="dispatch_schedule",
                    ref_id=dispatch_schedule.get("id", ""),
                    target_roles=["admin", "warehouse", "security", "production"],
                    notification_type="info"
                )
            
            # Send email notification
            updated_booking = await db.shipping_bookings.find_one({"id": booking_id}, {"_id": 0})
            if updated_booking:
                # Convert to dict if it's a Pydantic object
                schedule_dict = transport_schedule_obj if isinstance(transport_schedule_obj, dict) else transport_schedule_obj.model_dump()
                await notify_cro_received(updated_booking, schedule_dict)
    
    # Handle PO import bookings - route to Import Window after CRO is received
    # Create import record for ALL PO_IMPORT bookings (not just FOB) when CRO is saved
    if is_po_import and data.cro_number:
        # Get PO ID from booking - could be po_id (singular), first from po_ids (array), or ref_id (legacy)
        po_id = booking.get("po_id") or (booking.get("po_ids") and len(booking.get("po_ids")) > 0 and booking.get("po_ids")[0]) or booking.get("ref_id")
        
        # If still no po_id, try to find PO by booking number or other means
        if not po_id:
            # Try to find PO by matching booking number in shipping_booking_id field
            existing_import_by_booking = await db.imports.find_one({"shipping_booking_id": booking_id}, {"_id": 0, "po_id": 1})
            if existing_import_by_booking:
                po_id = existing_import_by_booking.get("po_id")
            else:
                # Try to find PO by matching supplier name and booking details
                # This is a fallback for legacy bookings that might not have po_id set
                if booking.get("supplier_name"):
                    # Find POs with matching supplier that are FOB and approved
                    matching_po = await db.purchase_orders.find_one({
                        "supplier_name": booking.get("supplier_name"),
                        "incoterm": {"$in": ["FOB", "fob", "Fob"]},
                        "status": "APPROVED",
                        "routed_to": {"$ne": "IMPORT"}  # Not already routed to import
                    }, {"_id": 0, "id": 1, "po_number": 1}, sort=[("created_at", -1)])
                    if matching_po:
                        po_id = matching_po.get("id")
                        # Update booking with found po_id
                        await db.shipping_bookings.update_one(
                            {"id": booking_id},
                            {"$set": {"po_id": po_id, "po_number": matching_po.get("po_number", "")}}
                        )
                        booking["po_id"] = po_id
                        booking["po_number"] = matching_po.get("po_number", "")
        
        if po_id:
            # Check if import record already exists (by po_id OR by shipping_booking_id)
            existing_import = await db.imports.find_one({
                "$or": [
                    {"po_id": po_id},
                    {"shipping_booking_id": booking_id}
                ]
            }, {"_id": 0})
            if not existing_import:
                # Create import record for tracking
                import_number = await generate_sequence("IMP", "imports")
                po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
                
                # Get default checklist (list format)
                checklist_list = get_default_import_checklist()
                
                # Get incoterm from booking or PO (default to FOB if not specified)
                incoterm = booking.get("incoterm") or (po.get("incoterm", "FOB") if po else "FOB")
                
                import_record = {
                    "id": str(uuid.uuid4()),
                    "import_number": import_number,
                    "po_id": po_id,
                    "po_number": po.get("po_number", "") if po else booking.get("po_number", ""),
                    "supplier_name": booking.get("supplier_name", "") or (po.get("supplier_name", "") if po else ""),
                    "incoterm": incoterm,
                    "status": "PENDING_DOCS",  # Start as PENDING_DOCS when CRO received - user needs to track documents
                    "shipping_booking_id": booking_id,
                    "document_checklist": checklist_list,  # Use list format as per ImportRecord model
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.imports.insert_one(import_record)
                
                # Update PO routing
                await db.purchase_orders.update_one(
                    {"id": po_id},
                    {"$set": {
                        "routed_to": "IMPORT",
                        "routed_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                # Create notification
                await create_notification(
                    event_type="IMPORT_RECORD_CREATED",
                    title=f"Import Record Created: {import_number}",
                    message=f"PO {booking.get('po_number', '')} shipping booked. Import record {import_number} created. Track shipment and collect import documents.",
                    link="/import-window",
                    ref_type="IMPORT",
                    ref_id=import_record["id"],
                    target_roles=["admin", "procurement", "finance"],
                    notification_type="info"
                )
        
        # Create notification for PO import shipping booked
        await create_notification(
            event_type="CRO_RECEIVED",
            title=f"CRO Received for PO Import: {data.cro_number}",
            message=f"CRO {data.cro_number} received for PO {booking.get('po_number', '')}. Shipping booked. Import tracking will be created.",
            link="/shipping",
            ref_type="SHIPPING_BOOKING",
            ref_id=booking_id,
            target_roles=["admin", "shipping", "procurement"],
            notification_type="success"
        )
    
    return {"message": "CRO details updated" + ("" if is_po_import else " and transport schedule generated")}

@api_router.put("/shipping-bookings/{booking_id}")
async def update_shipping_booking(
    booking_id: str, 
    shipping_line: Optional[str] = None,
    container_type: Optional[str] = None,
    container_count: Optional[int] = None,
    port_of_loading: Optional[str] = None,
    port_of_discharge: Optional[str] = None,
    cargo_description: Optional[str] = None,
    cargo_weight: Optional[float] = None,
    is_dg: Optional[bool] = None,
    dg_class: Optional[str] = None,
    notes: Optional[str] = None,
    cro_number: Optional[str] = None, 
    status: Optional[str] = None, 
    current_user: dict = Depends(get_current_user)
):
    """Update shipping booking details"""
    if not await has_page_access(current_user, "/shipping", fallback_roles=["admin", "shipping", "procurement"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {}
    
    # Booking detail fields
    if shipping_line is not None:
        update_data["shipping_line"] = shipping_line
    if container_type is not None:
        update_data["container_type"] = container_type
    if container_count is not None:
        update_data["container_count"] = container_count
    if port_of_loading is not None:
        update_data["port_of_loading"] = port_of_loading
    if port_of_discharge is not None:
        update_data["port_of_discharge"] = port_of_discharge
    if cargo_description is not None:
        update_data["cargo_description"] = cargo_description
    if cargo_weight is not None:
        update_data["cargo_weight"] = cargo_weight
    if is_dg is not None:
        update_data["is_dg"] = is_dg
    if dg_class is not None:
        update_data["dg_class"] = dg_class
    if notes is not None:
        update_data["notes"] = notes
    
    # CRO/Status fields
    if cro_number is not None:
        update_data["cro_number"] = cro_number
    if status is not None:
        update_data["status"] = status
    
    # If all required fields are now filled and status is PENDING_DETAILS, change to PENDING
    if status != "PENDING_DETAILS":
        booking = await db.shipping_bookings.find_one({"id": booking_id}, {"_id": 0})
        if booking and booking.get("status") == "PENDING_DETAILS":
            if all([
                update_data.get("shipping_line") or booking.get("shipping_line"),
                update_data.get("container_type") or booking.get("container_type"),
                update_data.get("container_count") or booking.get("container_count"),
                update_data.get("port_of_loading") or booking.get("port_of_loading"),
                update_data.get("port_of_discharge") or booking.get("port_of_discharge"),
                update_data.get("cargo_weight") or booking.get("cargo_weight"),
            ]):
                update_data["status"] = "PENDING"
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.shipping_bookings.update_one({"id": booking_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    return {"message": "Booking updated successfully", "updated_fields": list(update_data.keys())}

# ==================== TRANSPORT ROUTES ====================

@api_router.post("/transport-schedules", response_model=TransportSchedule)
async def create_transport_schedule(data: TransportScheduleCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "transport"], required_page="/transport-window"):
        raise HTTPException(status_code=403, detail="Only transport can create schedules")
    
    booking = await db.shipping_bookings.find_one({"id": data.shipping_booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Shipping booking not found")
    
    # Get job order details
    job_numbers = []
    product_names = []
    for job_id in booking.get("job_order_ids", []):
        job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
        if job:
            job_numbers.append(job["job_number"])
            product_names.append(job["product_name"])
    
    schedule_number = await generate_sequence("TRN", "transport_schedules")
    schedule = TransportSchedule(
        **data.model_dump(),
        schedule_number=schedule_number,
        booking_number=booking["booking_number"],
        cro_number=booking.get("cro_number"),
        vessel_name=booking.get("vessel_name"),
        vessel_date=booking.get("vessel_date"),
        cutoff_date=booking.get("cutoff_date"),
        container_type=booking["container_type"],
        container_count=booking["container_count"],
        port_of_loading=booking["port_of_loading"],
        job_numbers=job_numbers,
        product_names=product_names,
        created_by=current_user["id"]
    )
    await db.transport_schedules.insert_one(schedule.model_dump())
    return schedule

@api_router.get("/transport-schedules", response_model=List[TransportSchedule])
async def get_transport_schedules(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    schedules = await db.transport_schedules.find(query, {"_id": 0}).sort("pickup_date", 1).to_list(1000)
    return schedules

@api_router.get("/transport-schedules/pending")
async def get_pending_transport_schedules(current_user: dict = Depends(get_current_user)):
    """Get transport schedules pending assignment (for transport department)"""
    schedules = await db.transport_schedules.find(
        {"status": {"$in": ["pending", "assigned"]}},
        {"_id": 0}
    ).sort("pickup_date", 1).to_list(1000)
    return schedules

@api_router.put("/transport-schedules/{schedule_id}")
async def update_transport_schedule(
    schedule_id: str,
    status: Optional[str] = None,
    transporter: Optional[str] = None,
    vehicle_number: Optional[str] = None,
    driver_name: Optional[str] = None,
    driver_phone: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    update_data = {}
    if status:
        update_data["status"] = status
    if transporter:
        update_data["transporter"] = transporter
    if vehicle_number:
        update_data["vehicle_number"] = vehicle_number
    if driver_name:
        update_data["driver_name"] = driver_name
    if driver_phone:
        update_data["driver_phone"] = driver_phone
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.transport_schedules.update_one({"id": schedule_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    # Update dispatch schedule as well
    if any([transporter, vehicle_number, driver_name, driver_phone]):
        dispatch_update = {}
        if transporter:
            dispatch_update["transporter"] = transporter
        if vehicle_number:
            dispatch_update["vehicle_number"] = vehicle_number
        if driver_name:
            dispatch_update["driver_name"] = driver_name
        if driver_phone:
            dispatch_update["driver_phone"] = driver_phone
        await db.dispatch_schedules.update_one(
            {"transport_schedule_id": schedule_id},
            {"$set": dispatch_update}
        )
    
    return {"message": "Schedule updated"}

# ==================== DISPATCH ROUTES (Security View) ====================

@api_router.get("/dispatch-schedules")
async def get_dispatch_schedules(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get dispatch schedules for security/dispatch department"""
    query = {}
    if status:
        query["status"] = status
    schedules = await db.dispatch_schedules.find(query, {"_id": 0}).sort("pickup_date", 1).to_list(1000)
    return schedules

@api_router.get("/dispatch-schedules/today")
async def get_todays_dispatch_schedules(current_user: dict = Depends(get_current_user)):
    """Get today's expected container arrivals for security"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    schedules = await db.dispatch_schedules.find(
        {"pickup_date": today},
        {"_id": 0}
    ).sort("expected_arrival", 1).to_list(1000)
    return schedules

@api_router.get("/dispatch-schedules/upcoming")
async def get_upcoming_dispatch_schedules(days: int = 7, current_user: dict = Depends(get_current_user)):
    """Get upcoming container arrivals for the next N days"""
    today = datetime.now(timezone.utc)
    end_date = today + timedelta(days=days)
    
    schedules = await db.dispatch_schedules.find(
        {
            "pickup_date": {
                "$gte": today.strftime("%Y-%m-%d"),
                "$lte": end_date.strftime("%Y-%m-%d")
            }
        },
        {"_id": 0}
    ).sort("pickup_date", 1).to_list(1000)
    return schedules

@api_router.put("/dispatch-schedules/{schedule_id}/status")
async def update_dispatch_status(schedule_id: str, status: str, current_user: dict = Depends(get_current_user)):
    """Update dispatch status (for security to track loading progress)"""
    valid_statuses = ["scheduled", "in_transit", "arrived", "loading", "loaded", "departed"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    update_data = {"status": status}
    if status == "loading":
        update_data["loading_start"] = datetime.now(timezone.utc).isoformat()
    elif status == "loaded":
        update_data["loading_end"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.dispatch_schedules.update_one({"id": schedule_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dispatch schedule not found")
    
    # Create notifications for loading status changes
    if status == "loading":
        schedule = await db.dispatch_schedules.find_one({"id": schedule_id}, {"_id": 0})
        if schedule:
            await create_notification(
                event_type="CONTAINER_LOADING_STARTED",
                title="Container Loading Started",
                message=f"Loading started: {schedule.get('schedule_number')} - {schedule.get('container_count')}x {schedule.get('container_type', '').upper()} container(s)",
                link="/dispatch-gate",
                ref_type="dispatch_schedule",
                ref_id=schedule_id,
                target_roles=["admin", "warehouse", "shipping", "production"],
                notification_type="info"
            )
    elif status == "loaded":
        schedule = await db.dispatch_schedules.find_one({"id": schedule_id}, {"_id": 0})
        if schedule:
            await create_notification(
                event_type="CONTAINER_LOADING_COMPLETED",
                title="Container Loading Completed",
                message=f"Loading completed: {schedule.get('schedule_number')} - Ready for dispatch to port",
                link="/dispatch-gate",
                ref_type="dispatch_schedule",
                ref_id=schedule_id,
                target_roles=["admin", "warehouse", "shipping", "transport", "production"],
                notification_type="success"
            )
    
    return {"message": f"Dispatch status updated to {status}"}

# ==================== DOCUMENTATION ROUTES ====================

@api_router.post("/export-documents", response_model=ExportDocument)
async def create_export_document(data: ExportDocumentCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "documentation"], required_page="/documentation"):
        raise HTTPException(status_code=403, detail="Only documentation can create export documents")
    
    booking = await db.shipping_bookings.find_one({"id": data.shipping_booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Shipping booking not found")
    
    document = ExportDocument(**data.model_dump(), booking_number=booking["booking_number"], created_by=current_user["id"])
    await db.export_documents.insert_one(document.model_dump())
    return document

@api_router.get("/export-documents", response_model=List[ExportDocument])
async def get_export_documents(shipping_booking_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if shipping_booking_id:
        query["shipping_booking_id"] = shipping_booking_id
    docs = await db.export_documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs

# ==================== QC ROUTES ====================

@api_router.post("/qc-batches", response_model=QCBatch)
async def create_qc_batch(data: QCBatchCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "qc"], required_page="/qc"):
        raise HTTPException(status_code=403, detail="Only QC can create batches")
    
    job = await db.job_orders.find_one({"id": data.job_order_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    batch = QCBatch(
        **data.model_dump(),
        job_number=job["job_number"],
        product_name=job["product_name"],
        inspected_by=current_user["id"]
    )
    await db.qc_batches.insert_one(batch.model_dump())
    
    # Update job order with batch number
    await db.job_orders.update_one({"id": data.job_order_id}, {"$set": {"batch_number": data.batch_number}})
    
    return batch

@api_router.get("/qc-batches", response_model=List[QCBatch])
async def get_qc_batches(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    batches = await db.qc_batches.find(query, {"_id": 0}).sort("inspected_at", -1).to_list(1000)
    return batches

@api_router.put("/qc-batches/{batch_id}/status")
async def update_qc_status(batch_id: str, status: str, current_user: dict = Depends(get_current_user)):
    valid_statuses = ["pending", "passed", "failed", "hold"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.qc_batches.update_one({"id": batch_id}, {"$set": {"status": status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="QC batch not found")
    return {"message": f"QC status updated to {status}"}

# ==================== INVENTORY ROUTES ====================

@api_router.get("/inventory")
async def get_inventory(category: Optional[str] = None, low_stock: Optional[bool] = None, current_user: dict = Depends(get_current_user)):
    """Get inventory items - uses inventory_balances.on_hand as source of truth when available"""
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
            product["_source"] = "inventory_balances"  # Flag for debugging
        else:
            # Fall back to products.current_stock
            product["_source"] = "products"
        
        enriched_products.append(product)
    
    if low_stock:
        enriched_products = [p for p in enriched_products if p["current_stock"] < p.get("min_stock", 0)]
    
    return enriched_products

@api_router.get("/inventory/movements")
async def get_inventory_movements(product_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if product_id:
        query["product_id"] = product_id
    movements = await db.inventory_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return movements

# ==================== STOCK MANAGEMENT ROUTES ====================

@api_router.get("/stock/all")
async def get_all_stock(current_user: dict = Depends(get_current_user)):
    """Get all stock items from products, packaging, and inventory items"""
    stock_items = []
    
    # Get finished products
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    for product in products:
        product_id = product.get("id")
        
        # Use inventory_balances.on_hand as source of truth (same as /inventory endpoint)
        balance = await db.inventory_balances.find_one({"item_id": product_id}, {"_id": 0})
        if balance:
            # Use inventory_balances.on_hand as source of truth
            on_hand = balance.get("on_hand", 0)
            current_stock = on_hand
        else:
            # Fall back to products.current_stock
            current_stock = product.get("current_stock", 0)
        
        # Calculate reserved quantity from reservations
        reservations = await db.inventory_reservations.find({"item_id": product_id}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        available = current_stock - reserved
        
        # Calculate net weight per packaging unit (for report view)
        # Default assumption: 180kg for drums, 200kg for steel drums, etc.
        packaging_info = product.get("packaging", "Bulk")
        net_weight_kg_default = 0
        
        if packaging_info and packaging_info != "Bulk":
            # Try to infer from packaging string
            if "drum" in packaging_info.lower():
                # Default drum net weight
                if "210" in packaging_info or "250" in packaging_info:
                    net_weight_kg_default = 185
                else:
                    net_weight_kg_default = 180
            elif "ibc" in packaging_info.lower():
                net_weight_kg_default = 850
            elif "flexi" in packaging_info.lower():
                net_weight_kg_default = 20000
            # If product has density, calculate from capacity
            density = product.get("density_kg_per_l")
            if density and "200" in packaging_info:
                net_weight_kg_default = int(200 * density * 0.9)  # 90% fill
            elif density and "210" in packaging_info:
                net_weight_kg_default = int(210 * density * 0.9)
        
        stock_items.append({
            "id": product_id,
            "sku": product.get("sku", ""),
            "name": product.get("name"),
            "type": "FINISHED_PRODUCT",
            "category": product.get("category", ""),
            "packaging_info": packaging_info,
            "net_weight_kg_default": net_weight_kg_default,
            "current_stock": current_stock,
            "reserved": reserved,
            "available": available,
            "unit": product.get("unit", "KG"),
            "min_stock": product.get("min_stock", 0),
            "max_stock": product.get("max_stock", 0),
            "price": product.get("price", 0)
        })
    
    # Get packaging items
    packaging_items = await db.packaging.find({}, {"_id": 0}).to_list(1000)
    for pkg in packaging_items:
        pkg_id = pkg.get("id")
        
        # Use inventory_balances.on_hand as source of truth (same as /inventory endpoint)
        balance = await db.inventory_balances.find_one({"item_id": pkg_id}, {"_id": 0})
        if balance:
            # Use inventory_balances.on_hand as source of truth
            on_hand = balance.get("on_hand", 0)
            current_stock = on_hand
        else:
            # Fall back to packaging.current_stock
            current_stock = pkg.get("current_stock", 0)
        
        # Calculate reserved quantity from reservations
        reservations = await db.inventory_reservations.find({"item_id": pkg_id}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        available = current_stock - reserved
        
        # For packaging from packaging collection, show capacity info
        capacity = pkg.get("capacity_liters", 0)
        net_weight = pkg.get("net_weight_kg_default", 0)
        packaging_info = f"{capacity}L" if capacity > 0 else f"{net_weight}kg" if net_weight > 0 else ""
        
        stock_items.append({
            "id": pkg_id,
            "sku": pkg.get("sku", ""),
            "name": pkg.get("name"),
            "type": "PACKAGING",
            "category": pkg.get("category", "Packaging"),
            "packaging_info": packaging_info,
            "capacity_liters": capacity,
            "net_weight_kg_default": net_weight,
            "current_stock": current_stock,
            "reserved": reserved,
            "available": available,
            "unit": pkg.get("unit", "EA"),
            "min_stock": pkg.get("min_stock", 0),
            "max_stock": pkg.get("max_stock", 0),
            "price": pkg.get("price", 0)
        })
    
    # Get raw materials and packaging from inventory_items
    inventory_items = await db.inventory_items.find({"is_active": True}, {"_id": 0}).to_list(1000)
    for item in inventory_items:
        # Get balance
        balance = await db.inventory_balances.find_one({"item_id": item["id"]}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        
        # Calculate reserved
        reservations = await db.inventory_reservations.find({"item_id": item["id"]}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        
        # Determine type: PACK items are packaging, RAW/TRADED are raw materials
        item_type = item.get("item_type", "RAW")
        if item_type == "PACK":
            stock_type = "PACKAGING"
            category = item.get("category", "Packaging")
            unit = item.get("uom", "EA")
            # For packaging, show capacity/net weight info
            capacity = item.get("capacity_liters", 0)
            net_weight = item.get("net_weight_kg_default", 0)
            packaging_info = f"{capacity}L" if capacity > 0 else f"{net_weight}kg" if net_weight > 0 else ""
        else:
            stock_type = "RAW_MATERIAL"
            category = item.get("category", "Raw Material")
            unit = item.get("uom") or item.get("unit", "KG")
            packaging_info = ""
        
        stock_items.append({
            "id": item.get("id"),
            "sku": item.get("sku", ""),
            "name": item.get("name"),
            "type": stock_type,
            "category": category,
            "current_stock": on_hand,
            "reserved": reserved,
            "available": on_hand - reserved,
            "unit": unit,
            "packaging_info": packaging_info,
            "capacity_liters": item.get("capacity_liters", 0),
            "net_weight_kg_default": item.get("net_weight_kg_default", 0),
            "min_stock": 0,
            "max_stock": 0,
            "price": 0
        })
    
    return stock_items

@api_router.get("/stock/product-packaging-report")
async def get_product_packaging_report(current_user: dict = Depends(get_current_user)):
    """
    Get Product-Packaging Stock Report
    Shows products grouped by packaging type with standard quantities and drum counts
    """
    products = await db.products.find(
        {"category": "finished_product"},
        {"_id": 0}
    ).to_list(1000)
    
    report_items = []
    
    for product in products:
        product_id = product.get("id")
        product_name = product.get("name")
        packaging = product.get("packaging", "Bulk")
        unit = product.get("unit", "KG").upper()
        
        # Get current stock from inventory_balances
        balance = await db.inventory_balances.find_one({"item_id": product_id}, {"_id": 0})
        if balance:
            current_stock = balance.get("on_hand", 0)
        else:
            current_stock = product.get("current_stock", 0)
        
        # Calculate reserved quantity
        reservations = await db.inventory_reservations.find({"item_id": product_id}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        available = current_stock - reserved
        
        # Get packaging configuration if exists
        packaging_config = await db.product_packaging_configs.find_one({
            "product_id": product_id,
            "is_active": True
        }, {"_id": 0})
        
        # Determine qty_standard (net weight per package)
        # First check packaging_configs, then check if product has any active job orders with packaging
        qty_standard = 0
        drums_count = 0
        actual_packaging = packaging  # Default to product's packaging field
        
        # Check packaging_configs first (most accurate)
        if packaging_config:
            packaging_type = packaging_config.get("packaging_type", "").lower()
            actual_packaging = packaging_config.get("packaging_name", packaging)
            if packaging_type in ["drum", "carton"]:
                qty_standard = packaging_config.get("drum_carton_filling_kg", 0)
            elif packaging_type == "ibc":
                qty_standard = packaging_config.get("ibc_filling_kg", 0)
            elif packaging_type in ["flexi/iso", "flexi", "iso"]:
                flexi_mt = packaging_config.get("flexi_iso_filling_mt", 0)
                qty_standard = flexi_mt * 1000  # Convert MT to KG
        elif packaging and packaging.upper() != "BULK":
            # Try to infer from packaging string if no config exists
            packaging_lower = packaging.lower()
            if "drum" in packaging_lower:
                if "210" in packaging or "250" in packaging:
                    qty_standard = 185
                else:
                    qty_standard = 180
            elif "ibc" in packaging_lower:
                qty_standard = 850
                # Try to extract IBC capacity from string (e.g., "IBC 1000L")
                ibc_match = re.search(r'(\d+)\s*L', packaging, re.IGNORECASE)
                if ibc_match:
                    capacity_liters = int(ibc_match.group(1))
                    # Estimate weight based on typical density (0.85-0.9 kg/L for most chemicals)
                    # Use 0.9 as default fill ratio
                    qty_standard = int(capacity_liters * 0.9)
            elif "flexi" in packaging_lower or "iso" in packaging_lower:
                qty_standard = 20000
        else:
            # Check if there are any active job orders with this product that have packaging info
            # This helps when product.packaging is "Bulk" but jobs use specific packaging
            active_jobs = await db.job_orders.find({
                "product_id": product_id,
                "status": {"$in": ["pending", "approved", "procurement", "in_production"]}
            }, {"_id": 0, "packaging": 1, "items": 1}).to_list(10)
            
            for job in active_jobs:
                # Check multi-item structure first
                items = job.get("items", [])
                if items:
                    for item in items:
                        if item.get("product_id") == product_id:
                            item_packaging = item.get("packaging", "")
                            if item_packaging and item_packaging.upper() != "BULK":
                                actual_packaging = item_packaging
                                # Infer qty_standard from packaging string
                                packaging_lower = item_packaging.lower()
                                if "ibc" in packaging_lower:
                                    ibc_match = re.search(r'(\d+)\s*L', item_packaging, re.IGNORECASE)
                                    if ibc_match:
                                        capacity_liters = int(ibc_match.group(1))
                                        qty_standard = int(capacity_liters * 0.9)  # 90% fill
                                    else:
                                        qty_standard = 850  # Default IBC
                                elif "drum" in packaging_lower:
                                    if "210" in item_packaging or "250" in item_packaging:
                                        qty_standard = 185
                                    else:
                                        qty_standard = 180
                                break
                else:
                    # Legacy single product structure
                    job_packaging = job.get("packaging", "")
                    if job_packaging and job_packaging.upper() != "BULK":
                        actual_packaging = job_packaging
                        packaging_lower = job_packaging.lower()
                        if "ibc" in packaging_lower:
                            ibc_match = re.search(r'(\d+)\s*L', job_packaging, re.IGNORECASE)
                            if ibc_match:
                                capacity_liters = int(ibc_match.group(1))
                                qty_standard = int(capacity_liters * 0.9)
                            else:
                                qty_standard = 850
                        elif "drum" in packaging_lower:
                            if "210" in job_packaging or "250" in job_packaging:
                                qty_standard = 185
                            else:
                                qty_standard = 180
                        break
        
        # Calculate drum/unit count
        if qty_standard > 0:
            if unit == "MT":
                drums_count = int((current_stock * 1000) / qty_standard)
            elif unit == "KG":
                drums_count = int(current_stock / qty_standard)
            else:
                drums_count = int(current_stock)
        
        # Determine status
        min_stock = product.get("min_stock", 0)
        if current_stock <= 0:
            status = "Out of Stock"
        elif current_stock < min_stock:
            status = "Low Stock"
        else:
            status = "In Stock"
        if actual_packaging.upper() != "BULK" and qty_standard > 0:
            report_items.append({
                "product_id": product_id,
                "product_name": product_name,
                "sku": product.get("sku", ""),
                "packing": actual_packaging,  # Use actual_packaging which may come from job orders
                "qty_standard": qty_standard,
                "qty_standard_display": f"{qty_standard} {unit}" if qty_standard > 0 else "Bulk",
                "current_stock": current_stock,
                "current_stock_display": f"{current_stock:.2f} {unit}",
                "reserved": reserved,
                "reserved_display": f"{reserved:.2f} {unit}" if reserved > 0 else "0.00",
                "available": available,
                "available_display": f"{available:.2f} {unit}",
                "drums_count": drums_count if drums_count > 0 else "-",
                "status": status,
                "unit": unit
            })
        
        return {"items": report_items}

class StockAdjustment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_id: str
    item_name: str
    item_type: str
    adjustment: float
    new_stock: float
    reason: Optional[str] = None
    adjusted_by: str
    adjusted_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

@api_router.get("/stock/adjustments")
async def get_stock_adjustments(current_user: dict = Depends(get_current_user)):
    """Get stock adjustment history"""
    adjustments = await db.stock_adjustments.find({}, {"_id": 0}).sort("adjusted_at", -1).to_list(1000)
    return adjustments

class AddStockItemRequest(BaseModel):
    name: str
    sku: Optional[str] = None
    type: str  # FINISHED_PRODUCT, RAW_MATERIAL, PACKAGING
    category: Optional[str] = None
    quantity: float = 0
    unit: str = "KG"
    price: Optional[float] = 0

@api_router.post("/stock/add-item")
async def add_stock_item(data: AddStockItemRequest, current_user: dict = Depends(get_current_user)):
    """Add a new stock item"""
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/stock-management"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can add stock items")
    
    # Generate SKU if not provided
    sku = data.sku
    if not sku:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        type_prefix = {
            "FINISHED_PRODUCT": "FP",
            "RAW_MATERIAL": "RM",
            "PACKAGING": "PKG"
        }.get(data.type, "ITM")
        sku = f"{type_prefix}-{timestamp}"
    
    item_id = str(uuid.uuid4())
    
    # Create item based on type
    if data.type == "FINISHED_PRODUCT":
        product = {
            "id": item_id,
            "sku": sku,
            "name": data.name,
            "category": data.category or "General",
            "current_stock": data.quantity,
            "min_stock": 0,
            "max_stock": 0,
            "unit": data.unit,
            "price": data.price or 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.products.insert_one(product)
        
    elif data.type == "PACKAGING":
        packaging = {
            "id": item_id,
            "sku": sku,
            "name": data.name,
            "category": data.category or "Packaging",
            "current_stock": data.quantity,
            "min_stock": 0,
            "max_stock": 0,
            "unit": data.unit,
            "price": data.price or 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.packaging.insert_one(packaging)
        
    elif data.type == "RAW_MATERIAL":
        inventory_item = {
            "id": item_id,
            "sku": sku,
            "name": data.name,
            "category": data.category or "Raw Material",
            "item_type": "RAW",
            "unit": data.unit,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.inventory_items.insert_one(inventory_item)
        
        # Create balance record
        balance = {
            "item_id": item_id,
            "on_hand": data.quantity,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.inventory_balances.insert_one(balance)
    
    # Log adjustment if quantity > 0
    if data.quantity > 0:
        adjustment = StockAdjustment(
            item_id=item_id,
            item_name=data.name,
            item_type=data.type,
            adjustment=data.quantity,
            new_stock=data.quantity,
            reason="Initial stock",
            adjusted_by=current_user["id"]
        )
        await db.stock_adjustments.insert_one(adjustment.model_dump())
    
    return {"message": "Item added successfully", "id": item_id, "sku": sku}

@api_router.put("/stock/{item_id}/adjust")
async def adjust_stock(
    item_id: str, 
    adjustment: float = Query(...), 
    reason: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Adjust stock for any item type"""
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/stock-management"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can adjust stock")
    
    # Find the item in products, packaging, or inventory_items
    product = await db.products.find_one({"id": item_id}, {"_id": 0})
    packaging = await db.packaging.find_one({"id": item_id}, {"_id": 0})
    inventory_item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    
    if not product and not packaging and not inventory_item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Determine item details and current stock
    if product:
        item_name = product.get("name", "")
        item_type = "FINISHED_PRODUCT"
        
        # Check inventory_balances first (same logic as /stock/all endpoint)
        # This handles cases where current_stock might be None or missing
        balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
        if balance:
            current_stock = balance.get("on_hand", 0) or 0
        else:
            # Fall back to product.current_stock, defaulting to 0 if None or missing
            current_stock = product.get("current_stock") or 0
        
        new_stock = current_stock + adjustment
        
        if new_stock < 0:
            raise HTTPException(status_code=400, detail="Stock cannot be negative")
        
        # Update products table
        await db.products.update_one(
            {"id": item_id},
            {"$set": {"current_stock": new_stock}}
        )
        
        # ALSO update inventory_balances (CRITICAL FIX - ensures sync with Inventory page)
        if balance:
            await db.inventory_balances.update_one(
                {"item_id": item_id},
                {"$set": {
                    "on_hand": new_stock,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        else:
            # Create balance record if it doesn't exist
            await db.inventory_balances.insert_one({
                "id": str(uuid.uuid4()),
                "item_id": item_id,
                "on_hand": new_stock,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
    elif packaging:
        item_name = packaging.get("name", "")
        item_type = "PACKAGING"
        
        # Check inventory_balances first (same logic as /stock/all endpoint)
        balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
        if balance:
            current_stock = balance.get("on_hand", 0) or 0
        else:
            # Fall back to packaging.current_stock, defaulting to 0 if None or missing
            current_stock = packaging.get("current_stock") or 0
        
        new_stock = current_stock + adjustment
        
        if new_stock < 0:
            raise HTTPException(status_code=400, detail="Stock cannot be negative")
        
        # Update packaging table
        await db.packaging.update_one(
            {"id": item_id},
            {"$set": {"current_stock": new_stock}}
        )
        
        # ALSO update inventory_balances (CRITICAL FIX - ensures sync with Inventory page)
        if balance:
            await db.inventory_balances.update_one(
                {"item_id": item_id},
                {"$set": {
                    "on_hand": new_stock,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        else:
            # Create balance record if it doesn't exist
            await db.inventory_balances.insert_one({
                "id": str(uuid.uuid4()),
                "item_id": item_id,
                "on_hand": new_stock,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
    elif inventory_item:
        item_name = inventory_item.get("name", "")
        item_type = "RAW_MATERIAL"
        
        balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
        current_stock = (balance.get("on_hand", 0) if balance else 0) or 0
        new_stock = current_stock + adjustment
        
        if new_stock < 0:
            raise HTTPException(status_code=400, detail="Stock cannot be negative")
        
        if balance:
            await db.inventory_balances.update_one(
                {"item_id": item_id},
                {"$set": {"on_hand": new_stock, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            await db.inventory_balances.insert_one({
                "id": str(uuid.uuid4()),
                "item_id": item_id,
                "on_hand": new_stock,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
    
    # Log the adjustment
    adjustment_record = StockAdjustment(
        item_id=item_id,
        item_name=item_name,
        item_type=item_type,
        adjustment=adjustment,
        new_stock=new_stock,
        reason=reason,
        adjusted_by=current_user["id"]
    )
    await db.stock_adjustments.insert_one(adjustment_record.model_dump())
    
    return {"message": "Stock adjusted successfully", "new_stock": new_stock}

# ==================== DASHBOARD ROUTES ====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    pending_quotations = await db.quotations.count_documents({"status": "pending"})
    active_sales_orders = await db.sales_orders.count_documents({"status": "active"})
    pending_jobs = await db.job_orders.count_documents({"status": "pending"})
    in_production = await db.job_orders.count_documents({"status": "in_production"})
    ready_dispatch = await db.job_orders.count_documents({"status": "ready_for_dispatch"})
    pending_shipments = await db.shipping_bookings.count_documents({"status": "pending"})
    low_stock_count = await db.products.count_documents({"$expr": {"$lt": ["$current_stock", "$min_stock"]}})
    
    return {
        "pending_quotations": pending_quotations,
        "active_sales_orders": active_sales_orders,
        "pending_jobs": pending_jobs,
        "in_production": in_production,
        "ready_for_dispatch": ready_dispatch,
        "pending_shipments": pending_shipments,
        "low_stock_items": low_stock_count
    }

@api_router.get("/dashboard/recent-activities")
async def get_recent_activities(current_user: dict = Depends(get_current_user)):
    recent_quotations = await db.quotations.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_orders = await db.sales_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_jobs = await db.job_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    return {
        "recent_quotations": recent_quotations,
        "recent_orders": recent_orders,
        "recent_jobs": recent_jobs
    }

# ==================== EMAIL NOTIFICATION SERVICE ====================

async def send_email_notification(to_emails: List[str], subject: str, html_content: str):
    """Send email notification using Resend"""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return None
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": to_emails,
            "subject": subject,
            "html": html_content
        }
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {to_emails}: {result}")
        return result
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return None

async def notify_cro_received(booking: dict, transport_schedule: dict):
    """Send notification when CRO is received"""
    # Get users from transport and security departments
    transport_users = await db.users.find({"role": {"$in": ["transport", "security", "admin"]}, "is_active": True}, {"_id": 0}).to_list(100)
    emails = [u["email"] for u in transport_users if u.get("email")]
    
    if not emails:
        return
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0ea5e9; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">📦 CRO Received - Action Required</h1>
        </div>
        <div style="padding: 20px; background: #f8f9fa;">
            <h2 style="color: #333;">Container Pickup Required</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Booking #:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{booking.get('booking_number')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>CRO #:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{booking.get('cro_number')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Shipping Line:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{booking.get('shipping_line')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Vessel:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{booking.get('vessel_name')} ({booking.get('vessel_date')})</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Container:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{booking.get('container_count')}x {booking.get('container_type', '').upper()}</td></tr>
                <tr style="background: #fff3cd;"><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>⚠️ Cutoff Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd; color: #856404;"><strong>{booking.get('cutoff_date')}</strong></td></tr>
                <tr style="background: #d1ecf1;"><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>🚚 Pickup Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd; color: #0c5460;"><strong>{transport_schedule.get('pickup_date')}</strong></td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Route:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{booking.get('port_of_loading')} → {booking.get('port_of_discharge')}</td></tr>
            </table>
            <div style="margin-top: 20px; padding: 15px; background: #e7f3ff; border-radius: 5px;">
                <p style="margin: 0;"><strong>Transport Schedule:</strong> {transport_schedule.get('schedule_number')}</p>
                <p style="margin: 5px 0 0 0;">Jobs: {', '.join(transport_schedule.get('job_numbers', []))}</p>
            </div>
            <p style="margin-top: 20px; color: #666;">Please assign a transporter and vehicle for this pickup.</p>
        </div>
        <div style="background: #333; color: #999; padding: 10px; text-align: center; font-size: 12px;">
            Manufacturing ERP System
        </div>
    </div>
    """
    
    await send_email_notification(
        emails,
        f"🚨 CRO Received - Pickup Required by {transport_schedule.get('pickup_date')} - {booking.get('booking_number')}",
        html_content
    )

# ==================== PRODUCTION SCHEDULING ALGORITHM ====================

class ProductionScheduleItem(BaseModel):
    job_id: str
    job_number: str
    product_name: str
    quantity: float
    priority: str
    spa_number: str
    material_status: str  # ready, partial, not_ready, raw_materials_unavailable
    ready_percentage: float
    missing_materials: List[Dict[str, Any]]
    missing_raw_materials: List[Dict[str, Any]] = []  # Track raw materials separately
    available_materials: List[Dict[str, Any]]
    recommended_action: str
    estimated_start: Optional[str] = None
    schedule_date: Optional[str] = None  # Scheduled production date
    delivery_date: Optional[str] = None  # Delivery date
    created_at: Optional[str] = None  # Job order creation date

@api_router.get("/production/schedule")
async def get_production_schedule(current_user: dict = Depends(get_current_user)):
    """Get production schedule based on material availability"""
    # Get all pending job orders
    pending_jobs = await db.job_orders.find(
        {"status": {"$in": ["pending", "procurement"]}},
        {"_id": 0}
    ).sort([("priority", -1), ("created_at", 1)]).to_list(1000)
    
    schedule = []
    ready_jobs = []
    partial_jobs = []
    not_ready_jobs = []
    raw_materials_unavailable = []  # New category
    
    for job in pending_jobs:
        bom = job.get("bom", [])
        missing_materials = []
        available_materials = []
        missing_raw_materials = []  # Track raw materials separately
        total_items = len(bom)
        ready_items = 0
        
        for item in bom:
            # Support both old (product_id) and new (material_id) BOM structures
            material_id = item.get("product_id") or item.get("material_id")
            material_name = item.get("product_name") or item.get("material_name", "Unknown")
            sku = item.get("sku", "N/A")
            required = item.get("required_qty") or item.get("required_quantity", 0)
            item_type = item.get("item_type", "RAW")  # RAW or PACK
            
            if not material_id:
                continue
            
            # Check if it's an inventory item (new structure) or product (old structure)
            product = await db.products.find_one({"id": material_id}, {"_id": 0})
            if product:
                current_stock = product["current_stock"]
            else:
                # Check inventory_balances for new structure
                inventory_item = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
                if inventory_item:
                    balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                    current_stock = balance["on_hand"] if balance else 0
                else:
                    current_stock = 0
            
            material_info = {
                "product_id": material_id,
                "product_name": material_name,
                "sku": sku,
                "required_qty": required,
                "available_qty": current_stock,
                "shortage": max(0, required - current_stock),
                "unit": item.get("unit", "KG"),
                "item_type": item_type
            }
            
            if current_stock >= required:
                ready_items += 1
                available_materials.append(material_info)
            else:
                missing_materials.append(material_info)
                if item_type == "RAW":
                    missing_raw_materials.append(material_info)
        
        ready_percentage = (ready_items / total_items * 100) if total_items > 0 else 100
        
        # Determine material status
        if ready_percentage == 100:
            material_status = "ready"
            recommended_action = "Start production immediately"
        elif ready_percentage >= 50:
            material_status = "partial"
            recommended_action = "Procure missing materials or start partial production"
        else:
            material_status = "not_ready"
            recommended_action = "Wait for procurement - insufficient materials"
        
        # Check if raw materials are specifically unavailable
        if missing_raw_materials and len(missing_raw_materials) > 0:
            # Check if ONLY raw materials are missing (packaging is available)
            missing_pack = [m for m in missing_materials if m.get("item_type") == "PACK"]
            if len(missing_pack) == 0:
                material_status = "raw_materials_unavailable"
                recommended_action = "Raw materials unavailable - awaiting procurement"
        
        schedule_item = ProductionScheduleItem(
            job_id=job["id"],
            job_number=job["job_number"],
            product_name=job["product_name"],
            quantity=job["quantity"],
            priority=job["priority"],
            spa_number=job["spa_number"],
            material_status=material_status,
            ready_percentage=round(ready_percentage, 1),
            missing_materials=missing_materials,
            missing_raw_materials=missing_raw_materials,  # Add this field
            available_materials=available_materials,
            recommended_action=recommended_action,
            schedule_date=job.get("schedule_date"),  # Scheduled production date
            delivery_date=job.get("delivery_date"),  # Delivery date
            created_at=job.get("created_at")  # Job order creation/booking date
        )
        
        if material_status == "ready":
            ready_jobs.append(schedule_item)
        elif material_status == "raw_materials_unavailable":
            raw_materials_unavailable.append(schedule_item)
        elif material_status == "partial":
            partial_jobs.append(schedule_item)
        else:
            not_ready_jobs.append(schedule_item)
    
    # Sort by priority within each category
    priority_order = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    ready_jobs.sort(key=lambda x: priority_order.get(x.priority, 2))
    raw_materials_unavailable.sort(key=lambda x: priority_order.get(x.priority, 2))
    partial_jobs.sort(key=lambda x: priority_order.get(x.priority, 2))
    not_ready_jobs.sort(key=lambda x: priority_order.get(x.priority, 2))
    
    return {
        "summary": {
            "total_pending": len(pending_jobs),
            "ready_to_produce": len(ready_jobs),
            "partial_materials": len(partial_jobs),
            "awaiting_procurement": len(not_ready_jobs),
            "raw_materials_unavailable": len(raw_materials_unavailable)  # Add this
        },
        "ready_jobs": [j.model_dump() for j in ready_jobs],
        "partial_jobs": [j.model_dump() for j in partial_jobs],
        "not_ready_jobs": [j.model_dump() for j in not_ready_jobs],
        "raw_materials_unavailable": [j.model_dump() for j in raw_materials_unavailable]  # Add this
    }

@api_router.get("/production/procurement-list")
async def get_procurement_list(current_user: dict = Depends(get_current_user)):
    """Get list of materials needed for all pending jobs"""
    pending_jobs = await db.job_orders.find(
        {"status": {"$in": ["pending", "procurement"]}},
        {"_id": 0}
    ).to_list(1000)
    
    material_needs = {}
    
    for job in pending_jobs:
        for item in job.get("bom", []):
            # Support both old and new BOM structures
            material_id = item.get("product_id") or item.get("material_id")
            material_name = item.get("product_name") or item.get("material_name", "Unknown")
            sku = item.get("sku", "N/A")
            required = item.get("required_qty") or item.get("required_quantity", 0)
            
            if not material_id:
                continue
            
            if material_id not in material_needs:
                # Check products first (old structure)
                product = await db.products.find_one({"id": material_id}, {"_id": 0})
                if product:
                    current_stock = product["current_stock"]
                else:
                    # Check inventory items (new structure)
                    inventory_item = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
                    if inventory_item:
                        balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                        current_stock = balance["on_hand"] if balance else 0
                    else:
                        current_stock = 0
                
                material_needs[material_id] = {
                    "product_id": material_id,
                    "product_name": material_name,
                    "sku": sku,
                    "unit": item.get("unit", "KG"),
                    "current_stock": current_stock,
                    "total_required": 0,
                    "total_shortage": 0,
                    "jobs": []
                }
            
            material_needs[material_id]["total_required"] += required
            material_needs[material_id]["jobs"].append({
                "job_number": job["job_number"],
                "required_qty": required
            })
    
    # Calculate shortages
    procurement_list = []
    for material in material_needs.values():
        shortage = max(0, material["total_required"] - material["current_stock"])
        material["total_shortage"] = shortage
        if shortage > 0:
            procurement_list.append(material)
    
    procurement_list.sort(key=lambda x: x["total_shortage"], reverse=True)
    
    return {
        "total_materials_needed": len(procurement_list),
        "procurement_list": procurement_list
    }

# ==================== PRODUCTION LOGS ====================

@api_router.post("/production/logs", response_model=ProductionLog)
async def create_production_log(data: ProductionLogCreate, current_user: dict = Depends(get_current_user)):
    """Create a production log entry"""
    if not has_permission(current_user, required_roles=["admin", "production"], required_page="/production-schedule"):
        raise HTTPException(status_code=403, detail="Only admin/production can create production logs")
    
    log = ProductionLog(**data.model_dump(), created_by=current_user["id"])
    await db.production_logs.insert_one(log.model_dump())
    
    # Update job order with batch number from production log
    await db.job_orders.update_one(
        {"id": data.job_order_id},
        {"$set": {"batch_number": data.batch_number}}
    )
    
    # Update job order status if production is complete
    job_order = await db.job_orders.find_one({"id": data.job_order_id}, {"_id": 0})
    if job_order:
        # Calculate total produced for this job order item
        existing_logs = await db.production_logs.find(
            {"job_order_id": data.job_order_id, "product_id": data.product_id},
            {"_id": 0}
        ).to_list(1000)
        
        total_produced = sum(log_entry.get("quantity_produced", 0) for log_entry in existing_logs)
        
        # Find the item in job order
        items = job_order.get("items", [])
        if not items:
            # Handle legacy single product structure
            if job_order.get("product_id") == data.product_id:
                required_qty = job_order.get("quantity", 0)
                if total_produced >= required_qty:
                    # Production is complete - update status and create GRN
                    await db.job_orders.update_one(
                        {"id": data.job_order_id},
                        {"$set": {"status": "ready_for_dispatch"}}
                    )
                    
                    # Automatically create GRN to add finished goods to inventory
                    try:
                        # Get product details
                        product = await db.products.find_one({"id": data.product_id}, {"_id": 0})
                        product_name = product.get("name", data.product_name) if product else data.product_name
                        product_sku = product.get("sku", "-") if product else "-"
                        product_unit = product.get("unit", "KG") if product else "KG"
                        
                        # Get net_weight_kg from job order for drum-to-MT conversion
                        packaging = job_order.get("packaging", "").upper()
                        net_weight_kg = job_order.get("net_weight_kg")
                        production_type = data.production_type  # Get production type from the log
                        
                        # Handle based on production type
                        if production_type == "bulk":
                            # Bulk production - quantities are already in KG
                            # Convert to MT if product unit is MT
                            if product_unit.upper() == "MT":
                                grn_quantity = required_qty / 1000
                                grn_unit = "MT"
                            else:
                                grn_quantity = required_qty
                                grn_unit = "KG"
                        elif packaging != "BULK" and net_weight_kg and net_weight_kg > 0:
                            # Drummed production - convert drums to KG/MT
                            total_kg = required_qty * net_weight_kg
                            if product_unit.upper() == "MT":
                                grn_quantity = total_kg / 1000
                                grn_unit = "MT"
                            else:
                                grn_quantity = total_kg
                                grn_unit = "KG"
                        else:
                            # Fallback - use required_qty as-is
                            grn_quantity = required_qty
                            grn_unit = product_unit
                        
                        # Create GRN
                        grn_number = await generate_sequence("GRN", "grn")
                        grn_item = GRNItem(
                            product_id=data.product_id,
                            product_name=product_name,
                            sku=product_sku,
                            quantity=grn_quantity,
                            unit=grn_unit
                        )
                        grn_data = GRNCreate(
                            supplier="INTERNAL PRODUCTION",
                            items=[grn_item],
                            notes=f"Production completion for {job_order.get('job_number', 'N/A')} - Auto-generated from production log"
                        )
                        grn = GRN(**grn_data.model_dump(), grn_number=grn_number, received_by=current_user["id"])
                        await db.grn.insert_one(grn.model_dump())
                        
                        # Update inventory - ADD finished goods
                        item_id_for_balance = await find_inventory_item_id(
                            data.product_id, 
                            product_name, 
                            product_sku
                        )
                        
                        # Get inventory item and product for unit conversion
                        inventory_item = await db.inventory_items.find_one({"id": item_id_for_balance}, {"_id": 0})
                        
                        # Determine the inventory item's unit
                        if inventory_item:
                            inventory_item_unit = inventory_item.get("uom", "KG").upper()
                        elif product:
                            inventory_item_unit = product.get("unit", "KG").upper()
                        else:
                            inventory_item_unit = "KG"
                        
                        # Convert GRN quantity to match inventory item's unit
                        grn_unit_upper = grn_unit.upper()
                        if inventory_item_unit == "KG":
                            if grn_unit_upper == "MT":
                                quantity_to_add = grn_quantity * 1000
                            else:
                                quantity_to_add = grn_quantity
                        elif inventory_item_unit == "MT":
                            if grn_unit_upper == "KG":
                                quantity_to_add = grn_quantity / 1000
                            else:
                                quantity_to_add = grn_quantity
                        else:
                            quantity_to_add = grn_quantity if grn_unit_upper == "KG" else grn_quantity * 1000
                        
                        # Update products table
                        if product:
                            prev_stock = product.get("current_stock", 0)
                            new_stock = prev_stock + quantity_to_add
                            await db.products.update_one({"id": data.product_id}, {"$set": {"current_stock": new_stock}})
                            
                            # Create inventory movement record
                            movement = InventoryMovement(
                                product_id=data.product_id,
                                product_name=product_name,
                                sku=product_sku,
                                movement_type="production_complete",
                                quantity=quantity_to_add,
                                reference_type="grn",
                                reference_id=grn.id,
                                reference_number=grn_number,
                                previous_stock=prev_stock,
                                new_stock=new_stock,
                                created_by=current_user["id"]
                            )
                            await db.inventory_movements.insert_one(movement.model_dump())
                        
                        # Update inventory_balances
                        await db.inventory_balances.update_one(
                            {"item_id": item_id_for_balance},
                            {"$inc": {"on_hand": quantity_to_add}},
                            upsert=True
                        )
                        
                        # Also update inventory_balances using product_id directly if different
                        if product and data.product_id != item_id_for_balance:
                            await db.inventory_balances.update_one(
                                {"item_id": data.product_id},
                                {"$inc": {"on_hand": quantity_to_add}},
                                upsert=True
                            )
                        
                        # Reserve the quantity for bulk production (will be un-reserved when dispatched)
                        if data.production_type == "bulk":
                            reservation_id = str(uuid.uuid4())
                            reservation = {
                                "id": reservation_id,
                                "item_id": data.product_id,
                                "qty": quantity_to_add,  # Reserve the actual quantity added to stock
                                "reserved_for": "production_filling_complete",
                                "reference_type": "production_log",
                                "reference_id": log.id,
                                "job_order_id": data.job_order_id,
                                "created_at": datetime.now(timezone.utc).isoformat(),
                                "created_by": current_user["id"]
                            }
                            await db.inventory_reservations.insert_one(reservation)
                    except Exception as e:
                        # Log error but don't fail the production log creation
                        logging.error(f"Failed to create GRN for completed production: {str(e)}")
        else:
            # Handle new multi-item structure
            for item in items:
                if item.get("product_id") == data.product_id:
                    required_qty = item.get("quantity", 0)
                    if total_produced >= required_qty:
                        # Mark this item as complete
                        await db.job_orders.update_one(
                            {"id": data.job_order_id, "items.product_id": data.product_id},
                            {"$set": {"items.$.production_completed": True}}
                        )
                        
                        # Automatically create GRN for this completed item
                        try:
                            # Get product details
                            product = await db.products.find_one({"id": data.product_id}, {"_id": 0})
                            product_name = product.get("name", data.product_name) if product else data.product_name
                            product_sku = product.get("sku", "-") if product else "-"
                            product_unit = product.get("unit", "KG") if product else "KG"
                            
                            # Get net_weight_kg from job order item for drum-to-MT conversion
                            packaging = item.get("packaging", job_order.get("packaging", "")).upper()
                            net_weight_kg = item.get("net_weight_kg")
                            production_type = data.production_type  # Get production type from the log
                            
                            # Handle based on production type
                            if production_type == "bulk":
                                # Bulk production - quantities are already in KG
                                # Convert to MT if product unit is MT
                                if product_unit.upper() == "MT":
                                    grn_quantity = required_qty / 1000
                                    grn_unit = "MT"
                                else:
                                    grn_quantity = required_qty
                                    grn_unit = "KG"
                            elif packaging != "BULK" and net_weight_kg and net_weight_kg > 0:
                                # Drummed production - convert drums to KG/MT
                                total_kg = required_qty * net_weight_kg
                                if product_unit.upper() == "MT":
                                    grn_quantity = total_kg / 1000
                                    grn_unit = "MT"
                                else:
                                    grn_quantity = total_kg
                                    grn_unit = "KG"
                            else:
                                # Fallback - use required_qty as-is
                                grn_quantity = required_qty
                                grn_unit = product_unit
                            
                            # Create GRN for this item
                            grn_number = await generate_sequence("GRN", "grn")
                            grn_item = GRNItem(
                                product_id=data.product_id,
                                product_name=product_name,
                                sku=product_sku,
                                quantity=grn_quantity,
                                unit=grn_unit
                            )
                            grn_data = GRNCreate(
                                supplier="INTERNAL PRODUCTION",
                                items=[grn_item],
                                notes=f"Production completion for {job_order.get('job_number', 'N/A')} - Item: {product_name} - Auto-generated from production log"
                            )
                            grn = GRN(**grn_data.model_dump(), grn_number=grn_number, received_by=current_user["id"])
                            await db.grn.insert_one(grn.model_dump())
                            
                            # Update inventory - same logic as above
                            item_id_for_balance = await find_inventory_item_id(
                                data.product_id, 
                                product_name, 
                                product_sku
                            )
                            
                            inventory_item = await db.inventory_items.find_one({"id": item_id_for_balance}, {"_id": 0})
                            
                            if inventory_item:
                                inventory_item_unit = inventory_item.get("uom", "KG").upper()
                            elif product:
                                inventory_item_unit = product.get("unit", "KG").upper()
                            else:
                                inventory_item_unit = "KG"
                            
                            grn_unit_upper = grn_unit.upper()
                            if inventory_item_unit == "KG":
                                if grn_unit_upper == "MT":
                                    quantity_to_add = grn_quantity * 1000
                                else:
                                    quantity_to_add = grn_quantity
                            elif inventory_item_unit == "MT":
                                if grn_unit_upper == "KG":
                                    quantity_to_add = grn_quantity / 1000
                                else:
                                    quantity_to_add = grn_quantity
                            else:
                                quantity_to_add = grn_quantity if grn_unit_upper == "KG" else grn_quantity * 1000
                            
                            if product:
                                prev_stock = product.get("current_stock", 0)
                                new_stock = prev_stock + quantity_to_add
                                await db.products.update_one({"id": data.product_id}, {"$set": {"current_stock": new_stock}})
                                
                                movement = InventoryMovement(
                                    product_id=data.product_id,
                                    product_name=product_name,
                                    sku=product_sku,
                                    movement_type="production_complete",
                                    quantity=quantity_to_add,
                                    reference_type="grn",
                                    reference_id=grn.id,
                                    reference_number=grn_number,
                                    previous_stock=prev_stock,
                                    new_stock=new_stock,
                                    created_by=current_user["id"]
                                )
                                await db.inventory_movements.insert_one(movement.model_dump())
                            
                            await db.inventory_balances.update_one(
                                {"item_id": item_id_for_balance},
                                {"$inc": {"on_hand": quantity_to_add}},
                                upsert=True
                            )
                            
                            if product and data.product_id != item_id_for_balance:
                                await db.inventory_balances.update_one(
                                    {"item_id": data.product_id},
                                    {"$inc": {"on_hand": quantity_to_add}},
                                    upsert=True
                                )
                            
                            # Reserve the quantity for bulk production (will be un-reserved when dispatched)
                            if data.production_type == "bulk":
                                reservation_id = str(uuid.uuid4())
                                reservation = {
                                    "id": reservation_id,
                                    "item_id": data.product_id,
                                    "qty": quantity_to_add,  # Reserve the actual quantity added to stock
                                    "reserved_for": "production_filling_complete",
                                    "reference_type": "production_log",
                                    "reference_id": log.id,
                                    "job_order_id": data.job_order_id,
                                    "created_at": datetime.now(timezone.utc).isoformat(),
                                    "created_by": current_user["id"]
                                }
                                await db.inventory_reservations.insert_one(reservation)
                        except Exception as e:
                            logging.error(f"Failed to create GRN for completed production item: {str(e)}")
                        
                        # Check if all items are complete
                        all_items_complete = True
                        for job_item in items:
                            if not job_item.get("production_completed", False):
                                # Check if production is complete via logs
                                item_logs = await db.production_logs.find(
                                    {"job_order_id": data.job_order_id, "product_id": job_item.get("product_id")},
                                    {"_id": 0}
                                ).to_list(1000)
                                item_produced = sum(log_entry.get("quantity_produced", 0) for log_entry in item_logs)
                                if item_produced < job_item.get("quantity", 0):
                                    all_items_complete = False
                                    break
                        
                        if all_items_complete:
                            await db.job_orders.update_one(
                                {"id": data.job_order_id},
                                {"$set": {"status": "ready_for_dispatch"}}
                            )
    
    return log

@api_router.get("/production/logs", response_model=List[ProductionLog])
async def get_production_logs(
    job_order_id: Optional[str] = None,
    product_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get production logs with optional filters"""
    query = {}
    if job_order_id:
        query["job_order_id"] = job_order_id
    if product_id:
        query["product_id"] = product_id
    
    logs = await db.production_logs.find(query, {"_id": 0}).sort("production_date", -1).to_list(1000)
    return logs

@api_router.get("/production/logs/batch/{job_number}")
async def get_batch_by_job_number(job_number: str, current_user: dict = Depends(get_current_user)):
    """Get batch number from production logs by job number"""
    log = await db.production_logs.find_one(
        {"job_number": job_number},
        {"_id": 0}
    )
    
    if log:
        return {
            "batch_number": log.get("batch_number"),
            "production_type": log.get("production_type", "drummed"),
            "quantity_produced": log.get("quantity_produced"),
            "production_date": log.get("production_date"),
            "found": True
        }
    
    return {"batch_number": None, "found": False}

@api_router.get("/production/jobs-by-category")
async def get_jobs_by_category(
    category: str,
    current_user: dict = Depends(get_current_user)
):
    """Get job orders filtered by product category (Filling Jobs, Lubricants, Plasticisers, Jelly)"""
    # Get all job orders with status in_production, approved, or pending
    jobs = await db.job_orders.find(
        {"status": {"$in": ["approved", "in_production", "pending", "production_completed"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    # Filter by category
    filtered_jobs = []
    for job in jobs:
        # Handle both single product (legacy) and multi-item structure
        items = job.get("items", [])
        if not items:
            # Legacy single product structure
            should_include = False
            
            if category == "filling_jobs":
                # Filling jobs: include ALL products (both MANUFACTURED and TRADED)
                # All products need to go through the filling process
                should_include = True
            elif category == "lubricants":
                product_name = job.get("product_name", "").lower()
                should_include = any(pattern in product_name for pattern in ["lubricant", "lube", "grease"])
            elif category == "plasticisers":
                product_name = job.get("product_name", "").lower()
                should_include = any(pattern in product_name for pattern in ["plasticiser", "plasticizer", "plastic"])
            elif category == "jelly":
                product_name = job.get("product_name", "").lower()
                should_include = any(pattern in product_name for pattern in ["jelly", "gel", "jell"])
            
            if should_include:
                # Get production logs for this job
                logs = await db.production_logs.find(
                    {"job_order_id": job["id"], "product_id": job.get("product_id")},
                    {"_id": 0}
                ).to_list(1000)
                
                total_produced = sum(log.get("quantity_produced", 0) for log in logs)
                required_qty = job.get("quantity", 0)
                pending_qty = max(0, required_qty - total_produced)
                
                filtered_jobs.append({
                    "job_id": job["id"],
                    "job_number": job.get("job_number", ""),
                    "product_id": job.get("product_id"),
                    "product_name": job.get("product_name"),
                    "product_sku": job.get("product_sku"),
                    "container": job.get("packaging", "Bulk"),
                    "quantity": required_qty,
                    "quantity_produced": total_produced,
                    "quantity_pending": pending_qty,
                    "status": job.get("status"),
                    "delivery_date": job.get("delivery_date"),
                    "net_weight_kg": job.get("net_weight_kg"),
                })
        else:
            # New multi-item structure
            for item in items:
                should_include = False
                
                if category == "filling_jobs":
                    # Filling jobs: include ALL products (both MANUFACTURED and TRADED)
                    # All products need to go through the filling process
                    should_include = True
                elif category == "lubricants":
                    product_name = item.get("product_name", "").lower()
                    should_include = any(pattern in product_name for pattern in ["lubricant", "lube", "grease"])
                elif category == "plasticisers":
                    product_name = item.get("product_name", "").lower()
                    should_include = any(pattern in product_name for pattern in ["plasticiser", "plasticizer", "plastic"])
                elif category == "jelly":
                    product_name = item.get("product_name", "").lower()
                    should_include = any(pattern in product_name for pattern in ["jelly", "gel", "jell"])
                
                if should_include:
                    # Get production logs for this item
                    logs = await db.production_logs.find(
                        {"job_order_id": job["id"], "product_id": item.get("product_id")},
                        {"_id": 0}
                    ).to_list(1000)
                    
                    total_produced = sum(log.get("quantity_produced", 0) for log in logs)
                    required_qty = item.get("quantity", 0)
                    pending_qty = max(0, required_qty - total_produced)
                    
                    filtered_jobs.append({
                        "job_id": job["id"],
                        "job_number": job.get("job_number", ""),
                        "product_id": item.get("product_id"),
                        "product_name": item.get("product_name"),
                        "product_sku": item.get("product_sku"),
                        "container": item.get("packaging", "Bulk"),
                        "quantity": required_qty,
                        "quantity_produced": total_produced,
                        "quantity_pending": pending_qty,
                        "status": job.get("status"),
                        "delivery_date": job.get("delivery_date"),
                        "net_weight_kg": item.get("net_weight_kg"),
                    })
    
    return {"jobs": filtered_jobs}

# ==================== BLEND REPORT ====================

class BlendReportCreate(BaseModel):
    job_order_id: str
    batch_number: str
    blend_date: str
    operator_name: str
    materials_used: List[Dict[str, Any]]  # [{product_id, product_name, sku, batch_lot, quantity_used}]
    process_parameters: Dict[str, Any] = {}  # {temperature, mixing_time, speed, etc}
    quality_checks: Dict[str, Any] = {}  # {viscosity, ph, density, etc}
    output_quantity: float
    yield_percentage: float
    notes: Optional[str] = None

class BlendReport(BlendReportCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    report_number: str = ""
    job_number: str = ""
    product_name: str = ""
    status: str = "draft"  # draft, submitted, approved
    created_by: str = ""
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

@api_router.post("/blend-reports", response_model=BlendReport)
async def create_blend_report(data: BlendReportCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "production", "qc"], required_page="/production-schedule"):
        raise HTTPException(status_code=403, detail="Only production/QC can create blend reports")
    
    job = await db.job_orders.find_one({"id": data.job_order_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    report_number = await generate_sequence("BLR", "blend_reports")
    
    report = BlendReport(
        **data.model_dump(),
        report_number=report_number,
        job_number=job["job_number"],
        product_name=job["product_name"],
        created_by=current_user["id"]
    )
    await db.blend_reports.insert_one(report.model_dump())
    
    # Update job order with blend report reference
    await db.job_orders.update_one(
        {"id": data.job_order_id},
        {"$set": {"blend_report": report_number}}
    )
    
    return report

@api_router.get("/blend-reports")
async def get_blend_reports(job_order_id: Optional[str] = None, status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if job_order_id:
        query["job_order_id"] = job_order_id
    if status:
        query["status"] = status
    
    reports = await db.blend_reports.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return reports

@api_router.get("/blend-reports/{report_id}")
async def get_blend_report(report_id: str, current_user: dict = Depends(get_current_user)):
    report = await db.blend_reports.find_one({"id": report_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Blend report not found")
    return report

@api_router.put("/blend-reports/{report_id}/approve")
async def approve_blend_report(report_id: str, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "qc"], required_page="/production-schedule"):
        raise HTTPException(status_code=403, detail="Only QC can approve blend reports")
    
    result = await db.blend_reports.update_one(
        {"id": report_id},
        {"$set": {
            "status": "approved",
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Blend report not found")
    return {"message": "Blend report approved"}

# ==================== PDF GENERATION ====================

def create_standard_document_header(document_title: str, styles) -> list:
    """
    Creates an enhanced header with modern styling:
    - Logo at the top (centered)
    - Company header below with logo/company name on left and details on right
    - Document title below the header
    
    Returns a list of elements to be added to the PDF
    """
    elements = []
    
    # Company information
    company_name = "Asia Petrochemicals LLC"
    company_address = "PO Box 76283 Ras Al Khaimah U A E."
    company_phone = "T +971 4 2384533"
    company_fax = "F +971 4 2384534"
    company_trn = "TRN: 100283348900003"
    
    # Logo - will be on left side of header, next to company info
    logo_path = ROOT_DIR / "assets" / "logo.png"
    if not logo_path.exists():
        logo_path = ROOT_DIR / "assets" / "logo-color.png"
    
    logo_cell = Paragraph("&nbsp;", styles['Normal'])
    if logo_path.exists():
        try:
            # Logo on left side, sized appropriately
            logo = Image(str(logo_path), width=6*cm, height=2*cm)
            logo_cell = logo
        except Exception as e:
            logging.warning(f"Failed to load logo: {e}")
    
    # Company info on the right - modern styling
    company_info_style = ParagraphStyle(
        'CompanyInfo', 
        parent=styles['Normal'], 
        fontSize=10,
        alignment=TA_RIGHT, 
        leading=13,
        textColor=colors.HexColor('#212529')  # Bootstrap dark gray
    )
    
    # Enhanced company info with better formatting
    company_info_text = (
        f"<b><font size='12' color='#254c91'>{company_name}</font></b><br/>"
        f"{company_address}<br/>"
        f"{company_phone} &nbsp; {company_fax}<br/>"
        f"<b>{company_trn}</b>"
    )
    company_info_cell = Paragraph(company_info_text, company_info_style)
    
    # Create header table: logo (left) | company info (right) - aligned next to each other
    # Calculate widths: A4 width is 21cm, with 0.6cm margins = 19.8cm available
    header_table = Table(
        [[logo_cell, company_info_cell]], 
        colWidths=[9.9*cm, 9.9*cm]  # Logo left, company info right
    )
    
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),   # Logo left-aligned
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),  # Company info right-aligned
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(header_table)
    
    # Modern Document Title - Large, Bold, Blue (below the header)
    title_style = ParagraphStyle(
        'Title', 
        parent=styles['Heading1'], 
        fontSize=20,  # Slightly smaller for single page
        alignment=TA_CENTER, 
        spaceAfter=0.1*cm, 
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#254c91'),  # Blue color matching the design
        leading=24
    )
    elements.append(Paragraph(document_title.upper(), title_style))
    
    # Add a subtle divider line (Bootstrap-style)
    divider = Table([[""]], colWidths=[19.8*cm])
    divider.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (0, 0), 2, colors.HexColor('#dee2e6')),  # Bootstrap light gray
        ('TOPPADDING', (0, 0), (0, 0), 0.2*cm),
        ('BOTTOMPADDING', (0, 0), (0, 0), 0.2*cm),
    ]))
    elements.append(divider)
    elements.append(Spacer(1, 0.2*cm))
    
    return elements

def generate_cro_pdf(booking: dict, job_orders: list) -> BytesIO:
    """Generate CRO/Loading Instructions PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER, spaceAfter=20)
    elements.append(Paragraph("CONTAINER RELEASE ORDER / LOADING INSTRUCTIONS", title_style))
    elements.append(Spacer(1, 10))
    
    # Booking Details
    booking_data = [
        ["Booking Number:", booking.get("booking_number", ""), "CRO Number:", booking.get("cro_number", "")],
        ["Shipping Line:", booking.get("shipping_line", ""), "Vessel:", booking.get("vessel_name", "")],
        ["Container:", f"{booking.get('container_count', 1)}x {booking.get('container_type', '').upper()}", "Vessel Date:", booking.get("vessel_date", "")],
        ["Port of Loading:", booking.get("port_of_loading", ""), "Port of Discharge:", booking.get("port_of_discharge", "")],
        ["Cutoff Date:", booking.get("cutoff_date", ""), "Gate Cutoff:", booking.get("gate_cutoff", "")],
        ["Pickup Date:", booking.get("pickup_date", ""), "VGM Cutoff:", booking.get("vgm_cutoff", "")],
    ]
    
    booking_table = Table(booking_data, colWidths=[2.5*cm, 5*cm, 2.5*cm, 5*cm])
    booking_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(booking_table)
    elements.append(Spacer(1, 20))
    
    # Cargo Details
    elements.append(Paragraph("CARGO TO LOAD:", styles['Heading2']))
    elements.append(Spacer(1, 10))
    
    cargo_header = ["Job Number", "Product", "Quantity", "Packaging"]
    cargo_data = [cargo_header]
    
    for job in job_orders:
        cargo_data.append([
            job.get("job_number", ""),
            job.get("product_name", ""),
            str(job.get("quantity", "")),
            job.get("packaging", "Bulk")
        ])
    
    cargo_table = Table(cargo_data, colWidths=[3.5*cm, 7*cm, 2.5*cm, 2.5*cm])
    cargo_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 5),
        ('ALIGN', (2, 0), (2, -1), 'CENTER'),
    ]))
    elements.append(cargo_table)
    elements.append(Spacer(1, 20))
    
    # Instructions
    elements.append(Paragraph("LOADING INSTRUCTIONS:", styles['Heading2']))
    instructions = """
    1. Ensure container is clean and dry before loading<br/>
    2. Check container for any damage or holes<br/>
    3. Verify seal numbers before and after loading<br/>
    4. Take photos of empty container, during loading, and sealed container<br/>
    5. Complete VGM declaration before gate cutoff<br/>
    6. Ensure all cargo matches the job order quantities<br/>
    """
    elements.append(Paragraph(instructions, styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Footer
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

def generate_blend_report_pdf(report: dict) -> BytesIO:
    """Generate Blend Report PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER, spaceAfter=20)
    elements.append(Paragraph("BLEND / PRODUCTION REPORT", title_style))
    elements.append(Spacer(1, 10))
    
    # Report Info
    info_data = [
        ["Report Number:", report.get("report_number", ""), "Job Number:", report.get("job_number", "")],
        ["Product:", report.get("product_name", ""), "Batch Number:", report.get("batch_number", "")],
        ["Blend Date:", report.get("blend_date", ""), "Operator:", report.get("operator_name", "")],
        ["Output Quantity:", str(report.get("output_quantity", "")), "Yield:", f"{report.get('yield_percentage', '')}%"],
    ]
    
    info_table = Table(info_data, colWidths=[3*cm, 5*cm, 3*cm, 4.5*cm])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 20))
    
    # Materials Used
    elements.append(Paragraph("MATERIALS USED:", styles['Heading2']))
    mat_header = ["Material", "SKU", "Batch/Lot", "Quantity Used"]
    mat_data = [mat_header]
    
    for mat in report.get("materials_used", []):
        mat_data.append([
            mat.get("product_name", ""),
            mat.get("sku", ""),
            mat.get("batch_lot", ""),
            str(mat.get("quantity_used", ""))
        ])
    
    mat_table = Table(mat_data, colWidths=[5.5*cm, 3*cm, 3.5*cm, 3.5*cm])
    mat_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(mat_table)
    elements.append(Spacer(1, 20))
    
    # Process Parameters
    if report.get("process_parameters"):
        elements.append(Paragraph("PROCESS PARAMETERS:", styles['Heading2']))
        param_data = [[k, str(v)] for k, v in report.get("process_parameters", {}).items()]
        if param_data:
            param_table = Table(param_data, colWidths=[5*cm, 10.5*cm])
            param_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 5),
            ]))
            elements.append(param_table)
            elements.append(Spacer(1, 20))
    
    # Quality Checks
    if report.get("quality_checks"):
        elements.append(Paragraph("QUALITY CHECKS:", styles['Heading2']))
        qc_data = [[k, str(v)] for k, v in report.get("quality_checks", {}).items()]
        if qc_data:
            qc_table = Table(qc_data, colWidths=[5*cm, 10.5*cm])
            qc_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 5),
            ]))
            elements.append(qc_table)
            elements.append(Spacer(1, 20))
    
    # Status and Approval
    status_text = f"Status: {report.get('status', 'draft').upper()}"
    if report.get("approved_at"):
        status_text += f" | Approved: {report.get('approved_at')}"
    elements.append(Paragraph(status_text, styles['Normal']))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

@api_router.get("/pdf/cro/{booking_id}")
async def download_cro_pdf(booking_id: str, token: Optional[str] = None, current_user: dict = Depends(get_current_user_optional)):
    """Download CRO / Loading Instructions PDF"""
    # Authentication is handled by get_current_user_optional
    
    booking = await db.shipping_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Get job orders
    job_orders = []
    for job_id in booking.get("job_order_ids", []):
        job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
        if job:
            job_orders.append(job)
    
    pdf_buffer = generate_cro_pdf(booking, job_orders)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=CRO_{booking.get('booking_number', 'unknown')}.pdf"}
    )

@api_router.get("/pdf/blend-report/{report_id}")
async def download_blend_report_pdf(report_id: str, token: Optional[str] = None, current_user: dict = Depends(get_current_user_optional)):
    """Download Blend Report PDF"""
    # Authentication is handled by get_current_user_optional
    
    report = await db.blend_reports.find_one({"id": report_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Blend report not found")
    
    pdf_buffer = generate_blend_report_pdf(report)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=BlendReport_{report.get('report_number', 'unknown')}.pdf"}
    )

# ==================== QUOTATION PDF GENERATION ====================

def number_to_words(num: float) -> str:
    """Convert number to words (e.g., 1234.56 -> One Thousand Two Hundred Thirty Four and 56/100)"""
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
    teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    
    def convert_hundreds(n):
        result = ""
        if n >= 100:
            result += ones[n // 100] + " Hundred "
            n %= 100
        if n >= 20:
            result += tens[n // 10] + " "
            n %= 10
        elif n >= 10:
            result += teens[n - 10] + " "
            return result
        if n > 0:
            result += ones[n] + " "
        return result
    
    if num == 0:
        return "Zero"
    
    integer_part = int(num)
    decimal_part = int((num - integer_part) * 100)
    
    if integer_part == 0:
        words = "Zero"
    else:
        words = ""
        if integer_part >= 1000000:
            words += convert_hundreds(integer_part // 1000000).strip() + " Million "
            integer_part %= 1000000
        if integer_part >= 1000:
            words += convert_hundreds(integer_part // 1000).strip() + " Thousand "
            integer_part %= 1000
        if integer_part > 0:
            words += convert_hundreds(integer_part)
        words = words.strip()
    
    if decimal_part > 0:
        words += f" and {decimal_part}/100"
    
    return words

def generate_quotation_pdf(quotation: dict, include_stamp_signature: bool = False, dispatch_contact: Optional[dict] = None) -> BytesIO:
    """Generate Quotation/PFI PDF matching PHP template design"""
    buffer = BytesIO()
    # Reduced margins for single page layout
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.2*cm, bottomMargin=0.2*cm, leftMargin=0.6*cm, rightMargin=0.6*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Standardized Header - always "PROFORMA INVOICE"
    document_title = "Proforma Invoice"
    elements.extend(create_standard_document_header(document_title, styles))
    
    # Add document meta info (Proforma Invoice #, Date, Valid Till) - matching PHP
    meta_style = ParagraphStyle(
        'Meta', 
        parent=styles['Normal'], 
        fontSize=9, 
        alignment=TA_CENTER, 
        spaceAfter=3,
        textColor=colors.HexColor('#254c91')  # Matching PHP meta color
    )
    
    # Build meta text (matching PHP structure)
    pfi_number = quotation.get("pfi_number", quotation.get("inquiry_id", "N/A"))
    created_date = quotation.get("created_at", "")[:10] if quotation.get("created_at") else ""
    validity_date = quotation.get("validity_date", "")
    if not validity_date and quotation.get("validity_days"):
        # Calculate validity date if only days provided
        try:
            from datetime import datetime, timedelta
            if created_date:
                valid_from = datetime.strptime(created_date, "%Y-%m-%d")
                valid_to = valid_from + timedelta(days=int(quotation.get("validity_days", 30)))
                validity_date = valid_to.strftime("%Y-%m-%d")
        except:
            validity_date = ""
    
    meta_text = f"<b>Proforma Invoice #:</b> <b>{pfi_number}</b><br/>"
    if created_date:
        meta_text += f"Date: {created_date}<br/>"
    if validity_date:
        meta_text += f"Valid Till: {validity_date}"
    
    elements.append(Paragraph(meta_text, meta_style))
    elements.append(Spacer(1, 2))
    
    # Get customer details (from quotation or use defaults)
    customer_name = quotation.get("customer_name", "") or ""
    customer_address = quotation.get("customer_address", "") or ""
    customer_city = quotation.get("customer_city", "") or ""
    customer_country = quotation.get("customer_country", "") or ""
    customer_phone = quotation.get("customer_phone", "") or ""
    customer_email = quotation.get("customer_email", "") or ""
    
    # Build receiver/consignee text with all available fields
    receiver_text = f"<b>{customer_name}</b>" if customer_name else ""
    if customer_address:
        receiver_text += f"<br/>{customer_address}"
    if customer_city or customer_country:
        city_country = ", ".join(filter(None, [customer_city, customer_country]))
        if city_country:
            receiver_text += f"<br/>{city_country}"
    if customer_phone:
        receiver_text += f"<br/>Phone: {customer_phone}"
    if customer_email:
        receiver_text += f"<br/>Email: {customer_email}"
    
    # Shipper/Receiver Table
    # Create a style for shipper/receiver cells
    shipper_receiver_style = ParagraphStyle(
        'ShipperReceiver', 
        parent=styles['Normal'], 
        fontSize=9, 
        alignment=TA_LEFT,
        leading=12
    )
    
    # Build shipper text as Paragraph (so HTML is parsed)
    shipper_text = f"<b>Asia Petrochemicals LLC</b><br/>Plot # A 23 B, Al Jazeera Industrial Area<br/>Ras Al Khaimah, UAE<br/>Tel No - 042384533<br/>Fax No - 042384534<br/>Emirate : Ras al-Khaimah<br/>E-Mail : info@asia-petrochem.com"
    shipper_para = Paragraph(shipper_text, shipper_receiver_style)
    
    # Build receiver text as Paragraph (so HTML is parsed)
    receiver_para = Paragraph(receiver_text if receiver_text else "—", shipper_receiver_style)
    
    shipper_receiver_data = [
        ["SHIPPER", "RECEIVER/CONSIGNEE"],
        [shipper_para, receiver_para]
    ]
    shipper_receiver_table = Table(shipper_receiver_data, colWidths=[9.9*cm, 9.9*cm])
    shipper_receiver_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#0f172a')),  # Darker blue-gray
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 3),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ]))
    elements.append(shipper_receiver_table)
    elements.append(Spacer(1, 3))
    
    # Items Table - matching PHP template styling
    # Determine if local or export for column headers
    order_type = str(quotation.get("order_type", "local") or "local").lower()
    customer_type = str(quotation.get("customer_type", order_type) or order_type).lower()  # Fallback to order_type
    is_local = (customer_type == "local" or order_type == "local")
    
    # Get country of origin from quotation (default to UAE if not specified)
    country_of_origin = quotation.get("country_of_origin", "UAE") or "UAE"
    
    if is_local:
        items_header = ["#", "Description of Goods", "Container", "Qty", "Unit Price", "Grand Total"]
    else:
        # Determine U.O.M from first item to set header
        first_item = quotation.get("items", [{}])[0] if quotation.get("items") else {}
        uom = first_item.get("uom") or "per_mt"
        
        # If U.O.M is not set, try to infer from packaging (only if not explicitly set)
        if not first_item.get("uom"):
            packaging = str(first_item.get("packaging", "") or "").lower()
            packaging_type = str(first_item.get("packaging_type", "") or "").lower()
            
            if any(keyword in packaging for keyword in ["drum", "carton", "pail", "ibc", "bag", "box"]):
                uom = "per_unit"
            elif any(keyword in packaging_type for keyword in ["drum", "carton", "pail", "ibc"]):
                uom = "per_unit"
            elif any(keyword in packaging for keyword in ["flexi", "iso", "tank"]):
                uom = "per_liter"
            elif packaging == "bulk" or packaging_type == "bulk":
                uom = "per_mt"
        
        if uom == "per_unit":
            price_header = "Unit Price Per Unit"
        elif uom == "per_liter":
            price_header = "Unit Price Per Liter"
        else:  # per_mt
            price_header = "Unit Price Per MT"
        
        items_header = ["#", "Description of Goods", "Container/Tank", "Qty", price_header, "Grand Total"]
    
    items_data = [items_header]
    
    currency_symbol = {"USD": "$", "AED": "AED ", "EUR": "€"}.get(quotation.get("currency", "USD"), "$")
    
    # Create item description style once (outside loop for efficiency)
    item_desc_style = ParagraphStyle('ItemDesc', parent=styles['Normal'], fontSize=9, alignment=TA_LEFT)
    
    for idx, item in enumerate(quotation.get("items", []), 1):
        try:
            qty = float(item.get("quantity", 0) or 0)
            unit_price = float(item.get("unit_price", 0) or 0)
            total = float(item.get("total", qty * unit_price) or 0)
            
            # Get U.O.M from item, or infer from packaging type
            uom = item.get("uom") or "per_mt"
            
            # If U.O.M is not set, try to infer from packaging (only if not explicitly set)
            if not item.get("uom"):
                packaging = str(item.get("packaging", "") or "").lower()
                packaging_type = str(item.get("packaging_type", "") or "").lower()
                
                # Infer U.O.M from packaging
                if any(keyword in packaging for keyword in ["drum", "carton", "pail", "ibc", "bag", "box"]):
                    uom = "per_unit"
                elif any(keyword in packaging_type for keyword in ["drum", "carton", "pail", "ibc"]):
                    uom = "per_unit"
                elif any(keyword in packaging for keyword in ["flexi", "iso", "tank"]):
                    uom = "per_liter"  # Flexi/ISO tanks typically priced per liter
                elif packaging == "bulk" or packaging_type == "bulk":
                    uom = "per_mt"
                # else keep as per_mt
            
            # Get net weight early (needed for calculation)
            net_weight_kg = float(item.get("net_weight_kg", 0) or 0)
            
            # Display quantity based on U.O.M
            if uom == "per_unit":
                # For cartons, pails, drums: show actual quantity with comma formatting
                qty_display = f"{int(qty):,}"  # e.g., "8,000" not "8.000"
            elif uom == "per_liter":
                # For liters: show quantity with comma formatting
                qty_display = f"{qty:,.0f}" if qty == int(qty) else f"{qty:,.2f}"
            else:  # per_mt
                # For bulk: calculate and show MT
                qtyMT = (qty * net_weight_kg) / 1000.0 if qty > 0 and net_weight_kg > 0 else qty
                qty_display = f"{qtyMT:,.3f}"
            
            # Product description with packaging, net weight, and country of origin (matching ViewQuote.jsx)
            product_name = str(item.get('product_name', '') or '')
            product_desc = f"<b>{product_name}</b>"
            packaging = str(item.get("packaging", "") or "")
            if packaging:
                product_desc += f"<br/><b>Packing:</b> {packaging}"
            
            # Get country of origin early (needed for description)
            item_country_of_origin = item.get("country_of_origin", country_of_origin) or country_of_origin
            
            # Add Net weight and Country of origin to description (matching ViewQuote.jsx)
            if net_weight_kg:
                product_desc += f"<br/><b>Net weight:</b> {net_weight_kg} kg"
            else:
                product_desc += f"<br/><b>Net weight:</b> —"
            
            # Add country of origin to description
            product_desc += f"<br/><b>Country of origin:</b> {item_country_of_origin}"
            
            # Add HSCode below country of origin
            hscode = item.get("hscode") or quotation.get("hscode") or ""
            if hscode:
                product_desc += f"<br/><b>HSCode:</b> {hscode}"
            
            # Use Paragraph for description to handle HTML formatting
            desc_para = Paragraph(product_desc, item_desc_style)
            
            # Get container with count - use container_count_per_item for per-item allocation
            container_count_per_item = item.get("container_count_per_item")
            container_type = (item.get("container_type") or 
                        quotation.get("container_type") or 
                        "—")
            container_type = str(container_type) if container_type != "—" else "—"
            
            # Use per-item container count if available, otherwise fallback to packing_display or quotation total
            if container_count_per_item and container_count_per_item > 0:
                # Format container type for display
                if container_type == "20ft":
                    container_display = f"{container_count_per_item} x 20ft"
                elif container_type == "40ft":
                    container_display = f"{container_count_per_item} x 40ft"
                else:
                    container_display = f"{container_count_per_item} x {container_type}"
                container = container_display
            elif container_type != "—":
                # Fallback: use packing_display if available
                packing_display = item.get("packing_display", "")
                if packing_display:
                    container = packing_display
                else:
                    # Last fallback: use quotation container count
                    container_count = quotation.get("container_count") or 1
                    container = f"{container_count} x {container_type}"
            else:
                container = "—"
            
            items_data.append([
                str(idx),
                desc_para,  # Use Paragraph for HTML formatting
                container,  # Container/Tank info (per-item allocation)
                qty_display,  # Use dynamic qty_display based on U.O.M
                f"{currency_symbol}{unit_price:,.2f}",
                f"{currency_symbol}{total:,.2f}"
            ])
        except Exception as e:
            # Fallback for items with errors
            items_data.append([
                str(idx),
                Paragraph(f"<b>{str(item.get('product_name', 'N/A'))}</b>", item_desc_style),
                "—",
                "0",
                f"{currency_symbol}0.00",
                f"{currency_symbol}0.00"
            ])
    
    # Adjust column widths to prevent header overlapping
    # A4 width 21cm - 2cm margins = 19cm available
    # Column widths: #, Description, Container/Tank, Qty, Unit Price, Grand Total
    # Removed Net Weight/Unit column
    items_table = Table(items_data, colWidths=[0.7*cm, 6.5*cm, 2.5*cm, 2.5*cm, 3.0*cm, 3.0*cm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6f0fb')),  # Light blue matching PHP
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1847A6')),  # Blue text matching PHP
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, 0), 7),  # Smaller font for headers to prevent overlap
        ('FONTSIZE', (0, 1), (-1, -1), 8),  # Normal font for data rows
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d2d8e6')),  # Matching PHP border
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (3, 0), (5, -1), 'RIGHT'),  # Align numeric columns right (Qty, Unit Price, Grand Total)
        ('ALIGN', (1, 1), (1, -1), 'LEFT'),  # Description left-aligned
        ('PADDING', (0, 0), (-1, -1), 2),  # Reduced padding to fit more columns
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 3))
    
    # Totals - matching PHP template format
    subtotal = quotation.get('subtotal', 0)
    
    # For local: calculate VAT (5% default)
    vat_rate = 0.05  # 5% VAT for local
    vat_amount = 0.0
    if is_local:
        vat_amount = quotation.get("vat_amount", subtotal * vat_rate)
        total = quotation.get('total', subtotal + vat_amount)
    else:
        total = quotation.get('total', subtotal)
    
    # For local: show Subtotal, VAT, Total
    # For export: show only Total
    # Adjust totals table to match new column count (6 columns now - removed Net Weight/Unit)
    if is_local:
        totals_data = [
            ["", "", "", "", f"Subtotal {quotation.get('currency', 'USD')} Amount:", f"{currency_symbol}{subtotal:,.2f}"],
        ]
        
        # Add VAT (5% for local)
        if vat_amount > 0:
            totals_data.append(["", "", "", "", f"VAT (5%)", f"{currency_symbol}{vat_amount:,.2f}"])
        
        totals_data.append(["", "", "", "", f"Total {quotation.get('currency', 'USD')} Amount Payable", f"{currency_symbol}{total:,.2f}"])
    else:
        # Export orders - show CFR amount, additional freight, and total receivable
        totals_data = []
        
        # CFR Amount (product total)
        cfr_amount = quotation.get("cfr_amount") or subtotal
        port_of_discharge = quotation.get("port_of_discharge", "PORT")
        
        # Additional Freight (if CFR incoterm and freight is specified)
        incoterm = quotation.get("incoterm", "").upper()
        if incoterm == "CFR" and quotation.get("additional_freight_amount"):
            freight_rate = quotation.get("additional_freight_rate_per_fcl", 0)
            container_count = quotation.get("container_count", 0)
            freight_currency = quotation.get("additional_freight_currency", "USD")
            freight_symbol = {"USD": "$", "AED": "AED ", "EUR": "€"}.get(freight_currency, "$")
            
            # Show CFR amount
            totals_data.append(["", "", "", "", f"TOTAL {quotation.get('currency', 'USD')} AMOUNT CFR {port_of_discharge}:", f"{currency_symbol}{cfr_amount:,.2f}"])
            
            # Show additional freight
            if freight_rate > 0 and container_count > 0:
                freight_label = f"ADDITIONAL FREIGHT AS AGREED {freight_symbol}{freight_rate:,.0f} X {container_count}FCL:"
            else:
                freight_label = "ADDITIONAL FREIGHT:"
            
            totals_data.append(["", "", "", "", freight_label, f"{currency_symbol}{quotation.get('additional_freight_amount', 0):,.2f}"])
            
            # Total Receivable
            total_receivable = quotation.get("total_receivable") or (cfr_amount + quotation.get("additional_freight_amount", 0))
            totals_data.append(["", "", "", "", f"TOTAL {quotation.get('currency', 'USD')} AMOUNT RECEIVABLE:", f"{currency_symbol}{total_receivable:,.2f}"])
        else:
            # No additional freight - just show total
            totals_data.append(["", "", "", "", f"Total {quotation.get('currency', 'USD')} Amount Payable", f"{currency_symbol}{total:,.2f}"])
    
    totals_table = Table(totals_data, colWidths=[0.7*cm, 6.5*cm, 2.5*cm, 2.5*cm, 3.0*cm, 3.0*cm])
    totals_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#e9f2fc')),  # Light blue background matching PHP
        ('FONTNAME', (4, 0), (5, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (4, 0), (5, -1), 'RIGHT'),
        ('LINEABOVE', (4, 0), (5, 0), 1, colors.black),
        ('LINEBELOW', (4, -1), (5, -1), 2, colors.black),
        ('PADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 2))
    
    # Amount in Words - matching PHP format
    try:
        amount_words = number_to_words(total)
        currency_code = quotation.get("currency", "USD")
        amount_style = ParagraphStyle(
            'AmountWords', 
            parent=styles['Normal'], 
            fontSize=8, 
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1847A6')  # Blue color matching PHP
        )
        elements.append(Paragraph(f"AMOUNT IN WORDS: {amount_words} {currency_code} Only", amount_style))
    except Exception as e:
        logging.warning(f"Failed to convert amount to words: {e}")
        # Fallback if conversion fails
        amount_style = ParagraphStyle(
            'AmountWords', 
            parent=styles['Normal'], 
            fontSize=8, 
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1847A6')
        )
        elements.append(Paragraph(f"AMOUNT IN WORDS: {total:,.2f} {quotation.get('currency', 'USD')} Only", amount_style))
    elements.append(Spacer(1, 2))
    
    # Shipping Details (for export) - matching PHP format
    if quotation.get("order_type", "").lower() == "export":
        shipping_style = ParagraphStyle('Shipping', parent=styles['Normal'], fontSize=8)
        shipping_text = ""
        if quotation.get('port_of_loading'):
            shipping_text += f"PORT OF LOADING: {quotation.get('port_of_loading')}<br/>"
        if quotation.get('port_of_discharge'):
            shipping_text += f"PORT OF DISCHARGE: {quotation.get('port_of_discharge')}<br/>"
        if quotation.get('final_port_delivery'):
            shipping_text += f"FINAL PORT OF DELIVERY: {quotation.get('final_port_delivery')}<br/>"
        if quotation.get('destination_country'):
            shipping_text += f"DESTINATION COUNTRY: {quotation.get('destination_country')}<br/>"
        if quotation.get('country_of_origin'):
            shipping_text += f"COUNTRY OF ORIGIN: {quotation.get('country_of_origin')}"
        if shipping_text:
            elements.append(Paragraph(shipping_text, shipping_style))
            elements.append(Spacer(1, 3))
        
        # Export Dispatch Contact (for export orders only)
        # Use provided dispatch_contact or default
        if not dispatch_contact:
            dispatch_contact = {
                "name": "Dispatch Department",
                "phone": "+971 4 2384533",
                "email": "dispatch@asia-petrochem.com",
                "address": "Plot # A 23 B, Al Jazeera Industrial Area, Ras Al Khaimah, UAE"
            }
        
        contact_style = ParagraphStyle('Contact', parent=styles['Normal'], fontSize=8, fontName='Helvetica-Bold', textColor=colors.HexColor('#1847A6'))
        contact_text = f"<b>FOR DISPATCH INQUIRIES:</b><br/>"
        if dispatch_contact.get("name"):
            contact_text += f"{dispatch_contact['name']}<br/>"
        if dispatch_contact.get("phone"):
            contact_text += f"Phone: {dispatch_contact['phone']}<br/>"
        if dispatch_contact.get("email"):
            contact_text += f"Email: {dispatch_contact['email']}<br/>"
        if dispatch_contact.get("address"):
            contact_text += f"Address: {dispatch_contact['address']}"
        
        elements.append(Spacer(1, 2))
        elements.append(Paragraph(contact_text, contact_style))
    
    # Shipping Details (for local) - matching PHP format
    if is_local and (quotation.get('port_of_loading') or quotation.get('port_of_discharge')):
        shipping_style = ParagraphStyle('Shipping', parent=styles['Normal'], fontSize=8)
        shipping_text = ""
        if quotation.get('port_of_loading'):
            shipping_text += f"POINT OF LOADING: {quotation.get('port_of_loading')}<br/>"
        if quotation.get('port_of_discharge'):
            shipping_text += f"POINT OF DESTINATION: {quotation.get('port_of_discharge')}"
        if shipping_text:
            elements.append(Paragraph(shipping_text, shipping_style))
            elements.append(Spacer(1, 2))
    
    # Required Documents (for export) - matching PHP format
    selected_documents = quotation.get("required_documents", [])
    if selected_documents and isinstance(selected_documents, list):
        section_style = ParagraphStyle('Section', parent=styles['Normal'], fontSize=8, fontName='Helvetica-Bold', textColor=colors.HexColor('#1847A6'))
        elements.append(Paragraph("Documents need to be presented:", section_style))
        doc_list_style = ParagraphStyle('DocList', parent=styles['Normal'], fontSize=7)
        # Display all documents on the same line, comma-separated
        documents_text = ", ".join(selected_documents)
        elements.append(Paragraph(documents_text, doc_list_style))
        elements.append(Spacer(1, 2))
    
    # Terms & Conditions - matching PHP format with numbered lists
    section_style = ParagraphStyle('Section', parent=styles['Normal'], fontSize=8, fontName='Helvetica-Bold', textColor=colors.HexColor('#1847A6'))
    elements.append(Paragraph("Terms & Conditions:", section_style))
    
    terms_style = ParagraphStyle('Terms', parent=styles['Normal'], fontSize=7, leftIndent=12, leading=10)
    
    if is_local:
        # Local terms (matching PHP) - MODE OF TRANSPORT is always ROAD for local
        local_terms = [
            f"INCOTERMS: {quotation.get('incoterm', 'N/A')}",
            f"PAYMENT TERMS: {quotation.get('payment_terms', 'N/A')}",
            "MODE OF TRANSPORT: ROAD",
            "QUANTITY TOLERANCE : ±5%",
            "SUPPLY AND DELIVERY OF THE PRODUCTS AS PER ABOVE MENTIONED DETAILS.",
            "ALL BANKING CHARGES ARE ON APPLICANT ACCOUNT EXCEPT NEGOTIATION CHARGES, DISCOUNTING CHARGES TO BORNE BY THE APPLICANT",
            "IN CASE OF ANY DISCREPANCY NOTICED IN THE CONSIGNMENT, SHOULD BE NOTIFIED WITHIN 24 HOURS OF THE DELIVERY, FAILING WHICH WE HAVE NO OBLIGATION",
            "THIS PROFORMA INVOICE SUPERSEDES ALL OTHER CORRESPONDENCES AND IS FINAL AND BINDING ON BOTH BUYER AND SELLER.",
            "THIS PROFORMA INVOICE IS SUBJECT TO UAE JURISDICTIONS.",
            f"PERIOD OF VALIDITY: {validity_date if validity_date else 'N/A'}"
        ]
        for i, term in enumerate(local_terms, 1):
            elements.append(Paragraph(f"{i}. {term}", terms_style))
    else:
        # Export terms (matching PHP) - MODE OF TRANSPORT is always SEA for export
        export_terms = [
            f"INCOTERMS: {quotation.get('incoterm', 'N/A')}",
            f"PAYMENT TERMS: {quotation.get('payment_terms', 'N/A')}",
            "MODE OF TRANSPORT: SEA",
            "ALL BANK CHARGES OF BENEFICIARY'S BANK ARE ON US AND REMAINING ALL CHARGES ARE ON APPLICANT",
            "SHIPMENT PERIOD: WITHIN 3 WEEKS ON RECEIPT OF SIGNED PI AND PO",
            "LABELS: AS PER APC STANDARD",
            "QUANTITY TOLERANCE: ±5%",
            "INTEREST @18% PER ANNUM FOR LATE PAYMENTS",
        ]
        if quotation.get('incoterm', '').upper() != 'CIF':
            export_terms.append("INSURANCE TO BE COVERED BY THE BUYER")
        export_terms.extend([
            "SPLIT BILL OF LADING: $250 PER BL EXTRA",
            "CHANGES IN SHIPPING SCHEDULE WILL INCUR NEW FREIGHT",
            "EXTRA DAYS ON BL SUBJECT TO SHIPPING LINE APPROVAL & COST",
            f"PERIOD OF VALIDITY: {validity_date if validity_date else 'N/A'}",
            "LABELS: AS PER APC STANDARD"
        ])
        for i, term in enumerate(export_terms, 1):
            elements.append(Paragraph(f"{i}. {term}", terms_style))
    
    elements.append(Spacer(1, 2))
    
    # Contact for Dispatch - matching PHP format with box styling
    section_style = ParagraphStyle('Section', parent=styles['Normal'], fontSize=8, fontName='Helvetica-Bold', textColor=colors.HexColor('#1847A6'))
    elements.append(Paragraph("<b>For Dispatch and Delivery Please Contact the Below:</b>", section_style))
    
    # Contact box - matching PHP styling (background color #95a2cc) using Table
    contact_text_style = ParagraphStyle('ContactText', parent=styles['Normal'], fontSize=7)
    dispatch_text = "<b>Name:</b> videsh<br/><b>Phone:</b> +971504596544<br/><b>Email:</b> apcdispatch@asia-petrochem.com"
    contact_para = Paragraph(dispatch_text, contact_text_style)
    
    # Calculate available width (A4 width 21cm - margins 0.6cm each = 19.8cm)
    contact_box_table = Table([[contact_para]], colWidths=[19.8*cm])
    contact_box_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#95a2cc')),  # Matching PHP contact box color
        ('BORDER', (0, 0), (-1, -1), 1, colors.HexColor('#d2d8e6')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(contact_box_table)
    elements.append(Spacer(1, 2))
    
    # Bank Details - Get from quotation or use default
    # Note: Bank details should be passed as parameter or use default (no async DB calls in sync function)
    bank_id = quotation.get("bank_id")
    bank_details = quotation.get("bank_details")  # Get from quotation if already fetched
    
    # If no bank selected or not found, use default
    if not bank_details:
        bank_details = {
            "bank_name": "COMMERCIAL BANK OF DUBAI",
            "account_type": "US DOLLAR ACCOUNT",
            "iban": "AE6002300001005833726",
            "swift": "CBDBUAEADXXX",
            "branch_address": "P.O. Box 2668. Al Ittihad Street. Port Saeed, Deira- DUBAI-UAE"
        }
    
    # Bank Details - matching PHP format with box styling
    elements.append(Paragraph("Bank Details:", section_style))
    
    # Bank box - matching PHP styling (background color #f1f6fb) using Table
    bank_text_style = ParagraphStyle('BankText', parent=styles['Normal'], fontSize=7)
    bank_text = "<b>Beneficiary Name:</b> Asia Petrochemicals LLC<br/>"
    bank_text += f"<b>Bank Name:</b> {bank_details.get('bank_name', '')}<br/>"
    if bank_details.get("branch_name"):
        bank_text += f"{bank_details.get('branch_name')}<br/>"
    elif bank_details.get("branch_address"):
        bank_text += f"{bank_details.get('branch_address')}<br/>"
    bank_text += f"<b>Account Type:</b> {bank_details.get('account_type', '')}<br/>"
    if bank_details.get("iban"):
        bank_text += f"<b>IBAN:</b> {bank_details.get('iban')}<br/>"
    if bank_details.get("swift") or bank_details.get("swift_code"):
        bank_text += f"<b>SWIFT:</b> {bank_details.get('swift') or bank_details.get('swift_code', '')}"
    bank_para = Paragraph(bank_text, bank_text_style)
    
    bank_box_table = Table([[bank_para]], colWidths=[19.8*cm])
    bank_box_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f6fb')),  # Matching PHP bank box color
        ('BORDER', (0, 0), (-1, -1), 1, colors.HexColor('#d2d8e6')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(bank_box_table)
    elements.append(Spacer(1, 10))
    
    # Stamp and Signature (conditional)
    if include_stamp_signature:
        stamp_path = ROOT_DIR / "assets" / "stamp.png"
        signature_path = ROOT_DIR / "assets" / "signature.png"
        
        stamp_sig_data = []
        stamp_cell = ""
        sig_cell = ""
        
        if stamp_path.exists():
            try:
                stamp = Image(str(stamp_path), width=2*inch, height=2*inch)
                stamp_cell = stamp
            except:
                stamp_cell = "[STAMP]"
        
        if signature_path.exists():
            try:
                signature = Image(str(signature_path), width=2*inch, height=1*inch)
                sig_cell = signature
            except:
                sig_cell = "[SIGNATURE]"
        
        if stamp_cell or sig_cell:
            stamp_sig_table = Table([[stamp_cell, sig_cell]], colWidths=[9*cm, 9*cm])
            stamp_sig_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                ('ALIGN', (1, 0), (1, 0), 'CENTER'),
            ]))
            elements.append(stamp_sig_table)
    
    try:
        doc.build(elements)
        buffer.seek(0)
        return buffer
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logging.error(f"Error building quotation PDF document: {str(e)}\n{error_details}")
        raise

@api_router.get("/pdf/quotation/{quotation_id}")
async def download_quotation_pdf(
    quotation_id: str, 
    print: bool = Query(False, description="Include stamp and signature (for printing)"),
    token: Optional[str] = None, 
    current_user: dict = Depends(get_current_user_optional)
):
    """Download Quotation/PFI PDF"""
    # Authentication is handled by get_current_user_optional (supports both Authorization header and query param token)
    
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    # Get customer details if available
    customer_id = quotation.get("customer_id")
    if customer_id:
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if customer:
            quotation["customer_name"] = customer.get("name", quotation.get("customer_name", ""))
            quotation["customer_address"] = customer.get("address", "")
            quotation["customer_city"] = customer.get("city", "")
            quotation["customer_country"] = customer.get("country", "")
            quotation["customer_phone"] = customer.get("phone", "")
            quotation["customer_email"] = customer.get("email", "")
    
    # Include stamp/signature if printing or if explicitly approved
    include_stamp_signature = print or quotation.get("finance_approved", False)
    
    # Fetch bank details if bank_id is present (before passing to sync function)
    bank_id = quotation.get("bank_id")
    if bank_id:
        banks_doc = await db.settings.find_one({"type": "bank_accounts"}, {"_id": 0})
        if banks_doc:
            banks = banks_doc.get("data", [])
            bank_details = next((b for b in banks if b.get("id") == bank_id), None)
            if bank_details:
                quotation["bank_details"] = bank_details
    
    # Fetch export dispatch contact settings
    dispatch_contact = None
    if quotation.get("order_type", "").lower() == "export":
        settings = await db.settings.find_one({"type": "contact_for_dispatch"}, {"_id": 0})
        if settings and settings.get("data"):
            dispatch_contact = settings["data"]
    
    try:
        # Run PDF generation in thread pool to avoid blocking the event loop
        import asyncio
        loop = asyncio.get_event_loop()
        pdf_buffer = await loop.run_in_executor(
            None, 
            generate_quotation_pdf, 
            quotation, 
            include_stamp_signature,
            dispatch_contact
        )
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=PFI_{quotation.get('pfi_number', 'unknown')}.pdf"}
        )
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logging.error(f"Error generating quotation PDF: {str(e)}\n{error_details}")
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")

def _generate_preview_pdf() -> BytesIO:
    """Helper function to generate preview PDF (runs in thread pool)"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*cm, bottomMargin=1*cm, leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Standardized Header (matching PHP template)
    elements.extend(create_standard_document_header("Quotation", styles))
    
    # Add document meta info (matching PHP)
    meta_style = ParagraphStyle(
        'Meta', 
        parent=styles['Normal'], 
        fontSize=10, 
        alignment=TA_CENTER, 
        spaceAfter=15,
        textColor=colors.HexColor('#254c91')
    )
    
    meta_text = "<b>Quotation #:</b> <b>TEST-001</b><br/>Date: 2024-01-15<br/>Valid Till: 2024-02-15"
    elements.append(Paragraph(meta_text, meta_style))
    elements.append(Spacer(1, 10))
    
    # Add some sample content to show the layout
    sample_style = ParagraphStyle('Sample', parent=styles['Normal'], fontSize=10)
    elements.append(Paragraph("This is a preview of the quotation header matching the PHP template design.", sample_style))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("The logo is on the left, company address is on the right, and the document title is centered below.", sample_style))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

@api_router.get("/pdf/preview-quotation-header")
async def preview_quotation_header():
    """Preview the quotation header design - for testing purposes"""
    try:
        # Run PDF generation in thread pool to avoid blocking the event loop
        import asyncio
        loop = asyncio.get_event_loop()
        buffer = await loop.run_in_executor(None, _generate_preview_pdf)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=quotation_header_preview.pdf"}
        )
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logging.error(f"Error building preview PDF: {str(e)}\n{error_details}")
        raise HTTPException(status_code=500, detail=f"Error generating preview PDF: {str(e)}")

def generate_invoice_pdf(invoice: dict, include_stamp_signature: bool = False) -> BytesIO:
    """Generate Invoice PDF with standard header format"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*cm, bottomMargin=1*cm, leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Determine invoice type label: "Tax Invoice" for local, "Invoice" for international
    invoice_type = invoice.get("invoice_type", "").upper()
    is_export = invoice_type == "EXPORT"
    invoice_type_label = "INVOICE" if is_export else "TAX INVOICE"
    
    # Use standard header with document title
    elements.extend(create_standard_document_header(invoice_type_label, styles))
    elements.append(Spacer(1, 10))
    
    # Get customer details
    customer_name = invoice.get("customer_name", "")
    customer_address = invoice.get("customer_address", "")
    customer_city = invoice.get("customer_city", "")
    customer_country = invoice.get("customer_country", "")
    customer_phone = invoice.get("customer_phone", "")
    customer_email = invoice.get("customer_email", "")
    
    # Shipper/Receiver Table
    shipper_text = f"<b>Asia Petrochemicals LLC</b><br/>Plot # A 23 B, Al Jazeera Industrial Area<br/>Ras Al Khaimah, UAE<br/>Tel No - 042384533<br/>Fax No - 042384534<br/>Emirate : Ras al-Khaimah<br/>E-Mail : info@asia-petrochem.com"
    shipper_para = Paragraph(shipper_text, ParagraphStyle('Shipper', parent=styles['Normal'], fontSize=9, alignment=TA_LEFT, leading=12))
    
    receiver_text = f"<b>{customer_name}</b>" if customer_name else ""
    if customer_address:
        receiver_text += f"<br/>{customer_address}"
    if customer_city or customer_country:
        city_country = ", ".join(filter(None, [customer_city, customer_country]))
        if city_country:
            receiver_text += f"<br/>{city_country}"
    if customer_phone:
        receiver_text += f"<br/>Phone: {customer_phone}"
    if customer_email:
        receiver_text += f"<br/>Email: {customer_email}"
    if not receiver_text:
        receiver_text = "—"
    receiver_para = Paragraph(receiver_text, ParagraphStyle('Receiver', parent=styles['Normal'], fontSize=9, alignment=TA_LEFT, leading=12))
    
    shipper_receiver_data = [
        ["SHIPPER", "RECEIVER"],
        [shipper_para, receiver_para]
    ]
    shipper_receiver_table = Table(shipper_receiver_data, colWidths=[9*cm, 9*cm])
    shipper_receiver_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#1e293b')),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ]))
    elements.append(shipper_receiver_table)
    elements.append(Spacer(1, 15))
    
    # Header Info Table
    header_data = [
        ["Invoice Number:", invoice.get("invoice_number", ""), "Date:", invoice.get("created_at", "")[:10] if invoice.get("created_at") else ""],
        ["Currency:", invoice.get("currency", "USD"), "Payment Terms:", invoice.get("payment_terms", "")],
        ["Due Date:", invoice.get("due_date", "")[:10] if invoice.get("due_date") else "", "Status:", invoice.get("status", "PENDING")],
    ]
    
    header_table = Table(header_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 15))
    
    # Items Table
    items_header = ["#", "Product Description", "SKU", "Qty (KG)", "Unit Price", "Total"]
    items_data = [items_header]
    
    currency_symbol = {"USD": "$", "AED": "AED ", "EUR": "€"}.get(invoice.get("currency", "USD"), "$")
    
    for idx, item in enumerate(invoice.get("line_items", []), 1):
        qty = item.get("quantity", 0)
        unit_price = item.get("unit_price", 0)
        total = item.get("total", qty * unit_price)
        items_data.append([
            str(idx),
            item.get("product_name", ""),
            item.get("sku", ""),
            f"{qty:,.2f}",
            f"{currency_symbol}{unit_price:,.2f}",
            f"{currency_symbol}{total:,.2f}"
        ])
    
    items_table = Table(items_data, colWidths=[0.8*cm, 7*cm, 2.5*cm, 2.5*cm, 3*cm, 3*cm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (3, 0), (5, -1), 'RIGHT'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 15))
    
    # Totals
    subtotal = invoice.get('subtotal', 0)
    tax_amount = invoice.get('tax_amount', 0)
    total = invoice.get('amount', subtotal + tax_amount)
    totals_data = [
        ["", "", "", "", "Subtotal:", f"{currency_symbol}{subtotal:,.2f}"],
    ]
    
    # Add VAT/Tax if applicable
    if tax_amount > 0:
        tax_rate = invoice.get("tax_rate", 0)
        totals_data.append(["", "", "", "", f"VAT ({tax_rate}%):", f"{currency_symbol}{tax_amount:,.2f}"])
    
    totals_data.append(["", "", "", "", "Total:", f"{currency_symbol}{total:,.2f}"])
    
    totals_table = Table(totals_data, colWidths=[0.8*cm, 7*cm, 2.5*cm, 2.5*cm, 3*cm, 3*cm])
    totals_table.setStyle(TableStyle([
        ('FONTNAME', (4, 0), (5, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (4, 0), (5, -1), 'RIGHT'),
        ('LINEABOVE', (4, 0), (5, 0), 1, colors.black),
        ('LINEBELOW', (4, -1), (5, -1), 2, colors.black),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 15))
    
    # Amount in Words
    amount_words = number_to_words(total)
    amount_style = ParagraphStyle('AmountWords', parent=styles['Normal'], fontSize=10, fontName='Helvetica-Bold')
    elements.append(Paragraph(f"Amount in Words: {amount_words} {invoice.get('currency', 'USD')} Only", amount_style))
    elements.append(Spacer(1, 15))
    
    # Shipping Information (for export)
    if invoice.get("invoice_type") == "EXPORT":
        shipping_style = ParagraphStyle('Shipping', parent=styles['Normal'], fontSize=9)
        elements.append(Paragraph("<b>Shipping Information:</b>", shipping_style))
        shipping_text = f"Port of Loading: {invoice.get('port_of_loading', '')}<br/>"
        shipping_text += f"Port of Discharge: {invoice.get('port_of_discharge', '')}<br/>"
        shipping_text += f"Delivery Place: {invoice.get('delivery_place', '')}<br/>"
        shipping_text += f"Incoterm: {invoice.get('incoterm', '')}"
        elements.append(Paragraph(shipping_text, shipping_style))
        elements.append(Spacer(1, 10))
    
    # Payment Terms
    if invoice.get("payment_terms"):
        payment_style = ParagraphStyle('Payment', parent=styles['Normal'], fontSize=9)
        elements.append(Paragraph(f"<b>Payment Terms:</b> {invoice.get('payment_terms', '')}", payment_style))
        elements.append(Spacer(1, 10))
    
    # Bank Details
    bank_style = ParagraphStyle('Bank', parent=styles['Normal'], fontSize=9)
    elements.append(Paragraph("<b>Bank Details:</b>", bank_style))
    bank_text = "Bank Name: [Bank Name]<br/>Account Number: [Account Number]<br/>SWIFT: [SWIFT Code]<br/>IBAN: [IBAN]"
    elements.append(Paragraph(bank_text, bank_style))
    elements.append(Spacer(1, 20))
    
    # Stamp and Signature (conditional)
    if include_stamp_signature:
        stamp_path = ROOT_DIR / "assets" / "stamp.png"
        signature_path = ROOT_DIR / "assets" / "signature.png"
        
        stamp_cell = ""
        sig_cell = ""
        
        if stamp_path.exists():
            try:
                stamp = Image(str(stamp_path), width=2*inch, height=2*inch)
                stamp_cell = stamp
            except:
                stamp_cell = "[STAMP]"
        
        if signature_path.exists():
            try:
                signature = Image(str(signature_path), width=2*inch, height=1*inch)
                sig_cell = signature
            except:
                sig_cell = "[SIGNATURE]"
        
        if stamp_cell or sig_cell:
            stamp_sig_table = Table([[stamp_cell, sig_cell]], colWidths=[9*cm, 9*cm])
            stamp_sig_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                ('ALIGN', (1, 0), (1, 0), 'CENTER'),
            ]))
            elements.append(stamp_sig_table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

def generate_grn_pdf(grn: dict) -> BytesIO:
    """Generate GRN (Goods Receipt Note) PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*cm, bottomMargin=1*cm, leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Use standard header with document title
    elements.extend(create_standard_document_header("GOODS RECEIPT NOTE", styles))
    elements.append(Spacer(1, 10))
    
    # GRN Details
    grn_data = [
        ["GRN Number:", grn.get("grn_number", ""), "Date:", grn.get("created_at", "")[:10] if grn.get("created_at") else ""],
        ["Supplier:", grn.get("supplier", ""), "Delivery Note:", grn.get("delivery_note", "")],
        ["PO Number:", grn.get("po_number", ""), "Status:", grn.get("status", "")],
    ]
    
    grn_table = Table(grn_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    grn_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(grn_table)
    elements.append(Spacer(1, 15))
    
    # Items Table
    items_header = ["#", "Product Name", "SKU", "Quantity", "Unit", "Batch/Lot"]
    items_data = [items_header]
    
    for idx, item in enumerate(grn.get("items", []), 1):
        items_data.append([
            str(idx),
            item.get("product_name", ""),
            item.get("sku", ""),
            f"{item.get('quantity', 0):,.2f}",
            item.get("uom", "KG"),
            item.get("batch_number", "")
        ])
    
    items_table = Table(items_data, colWidths=[0.8*cm, 6*cm, 2.5*cm, 3*cm, 2*cm, 4.7*cm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 15))
    
    # Notes
    if grn.get("notes"):
        notes_style = ParagraphStyle('Notes', parent=styles['Normal'], fontSize=9)
        elements.append(Paragraph(f"<b>Notes:</b> {grn.get('notes')}", notes_style))
        elements.append(Spacer(1, 10))
    
    # Signature section
    signature_data = [
        ["Received By:", "Checked By:", "Approved By:"],
        ["", "", ""],
        ["", "", ""],
    ]
    signature_table = Table(signature_data, colWidths=[6*cm, 6*cm, 6*cm])
    signature_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(signature_table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

def generate_po_pdf(po: dict) -> BytesIO:
    """Generate Purchase Order PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*cm, bottomMargin=1*cm, leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Use standard header
    elements.extend(create_standard_document_header("PURCHASE ORDER", styles))
    elements.append(Spacer(1, 10))
    
    # PO Details
    po_data = [
        ["PO Number:", po.get("po_number", ""), "Date:", po.get("created_at", "")[:10] if po.get("created_at") else ""],
        ["Supplier:", po.get("supplier_name", ""), "Status:", po.get("status", "")],
        ["Payment Terms:", po.get("payment_terms", ""), "Currency:", po.get("currency", "")],
        ["Delivery Date:", po.get("delivery_date", ""), "Incoterm:", po.get("incoterm", "")],
    ]
    
    po_table = Table(po_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    po_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(po_table)
    elements.append(Spacer(1, 15))
    
    # Items Table
    items_header = ["#", "Item Name", "SKU", "Quantity", "Unit", "Unit Price", "Total"]
    items_data = [items_header]
    
    currency_symbol = {"USD": "$", "AED": "AED ", "EUR": "€"}.get(po.get("currency", "USD"), "$")
    
    for idx, line in enumerate(po.get("lines", []), 1):
        qty = line.get("qty", 0)
        unit_price = line.get("unit_price", 0)
        total = qty * unit_price
        items_data.append([
            str(idx),
            line.get("item_name", ""),
            line.get("sku", ""),
            f"{qty:,.2f}",
            line.get("uom", ""),
            f"{currency_symbol}{unit_price:,.2f}",
            f"{currency_symbol}{total:,.2f}"
        ])
    
    items_table = Table(items_data, colWidths=[0.8*cm, 5*cm, 2*cm, 2.5*cm, 1.5*cm, 3*cm, 3.2*cm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (3, 0), (6, -1), 'RIGHT'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 15))
    
    # Total
    total = po.get("total_amount", 0)
    totals_data = [
        ["", "", "", "", "", "Total:", f"{currency_symbol}{total:,.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[0.8*cm, 5*cm, 2*cm, 2.5*cm, 1.5*cm, 3*cm, 3.2*cm])
    totals_table.setStyle(TableStyle([
        ('FONTNAME', (5, 0), (6, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (5, 0), (6, 0), 'RIGHT'),
        ('LINEABOVE', (5, 0), (6, 0), 1, colors.black),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(totals_table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

def generate_job_order_pdf(job: dict, so: dict = None, quotation: dict = None, customer: dict = None, products_map: dict = None) -> BytesIO:
    """Generate Job Order PDF with modern, attractive styling"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        topMargin=0.5*cm, 
        bottomMargin=1*cm, 
        leftMargin=0.8*cm, 
        rightMargin=0.8*cm
    )
    styles = getSampleStyleSheet()
    elements = []
    
    # Use enhanced header with centered logo
    elements.extend(create_standard_document_header("JOB ORDER", styles))
    
    # Modern color scheme (Bootstrap-inspired)
    primary_color = colors.HexColor('#0d6efd')  # Bootstrap primary blue
    secondary_color = colors.HexColor('#6c757d')  # Bootstrap secondary gray
    success_color = colors.HexColor('#198754')  # Bootstrap success green
    light_bg = colors.HexColor('#f8f9fa')  # Bootstrap light background
    border_color = colors.HexColor('#dee2e6')  # Bootstrap border gray
    dark_text = colors.HexColor('#212529')  # Bootstrap dark text
    
    # Helper function to format dates
    def format_date_company(date_str):
        if not date_str:
            return ""
        try:
            from datetime import datetime
            dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
            return dt.strftime("%d-%b-%y")
        except:
            return date_str[:10] if date_str else ""
    
    # Get PI number and date from quotation
    pi_number = quotation.get("pfi_number", "") if quotation else ""
    pi_date = quotation.get("created_at", "")[:10] if quotation and quotation.get("created_at") else ""
    job_date = job.get("created_at", "")[:10] if job.get("created_at") else job.get("schedule_date", "")[:10] if job.get("schedule_date") else ""
    
    # PI Number and Job Order Number Section - Modern Card Style
    pi_job_data = [
        ["P I NO:", pi_number or "—", "Date:", format_date_company(pi_date)],
        ["JOB ORDER#:", f"<b>{job.get('job_number', '')}</b>", "Date:", format_date_company(job_date)],
    ]
    
    pi_job_table = Table(pi_job_data, colWidths=[3*cm, 6.5*cm, 2.5*cm, 6.4*cm])
    pi_job_table.setStyle(TableStyle([
        # Header row styling
        ('BACKGROUND', (0, 0), (0, -1), primary_color),
        ('BACKGROUND', (2, 0), (2, -1), primary_color),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.white),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.white),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        # Data rows
        ('BACKGROUND', (1, 0), (1, -1), light_bg),
        ('BACKGROUND', (3, 0), (3, -1), light_bg),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTNAME', (3, 0), (3, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, border_color),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
    ]))
    elements.append(pi_job_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # Invoice/Consignee Section - Enhanced Card Style
    consignee_name = job.get("consignee", job.get("customer_name", ""))
    consignee_address = ""
    if customer:
        address_parts = [p for p in [
            customer.get("address"),
            customer.get("city"),
            customer.get("state"),
            customer.get("country"),
            customer.get("postal_code")
        ] if p]
        consignee_address = ", ".join(address_parts)
    elif job.get("customer_address"):
        consignee_address = job.get("customer_address", "")
    
    nif = customer.get("tax_id", "") if customer else job.get("tax_id", "")
    consignee_text = f"<b>{consignee_name}</b>"
    if consignee_address:
        consignee_text += f"<br/>{consignee_address}"
    if nif:
        consignee_text += f"<br/><b>NIF:</b> {nif}"
    
    invoice_consignee_data = [
        ["Invoice/Consignee:", Paragraph(consignee_text, ParagraphStyle('Consignee', parent=styles['Normal'], fontSize=9))],
    ]
    
    invoice_consignee_table = Table(invoice_consignee_data, colWidths=[3.5*cm, 14.9*cm])
    invoice_consignee_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), primary_color),
        ('TEXTCOLOR', (0, 0), (0, 0), colors.white),
        ('BACKGROUND', (1, 0), (1, 0), light_bg),
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, border_color),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(invoice_consignee_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # Products Section - Modern Table with Multiple Products Support
    job_items = []
    if job.get("items") and len(job.get("items", [])) > 0:
        job_items = job.get("items")
    else:
        # Single product (backward compatibility)
        if job.get("product_id") or job.get("product_name"):
            job_items = [{
                "product_id": job.get("product_id", ""),
                "product_name": job.get("product_name", ""),
                "quantity": job.get("quantity", 0),
                "packaging": job.get("packaging", "Bulk"),
                "net_weight_kg": job.get("net_weight_kg")
            }]
    
    products_data = []
    total_drums = 0
    total_weight_mt = 0
    
    for idx, item in enumerate(job_items, 1):
        # Get full product name from products_map if available
        product_id = item.get("product_id", "")
        product_name = item.get("product_name", "")
        if products_map and product_id and product_id in products_map:
            product_name = products_map[product_id].get("name", product_name)
        
        quantity = item.get("quantity", 0)
        packaging = item.get("packaging", "Bulk")
        net_weight_kg = item.get("net_weight_kg") or 200
        unit = item.get("unit", job.get("unit", "KG"))  # Get unit from item or job
        
        # Calculate drums and weight based on packaging type
        if packaging != "Bulk" and net_weight_kg and net_weight_kg > 0:
            # For packaged items, quantity might be in different units
            # Check if quantity is in KG or MT based on unit field
            if unit.upper() in ["MT", "TON", "TONS"]:
                # Quantity is in MT, convert to KG first to calculate drums
                quantity_kg = quantity * 1000
                drums = int(quantity_kg / net_weight_kg) if net_weight_kg > 0 else 0
                weight_mt = quantity
            elif unit.upper() in ["KG", "KGS", "KILOGRAM", "KILOGRAMS"]:
                # Quantity is in KG
                drums = int(quantity / net_weight_kg) if net_weight_kg > 0 else 0
                weight_mt = quantity / 1000
            else:
                # Assume quantity is number of drums
                drums = int(quantity) if quantity > 0 else 0
                weight_mt = (drums * net_weight_kg) / 1000
            
            # Get batch number from job order
            batch_number = job.get("batch_number", "")
            batch_text = f"<b>BATCH NO:</b> {batch_number}" if batch_number else ""
            
            packing_desc = (
                f"<b>{product_name}</b>, PACKED IN STEEL DRUMS PALLETISED, "
                f"QTY: <b>{weight_mt:.2f} MT</b>; "
                f"<b>{net_weight_kg:.0f}KGS/DRUM</b> TOTAL <b>{drums} DRUMS</b>"
            )
            if batch_text:
                packing_desc += f"; {batch_text}"
        else:
            # Bulk packaging
            drums = 0
            if unit.upper() in ["MT", "TON", "TONS"]:
                weight_mt = quantity
            else:
                # Assume KG and convert to MT
                weight_mt = quantity / 1000 if quantity > 0 else 0
            packing_desc = f"<b>{product_name}</b>, BULK, QTY: <b>{weight_mt:.2f} MT</b>"
        
        total_drums += drums
        total_weight_mt += weight_mt
        
        products_data.append([
            f"<b>PRODUCT-{idx}:</b>",
            Paragraph(packing_desc, ParagraphStyle('Product', parent=styles['Normal'], fontSize=9))
        ])
    
    if products_data:
        products_table = Table(products_data, colWidths=[3*cm, 15.4*cm])
        products_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), primary_color),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.white),
            ('BACKGROUND', (1, 0), (1, -1), light_bg),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, border_color),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [primary_color, light_bg]),
        ]))
        elements.append(products_table)
        elements.append(Spacer(1, 0.3*cm))
        
        # Total Container Info - Success Color Badge Style
        container_type = job.get("container_type", "")
        container_count = job.get("container_count", 0)
        if container_count > 0 and container_type:
            container_info = (
                f"<b>Total Container:</b> <font color='{success_color.hexval()}' size='11'>"
                f"{container_count} X{container_type} FCL"
            )
            if total_drums > 0:
                container_info += f" ({total_drums} DRUMS)"
            container_info += "</font>"
            
            container_para = Paragraph(
                container_info, 
                ParagraphStyle('ContainerInfo', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER)
            )
            elements.append(container_para)
            elements.append(Spacer(1, 0.3*cm))
    
    # Payment and Shipping Terms - Modern Card Style
    payment_terms = job.get("payment_terms", quotation.get("payment_terms", "") if quotation else "")
    incoterm = job.get("incoterm", quotation.get("incoterm", "") if quotation else "")
    port_of_loading = job.get("port_of_loading", quotation.get("port_of_loading", "") if quotation else "")
    port_of_discharge = job.get("port_of_discharge", quotation.get("port_of_discharge", "") if quotation else "")
    
    terms_data = [
        ["Payment Terms:", payment_terms or "—", "Shipment:", "IMMEDIATE"],
        ["Terms of Delivery:", incoterm or "—", "Port/Point of Loading:", port_of_loading or "—"],
        ["", "", "Port/Point of Discharges:", port_of_discharge or "—"],
        ["", "", "Final Place of Destination:", port_of_discharge or "—"],
    ]
    
    terms_table = Table(terms_data, colWidths=[3.5*cm, 5.5*cm, 3.5*cm, 5.9*cm])
    terms_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), secondary_color),
        ('BACKGROUND', (2, 0), (2, -1), secondary_color),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.white),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.white),
        ('BACKGROUND', (1, 0), (1, -1), light_bg),
        ('BACKGROUND', (3, 0), (3, -1), light_bg),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, border_color),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [secondary_color, light_bg]),
    ]))
    elements.append(terms_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # Loading Instructions - Alert Box Style
    loading_instructions = job.get("loading_remark", "KINDLY DO IMMEDIATE SHIPMENT. ACCORDINGLY PLAN AND GIVE SHIPMENT DETAILS TO CUSTOMER.")
    loading_box = Table([[
        Paragraph(
            f"<b>Loading Instructions:</b> {loading_instructions}",
            ParagraphStyle('Loading', parent=styles['Normal'], fontSize=9, leading=12)
        )
    ]], colWidths=[18.4*cm])
    loading_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#fff3cd')),  # Bootstrap warning light
        ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor('#856404')),  # Bootstrap warning dark
        ('GRID', (0, 0), (0, 0), 1, colors.HexColor('#ffc107')),  # Bootstrap warning
        ('PADDING', (0, 0), (0, 0), 10),
        ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
    ]))
    elements.append(loading_box)
    elements.append(Spacer(1, 0.3*cm))
    
    # Freight Information (if available)
    if quotation and quotation.get("freight_rate"):
        freight_text = f"<b>FREIGHT:</b> FREIGHT CHARGES AT THE TIME OF ISSUING THE PI WAS <b>{quotation.get('freight_rate')}</b>"
        freight_para = Paragraph(
            freight_text,
            ParagraphStyle('Freight', parent=styles['Normal'], fontSize=9, textColor=dark_text)
        )
        elements.append(freight_para)
        elements.append(Spacer(1, 0.2*cm))
    
    # Remarks - Info Box Style
    remarks = job.get("notes", "PLEASE LOAD AS PER TOTAL PAYLOAD QTY.")
    remarks_box = Table([[
        Paragraph(
            f"<b>Remarks while Loading:</b> {remarks}",
            ParagraphStyle('Remarks', parent=styles['Normal'], fontSize=9)
        )
    ]], colWidths=[18.4*cm])
    remarks_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#d1ecf1')),  # Bootstrap info light
        ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor('#0c5460')),  # Bootstrap info dark
        ('GRID', (0, 0), (0, 0), 1, colors.HexColor('#0dcaf0')),  # Bootstrap info
        ('PADDING', (0, 0), (0, 0), 10),
        ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
    ]))
    elements.append(remarks_box)
    elements.append(Spacer(1, 0.3*cm))
    
    # Pallet and Labeling
    pallet_info = "NO"
    labeling = job.get("label_confirmation", "AS ATTACHED")
    
    pallet_label_data = [
        ["Pallet Instruction:", pallet_info, "Labeling:", labeling],
    ]
    
    pallet_label_table = Table(pallet_label_data, colWidths=[3.5*cm, 5.5*cm, 3.5*cm, 5.9*cm])
    pallet_label_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), primary_color),
        ('BACKGROUND', (2, 0), (2, 0), primary_color),
        ('TEXTCOLOR', (0, 0), (0, 0), colors.white),
        ('TEXTCOLOR', (2, 0), (2, 0), colors.white),
        ('BACKGROUND', (1, 0), (1, 0), light_bg),
        ('BACKGROUND', (3, 0), (3, 0), light_bg),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, border_color),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(pallet_label_table)
    elements.append(Spacer(1, 0.3*cm))
    
    # Mode of Transport and Free Time
    transport_mode = job.get("transport_mode", quotation.get("transport_mode", "SEA") if quotation else "SEA")
    free_time_days = job.get("free_time_days", quotation.get("free_time_days", "21") if quotation else "21")
    
    transport_data = [
        ["Mode of Transport:", transport_mode, "FREE TIME DAYS AT DESTINATION:", f"{free_time_days} DAYS DETENTION FREE TIME ALLOWED AT PORT OF DESTINATION"],
    ]
    
    transport_table = Table(transport_data, colWidths=[4*cm, 5*cm, 4.5*cm, 4.9*cm])
    transport_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), success_color),
        ('BACKGROUND', (2, 0), (2, 0), success_color),
        ('TEXTCOLOR', (0, 0), (0, 0), colors.white),
        ('TEXTCOLOR', (2, 0), (2, 0), colors.white),
        ('BACKGROUND', (1, 0), (1, 0), light_bg),
        ('BACKGROUND', (3, 0), (3, 0), light_bg),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, border_color),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(transport_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # Important Remarks - Warning Box Style
    important_remarks = "EXPORT DECLARATION(ED) MUST BE PASSED BY APC (NON VAT SHIPMENT)."
    important_box = Table([[
        Paragraph(
            f"<b>IMPORTANT REMARKS:</b> {important_remarks}",
            ParagraphStyle('Important', parent=styles['Normal'], fontSize=9, leading=12)
        )
    ]], colWidths=[18.4*cm])
    important_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#f8d7da')),  # Bootstrap danger light
        ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor('#721c24')),  # Bootstrap danger dark
        ('GRID', (0, 0), (0, 0), 1, colors.HexColor('#dc3545')),  # Bootstrap danger
        ('PADDING', (0, 0), (0, 0), 10),
        ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
    ]))
    elements.append(important_box)
    elements.append(Spacer(1, 0.4*cm))
    
    # Email Instructions - Primary Color Box
    email_text = (
        "<b>IMP TO TO MR SHINU:</b> KINDLY EMAIL ALL ED COPY TO EMAIL IDS: "
        "<font color='#0d6efd'><b>raj@asia-petrochem.com</b></font>; "
        "<font color='#0d6efd'><b>receivables@asia-petrochem.com</b></font> & "
        "<font color='#0d6efd'><b>apcaccounts@asia-petrochem.com</b></font>"
    )
    email_box = Table([[
        Paragraph(
            email_text,
            ParagraphStyle('Email', parent=styles['Normal'], fontSize=9, leading=12)
        )
    ]], colWidths=[18.4*cm])
    email_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#cfe2ff')),  # Light blue
        ('TEXTCOLOR', (0, 0), (0, 0), dark_text),
        ('GRID', (0, 0), (0, 0), 1, primary_color),
        ('PADDING', (0, 0), (0, 0), 10),
        ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
    ]))
    elements.append(email_box)
    elements.append(Spacer(1, 0.4*cm))
    
    # Signature Section - Right Aligned
    signature_style = ParagraphStyle(
        'Signature', 
        parent=styles['Normal'], 
        fontSize=10, 
        alignment=TA_RIGHT,
        textColor=dark_text
    )
    elements.append(Paragraph(
        "for <b>Asia Petrochemicals L.L.C</b>, Dubai<br/>Authorized Signature",
        signature_style
    ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

def generate_delivery_note_pdf(do: dict) -> BytesIO:
    """Generate Delivery Note PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*cm, bottomMargin=1*cm, leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Use standard header
    elements.extend(create_standard_document_header("DELIVERY NOTE", styles))
    elements.append(Spacer(1, 10))
    
    # Delivery Note Details
    do_data = [
        ["DN No:", do.get("do_number", ""), "Date:", do.get("issued_at", "")[:10] if do.get("issued_at") else do.get("created_at", "")[:10] if do.get("created_at") else ""],
        ["Consignee:", do.get("customer_name", ""), "PI No:", do.get("pi_number", "")],
        ["Our Ref:", do.get("our_ref", ""), "Customer PO:", do.get("customer_po", "")],
    ]
    
    do_table = Table(do_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    do_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(do_table)
    elements.append(Spacer(1, 15))
    
    # Items Table
    items_header = ["No.", "Description", "Quantity", "Unit"]
    items_data = [items_header]
    
    for idx, item in enumerate(do.get("items", []), 1):
        items_data.append([
            str(idx),
            item.get("product_name", ""),
            f"{item.get('quantity', 0):,.2f}",
            item.get("uom", "MT")
        ])
    
    items_table = Table(items_data, colWidths=[1.5*cm, 10*cm, 3.5*cm, 3*cm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 15))
    
    # Remarks
    if do.get("remarks"):
        remarks_style = ParagraphStyle('Remarks', parent=styles['Normal'], fontSize=9)
        elements.append(Paragraph(f"<b>Remarks:</b> {do.get('remarks')}", remarks_style))
        elements.append(Spacer(1, 10))
    
    # Signature section
    signature_data = [
        ["For Asia Petrochemicals LLC", "Customer"],
        ["", ""],
        ["", "We confirm receipt of goods in good condition"],
        ["", "Sign / Date:"],
    ]
    signature_table = Table(signature_data, colWidths=[9*cm, 9*cm])
    signature_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(signature_table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

def generate_weighment_slip_pdf(weighment: dict) -> BytesIO:
    """Generate Weighment Slip PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*cm, bottomMargin=1*cm, leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Use standard header
    elements.extend(create_standard_document_header("WEIGHMENT SLIP", styles))
    elements.append(Spacer(1, 10))
    
    # Ticket Details
    ticket_data = [
        ["Ticket No:", weighment.get("ticket_number", ""), "Date:", weighment.get("date", "")],
    ]
    
    ticket_table = Table(ticket_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    ticket_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, 0), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(ticket_table)
    elements.append(Spacer(1, 15))
    
    # Vehicle Information
    vehicle_data = [
        ["Vehicle Number:", weighment.get("vehicle_number", ""), "Driver Name:", weighment.get("driver_name", "")],
        ["Transport Company:", weighment.get("transport_company", ""), "License No:", weighment.get("license_no", "")],
    ]
    
    vehicle_table = Table(vehicle_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    vehicle_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(vehicle_table)
    elements.append(Spacer(1, 15))
    
    # Material Information
    material_data = [
        ["Material Code:", weighment.get("material_code", ""), "Cargo Type:", weighment.get("cargo_type", "")],
        ["Source Location:", weighment.get("source_location", ""), "Destination:", weighment.get("destination", "")],
    ]
    
    material_table = Table(material_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    material_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(material_table)
    elements.append(Spacer(1, 15))
    
    # Weighment Details
    weight_data = [
        ["Description", "Weight (KG)"],
        ["Gross Weight (Vehicle + Cargo)", f"{weighment.get('gross_weight', 0):,.2f}"],
        ["Tare Weight (Empty Vehicle)", f"{weighment.get('tare_weight', 0):,.2f}"],
        ["Net Weight (Actual Cargo)", f"{weighment.get('net_weight', 0):,.2f}"],
    ]
    
    weight_table = Table(weight_data, colWidths=[12*cm, 6*cm])
    weight_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(weight_table)
    elements.append(Spacer(1, 15))
    
    # Weighing Times
    time_data = [
        ["First Weight (IN):", weighment.get("first_weight_time", ""), "Second Weight (OUT):", weighment.get("second_weight_time", "")],
    ]
    
    time_table = Table(time_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    time_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, 0), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(time_table)
    elements.append(Spacer(1, 15))
    
    # Signatures
    signature_data = [
        ["Weigh Bridge Operator:", "Security Officer:", "Driver Signature:"],
        ["", "", ""],
    ]
    signature_table = Table(signature_data, colWidths=[6*cm, 6*cm, 6*cm])
    signature_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(signature_table)
    
    # Footer
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER)
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("This is a computer-generated document. No signature required.", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

def generate_coa_pdf(coa: dict) -> BytesIO:
    """Generate Certificate of Analysis PDF with DO, buyer name, Product, qty"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*cm, bottomMargin=1*cm, leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    
    # Use standard header
    elements.extend(create_standard_document_header("CERTIFICATE OF ANALYSIS", styles))
    elements.append(Spacer(1, 10))
    
    # COA Details
    coa_data = [
        ["Consignee:", coa.get("buyer_name", coa.get("customer_name", "")), "DO:", coa.get("do_number", "")],
        ["Product:", coa.get("product_name", ""), "Quantity:", f"{coa.get('quantity', 0):,.2f} {coa.get('uom', 'MT')}"],
        ["PI No. & Date:", coa.get("pi_number", ""), "Batch No.:", coa.get("batch_number", "")],
        ["Packaging:", coa.get("packaging", ""), "Net Weight:", f"{coa.get('net_weight', 0):,.2f} {coa.get('net_weight_unit', 'KG')}"],
        ["MFG Date:", coa.get("mfg_date", ""), "EXP Date:", coa.get("exp_date", "")],
    ]
    
    coa_table = Table(coa_data, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    coa_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('BACKGROUND', (2, 0), (2, -1), colors.lightgrey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(coa_table)
    elements.append(Spacer(1, 15))
    
    # Results Section
    results_style = ParagraphStyle('Results', parent=styles['Heading2'], fontSize=12, spaceAfter=10)
    elements.append(Paragraph("RESULTS:", results_style))
    
    # Test Results Table
    if coa.get("test_results"):
        test_header = ["Properties", "Unit", "Results"]
        test_data = [test_header]
        
        for result in coa.get("test_results", []):
            test_data.append([
                result.get("property", ""),
                result.get("unit", ""),
                result.get("result", "")
            ])
        
        test_table = Table(test_data, colWidths=[6*cm, 3*cm, 9*cm])
        test_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(test_table)
    
    elements.append(Spacer(1, 20))
    
    # Footer with company stamp area
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=9)
    elements.append(Paragraph("Asia Petrochemicals LLC", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

@api_router.get("/pdf/invoice/{invoice_id}")
async def download_invoice_pdf(
    invoice_id: str,
    print: bool = Query(False, description="Include stamp and signature (for printing)"),
    token: Optional[str] = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Download Invoice PDF"""
    # Authentication is handled by get_current_user_optional (supports both Authorization header and query param token)
    
    invoice = await db.receivable_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get customer details if available
    customer_id = invoice.get("customer_id")
    if customer_id:
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if customer:
            invoice["customer_name"] = customer.get("name", invoice.get("customer_name", ""))
            invoice["customer_address"] = customer.get("address", "")
            invoice["customer_city"] = customer.get("city", "")
            invoice["customer_country"] = customer.get("country", "")
            invoice["customer_phone"] = customer.get("phone", "")
            invoice["customer_email"] = customer.get("email", "")
    
    # Include stamp/signature if printing or if finance approved
    include_stamp_signature = print or invoice.get("finance_approved", False)
    
    pdf_buffer = generate_invoice_pdf(invoice, include_stamp_signature=include_stamp_signature)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Invoice_{invoice.get('invoice_number', 'unknown')}.pdf"}
    )

@api_router.get("/pdf/grn/{grn_id}")
async def download_grn_pdf(
    grn_id: str,
    token: Optional[str] = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Download GRN PDF"""
    grn = await db.grn.find_one({"id": grn_id}, {"_id": 0})
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    
    pdf_buffer = generate_grn_pdf(grn)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=GRN_{grn.get('grn_number', 'unknown')}.pdf"}
    )

@api_router.get("/pdf/purchase-order/{po_id}")
async def download_po_pdf(
    po_id: str,
    token: Optional[str] = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Download Purchase Order PDF"""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    
    # Get PO lines
    lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(1000)
    po["lines"] = lines
    
    pdf_buffer = generate_po_pdf(po)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=PO_{po.get('po_number', 'unknown')}.pdf"}
    )

@api_router.get("/pdf/job-order/{job_id}")
async def download_job_order_pdf(
    job_id: str,
    token: Optional[str] = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Download Job Order PDF with enhanced styling"""
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Fetch related data for complete PDF
    so = None
    quotation = None
    customer = None
    
    # Get sales order
    if job.get("sales_order_id"):
        so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
        
        # Get quotation from sales order
        if so and so.get("quotation_id"):
            quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
    
    # Get customer information
    if job.get("customer_id"):
        customer = await db.customers.find_one({"id": job.get("customer_id")}, {"_id": 0})
    elif job.get("customer_name"):
        # Try to find customer by name
        customer = await db.customers.find_one({"name": job.get("customer_name")}, {"_id": 0})
    
    # Get product information for all items in job order
    products_map = {}
    job_items = job.get("items", [])
    if not job_items and (job.get("product_id") or job.get("product_name")):
        # Single product (backward compatibility)
        job_items = [{
            "product_id": job.get("product_id", ""),
            "product_name": job.get("product_name", ""),
            "quantity": job.get("quantity", 0),
            "packaging": job.get("packaging", "Bulk"),
            "net_weight_kg": job.get("net_weight_kg")
        }]
    
    # Fetch all product details
    for item in job_items:
        product_id = item.get("product_id")
        if product_id:
            product = await db.products.find_one({"id": product_id}, {"_id": 0})
            if product:
                products_map[product_id] = product
    
    # Generate PDF with all related data
    pdf_buffer = generate_job_order_pdf(job, so=so, quotation=quotation, customer=customer, products_map=products_map)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=JobOrder_{job.get('job_number', 'unknown')}.pdf"}
    )

@api_router.get("/pdf/delivery-note/{do_id}")
async def download_delivery_note_pdf(
    do_id: str,
    token: Optional[str] = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Download Delivery Note PDF"""
    do = await db.delivery_orders.find_one({"id": do_id}, {"_id": 0})
    if not do:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    
    pdf_buffer = generate_delivery_note_pdf(do)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=DeliveryNote_{do.get('do_number', 'unknown')}.pdf"}
    )

@api_router.get("/pdf/weighment-slip/{weighment_id}")
async def download_weighment_slip_pdf(
    weighment_id: str,
    token: Optional[str] = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Download Weighment Slip PDF"""
    # Get weighment from security checklist
    checklist = await db.security_checklists.find_one({"id": weighment_id}, {"_id": 0})
    if not checklist:
        raise HTTPException(status_code=404, detail="Weighment slip not found")
    
    # Build weighment dict from checklist
    weighment = {
        "ticket_number": checklist.get("ticket_number", ""),
        "date": checklist.get("date", checklist.get("created_at", "")[:10] if checklist.get("created_at") else ""),
        "vehicle_number": checklist.get("vehicle_number", ""),
        "driver_name": checklist.get("driver_name", ""),
        "transport_company": checklist.get("transport_company", ""),
        "license_no": checklist.get("license_no", ""),
        "material_code": checklist.get("material_code", ""),
        "cargo_type": checklist.get("cargo_type", ""),
        "source_location": checklist.get("source_location", ""),
        "destination": checklist.get("destination", ""),
        "gross_weight": checklist.get("gross_weight", 0),
        "tare_weight": checklist.get("tare_weight", 0),
        "net_weight": checklist.get("net_weight", 0),
        "first_weight_time": checklist.get("first_weight_time", ""),
        "second_weight_time": checklist.get("second_weight_time", ""),
    }
    
    pdf_buffer = generate_weighment_slip_pdf(weighment)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=WeighmentSlip_{weighment.get('ticket_number', 'unknown')}.pdf"}
    )

@api_router.get("/pdf/coa/{coa_id}")
async def download_coa_pdf(
    coa_id: str,
    token: Optional[str] = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Download Certificate of Analysis PDF"""
    # Get COA from inspection
    inspection = await db.qc_inspections.find_one({"id": coa_id}, {"_id": 0})
    if not inspection or not inspection.get("coa_generated"):
        raise HTTPException(status_code=404, detail="COA not found or not generated")
    
    # Get related job order for additional details
    job_id = inspection.get("job_order_id")
    job = None
    if job_id:
        job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    
    # Get delivery order
    do = None
    if job_id:
        do = await db.delivery_orders.find_one({"job_order_id": job_id}, {"_id": 0})
    
    # Get sales order and quotation for buyer name
    buyer_name = ""
    if job:
        so_id = job.get("sales_order_id")
        if so_id:
            so = await db.sales_orders.find_one({"id": so_id}, {"_id": 0})
            if so:
                buyer_name = so.get("customer_name", "")
                quotation_id = so.get("quotation_id")
                if quotation_id:
                    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
                    if quotation:
                        buyer_name = quotation.get("customer_name", buyer_name)
    
    # Build COA dict
    coa = {
        "buyer_name": buyer_name,
        "customer_name": buyer_name,
        "do_number": do.get("do_number", "") if do else "",
        "product_name": job.get("product_name", "") if job else inspection.get("product_name", ""),
        "quantity": job.get("quantity", 0) if job else 0,
        "uom": "MT",
        "pi_number": inspection.get("pi_number", ""),
        "batch_number": inspection.get("batch_number", ""),
        "packaging": job.get("packaging", "") if job else "",
        "net_weight": inspection.get("net_weight", 0),
        "net_weight_unit": "KG",
        "mfg_date": inspection.get("mfg_date", ""),
        "exp_date": inspection.get("exp_date", ""),
        "test_results": inspection.get("test_results", []),
    }
    
    pdf_buffer = generate_coa_pdf(coa)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=COA_{inspection.get('coa_number', 'unknown')}.pdf"}
    )

# ==================== ADDITIONAL EMAIL NOTIFICATIONS ====================

async def notify_quotation_approved(quotation: dict):
    """Send notification when quotation is approved"""
    # Get sales users
    sales_users = await db.users.find({"role": {"$in": ["sales", "admin"]}, "is_active": True}, {"_id": 0}).to_list(100)
    emails = [u["email"] for u in sales_users if u.get("email")]
    
    if not emails:
        return
    
    currency_symbol = {"USD": "$", "AED": "AED ", "EUR": "€"}.get(quotation.get("currency", "USD"), "$")
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #10b981; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">✅ Quotation Approved</h1>
        </div>
        <div style="padding: 20px; background: #f8f9fa;">
            <h2 style="color: #333;">Quotation {quotation.get('pfi_number')} has been approved!</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>PFI Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{quotation.get('pfi_number')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Customer:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{quotation.get('customer_name')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Total:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{currency_symbol}{quotation.get('total', 0):,.2f}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Payment Terms:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{quotation.get('payment_terms')}</td></tr>
            </table>
            <p style="margin-top: 20px;">You can now convert this quotation to a Sales Order.</p>
        </div>
        <div style="background: #333; color: #999; padding: 10px; text-align: center; font-size: 12px;">
            Manufacturing ERP System
        </div>
    </div>
    """
    
    await send_email_notification(
        emails,
        f"✅ Quotation Approved - {quotation.get('pfi_number')} - {quotation.get('customer_name')}",
        html_content
    )

async def notify_job_order_status_change(job: dict, new_status: str):
    """Send notification when job order status changes"""
    # Get relevant users based on status
    roles_to_notify = {
        "in_production": ["production", "admin"],
        "procurement": ["procurement", "admin"],
        "Production_Completed": ["production", "security", "admin"],
        "ready_for_dispatch": ["shipping", "security", "admin"],
        "dispatched": ["shipping", "security", "transport", "admin"]
    }
    
    roles = roles_to_notify.get(new_status, ["admin"])
    users = await db.users.find({"role": {"$in": roles}, "is_active": True}, {"_id": 0}).to_list(100)
    emails = [u["email"] for u in users if u.get("email")]
    
    if not emails:
        return
    
    status_colors = {
        "in_production": "#f59e0b",
        "procurement": "#ef4444",
        "Production_Completed": "#10b981",
        "ready_for_dispatch": "#10b981",
        "dispatched": "#3b82f6"
    }
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: {status_colors.get(new_status, '#6b7280')}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">📦 Job Order Update</h1>
        </div>
        <div style="padding: 20px; background: #f8f9fa;">
            <h2 style="color: #333;">Job {job.get('job_number')} - Status Changed</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Job Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{job.get('job_number')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>SPA Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{job.get('spa_number')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Product:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{job.get('product_name')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Quantity:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{job.get('quantity')}</td></tr>
                <tr style="background: #e7f3ff;"><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>New Status:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">{new_status.replace('_', ' ').upper()}</td></tr>
            </table>
        </div>
        <div style="background: #333; color: #999; padding: 10px; text-align: center; font-size: 12px;">
            Manufacturing ERP System
        </div>
    </div>
    """
    
    await send_email_notification(
        emails,
        f"📦 Job Order {job.get('job_number')} - {new_status.replace('_', ' ').title()}",
        html_content
    )

async def notify_dispatch_ready(job: dict, dispatch_schedule: dict):
    """Send notification when a dispatch is scheduled"""
    # Get security and transport users
    users = await db.users.find({"role": {"$in": ["security", "transport", "admin"]}, "is_active": True}, {"_id": 0}).to_list(100)
    emails = [u["email"] for u in users if u.get("email")]
    
    if not emails:
        return
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #8b5cf6; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">🚛 Dispatch Ready</h1>
        </div>
        <div style="padding: 20px; background: #f8f9fa;">
            <h2 style="color: #333;">Container pickup scheduled!</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Schedule #:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{dispatch_schedule.get('schedule_number')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Booking #:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{dispatch_schedule.get('booking_number')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Job Numbers:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{', '.join(dispatch_schedule.get('job_numbers', []))}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Products:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{', '.join(dispatch_schedule.get('product_names', []))}</td></tr>
                <tr style="background: #d1ecf1;"><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Pickup Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">{dispatch_schedule.get('pickup_date')}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Container:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">{dispatch_schedule.get('container_count')}x {dispatch_schedule.get('container_type')}</td></tr>
            </table>
            <p style="margin-top: 20px; color: #666;">Please prepare for container loading at the scheduled time.</p>
        </div>
        <div style="background: #333; color: #999; padding: 10px; text-align: center; font-size: 12px;">
            Manufacturing ERP System
        </div>
    </div>
    """
    
    await send_email_notification(
        emails,
        f"🚛 Dispatch Ready - Pickup on {dispatch_schedule.get('pickup_date')}",
        html_content
    )

# ==================== NOTIFICATIONS ====================

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"  # info, warning, success, error
    link: Optional[str] = None
    user_id: Optional[str] = None  # If null, notification is for all users

class Notification(NotificationCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_read: bool = False
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

@api_router.post("/notifications", response_model=Notification)
async def create_notification(data: NotificationCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin can create notifications")
    
    notification = Notification(**data.model_dump(), created_by=current_user["id"])
    await db.notifications.insert_one(notification.model_dump())
    return notification

@api_router.get("/notifications")
async def get_notifications(unread_only: bool = False, current_user: dict = Depends(get_current_user)):
    query = {
        "$or": [
            {"user_id": None},
            {"user_id": current_user["id"]}
        ]
    }
    if unread_only:
        query["is_read"] = False
    
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"is_read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"$or": [{"user_id": None}, {"user_id": current_user["id"]}]},
        {"$set": {"is_read": True}}
    )
    return {"message": "All notifications marked as read"}

@api_router.get("/notifications/recent")
async def get_recent_notifications(current_user: dict = Depends(get_current_user)):
    """Get recent notifications with unread count for dashboard"""
    query = {
        "$or": [
            {"user_id": None},
            {"user_id": current_user["id"]}
        ]
    }
    
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(10)
    unread_count = await db.notifications.count_documents({**query, "is_read": False})
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }

# ==================== USER MANAGEMENT ====================

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None

class UserPasswordChange(BaseModel):
    new_password: str

@api_router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin"], required_page="/users"):
        raise HTTPException(status_code=403, detail="Only admin can view users")
    
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(1000)
    return users

@api_router.get("/users/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin"], required_page="/users") and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Only admin can view other users")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin"], required_page="/users"):
        raise HTTPException(status_code=403, detail="Only admin can update users")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    if "role" in update_data and update_data["role"] not in ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {ROLES}")
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return user

@api_router.put("/users/{user_id}/password")
async def change_user_password(user_id: str, data: UserPasswordChange, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin"], required_page="/users"):
        raise HTTPException(status_code=403, detail="Only admin can change passwords")
    
    hashed = hash_password(data.new_password)
    result = await db.users.update_one({"id": user_id}, {"$set": {"password": hashed}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Password updated successfully"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin"], required_page="/users"):
        raise HTTPException(status_code=403, detail="Only admin can delete users")
    
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

# Helper to create system notifications
async def create_system_notification(title: str, message: str, type: str = "info", link: Optional[str] = None, user_id: Optional[str] = None):
    notification = {
        "id": str(uuid.uuid4()),
        "title": title,
        "message": message,
        "type": type,
        "link": link,
        "user_id": user_id,
        "is_read": False,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification

@api_router.get("/")
async def root():
    return {"message": "Manufacturing ERP API", "version": "1.0.0"}

# ==================== PRODUCTION SCHEDULING APIs (DRUMS-ONLY) ====================

from production_scheduling import (
    ProductionScheduler,
    Packaging, PackagingCreate,
    InventoryItem, InventoryItemCreate, InventoryBalance, InventoryReservation,
    JobOrderItem, JobOrderItemCreate,
    ProductBOM, ProductBOMCreate, ProductBOMItem, ProductBOMItemCreate,
    ProductPackagingSpec, ProductPackagingSpecCreate,
    PackagingBOM, PackagingBOMCreate, PackagingBOMItem, PackagingBOMItemCreate,
    Supplier, SupplierCreate,
    ProcurementRequisition, ProcurementRequisitionLine,
    PurchaseOrder, PurchaseOrderCreate, PurchaseOrderLine, PurchaseOrderLineCreate,
    EmailOutbox,
    ProductionCampaign, ProductionScheduleDay
)

# Initialize scheduler
scheduler = ProductionScheduler(db)

# Packaging Management
@api_router.post("/packaging", response_model=Packaging)
async def create_packaging(data: PackagingCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can create packaging")
    
    packaging = Packaging(**data.model_dump())
    await db.packaging.insert_one(packaging.model_dump())
    return packaging

@api_router.get("/packaging", response_model=List[Packaging])
async def get_packaging(category: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {'is_active': True}
    if category:
        query['category'] = category
    packaging_list = await db.packaging.find(query, {"_id": 0}).to_list(1000)
    return packaging_list

@api_router.put("/packaging/{packaging_id}", response_model=Packaging)
async def update_packaging(packaging_id: str, data: PackagingCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can update packaging")
    
    result = await db.packaging.update_one({"id": packaging_id}, {"$set": data.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Packaging not found")
    return await db.packaging.find_one({"id": packaging_id}, {"_id": 0})

# ==================== COSTING & MARGIN VALIDATION APIs ====================

from costing_service import CostingService

@api_router.post("/costing/calculate")
async def calculate_costing(
    reference_type: str = Query(..., description="QUOTATION or JOB_ORDER"),
    reference_id: str = Query(...),
    raw_material_cost: Optional[float] = Query(None),
    ocean_freight: Optional[float] = Query(None),
    raw_material_source: Optional[str] = Query("SYSTEM", description="SYSTEM or MANUAL"),
    packaging_type: Optional[str] = Query(None, description="BULK or DRUM"),
    incoterm_type: Optional[str] = Query(None, description="EXW or DELIVERED"),
    is_dg: Optional[bool] = Query(None, description="Dangerous goods flag"),
    current_user: dict = Depends(get_current_user)
):
    """Calculate costs for quotation or job order"""
    costing_service = CostingService(db)
    
    # Get reference document
    local_type = None
    if reference_type == "QUOTATION":
        doc = await db.quotations.find_one({"id": reference_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Quotation not found")
        
        order_type = doc.get("order_type", "local")
        items = doc.get("items", [])
        packaging = items[0].get("packaging", "Bulk") if items else "Bulk"
        incoterm = doc.get("incoterm")
        local_type = doc.get("local_type")
    elif reference_type == "JOB_ORDER":
        doc = await db.job_orders.find_one({"id": reference_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Job order not found")
        
        # Get order type from quotation via sales order
        so = await db.sales_orders.find_one({"id": doc.get("sales_order_id")}, {"_id": 0})
        if so:
            quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
            if quotation:
                order_type = quotation.get("order_type", "local")
                items = quotation.get("items", [])
                packaging = items[0].get("packaging", "Bulk") if items else "Bulk"
                incoterm = quotation.get("incoterm")
                local_type = quotation.get("local_type")
            else:
                order_type = "local"
                packaging = doc.get("packaging", "Bulk")
                incoterm = doc.get("incoterm")
        else:
            order_type = "local"
            packaging = doc.get("packaging", "Bulk")
            incoterm = doc.get("incoterm")
    else:
        raise HTTPException(status_code=400, detail="Invalid reference_type. Must be QUOTATION or JOB_ORDER")
    
    # Determine costing type
    # Get country_of_destination, transport_mode, container_type, and is_dg from doc
    country_of_destination = doc.get("country_of_destination") if reference_type == "QUOTATION" else None
    transport_mode = doc.get("transport_mode") if reference_type == "QUOTATION" else None
    container_type = doc.get("container_type") if reference_type == "QUOTATION" else None
    quotation_is_dg = doc.get("is_dg") if reference_type == "QUOTATION" else None
    
    if reference_type == "JOB_ORDER" and so:
        quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
        if quotation:
            country_of_destination = quotation.get("country_of_destination")
            transport_mode = quotation.get("transport_mode")
            container_type = quotation.get("container_type")
            quotation_is_dg = quotation.get("is_dg")
    
    # Use is_dg from query parameter if provided, otherwise from quotation
    final_is_dg = is_dg if is_dg is not None else quotation_is_dg
    
    # Debug logging (can be removed in production)
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Determining costing type: order_type={order_type}, transport_mode={transport_mode}, packaging={packaging}, container_type={container_type}, is_dg={final_is_dg}")
    
    costing_type = costing_service.determine_costing_type(
        order_type, 
        packaging, 
        incoterm,
        country_of_destination=country_of_destination,
        transport_mode=transport_mode,
        local_type=local_type,
        container_type=container_type,
        is_dg=final_is_dg
    )
    
    logger.info(f"Determined costing type: {costing_type}")
    
    # Get quotation_id for cost calculation (always use quotation, even for job orders)
    quotation_id_for_calc = reference_id
    if reference_type == "JOB_ORDER":
        so = await db.sales_orders.find_one({"id": doc.get("sales_order_id")}, {"_id": 0})
        if so:
            quotation_id_for_calc = so.get("quotation_id")
        else:
            raise HTTPException(status_code=400, detail="Job order must have a sales order with quotation")
    
    # Calculate costs based on type
    if costing_type == "EXPORT_GCC_ROAD":
        result = await costing_service.calculate_export_gcc_road_cost(
            quotation_id_for_calc,
            raw_material_cost
        )
    elif costing_type == "EXPORT_ROAD":
        # Use same calculation as EXPORT_GCC_ROAD for now
        result = await costing_service.calculate_export_gcc_road_cost(
            quotation_id_for_calc,
            raw_material_cost
        )
    elif costing_type == "EXPORT_40FT_DG":
        # Use same calculation as EXPORT_CONTAINERIZED for now
        result = await costing_service.calculate_export_containerized_cost(
            quotation_id_for_calc,
            raw_material_cost,
            ocean_freight,
            raw_material_source=raw_material_source,
            packaging_type=packaging_type,
            incoterm_type=incoterm_type,
            is_dg=True
        )
    elif costing_type == "EXPORT_20FT_DG":
        # Use same calculation as EXPORT_CONTAINERIZED for now
        result = await costing_service.calculate_export_containerized_cost(
            quotation_id_for_calc,
            raw_material_cost,
            ocean_freight,
            raw_material_source=raw_material_source,
            packaging_type=packaging_type,
            incoterm_type=incoterm_type,
            is_dg=True
        )
    elif costing_type == "EXPORT_CONTAINERIZED":
        result = await costing_service.calculate_export_containerized_cost(
            quotation_id_for_calc,
            raw_material_cost,
            ocean_freight,
            raw_material_source=raw_material_source,
            packaging_type=packaging_type,
            incoterm_type=incoterm_type,
            is_dg=is_dg
        )
    elif costing_type == "EXPORT_BULK":
        result = await costing_service.calculate_export_bulk_cost(
            quotation_id_for_calc,
            raw_material_cost,
            ocean_freight,
            raw_material_source=raw_material_source,
            incoterm_type=incoterm_type
        )
    elif costing_type == "LOCAL_PURCHASE_SALE":
        # Use same calculation as LOCAL_DISPATCH for now
        result = await costing_service.calculate_local_dispatch_cost(
            quotation_id_for_calc,
            raw_material_cost,
            raw_material_source=raw_material_source,
            packaging_type=packaging_type,
            incoterm_type=incoterm_type
        )
    elif costing_type == "LOCAL_BULK_TO_PLANT":
        # Use same calculation as LOCAL_DISPATCH for now
        result = await costing_service.calculate_local_dispatch_cost(
            quotation_id_for_calc,
            raw_material_cost,
            raw_material_source=raw_material_source,
            packaging_type=packaging_type,
            incoterm_type=incoterm_type
        )
    elif costing_type == "LOCAL_DRUM_TO_PLANT":
        # Use same calculation as LOCAL_DISPATCH for now
        result = await costing_service.calculate_local_dispatch_cost(
            quotation_id_for_calc,
            raw_material_cost,
            raw_material_source=raw_material_source,
            packaging_type=packaging_type,
            incoterm_type=incoterm_type
        )
    else:  # LOCAL_DISPATCH
        result = await costing_service.calculate_local_dispatch_cost(
            quotation_id_for_calc,
            raw_material_cost,
            raw_material_source=raw_material_source,
            packaging_type=packaging_type,
            incoterm_type=incoterm_type
        )
    
    # Check if costing already exists
    existing = await db.costing_calculations.find_one({
        "reference_type": reference_type,
        "reference_id": reference_id
    }, {"_id": 0})
    
    if existing:
        # Update existing
        update_data = {
            **result,
            "costing_type": costing_type,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"]
        }
        await db.costing_calculations.update_one(
            {"id": existing["id"]},
            {"$set": update_data}
        )
        result["id"] = existing["id"]
        result["cost_confirmed"] = existing.get("cost_confirmed", False)
    else:
        # Create new
        costing = CostingCalculation(
            reference_type=reference_type,
            reference_id=reference_id,
            costing_type=costing_type,
            **result,
            created_by=current_user["id"],
            updated_by=current_user["id"]
        )
        await db.costing_calculations.insert_one(costing.model_dump())
        result["id"] = costing.id
        result["cost_confirmed"] = False
    
    result["costing_type"] = costing_type
    return result

@api_router.get("/costing/{reference_type}/{reference_id}")
async def get_costing(
    reference_type: str,
    reference_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get existing costing for quotation or job order"""
    costing = await db.costing_calculations.find_one({
        "reference_type": reference_type,
        "reference_id": reference_id
    }, {"_id": 0})
    
    if not costing:
        raise HTTPException(status_code=404, detail="Costing not found")
    
    return costing

@api_router.put("/costing/{costing_id}/confirm")
async def confirm_costing(
    costing_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Confirm costing (sets cost_confirmed=true)"""
    costing = await db.costing_calculations.find_one({"id": costing_id}, {"_id": 0})
    if not costing:
        raise HTTPException(status_code=404, detail="Costing not found")
    
    # Update costing
    await db.costing_calculations.update_one(
        {"id": costing_id},
        {"$set": {
            "cost_confirmed": True,
            "confirmed_by": current_user["id"],
            "confirmed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Update reference document
    reference_type = costing.get("reference_type")
    reference_id = costing.get("reference_id")
    
    update_data = {
        "costing_id": costing_id,
        "cost_confirmed": True,
        "total_cost": costing.get("total_cost"),
        "margin_amount": costing.get("margin_amount"),
        "margin_percentage": costing.get("margin_percentage")
    }
    
    if reference_type == "QUOTATION":
        await db.quotations.update_one({"id": reference_id}, {"$set": update_data})
    elif reference_type == "JOB_ORDER":
        await db.job_orders.update_one({"id": reference_id}, {"$set": update_data})
    
    return {"message": "Costing confirmed", "costing_id": costing_id}

@api_router.put("/costing/{costing_id}")
async def update_costing(
    costing_id: str,
    data: CostingCalculationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update costing with manual overrides"""
    costing = await db.costing_calculations.find_one({"id": costing_id}, {"_id": 0})
    if not costing:
        raise HTTPException(status_code=404, detail="Costing not found")
    
    # Recalculate total cost and margin
    total_cost = (
        data.raw_material_cost +
        data.packaging_cost +
        data.inland_transport_cost +
        data.thc_cost +
        data.isps_cost +
        data.documentation_cost +
        data.bl_cost +
        data.ocean_freight_cost +
        data.port_charges +
        data.local_transport_cost
    )

    # For custom costing sheets that store a detailed breakdown, allow them to drive total_cost
    costing_type_from_data = data.costing_type or costing.get("costing_type")
    if data.custom_breakdown:
        cb = data.custom_breakdown or {}
        # Get total_cost from custom_breakdown if available
        if cb.get("total_cost") is not None:
            total_cost = cb.get("total_cost")
    
    selling_price = costing.get("selling_price", 0.0)
    reference_type = costing.get("reference_type")
    reference_id = costing.get("reference_id")
    
    # Get quantity from reference document
    if reference_type == "QUOTATION":
        doc = await db.quotations.find_one({"id": reference_id}, {"_id": 0})
    else:
        doc = await db.job_orders.find_one({"id": reference_id}, {"_id": 0})
    
    items = doc.get("items", []) if doc else []
    total_quantity = sum(item.get("quantity", 0) for item in items)
    unit_price = selling_price / total_quantity if total_quantity > 0 else 0.0
    
    # Calculate margin - USE net_profit_loss from custom_breakdown if it exists
    costing_service = CostingService(db)
    if data.custom_breakdown and data.custom_breakdown.get("net_profit_loss") is not None:
        # Use the net profit from costing modal
        net_profit = data.custom_breakdown.get("net_profit_loss")
        margin = {
            "margin_amount": net_profit,
            "margin_percentage": (net_profit / selling_price * 100) if selling_price > 0 else 0
        }
    else:
        # Only recalculate if not provided
        margin = costing_service.calculate_margin(selling_price, total_cost, total_quantity, unit_price)
    
    # Update costing
    update_data = {
        **data.model_dump(),
        "total_cost": total_cost,
        **margin,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    
    await db.costing_calculations.update_one(
        {"id": costing_id},
        {"$set": update_data}
    )
    
    # Update reference document with cached margin
    if reference_type == "QUOTATION":
        await db.quotations.update_one(
            {"id": reference_id},
            {"$set": {
                "margin_amount": margin["margin_amount"],
                "margin_percentage": margin["margin_percentage"]
            }}
        )
    elif reference_type == "JOB_ORDER":
        await db.job_orders.update_one(
            {"id": reference_id},
            {"$set": {
                "margin_amount": margin["margin_amount"],
                "margin_percentage": margin["margin_percentage"]
            }}
        )
    
    updated = await db.costing_calculations.find_one({"id": costing_id}, {"_id": 0})
    return updated

@api_router.get("/costing/{costing_id}/summary")
async def get_costing_summary(
    costing_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get costing summary for approval review"""
    costing = await db.costing_calculations.find_one({"id": costing_id}, {"_id": 0})
    if not costing:
        raise HTTPException(status_code=404, detail="Costing not found")
    
    return costing

# ==================== TRANSPORT ROUTES MASTER DATA APIs ====================

@api_router.get("/transport-routes", response_model=List[TransportRoute])
async def get_transport_routes(
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all transport routes"""
    query = {}
    if origin:
        query["origin"] = origin.upper()
    if destination:
        query["destination"] = destination.upper()
    if is_active is not None:
        query["is_active"] = is_active
    
    routes = await db.transport_routes.find(query, {"_id": 0}).sort("route_name", 1).to_list(1000)
    return routes

@api_router.post("/transport-routes", response_model=TransportRoute)
async def create_transport_route(
    data: TransportRouteCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new transport route"""
    if not has_permission(current_user, required_roles=["admin", "finance"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin/finance can manage transport routes")
    
    route = TransportRoute(**data.model_dump())
    await db.transport_routes.insert_one(route.model_dump())
    return route

@api_router.put("/transport-routes/{route_id}", response_model=TransportRoute)
async def update_transport_route(
    route_id: str,
    data: TransportRouteCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a transport route"""
    if not has_permission(current_user, required_roles=["admin", "finance"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin/finance can manage transport routes")
    
    update_data = data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.transport_routes.update_one(
        {"id": route_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transport route not found")
    
    return await db.transport_routes.find_one({"id": route_id}, {"_id": 0})

@api_router.post("/transport/routes/update-from-bookings")
async def update_transport_master_from_bookings(
    route_id: Optional[str] = Query(None, description="Specific route ID to update. If not provided, updates all routes with auto_update enabled"),
    auto_update: bool = Query(True, description="Whether to perform auto-update"),
    current_user: dict = Depends(get_current_user)
):
    """
    Update transport master routes from actual booking charges.
    Calculates average rate from recent bookings for matching routes.
    """
    if not has_permission(current_user, required_roles=["admin", "finance"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin/finance can update transport master")
    
    if not auto_update:
        return {"message": "Auto-update is disabled", "updated_routes": []}
    
    updated_routes = []
    
    # Get routes to update
    if route_id:
        route = await db.transport_routes.find_one({"id": route_id}, {"_id": 0})
        if not route:
            raise HTTPException(status_code=404, detail="Transport route not found")
        routes_to_update = [route] if route.get("auto_update_from_bookings", False) else []
    else:
        # Get all routes with auto_update enabled
        routes_to_update = await db.transport_routes.find(
            {"auto_update_from_bookings": True, "is_active": True},
            {"_id": 0}
        ).to_list(1000)
    
    for route in routes_to_update:
        origin = route.get("origin", "").upper()
        destination = route.get("destination", "").upper()
        vehicle_type = route.get("vehicle_type", "")
        
        # Get recent transport bookings for this route (last 30 days)
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        
        # Check transport_outward bookings
        outward_bookings = await db.transport_outward.find({
            "transport_charges": {"$exists": True, "$ne": None, "$gt": 0},
            "created_at": {"$gte": thirty_days_ago},
            "status": {"$in": ["DISPATCHED", "DELIVERED", "COMPLETED"]}
        }, {"_id": 0}).to_list(1000)
        
        # Check transport_inward bookings
        inward_bookings = await db.transport_inward.find({
            "transport_charges": {"$exists": True, "$ne": None, "$gt": 0},
            "created_at": {"$gte": thirty_days_ago},
            "status": {"$in": ["ARRIVED", "DELIVERED", "COMPLETED"]}
        }, {"_id": 0}).to_list(1000)
        
        # Filter bookings that match this route
        # For outward: check if destination matches
        # For inward: check if origin matches (assuming RAK as origin for local deliveries)
        matching_charges = []
        
        for booking in outward_bookings:
            # Try to match by delivery location or job order destination
            job_id = booking.get("job_order_id")
            if job_id:
                job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
                if job:
                    delivery_place = (job.get("delivery_place") or job.get("delivery_location") or "").upper()
                    if destination in delivery_place or delivery_place in destination:
                        charges = booking.get("transport_charges")
                        if charges and charges > 0:
                            matching_charges.append(charges)
        
        for booking in inward_bookings:
            # For inward, typically from port to RAK, so check if destination is RAK
            if destination == "RAK" or origin == "RAK":
                charges = booking.get("transport_charges")
                if charges and charges > 0:
                    matching_charges.append(charges)
        
        # Calculate average if we have matching charges
        if matching_charges:
            avg_rate = sum(matching_charges) / len(matching_charges)
            
            # Update route with new average rate
            await db.transport_routes.update_one(
                {"id": route["id"]},
                {"$set": {
                    "rate": round(avg_rate, 2),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "effective_date": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            updated_routes.append({
                "route_id": route["id"],
                "route_name": route.get("route_name"),
                "old_rate": route.get("rate"),
                "new_rate": round(avg_rate, 2),
                "samples_count": len(matching_charges)
            })
    
    return {
        "message": f"Updated {len(updated_routes)} transport route(s)",
        "updated_routes": updated_routes
    }

# ==================== FIXED CHARGES MASTER DATA APIs ====================

@api_router.get("/fixed-charges", response_model=List[FixedCharge])
async def get_fixed_charges(
    charge_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all fixed charges"""
    query = {}
    if charge_type:
        query["charge_type"] = charge_type
    if is_active is not None:
        query["is_active"] = is_active
    
    charges = await db.fixed_charges.find(query, {"_id": 0}).sort("charge_type", 1).to_list(1000)
    return charges

@api_router.post("/fixed-charges", response_model=FixedCharge)
async def create_fixed_charge(
    data: FixedChargeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new fixed charge"""
    if not has_permission(current_user, required_roles=["admin", "finance"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin/finance can manage fixed charges")
    
    charge = FixedCharge(**data.model_dump())
    await db.fixed_charges.insert_one(charge.model_dump())
    return charge

@api_router.put("/fixed-charges/{charge_id}", response_model=FixedCharge)
async def update_fixed_charge(
    charge_id: str,
    data: FixedChargeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a fixed charge"""
    if not has_permission(current_user, required_roles=["admin", "finance"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin/finance can manage fixed charges")
    
    update_data = data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.fixed_charges.update_one(
        {"id": charge_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fixed charge not found")
    
    return await db.fixed_charges.find_one({"id": charge_id}, {"_id": 0})

# Inventory Items Management
@api_router.post("/inventory-items", response_model=InventoryItem)
async def create_inventory_item(data: InventoryItemCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can create inventory items")
    
    item = InventoryItem(**data.model_dump())
    await db.inventory_items.insert_one(item.model_dump())
    
    # Create initial balance record
    balance = InventoryBalance(item_id=item.id)
    await db.inventory_balances.insert_one(balance.model_dump())
    
    return item

@api_router.get("/inventory-items")
async def get_inventory_items(item_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get inventory items with balance and calculated availability status"""
    query = {'is_active': True}
    if item_type:
        query['item_type'] = item_type
    items = await db.inventory_items.find(query, {"_id": 0}).to_list(1000)
    
    # Enrich with balance data and calculate status
    enriched_items = []
    for item in items:
        balance = await db.inventory_balances.find_one({"item_id": item["id"]}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        
        # Calculate reserved quantity from reservations
        reservations = await db.inventory_reservations.find({"item_id": item["id"]}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        
        # Calculate inbound from open PO lines
        po_lines = await db.purchase_order_lines.find({
            "item_id": item["id"],
            "status": {"$in": ["OPEN", "PARTIAL"]}
        }, {"_id": 0}).to_list(1000)
        inbound = sum(line.get("qty", 0) - line.get("received_qty", 0) for line in po_lines)
        
        # Calculate availability
        available = on_hand - reserved
        
        # Determine status
        if available > 0:
            status = "IN_STOCK"
        elif inbound > 0:
            status = "INBOUND"
        else:
            status = "OUT_OF_STOCK"
        
        enriched_item = {
            **item,
            "on_hand": on_hand,
            "reserved": reserved,
            "available": available,
            "inbound": inbound,
            "status": status
        }
        enriched_items.append(enriched_item)
    
    return enriched_items

@api_router.get("/inventory-items/{item_id}/availability")
async def get_inventory_item_availability(item_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed availability for a specific inventory item (Phase 1)"""
    # Use the same lookup strategy as find_inventory_item_id to find the correct inventory_item.id
    # This handles cases where material_item_id in BOM might be a product_id
    actual_item_id = await find_inventory_item_id(item_id)
    
    # Check inventory_balances using the resolved item_id - this is the source of truth for stock
    balance = await db.inventory_balances.find_one({"item_id": actual_item_id}, {"_id": 0})
    on_hand = balance.get("on_hand", 0) if balance else 0
    
    # Try to find the item in inventory_items using the resolved ID
    item = await db.inventory_items.find_one({"id": actual_item_id}, {"_id": 0})
    
    # If not found in inventory_items, try products collection
    if not item:
        product = await db.products.find_one({"id": actual_item_id}, {"_id": 0})
        # If found in products, create a compatible item structure
        if product:
            item = {
                "id": product.get("id"),
                "name": product.get("name"),
                "sku": product.get("sku"),
                "uom": product.get("unit", "KG"),
                "item_type": "FINISHED_PRODUCT"
            }
    
    # Get reservations using the resolved item_id (which should match inventory_balances.item_id)
    reservations = await db.inventory_reservations.find({"item_id": actual_item_id}, {"_id": 0}).to_list(1000)
    reserved = sum(r.get("qty", 0) for r in reservations)
    
    # Get inbound from open PO lines using the resolved item_id
    po_lines = await db.purchase_order_lines.find({
        "item_id": actual_item_id,
        "status": {"$in": ["OPEN", "PARTIAL"]}
    }, {"_id": 0}).to_list(1000)
    
    inbound_details = []
    total_inbound = 0
    for line in po_lines:
        remaining = line.get("qty", 0) - line.get("received_qty", 0)
        if remaining > 0:
            po = await db.purchase_orders.find_one({"id": line.get("po_id")}, {"_id": 0})
            inbound_details.append({
                "po_number": po.get("po_number") if po else "N/A",
                "qty": remaining,
                "promised_delivery_date": line.get("promised_delivery_date"),
                "supplier_name": po.get("supplier_name") if po else "N/A"
            })
            total_inbound += remaining
    
    # Calculate availability
    available = on_hand - reserved
    
    # Determine status
    if available > 0:
        status = "IN_STOCK"
    elif total_inbound > 0:
        status = "INBOUND"
    else:
        status = "OUT_OF_STOCK"
    
    return {
        "item": item,
        "on_hand": on_hand,
        "reserved": reserved,
        "available": available,
        "inbound": total_inbound,
        "inbound_details": inbound_details,
        "status": status,
        "reservations": reservations
    }

@api_router.put("/inventory-items/{item_id}", response_model=InventoryItem)
async def update_inventory_item(
    item_id: str, 
    data: InventoryItemCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Update an inventory item (name, SKU, capacity, etc.)"""
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can update inventory items")
    
    item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Update the item
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.inventory_items.update_one(
        {"id": item_id},
        {"$set": update_data}
    )
    
    # Return updated item
    updated_item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    return InventoryItem(**updated_item)

@api_router.delete("/inventory-items/{item_id}")
async def delete_inventory_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Delete/deactivate an inventory item"""
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can delete inventory items")
    
    item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Check if item has stock or is used in any BOMs
    balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
    if balance and balance.get("on_hand", 0) > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete item with stock on hand ({balance.get('on_hand')} {item.get('uom')}). Adjust stock to zero first."
        )
    
    # Check if used in product BOMs
    bom_usage = await db.product_bom_items.find_one({"material_item_id": item_id}, {"_id": 0})
    if bom_usage:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete item that is used in product BOMs. Remove from BOMs first."
        )
    
    # Soft delete by marking as inactive
    await db.inventory_items.update_one(
        {"id": item_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Inventory item deleted successfully", "id": item_id}

@api_router.put("/inventory-items/{item_id}/adjust-stock")
async def adjust_inventory_stock(
    item_id: str,
    adjustment: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adjust stock quantity (increase or decrease drums/items)"""
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can adjust stock")
    
    item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    qty_change = adjustment.get("quantity", 0)
    reason = adjustment.get("reason", "Manual adjustment")
    
    if qty_change == 0:
        raise HTTPException(status_code=400, detail="Quantity adjustment cannot be zero")
    
    # Get current balance
    balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
    current_qty = balance.get("on_hand", 0) if balance else 0
    new_qty = current_qty + qty_change
    
    if new_qty < 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot decrease stock below zero. Current: {current_qty}, Attempted change: {qty_change}"
        )
    
    # Update balance
    await db.inventory_balances.update_one(
        {"item_id": item_id},
        {"$set": {"on_hand": new_qty}},
        upsert=True
    )
    
    # Create inventory movement record
    movement = InventoryMovement(
        product_id=item_id,
        product_name=item.get("name", "Unknown"),
        sku=item.get("sku", ""),
        movement_type="adjustment_increase" if qty_change > 0 else "adjustment_decrease",
        quantity=abs(qty_change),
        reference_type="manual_adjustment",
        reference_id=item_id,
        reference_number=f"ADJ-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        previous_stock=current_qty,
        new_stock=new_qty,
        notes=reason,
        created_by=current_user["id"]
    )
    await db.inventory_movements.insert_one(movement.model_dump())
    
    return {
        "message": "Stock adjusted successfully",
        "item_id": item_id,
        "previous_qty": current_qty,
        "new_qty": new_qty,
        "change": qty_change,
        "uom": item.get("uom", "EA")
    }

# Job Order Items Management
@api_router.post("/job-order-items", response_model=JobOrderItem)
async def create_job_order_item(data: JobOrderItemCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "production", "sales"], required_page="/job-orders"):
        raise HTTPException(status_code=403, detail="Only admin/production/sales can create job order items")
    
    item = JobOrderItem(**data.model_dump())
    await db.job_order_items.insert_one(item.model_dump())
    return item

@api_router.get("/job-order-items")
async def get_job_order_items(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query['status'] = status
    items = await db.job_order_items.find(query, {"_id": 0}).to_list(1000)
    return items

# Product BOM Management
@api_router.post("/product-boms", response_model=ProductBOM)
async def create_product_bom(data: ProductBOMCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "production"], required_page="/bom-management"):
        raise HTTPException(status_code=403, detail="Only admin/production can create BOMs")
    
    # If this is set as active, deactivate other BOMs for same product
    if data.is_active:
        await db.product_boms.update_many(
            {"product_id": data.product_id, "is_active": True},
            {"$set": {"is_active": False}}
        )
    
    bom = ProductBOM(**data.model_dump())
    await db.product_boms.insert_one(bom.model_dump())
    return bom

@api_router.post("/product-bom-items", response_model=ProductBOMItem)
async def create_product_bom_item(data: ProductBOMItemCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "production"], required_page="/bom-management"):
        raise HTTPException(status_code=403, detail="Only admin/production can create BOM items")
    
    item = ProductBOMItem(**data.model_dump())
    await db.product_bom_items.insert_one(item.model_dump())
    return item

@api_router.get("/product-boms/{product_id}")
async def get_product_boms(product_id: str, current_user: dict = Depends(get_current_user)):
    boms = await db.product_boms.find({"product_id": product_id}, {"_id": 0}).to_list(1000)
    
    # For each BOM, get its items
    for bom in boms:
        bom_items = await db.product_bom_items.find({"bom_id": bom['id']}, {"_id": 0}).to_list(1000)
        
        # Enrich with material details
        for item in bom_items:
            material_id = item.get('material_item_id')
            if not material_id:
                item['material_name'] = 'Unknown'
                item['material_sku'] = '-'
                item['uom'] = 'KG'
                continue
            
            # Try inventory_items first
            material = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
            
            # If not found in inventory_items, try products collection
            if not material:
                material = await db.products.find_one({"id": material_id}, {"_id": 0})
            
            item['material'] = material
            if material:
                item['material_name'] = material.get('name', 'Unknown')
                item['material_sku'] = material.get('sku', '-')
                # Products use 'unit', inventory_items use 'uom'
                item['uom'] = material.get('uom') or material.get('unit', 'KG')
            else:
                # If still not found, set defaults
                item['material_name'] = 'Unknown'
                item['material_sku'] = '-'
                item['uom'] = 'KG'
        
        bom['items'] = bom_items
    
    return boms

# Product-Packaging Conversion Specs
@api_router.post("/product-packaging-specs", response_model=ProductPackagingSpec)
async def create_product_packaging_spec(data: ProductPackagingSpecCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "production"], required_page="/products"):
        raise HTTPException(status_code=403, detail="Only admin/production can create conversion specs")
    
    spec = ProductPackagingSpec(**data.model_dump())
    await db.product_packaging_specs.insert_one(spec.model_dump())
    return spec

@api_router.get("/product-packaging-specs/{product_id}")
async def get_product_packaging_specs(product_id: str, current_user: dict = Depends(get_current_user)):
    specs = await db.product_packaging_specs.find({"product_id": product_id}, {"_id": 0}).to_list(1000)
    return specs

# Packaging BOM Management
@api_router.post("/packaging-boms", response_model=PackagingBOM)
async def create_packaging_bom(data: PackagingBOMCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can create packaging BOMs")
    
    bom = PackagingBOM(**data.model_dump())
    await db.packaging_boms.insert_one(bom.model_dump())
    return bom

@api_router.post("/packaging-bom-items", response_model=PackagingBOMItem)
async def create_packaging_bom_item(data: PackagingBOMItemCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can create packaging BOM items")
    
    item = PackagingBOMItem(**data.model_dump())
    await db.packaging_bom_items.insert_one(item.model_dump())
    return item

@api_router.get("/packaging-boms/{packaging_id}")
async def get_packaging_boms(packaging_id: str, current_user: dict = Depends(get_current_user)):
    boms = await db.packaging_boms.find({"packaging_id": packaging_id}, {"_id": 0}).to_list(1000)
    
    for bom in boms:
        bom_items = await db.packaging_bom_items.find({"packaging_bom_id": bom['id']}, {"_id": 0}).to_list(1000)
        
        # Enrich with pack item details
        for item in bom_items:
            pack_item = await db.inventory_items.find_one({"id": item['pack_item_id']}, {"_id": 0})
            item['pack_item'] = pack_item
            if pack_item:
                item['pack_item_name'] = pack_item.get('name', 'Unknown')
                item['pack_item_sku'] = pack_item.get('sku', '-')
        
        bom['items'] = bom_items
    
    return boms

# BOM Activation Endpoints
@api_router.put("/product-boms/{bom_id}/activate")
async def activate_product_bom(bom_id: str, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "production"], required_page="/bom-management"):
        raise HTTPException(status_code=403, detail="Only admin/production can activate BOMs")
    
    bom = await db.product_boms.find_one({"id": bom_id}, {"_id": 0})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    # Deactivate all other BOMs for this product
    await db.product_boms.update_many(
        {"product_id": bom["product_id"], "is_active": True},
        {"$set": {"is_active": False}}
    )
    
    # Activate this BOM
    await db.product_boms.update_one(
        {"id": bom_id},
        {"$set": {"is_active": True}}
    )
    
    return {"message": "BOM activated successfully"}

@api_router.put("/packaging-boms/{bom_id}/activate")
async def activate_packaging_bom(bom_id: str, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "inventory"], required_page="/inventory"):
        raise HTTPException(status_code=403, detail="Only admin/inventory can activate packaging BOMs")
    
    bom = await db.packaging_boms.find_one({"id": bom_id}, {"_id": 0})
    if not bom:
        raise HTTPException(status_code=404, detail="Packaging BOM not found")
    
    # Deactivate all other BOMs for this packaging
    await db.packaging_boms.update_many(
        {"packaging_id": bom["packaging_id"], "is_active": True},
        {"$set": {"is_active": False}}
    )
    
    # Activate this BOM
    await db.packaging_boms.update_one(
        {"id": bom_id},
        {"$set": {"is_active": True}}
    )
    
    return {"message": "Packaging BOM activated successfully"}

# Suppliers Management
@api_router.post("/suppliers", response_model=Supplier)
async def create_supplier(data: SupplierCreate, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "procurement"], required_page="/procurement"):
        raise HTTPException(status_code=403, detail="Only admin/procurement can create suppliers")
    
    supplier = Supplier(**data.model_dump())
    await db.suppliers.insert_one(supplier.model_dump())
    return supplier

@api_router.get("/suppliers")
async def get_suppliers(current_user: dict = Depends(get_current_user)):
    suppliers = await db.suppliers.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return suppliers

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    if not has_permission(current_user, required_roles=["admin", "procurement"], required_page="/procurement"):
        raise HTTPException(status_code=403, detail="Only admin/procurement can delete suppliers")
    
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier deleted successfully"}

# Purchase Orders Management
@api_router.post("/purchase-orders", response_model=PurchaseOrder)
async def create_purchase_order(data: PurchaseOrderCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement can create POs")
    
    po_number = await generate_sequence("PO", "purchase_orders")
    po = PurchaseOrder(**data.model_dump(), po_number=po_number)
    await db.purchase_orders.insert_one(po.model_dump())
    return po

@api_router.post("/purchase-order-lines", response_model=PurchaseOrderLine)
async def create_purchase_order_line(data: PurchaseOrderLineCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement can create PO lines")
    
    line = PurchaseOrderLine(**data.model_dump())
    await db.purchase_order_lines.insert_one(line.model_dump())
    return line

@api_router.get("/purchase-orders")
async def get_purchase_orders(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query['status'] = status
    pos = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with lines and PFI reference for all POs
    enriched_pos = []
    for po in pos:
        lines = await db.purchase_order_lines.find({"po_id": po["id"]}, {"_id": 0}).to_list(1000)
        po["lines"] = lines
        
        # Enrich with PFI number if quotation_id exists but pfi_number is missing
        if po.get("quotation_id") and not po.get("pfi_number"):
            quotation = await db.quotations.find_one({"id": po["quotation_id"]}, {"_id": 0})
            if quotation:
                po["pfi_number"] = quotation.get("pfi_number")
        
        # If quotation_id/pfi_number are missing, try to find from job_numbers in PO lines
        if not po.get("quotation_id") and not po.get("pfi_number") and lines:
            for line in lines:
                job_numbers = line.get("job_numbers", [])
                if job_numbers:
                    # Try first job number
                    job_number = job_numbers[0]
                    job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
                    if job:
                        sales_order_id = job.get("sales_order_id")
                        if sales_order_id:
                            sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
                            if sales_order and sales_order.get("quotation_id"):
                                po["quotation_id"] = sales_order.get("quotation_id")
                                quotation = await db.quotations.find_one({"id": po["quotation_id"]}, {"_id": 0})
                                if quotation:
                                    po["pfi_number"] = quotation.get("pfi_number")
                                break  # Found it, no need to check other lines
        
        enriched_pos.append(po)
    
    return enriched_pos

@api_router.get("/purchase-orders/ready-for-import-booking")
async def get_pos_ready_for_import_booking(current_user: dict = Depends(get_current_user)):
    """Get approved POs with FOB incoterm that need import booking"""
    pos = await db.purchase_orders.find({
        "status": "APPROVED",
        "incoterm": "FOB",  # Only FOB POs
        "routed_to": {"$in": ["SHIPPING", None]}  # Not yet routed or routed to shipping
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return pos

@api_router.get("/purchase-orders/pending-approval")
async def get_pos_pending_approval(current_user: dict = Depends(get_current_user)):
    """Get POs pending finance approval"""
    if not await has_page_access(current_user, "/finance-approval", fallback_roles=["finance"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    pos = await db.purchase_orders.find(
        {"status": "DRAFT"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    # Enrich with lines and PFI reference
    enriched_pos = []
    for po in pos:
        lines = await db.purchase_order_lines.find({"po_id": po["id"]}, {"_id": 0}).to_list(1000)
        po["lines"] = lines
        
        # Enrich with PFI number if quotation_id exists but pfi_number is missing
        if po.get("quotation_id") and not po.get("pfi_number"):
            quotation = await db.quotations.find_one({"id": po["quotation_id"]}, {"_id": 0})
            if quotation:
                po["pfi_number"] = quotation.get("pfi_number")
        
        # If quotation_id/pfi_number are missing, try to find from job_numbers in PO lines
        if not po.get("quotation_id") and not po.get("pfi_number") and lines:
            for line in lines:
                job_numbers = line.get("job_numbers", [])
                if job_numbers:
                    # Try first job number
                    job_number = job_numbers[0]
                    job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
                    if job:
                        sales_order_id = job.get("sales_order_id")
                        if sales_order_id:
                            sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
                            if sales_order and sales_order.get("quotation_id"):
                                po["quotation_id"] = sales_order.get("quotation_id")
                                quotation = await db.quotations.find_one({"id": po["quotation_id"]}, {"_id": 0})
                                if quotation:
                                    po["pfi_number"] = quotation.get("pfi_number")
                                break  # Found it, no need to check other lines
        
        enriched_pos.append(po)
    
    return enriched_pos

@api_router.get("/purchase-orders/{po_id}")
async def get_purchase_order(po_id: str, current_user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    
    # Get PO lines
    lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(1000)
    po['lines'] = lines
    
    # Get supplier details
    supplier = await db.suppliers.find_one({"id": po['supplier_id']}, {"_id": 0})
    po['supplier'] = supplier
    
    return po

@api_router.put("/purchase-orders/{po_id}/status")
async def update_po_status(po_id: str, status: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement can update PO status")
    
    valid_statuses = ["DRAFT", "APPROVED", "SENT", "PARTIAL", "RECEIVED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    update_data = {"status": status}
    
    # If status is SENT, create email outbox entry (don't auto-send)
    if status == "SENT":
        update_data["sent_at"] = datetime.now(timezone.utc).isoformat()
        
        # Get PO and supplier details
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        supplier = await db.suppliers.find_one({"id": po['supplier_id']}, {"_id": 0})
        
        if supplier and supplier.get('email'):
            # Create email outbox entry
            email = EmailOutbox(
                to=supplier['email'],
                subject=f"Purchase Order {po['po_number']}",
                body=f"Please find attached Purchase Order {po['po_number']}",
                ref_type="PO",
                ref_id=po_id
            )
            await db.email_outbox.insert_one(email.model_dump())
            update_data["email_status"] = "QUEUED"
        else:
            update_data["email_status"] = "NOT_CONFIGURED"
    
    result = await db.purchase_orders.update_one({"id": po_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="PO not found")
    
    return {"message": f"PO status updated to {status}"}

# Procurement Requisitions
@api_router.get("/procurement-requisitions")
async def get_procurement_requisitions(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "procurement", "production"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement/production can view PRs")
    
    query = {}
    if status:
        query['status'] = status
    
    prs = await db.procurement_requisitions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get lines for each PR
    for pr in prs:
        lines = await db.procurement_requisition_lines.find({"pr_id": pr['id']}, {"_id": 0}).to_list(1000)
        
        # Enrich with item details
        for line in lines:
            item = await db.inventory_items.find_one({"id": line['item_id']}, {"_id": 0})
            line['item'] = item
        
        pr['lines'] = lines
    
    return prs

# Production Scheduling - Main APIs
@api_router.post("/production/drum-schedule/regenerate")
async def regenerate_drum_schedule(week_start: str, current_user: dict = Depends(get_current_user)):
    """Regenerate weekly drum production schedule"""
    if current_user["role"] not in ["admin", "production"]:
        raise HTTPException(status_code=403, detail="Only admin/production can regenerate schedule")
    
    try:
        result = await scheduler.regenerate_schedule(week_start)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/production/drum-schedule")
async def get_drum_schedule(week_start: str, current_user: dict = Depends(get_current_user)):
    """Get weekly drum production schedule"""
    # Get schedule days for the week
    schedule_days = await db.production_schedule_days.find(
        {"week_start": week_start},
        {"_id": 0}
    ).sort("schedule_date", 1).to_list(1000)
    
    # Enrich with campaign and requirement details
    for day in schedule_days:
        # Get campaign
        campaign = await db.production_campaigns.find_one({"id": day['campaign_id']}, {"_id": 0})
        if campaign:
            # Get product and packaging details
            product = await db.products.find_one({"id": campaign['product_id']}, {"_id": 0})
            packaging = await db.packaging.find_one({"id": campaign['packaging_id']}, {"_id": 0})
            
            campaign['product'] = product
            campaign['packaging'] = packaging
            
            # Get job links
            job_links = await db.production_campaign_job_links.find(
                {"campaign_id": campaign['id']},
                {"_id": 0}
            ).to_list(1000)
            
    # Enrich job links with job order details
            for link in job_links:
                job_order = await db.job_orders.find_one({"id": link['job_order_item_id']}, {"_id": 0})
                if job_order:
                    link['job_order'] = job_order
            
            campaign['job_links'] = job_links
            day['campaign'] = campaign
        
        # Get requirements
        requirements = await db.production_day_requirements.find(
            {"schedule_day_id": day['id']},
            {"_id": 0}
        ).to_list(1000)
        
        # Enrich requirements with item details
        for req in requirements:
            item = await db.inventory_items.find_one({"id": req['item_id']}, {"_id": 0})
            req['item'] = item
        
        day['requirements'] = requirements
    
    # Calculate daily capacity usage
    daily_usage = {}
    for day in schedule_days:
        date_key = day['schedule_date']
        if date_key not in daily_usage:
            daily_usage[date_key] = 0
        daily_usage[date_key] += day['planned_drums']
    
    return {
        'week_start': week_start,
        'schedule_days': schedule_days,
        'daily_capacity': 600,
        'daily_usage': daily_usage
    }

@api_router.get("/production/campaign/{campaign_id}")
async def get_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Get campaign details with job orders and requirements"""
    campaign = await db.production_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get product and packaging
    product = await db.products.find_one({"id": campaign['product_id']}, {"_id": 0})
    packaging = await db.packaging.find_one({"id": campaign['packaging_id']}, {"_id": 0})
    
    campaign['product'] = product
    campaign['packaging'] = packaging
    
    # Get job links
    job_links = await db.production_campaign_job_links.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).to_list(1000)
    
    for link in job_links:
        job_order = await db.job_orders.find_one({"id": link['job_order_item_id']}, {"_id": 0})
        if job_order:
            link['job_order'] = job_order
    
    campaign['job_links'] = job_links
    
    # Get all schedule days for this campaign
    schedule_days = await db.production_schedule_days.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).sort("schedule_date", 1).to_list(1000)
    
    campaign['schedule_days'] = schedule_days
    
    return campaign

@api_router.get("/production/arrivals")
async def get_arrivals(week_start: str, current_user: dict = Depends(get_current_user)):
    """Get incoming RAW + PACK materials for the week from PO ETAs"""
    from datetime import datetime, timedelta
    
    week_start_date = datetime.fromisoformat(week_start)
    week_end_date = week_start_date + timedelta(days=7)
    
    # Get PO lines with promised delivery dates in this week
    pipeline = [
        {'$match': {
            'promised_delivery_date': {
                '$gte': week_start_date.isoformat(),
                '$lt': week_end_date.isoformat()
            }
        }},
        {'$lookup': {
            'from': 'purchase_orders',
            'localField': 'po_id',
            'foreignField': 'id',
            'as': 'po'
        }},
        {'$unwind': '$po'},
        {'$match': {
            'po.status': {'$in': ['SENT', 'PARTIAL']}
        }},
        {'$lookup': {
            'from': 'inventory_items',
            'localField': 'item_id',
            'foreignField': 'id',
            'as': 'item'
        }},
        {'$unwind': '$item'},
        {'$project': {
            '_id': 0,
            'po_number': '$po.po_number',
            'item_id': 1,
            'item_name': '$item.name',
            'item_type': 1,
            'qty': 1,
            'uom': 1,
            'received_qty': 1,
            'remaining_qty': {'$subtract': ['$qty', '$received_qty']},
            'promised_delivery_date': 1,
            'required_by': 1
        }}
    ]
    
    arrivals = await db.purchase_order_lines.aggregate(pipeline).to_list(1000)
    
    # Group by item type
    raw_arrivals = [a for a in arrivals if a['item_type'] == 'RAW']
    pack_arrivals = [a for a in arrivals if a['item_type'] == 'PACK']
    
    return {
        'week_start': week_start,
        'raw_arrivals': raw_arrivals,
        'pack_arrivals': pack_arrivals,
        'total_arrivals': len(arrivals)
    }

@api_router.post("/production/schedule/approve")
async def approve_schedule(week_start: str, current_user: dict = Depends(get_current_user)):
    """Approve schedule and create material reservations for READY days"""
    if current_user["role"] not in ["admin", "production"]:
        raise HTTPException(status_code=403, detail="Only admin/production can approve schedule")
    
    # Get all READY schedule days for this week
    ready_days = await db.production_schedule_days.find({
        "week_start": week_start,
        "status": "READY"
    }, {"_id": 0}).to_list(1000)
    
    reservations_created = 0
    
    for day in ready_days:
        # Get all requirements for this day
        requirements = await db.production_day_requirements.find({
            "schedule_day_id": day['id']
        }, {"_id": 0}).to_list(1000)
        
        # Create reservations
        for req in requirements:
            reservation = InventoryReservation(
                item_id=req['item_id'],
                ref_type="SCHEDULE_DAY",
                ref_id=day['id'],
                qty=req['required_qty']
            )
            await db.inventory_reservations.insert_one(reservation.model_dump())
            reservations_created += 1
        
        # Update day status (could add "APPROVED" status if needed)
        await db.production_schedule_days.update_one(
            {"id": day['id']},
            {"$set": {"status": "READY"}}  # Keep as READY for now
        )
    
    return {
        "success": True,
        "message": f"Schedule approved and {reservations_created} material reservations created",
        "ready_days_approved": len(ready_days),
        "reservations_created": reservations_created
    }

# ==================== NOTIFICATIONS (STRICT EVENT-BASED) ====================

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"  # info, success, warning, error
    link: Optional[str] = None
    event_type: str  # RFQ_QUOTE_RECEIVED, PO_PENDING_APPROVAL, PRODUCTION_BLOCKED, GRN_PAYABLES_REVIEW
    ref_type: Optional[str] = None
    ref_id: Optional[str] = None

async def create_notification(
    event_type: str,
    title: str,
    message: str,
    link: str = None,
    ref_type: str = None,
    ref_id: str = None,
    target_roles: List[str] = None,
    notification_type: str = "info"
):
    """Create notifications for specific events - STRICT, NO NOISE"""
    valid_events = [
        "QUOTATION_APPROVED",
        "QUOTATION_FINANCE_APPROVED",
        "SALES_ORDER_CREATED",
        "RFQ_QUOTE_RECEIVED",
        "PO_PENDING_APPROVAL",
        "PO_READY_FOR_TRANSPORT_BOOKING",
        "PRODUCTION_BLOCKED",
        "GRN_PAYABLES_REVIEW",
        "JOB_READY",
        "RAW_MATERIALS_AVAILABLE",
        "PRODUCTION_SCHEDULED",
        "EXPORT_BOOKING_READY",
        "LOCAL_DISPATCH_READY",
        "SHIPPING_BOOKING_CREATED",
        "SHIP_BOOKING_REQUIRED",
        "CRO_RECEIVED",
        "TRANSPORT_BOOKING_REQUIRED",
        "CONTAINER_LOADING_SCHEDULED",
        "CONTAINER_LOADING_TODAY",
        "CONTAINER_LOADING_STARTED",
        "CONTAINER_LOADING_COMPLETED",
        "TRANSPORT_LOADING_STARTED",
        "TRANSPORT_ARRIVAL_SCHEDULED",
        "TRANSPORT_ARRIVING_TODAY",
        "TRANSPORT_ARRIVED",
        "TRANSPORT_IN_TRANSIT",
        "TRANSPORT_STATUS_UPDATED",
        "UNLOADING_COMPLETED",
        "INVOICE_GENERATED",
        "IMPORT_COMPLETED",
        "QC_INSPECTION_REQUIRED",
        "DO_DOCUMENTS_GENERATED"
    ]
    
    if event_type not in valid_events:
        return None  # Silently ignore invalid events
    
    notification = {
        "id": str(uuid.uuid4()),
        "title": title,
        "message": message,
        "type": notification_type,
        "link": link,
        "event_type": event_type,
        "ref_type": ref_type,
        "ref_id": ref_id,
        "target_roles": target_roles,
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification

@api_router.get("/notifications/unread-count")
async def get_unread_notification_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread notifications for current user's role"""
    user_role = current_user.get("role", "")
    
    query = {
        "is_read": False,
        "$or": [
            {"target_roles": {"$exists": False}},
            {"target_roles": None},
            {"target_roles": {"$in": [user_role, "all"]}}
        ]
    }
    
    count = await db.notifications.count_documents(query)
    return {"unread_count": count}

@api_router.get("/notifications/bell")
async def get_bell_notifications(current_user: dict = Depends(get_current_user)):
    """Get notifications for bell icon - strict event-based only"""
    user_role = current_user.get("role", "")
    
    # Only show notifications relevant to user's role
    role_events = {
        "procurement": ["RFQ_QUOTE_RECEIVED", "PRODUCTION_BLOCKED"],
        "finance": ["PO_PENDING_APPROVAL", "GRN_PAYABLES_REVIEW", "UNLOADING_COMPLETED"],
        "sales": ["QUOTATION_APPROVED", "SALES_ORDER_CREATED"],
        "production": ["PRODUCTION_BLOCKED", "PO_PENDING_APPROVAL", "SALES_ORDER_CREATED", "CONTAINER_LOADING_SCHEDULED", "CONTAINER_LOADING_TODAY", 
                      "CONTAINER_LOADING_STARTED", "CONTAINER_LOADING_COMPLETED", "TRANSPORT_ARRIVAL_SCHEDULED", 
                      "TRANSPORT_ARRIVING_TODAY", "TRANSPORT_ARRIVED", "UNLOADING_COMPLETED"],
        "warehouse": ["CONTAINER_LOADING_SCHEDULED", "CONTAINER_LOADING_TODAY", "CONTAINER_LOADING_STARTED", 
                     "CONTAINER_LOADING_COMPLETED", "TRANSPORT_ARRIVAL_SCHEDULED", "TRANSPORT_ARRIVING_TODAY", 
                     "TRANSPORT_ARRIVED", "UNLOADING_COMPLETED"],
        "security": ["CONTAINER_LOADING_TODAY", "CONTAINER_LOADING_STARTED", "TRANSPORT_ARRIVING_TODAY", "TRANSPORT_ARRIVED"],
        "transport": ["CONTAINER_LOADING_TODAY", "CONTAINER_LOADING_COMPLETED", "TRANSPORT_ARRIVING_TODAY"],
        "shipping": ["CONTAINER_LOADING_STARTED", "CONTAINER_LOADING_COMPLETED"],
        "admin": ["RFQ_QUOTE_RECEIVED", "PO_PENDING_APPROVAL", "PRODUCTION_BLOCKED", "GRN_PAYABLES_REVIEW", "QUOTATION_APPROVED", "SALES_ORDER_CREATED",
                 "CONTAINER_LOADING_SCHEDULED", "CONTAINER_LOADING_TODAY", "CONTAINER_LOADING_STARTED", 
                 "CONTAINER_LOADING_COMPLETED", "TRANSPORT_ARRIVAL_SCHEDULED", "TRANSPORT_ARRIVING_TODAY", 
                 "TRANSPORT_ARRIVED", "UNLOADING_COMPLETED"]
    }
    
    allowed_events = role_events.get(user_role, role_events.get("admin", []))
    
    notifications = await db.notifications.find({
        "event_type": {"$in": allowed_events},
        "$or": [
            {"target_roles": {"$exists": False}},
            {"target_roles": None},
            {"target_roles": {"$in": [user_role, "all"]}}
        ]
    }, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    
    unread_count = await db.notifications.count_documents({
        "event_type": {"$in": allowed_events},
        "is_read": False,
        "$or": [
            {"target_roles": {"$exists": False}},
            {"target_roles": None},
            {"target_roles": {"$in": [user_role, "all"]}}
        ]
    })
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a notification as read"""
    await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"is_read": True}}
    )
    return {"success": True}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read for current user's role"""
    user_role = current_user.get("role", "")
    await db.notifications.update_many(
        {
            "is_read": False,
            "$or": [
                {"target_roles": {"$exists": False}},
                {"target_roles": None},
                {"target_roles": {"$in": [user_role, "all"]}}
            ]
        },
        {"$set": {"is_read": True}}
    )
    return {"success": True}

# ==================== PHASE 3: SMTP EMAIL QUEUE ====================

class EmailQueueCreate(BaseModel):
    to_email: str
    subject: str
    body_html: str
    body_text: Optional[str] = None
    ref_type: Optional[str] = None  # PO, QUOTATION, etc.
    ref_id: Optional[str] = None

class EmailQueueItem(EmailQueueCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "QUEUED"  # QUEUED, SENT, FAILED
    attempts: int = 0
    last_error: Optional[str] = None
    sent_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

@api_router.post("/email/queue")
async def queue_email(data: EmailQueueCreate, current_user: dict = Depends(get_current_user)):
    """Queue an email for sending via SMTP"""
    email_item = EmailQueueItem(**data.model_dump())
    await db.email_outbox.insert_one(email_item.model_dump())
    return {"success": True, "email_id": email_item.id, "status": "QUEUED"}

@api_router.get("/email/outbox")
async def get_email_outbox(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get email queue with SMTP configuration status"""
    query = {}
    if status:
        query["status"] = status
    emails = await db.email_outbox.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Check if SMTP is configured
    smtp_host = os.environ.get('SMTP_HOST')
    smtp_configured = smtp_host is not None and smtp_host != ''
    
    return {
        "smtp_configured": smtp_configured,
        "smtp_status": "CONFIGURED" if smtp_configured else "NOT_CONFIGURED",
        "emails": emails
    }

@api_router.post("/email/process-queue")
async def process_email_queue(current_user: dict = Depends(get_current_user)):
    """Process queued emails using SMTP (if configured)"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can process email queue")
    
    # Check SMTP configuration
    smtp_host = os.environ.get('SMTP_HOST')
    smtp_port = int(os.environ.get('SMTP_PORT', 587))
    smtp_user = os.environ.get('SMTP_USER')
    smtp_pass = os.environ.get('SMTP_PASS')
    smtp_from = os.environ.get('SMTP_FROM', smtp_user)
    
    if not smtp_host:
        return {
            "success": False,
            "message": "SMTP not configured. Emails remain QUEUED.",
            "processed": 0
        }
    
    # Get queued emails
    queued_emails = await db.email_outbox.find(
        {"status": "QUEUED"},
        {"_id": 0}
    ).limit(50).to_list(50)
    
    processed = 0
    failed = 0
    
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    for email in queued_emails:
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = email['subject']
            msg['From'] = smtp_from
            msg['To'] = email['to_email']
            
            if email.get('body_text'):
                msg.attach(MIMEText(email['body_text'], 'plain'))
            msg.attach(MIMEText(email['body_html'], 'html'))
            
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                if smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_from, email['to_email'], msg.as_string())
            
            await db.email_outbox.update_one(
                {"id": email['id']},
                {"$set": {
                    "status": "SENT",
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                    "attempts": email.get('attempts', 0) + 1
                }}
            )
            processed += 1
        except Exception as e:
            await db.email_outbox.update_one(
                {"id": email['id']},
                {"$set": {
                    "status": "FAILED" if email.get('attempts', 0) >= 2 else "QUEUED",
                    "last_error": str(e),
                    "attempts": email.get('attempts', 0) + 1
                }}
            )
            failed += 1
    
    return {
        "success": True,
        "processed": processed,
        "failed": failed,
        "message": f"Processed {processed} emails, {failed} failed"
    }

# ==================== PHASE 4: AUTO PROCUREMENT FROM SHORTAGES ====================

@api_router.get("/procurement/shortages")
async def get_procurement_shortages(current_user: dict = Depends(get_current_user)):
    """Get material shortages from job orders' material_shortages array AND procurement requisitions
    (calculated from CURRENT STOCK)
    
    Returns individual job order shortages instead of aggregated totals.
    Includes items from procurement requisitions that haven't been converted to POs yet.
    
    PROCUREMENT ↔ BOM ↔ UNIT ENGINE CONTRACT:
    ==========================================
    1) ALL shortage quantities MUST be in ACCOUNTING UNIT = KG
    2) Source data:
       - BOM: qty_kg_per_kg_finished (RAW, PACK)
       - Direct requirement: job order quantity (TRADED)
    3) NO package units allowed in shortages (CARTON, DRUM, PAIL, IBC)
    4) MT is for UI display ONLY (conversion: kg / 1000)
    5) Unit Conversion Engine is authoritative for all conversions
    6) Quantities are NEVER manipulated inline with hardcoded factors
    
    Data Shape Guarantee:
    {
      item_id: str,
      item_name: str,
      item_type: "RAW" | "PACK" | "TRADED",
      required_qty: float (ALWAYS in KG),
      on_hand: float (ALWAYS in KG from inventory_balances),
      shortage: float (ALWAYS in KG),
      uom: str (for reference, but qty is KG),
      source: "BOM" | "JOB_ORDER"
    }
    """
    start_time = time.time()
    logger.info("Starting procurement shortages calculation")
    
    # Get all pending job orders that need procurement
    pending_jobs = await db.job_orders.find(
        {
            "$or": [
                {"procurement_required": True},
                {"procurement_status": "pending"},
                {"material_shortages": {"$exists": True, "$ne": []}}
            ]
        },
        {"_id": 0}
    ).to_list(1000)
    
    shortage_list = []  # Individual shortage entries per job order
    processed_pr_items = set()  # Track (item_id, job_id) pairs from PRs to avoid duplicates
    
    # First, get procurement requisitions and their lines to include in shortages
    draft_prs = await db.procurement_requisitions.find({"status": "DRAFT"}, {"_id": 0}).to_list(100)
    
    for pr in draft_prs:
        pr_lines = await db.procurement_requisition_lines.find({"pr_id": pr["id"]}, {"_id": 0}).to_list(1000)
        
        for pr_line in pr_lines:
            item_id = pr_line.get("item_id")
            if not item_id:
                continue
            
            # Parse job numbers from reason field (format: "Shortage for jobs: JOB-000090, JOB-000091")
            reason = pr_line.get("reason", "")
            job_numbers = []
            if reason:
                # Extract job numbers using regex
                job_number_pattern = r'JOB-\d+'
                job_numbers = re.findall(job_number_pattern, reason.upper())
            
            # If no job numbers in reason, try to get from linked fields
            if not job_numbers:
                # Check if there's a linked_job_order_id (from old implementation)
                linked_job_id = pr_line.get("linked_job_order_id")
                if linked_job_id:
                    job = await db.job_orders.find_one({"id": linked_job_id}, {"_id": 0})
                    if job:
                        job_numbers = [job.get("job_number")]
            
            # For each job number found, create a shortage entry
            for job_number in job_numbers:
                job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
                if not job:
                    continue
                
                job_id = job.get("id")
                key = (item_id, job_id)
                
                # Skip if already processed from job order's material_shortages
                if key in processed_pr_items:
                    continue
                
                # Get material details
                material = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
                if not material:
                    material = await db.products.find_one({"id": item_id}, {"_id": 0})
                
                if not material:
                    continue
                
                # Get current stock levels
                balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
                on_hand = balance.get("on_hand", 0) if balance else 0
                
                reservations = await db.inventory_reservations.find({"item_id": item_id}, {"_id": 0}).to_list(1000)
                reserved = sum(r.get("qty", 0) for r in reservations)
                available = on_hand - reserved
                
                # Use the PR line quantity as required_qty
                required_qty = pr_line.get("qty", 0)
                shortage = max(0, required_qty - available)
                
                # Only include if there's still a shortage
                if shortage > 0:
                    # CONTRACT ENFORCEMENT: Validate quantities
                    if required_qty < 0 or shortage < 0:
                        logger.error(f"NEGATIVE quantity in PR shortage for {item_id}: required={required_qty}, shortage={shortage}")
                        continue  # Skip invalid data but don't crash
                    
                    # Get UOM for reference
                    uom = pr_line.get("uom") or material.get("uom") or material.get("unit", "KG")
                    
                    # VALIDATION: Normalize MT to KG
                    if uom.upper() in ["MT", "METRIC TON", "TONNE"]:
                        logger.warning(f"PR line {item_id} has MT in uom - normalizing to KG")
                        uom = "KG"
                    
                    processed_pr_items.add(key)
                    item_type = pr_line.get("item_type", "RAW")
                    display_type = "RM/Production" if item_type == "RAW" else "RM/Trading" if item_type == "TRADED" else "Packaging"
                    
                    # Get quotation/PFI reference from job order -> sales order -> quotation
                    quotation_id = None
                    pfi_number = None
                    sales_order_id = job.get("sales_order_id")
                    if sales_order_id:
                        sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
                        if sales_order and sales_order.get("quotation_id"):
                            quotation_id = sales_order.get("quotation_id")
                            quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
                            if quotation:
                                pfi_number = quotation.get("pfi_number")
                    
                    shortage_list.append({
                        "item_id": item_id,
                        "job_id": job_id,
                        "job_number": job_number,
                        "product_name": job.get("product_name", "Unknown"),
                        "item_name": material.get("name", "Unknown"),
                        "item_sku": material.get("sku", "N/A"),
                        "item_type": item_type,
                        "display_type": display_type,
                        "uom": uom,  # For reference, but qty is always KG
                        "required_qty": required_qty,  # ALWAYS KG
                        "shortage": shortage,  # ALWAYS KG
                        "on_hand": on_hand,  # ALWAYS KG
                        "reserved": reserved,  # ALWAYS KG
                        "available": available,  # ALWAYS KG
                        "source": "PROCUREMENT_REQUISITION",  # CONTRACT: Track source
                        "quotation_id": quotation_id,  # Link to quotation/PFI
                        "pfi_number": pfi_number  # PFI number for display
                    })
    
    # Now process job orders' material_shortages (existing logic)
    for job in pending_jobs:
        job_number = job.get("job_number", "Unknown")
        job_id = job.get("id")
        material_shortages = job.get("material_shortages", [])
        
        # If material_shortages is empty but procurement_required is True,
        # calculate shortages from BOM
        if not material_shortages and job.get("procurement_required"):
            product_id = job.get("product_id")
            # Use total_weight_mt from job order (correct value in MT) instead of quantity (number of units)
            total_weight_mt = job.get("total_weight_mt", 0)
            quantity = job.get("quantity", 0)
            packaging = job.get("packaging", "Bulk")
            # Use stored net_weight_kg from job order, only default if not provided and not Bulk
            net_weight_kg = job.get("net_weight_kg")
            if net_weight_kg is None and packaging != "Bulk":
                net_weight_kg = 200  # Default only when needed
            
            if product_id and (total_weight_mt > 0 or quantity > 0):
                # Get product BOM
                product_bom = await db.product_boms.find_one({
                    "product_id": product_id,
                    "is_active": True
                }, {"_id": 0})
                
                if product_bom:
                    bom_items = await db.product_bom_items.find({
                        "bom_id": product_bom["id"]
                    }, {"_id": 0}).to_list(100)
                    
                    # Calculate total KG needed - prioritize total_weight_mt (correct value)
                    if total_weight_mt > 0:
                        # Use total_weight_mt from job order (e.g., 14.8 MT = 14,800 KG)
                        total_kg = total_weight_mt * 1000
                    elif packaging != "Bulk":
                        # Fallback: calculate from quantity and net_weight_kg if total_weight_mt not available
                        total_kg = quantity * (net_weight_kg or 200)
                    else:
                        # Fallback: assume quantity is in MT for bulk
                        total_kg = quantity * 1000
                    
                    # Build material_shortages from BOM
                    for bom_item in bom_items:
                        material_id = bom_item.get("material_item_id")
                        qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
                        
                        # CONTRACT ENFORCEMENT: BOM quantities MUST be in KG basis
                        if qty_per_kg < 0:
                            logger.error(f"BOM item {material_id} has NEGATIVE qty_per_kg: {qty_per_kg}")
                            raise HTTPException(
                                status_code=520,
                                detail=f"BOM data integrity error: negative quantity for {material_id}"
                            )
                        
                        # Calculate required quantity in KG (accounting unit)
                        required_qty = total_kg * qty_per_kg
                        
                        # Get material details - check both inventory_items and products
                        material = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
                        if not material:
                            material = await db.products.find_one({"id": material_id}, {"_id": 0})
                        
                        if material:
                            # Check availability (inventory_balances stores quantities in KG)
                            balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                            on_hand = balance.get("on_hand", 0) if balance else 0
                            reservations = await db.inventory_reservations.find({"item_id": material_id}, {"_id": 0}).to_list(1000)
                            reserved = sum(r.get("qty", 0) for r in reservations)
                            available = on_hand - reserved
                            
                            # CONTRACT ENFORCEMENT: All quantities in KG
                            shortage_qty = max(0, required_qty - available)
                            if shortage_qty > 0:
                                # Get UOM for reference (but quantity is always KG)
                                uom = bom_item.get("uom") or material.get("uom") or material.get("unit", "KG")
                                
                                # VALIDATION: Ensure UOM is normalized to KG for accounting
                                # BOM should always use KG, but if MT is stored, log warning
                                if uom.upper() in ["MT", "METRIC TON", "TONNE"]:
                                    logger.warning(f"BOM item {material_id} has MT in uom field - should be KG")
                                    uom = "KG"  # Force to KG for contract compliance
                                
                                material_shortages.append({
                                    "item_id": material_id,
                                    "item_name": material.get("name", "Unknown"),
                                    "item_sku": material.get("sku", "-"),
                                    "required_qty": required_qty,  # ALWAYS KG
                                    "available": available,  # ALWAYS KG
                                    "shortage": shortage_qty,  # ALWAYS KG
                                    "status": "SHORTAGE",
                                    "uom": uom,  # For reference, but qty is KG
                                    "item_type": "RAW",
                                    "source": "BOM"  # CONTRACT: Track shortage source
                                })
                    
                    # Also check for packaging requirements if packaging is not "Bulk"
                                       # Also check for packaging requirements if packaging is not "Bulk"
                    if packaging and packaging != "Bulk" and total_kg > 0:
                        try:
                            packaging_item_id = await find_or_create_packaging_item(packaging)
                            if packaging_item_id:
                                # Calculate required packaging quantity
                                packaging_qty = 0
                                packaging_lower = packaging.lower()
                                
                                if "drum" in packaging_lower:
                                    capacity_liters = 200
                                    if "210" in packaging or "210l" in packaging_lower:
                                        capacity_liters = 210
                                    elif "250" in packaging or "250l" in packaging_lower:
                                        capacity_liters = 250
                                    net_weight_per_drum = capacity_liters * 0.85
                                    packaging_qty = max(1, ceil(total_kg / net_weight_per_drum))
                                elif "ibc" in packaging_lower:
                                    net_weight_per_ibc = 1000 * 0.85
                                    packaging_qty = max(1, ceil(total_kg / net_weight_per_ibc))
                                elif "flexi" in packaging_lower or "flexitank" in packaging_lower:
                                    packaging_qty = 1
                                else:
                                    net_weight = net_weight_kg if net_weight_kg else 200
                                    packaging_qty = max(1, ceil(total_kg / net_weight))
                                
                                # Check packaging availability
                                packaging_balance = await db.inventory_balances.find_one({"item_id": packaging_item_id}, {"_id": 0})
                                packaging_on_hand = packaging_balance.get("on_hand", 0) if packaging_balance else 0
                                packaging_reservations = await db.inventory_reservations.find({"item_id": packaging_item_id}, {"_id": 0}).to_list(1000)
                                packaging_reserved = sum(r.get("qty", 0) for r in packaging_reservations)
                                packaging_available = packaging_on_hand - packaging_reserved
                                packaging_shortage = max(0, packaging_qty - packaging_available)
                                
                                if packaging_shortage > 0:
                                    packaging_item = await db.inventory_items.find_one({"id": packaging_item_id}, {"_id": 0})
                                    if packaging_item:
                                        material_shortages.append({
                                            "item_id": packaging_item_id,
                                            "item_name": packaging_item.get("name", packaging),
                                            "item_sku": packaging_item.get("sku", "-"),
                                            "required_qty": packaging_qty,  # In EA (units), not KG
                                            "available": packaging_available,  # In EA
                                            "shortage": packaging_shortage,  # In EA
                                            "status": "SHORTAGE",
                                            "uom": packaging_item.get("uom", "EA"),
                                            "item_type": "PACK",
                                            "source": "JOB_ORDER"
                                        })
                        except Exception as e:
                            logger.error(f"Error calculating packaging shortage for job {job_number}: {e}")
                        
        # Process each shortage from the job order - create individual entries
        for shortage_item in material_shortages:
            item_id = shortage_item.get("item_id")
            if not item_id:
                continue
            
            key = (item_id, job_id)
            # Skip if already added from procurement requisition
            if key in processed_pr_items:
                continue
            
            # Get current stock levels (ALWAYS use inventory_balances as source of truth for procurement)
            # This ensures consistency with procurement calculations regardless of where item is stored
            balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
            on_hand = balance.get("on_hand", 0) if balance else 0
            
            # Get reservations
            reservations = await db.inventory_reservations.find({"item_id": item_id}, {"_id": 0}).to_list(1000)
            reserved = sum(r.get("qty", 0) for r in reservations)
            
            available = on_hand - reserved
            required_qty = shortage_item.get("required_qty", 0)
            shortage = max(0, required_qty - available)
            
            # Only include if there's still a shortage
            if shortage > 0:
                # Get material details - check both inventory_items and products
                material = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
                if not material:
                    material = await db.products.find_one({"id": item_id}, {"_id": 0})
                
                if not material:
                    continue
                
                # CONTRACT ENFORCEMENT: Validate quantities are non-negative
                if required_qty < 0 or shortage < 0:
                    logger.error(f"NEGATIVE quantity in shortage for {item_id}: required={required_qty}, shortage={shortage}")
                    raise HTTPException(
                        status_code=520,
                        detail=f"Data integrity error: negative shortage quantity for {material.get('name', item_id)}"
                    )
                
                # Get UOM for reference
                uom = shortage_item.get("uom") or material.get("uom") or material.get("unit", "KG")
                
                # VALIDATION: Normalize MT to KG for contract compliance
                if uom.upper() in ["MT", "METRIC TON", "TONNE"]:
                    logger.warning(f"Shortage item {item_id} has MT in uom - normalizing to KG")
                    uom = "KG"
                
                # Determine shortage source
                shortage_source = shortage_item.get("source", "JOB_ORDER")
                
                # Get quotation/PFI reference from job order -> sales order -> quotation
                quotation_id = None
                pfi_number = None
                sales_order_id = job.get("sales_order_id")
                if sales_order_id:
                    sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
                    if sales_order and sales_order.get("quotation_id"):
                        quotation_id = sales_order.get("quotation_id")
                        quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
                        if quotation:
                            pfi_number = quotation.get("pfi_number")
                
                # Create individual shortage entry per job order
                item_type = shortage_item.get("item_type", "RAW")  # RAW, PACK, or TRADED
                display_type = "RM/Production" if item_type == "RAW" else "RM/Trading" if item_type == "TRADED" else "Packaging"
                shortage_list.append({
                    "item_id": item_id,
                    "job_id": job_id,
                    "job_number": job_number,
                    "product_name": job.get("product_name", "Unknown"),
                    "item_name": shortage_item.get("item_name") or material.get("name", "Unknown"),
                    "item_sku": shortage_item.get("item_sku") or material.get("sku", "N/A"),
                    "item_type": item_type,
                    "display_type": display_type,
                    "uom": uom,  # For reference, but qty is always KG
                    "required_qty": required_qty,  # ALWAYS KG
                    "shortage": shortage,  # ALWAYS KG
                    "on_hand": on_hand,  # ALWAYS KG (from inventory_balances)
                    "reserved": reserved,  # ALWAYS KG
                    "available": available,  # ALWAYS KG
                    "source": shortage_source,  # CONTRACT: Track shortage source
                    "quotation_id": quotation_id,  # Link to quotation/PFI
                    "pfi_number": pfi_number  # PFI number for display
                })
    
    # ==================== ADD LOW STOCK ITEMS FROM PRODUCTS TABLE ====================
    # Check products table for low stock items and add them to shortages
    # Note: products table doesn't have is_active field, so we check all products
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    
    low_stock_found_count = 0
    low_stock_added_count = 0
    skipped_by_category = 0
    total_products_checked = len(products)
    products_with_min_stock = 0
    products_below_min_stock = 0
    
    logger.info(f"Checking {total_products_checked} active products for low stock...")
    
    for product in products:
        current_stock = product.get("current_stock", 0)
        min_stock = product.get("min_stock", 0)
        category = product.get("category", "finished_product")
        product_type = product.get("type", "MANUFACTURED")
        item_name = product.get("name", "Unknown")
        
        # Count products with min_stock set
        if min_stock > 0:
            products_with_min_stock += 1
        
        # Only process if min_stock > 0 and current_stock < min_stock
        if min_stock > 0 and current_stock < min_stock:
            products_below_min_stock += 1
            low_stock_found_count += 1
            logger.info(f"Low stock found: {item_name} (SKU: {product.get('sku', 'N/A')}) - Category: {category}, Type: {product_type}, Current: {current_stock}, Min: {min_stock}")
            
            shortage = min_stock - current_stock
            required_qty = min_stock  # Required quantity is the minimum stock level
            item_id = product.get("id")
            item_sku = product.get("sku", "N/A")
            unit = product.get("unit", "KG")
            
            # Convert to KG if needed (for consistency with shortage calculations)
            on_hand_kg = current_stock
            required_qty_kg = required_qty
            shortage_kg = shortage
            
            if unit.upper() == "MT":
                on_hand_kg = current_stock * 1000
                required_qty_kg = required_qty * 1000
                shortage_kg = shortage * 1000
                unit = "KG"  # Normalize to KG
            
            # Determine item_type and display_type based on category and type
            # PRIORITY: Check category first, then type (as per user requirement)
            item_type = None
            display_type = None
            
            # Check category first as per user requirement
            if category == "raw_material":
                # If RAW MATERIAL, check type
                if product_type == "TRADED":
                    item_type = "TRADED"
                    display_type = "RM/Trading"
                else:
                    # type == "MANUFACTURED" or default
                    item_type = "RAW"
                    display_type = "RM/Production"
            elif category == "packaging":
                item_type = "PACK"
                display_type = "Packaging"
            else:
                # For finished_product or other categories, skip (as per requirement)
                skipped_by_category += 1
                logger.info(f"Skipping {item_name} - category is '{category}' (not raw_material or packaging)")
                continue
            
            # Check if this item is already in shortage_list (from job orders)
            # Use a unique key: (item_id, "LOW_STOCK") to avoid duplicates
            existing_shortage = next(
                (s for s in shortage_list if s.get("item_id") == item_id and s.get("source") == "LOW_STOCK"),
                None
            )
            
            if not existing_shortage:
                # Get reservations for this item
                reservations = await db.inventory_reservations.find({"item_id": item_id}, {"_id": 0}).to_list(1000)
                reserved = sum(r.get("qty", 0) for r in reservations)
                available = on_hand_kg - reserved
                
                shortage_list.append({
                    "item_id": item_id,
                    "job_id": "LOW_STOCK",  # Special job_id for low stock items
                    "job_number": "LOW_STOCK",  # Special job number
                    "product_name": item_name,  # Product name for display
                    "item_name": item_name,
                    "item_sku": item_sku,
                    "item_type": item_type,
                    "display_type": display_type,
                    "uom": unit,  # For reference
                    "required_qty": required_qty_kg,  # ALWAYS in KG
                    "shortage": shortage_kg,  # ALWAYS in KG
                    "on_hand": on_hand_kg,  # ALWAYS in KG
                    "reserved": reserved,  # Reservations in KG
                    "available": available,  # Available = on_hand - reserved
                    "source": "LOW_STOCK"  # Track source
                })
                low_stock_added_count += 1
                logger.info(f"Added {item_name} to {display_type} shortages")
    
    # Also check inventory_items table for RAW and PACK materials with low stock
    inventory_items = await db.inventory_items.find(
        {"is_active": True, "item_type": {"$in": ["RAW", "PACK"]}},
        {"_id": 0}
    ).to_list(1000)
    
    for item in inventory_items:
        item_id = item.get("id")
        min_stock = item.get("min_stock", 0)
        
        # Get stock from inventory_balances
        balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        
        # Only process if min_stock > 0 and on_hand < min_stock
        if min_stock > 0 and on_hand < min_stock:
            shortage = min_stock - on_hand
            required_qty = min_stock
            item_name = item.get("name", "Unknown")
            item_sku = item.get("sku", "N/A")
            item_type = item.get("item_type")  # RAW or PACK
            unit = item.get("uom", "KG")
            
            # Convert to KG if needed
            on_hand_kg = on_hand
            required_qty_kg = required_qty
            shortage_kg = shortage
            
            if unit.upper() == "MT":
                on_hand_kg = on_hand * 1000
                required_qty_kg = required_qty * 1000
                shortage_kg = shortage * 1000
                unit = "KG"
            
            # Determine display_type
            if item_type == "RAW":
                display_type = "RM/Production"
            elif item_type == "PACK":
                display_type = "Packaging"
            else:
                continue
            
            # Check if this item is already in shortage_list
            existing_shortage = next(
                (s for s in shortage_list if s.get("item_id") == item_id and s.get("source") == "LOW_STOCK"),
                None
            )
            
            if not existing_shortage:
                # Get reservations for this item
                reservations = await db.inventory_reservations.find({"item_id": item_id}, {"_id": 0}).to_list(1000)
                reserved = sum(r.get("qty", 0) for r in reservations)
                available = on_hand_kg - reserved
                
                shortage_list.append({
                    "item_id": item_id,
                    "job_id": "LOW_STOCK",
                    "job_number": "LOW_STOCK",
                    "product_name": item_name,
                    "item_name": item_name,
                    "item_sku": item_sku,
                    "item_type": item_type,
                    "display_type": display_type,
                    "uom": unit,
                    "required_qty": required_qty_kg,  # ALWAYS in KG
                    "shortage": shortage_kg,  # ALWAYS in KG
                    "on_hand": on_hand_kg,  # ALWAYS in KG
                    "reserved": reserved,  # Reservations in KG
                    "available": available,  # Available = on_hand - reserved
                    "source": "LOW_STOCK"
                })
    
    # Always log the summary, even if no low stock items found
    logger.info(f"Low stock check summary: Checked {total_products_checked} products, {products_with_min_stock} have min_stock set, {products_below_min_stock} below min_stock, added {low_stock_added_count} to shortages, skipped {skipped_by_category} by category")
    
    # Sort by item name, then by job number
    shortage_list.sort(key=lambda x: (x["item_name"], x["job_number"]))
    
    elapsed_time = time.time() - start_time
    pack_count = len([s for s in shortage_list if s["item_type"] == "PACK"])
    raw_count = len([s for s in shortage_list if s["item_type"] == "RAW"])
    traded_count = len([s for s in shortage_list if s["item_type"] == "TRADED"])
    logger.info(f"Procurement shortages calculation completed in {elapsed_time:.2f}s. Found {len(shortage_list)} total shortages (RAW: {raw_count}, PACK: {pack_count}, TRADED: {traded_count})")
    
    return {
        "total_shortages": len(shortage_list),
        "raw_shortages": [s for s in shortage_list if s["item_type"] == "RAW"],
        "pack_shortages": [s for s in shortage_list if s["item_type"] == "PACK"],
        "traded_shortages": [s for s in shortage_list if s["item_type"] == "TRADED"],
        "all_shortages": shortage_list
    }

@api_router.post("/procurement/auto-generate")
async def auto_generate_procurement(current_user: dict = Depends(get_current_user)):
    """Auto-generate procurement requisitions from BOM-derived shortages (Phase 4)
    
    THIS READS FROM product_boms AND packaging_boms - NOT from job_orders.bom
    """
    if current_user["role"] not in ["admin", "production", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/production/procurement can auto-generate")
    
    # Get ALL shortages from BOMs
    # Get all pending job orders that require procurement
    # Include job orders that have procurement_required=True, procurement_status="pending", 
    # or have material_shortages array with items
    # Also include ready_for_dispatch jobs that may have raw material shortages
    pending_jobs_raw = await db.job_orders.find(
        {
            "status": {"$in": ["pending", "procurement", "in_production", "ready_for_dispatch"]}
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Filter to only include job orders that actually need procurement
    pending_jobs = []
    for job in pending_jobs_raw:
        has_procurement_required = job.get("procurement_required", False) is True
        has_pending_status = job.get("procurement_status") == "pending"
        has_material_shortages = len(job.get("material_shortages", [])) > 0
        
        if has_procurement_required or has_pending_status or has_material_shortages:
            pending_jobs.append(job)
    
    shortages = {}  # {item_id: {details}}
    
    for job in pending_jobs:
        product_id = job.get("product_id")
        quantity = job.get("quantity", 0)
        job_number = job.get("job_number", "Unknown")
        delivery_date = job.get("delivery_date")
        
        # Get active product BOM
        product_bom = await db.product_boms.find_one({
            "product_id": product_id,
            "is_active": True
        }, {"_id": 0})
        
        if product_bom:
            bom_items = await db.product_bom_items.find({
                "bom_id": product_bom["id"]
            }, {"_id": 0}).to_list(100)
            
            # Get packaging and net_weight_kg from job order (preserved from quotation)
            packaging = job.get("packaging", "Bulk")
            net_weight_kg = job.get("net_weight_kg")
            
            # Only use default/spec if net_weight_kg not provided and not Bulk
            if net_weight_kg is None and packaging != "Bulk":
                spec = await db.product_packaging_specs.find_one({"product_id": product_id}, {"_id": 0})
                net_weight_kg = spec.get("net_weight_kg", 200) if spec else 200
            
            # Calculate finished KG based on packaging
            if packaging != "Bulk" and net_weight_kg is not None:
                finished_kg = quantity * net_weight_kg
            else:
                finished_kg = quantity * 1000  # Bulk: quantity is in MT
            
            for bom_item in bom_items:
                material_id = bom_item.get("material_item_id")
                qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
                
                required_qty = finished_kg * qty_per_kg
                
                material = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
                if not material:
                    continue
                
                balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
                on_hand = balance.get("on_hand", 0) if balance else 0
                
                reservations = await db.inventory_reservations.find({"item_id": material_id}, {"_id": 0}).to_list(1000)
                reserved = sum(r.get("qty", 0) for r in reservations)
                
                available = on_hand - reserved
                shortage = max(0, required_qty - available)
                
                if shortage > 0:
                    if material_id not in shortages:
                        shortages[material_id] = {
                            "item_id": material_id,
                            "item_name": material.get("name", "Unknown"),
                            "item_type": "RAW",
                            "uom": material.get("uom", "KG"),
                            "total_shortage": 0,
                            "required_by": delivery_date,
                            "jobs": []
                        }
                    shortages[material_id]["total_shortage"] += shortage
                    shortages[material_id]["jobs"].append(job_number)
        
        # Packaging BOM
        packaging = await db.packaging.find_one({"name": {"$regex": "DRUM", "$options": "i"}}, {"_id": 0})
        if packaging:
            packaging_bom = await db.packaging_boms.find_one({
                "packaging_id": packaging["id"],
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
                    
                    reservations = await db.inventory_reservations.find({"item_id": pack_id}, {"_id": 0}).to_list(1000)
                    reserved = sum(r.get("qty", 0) for r in reservations)
                    
                    available = on_hand - reserved
                    shortage = max(0, required_qty - available)
                    
                    if shortage > 0:
                        if pack_id not in shortages:
                            shortages[pack_id] = {
                                "item_id": pack_id,
                                "item_name": pack_material.get("name", "Unknown"),
                                "item_type": "PACK",
                                "uom": pack_material.get("uom", "EA"),
                                "total_shortage": 0,
                                "required_by": delivery_date,
                                "jobs": []
                            }
                        shortages[pack_id]["total_shortage"] += shortage
                        shortages[pack_id]["jobs"].append(job_number)
    
    if not shortages:
        return {"success": True, "message": "No shortages found from BOMs", "lines_created": 0}
    
    # Find or create draft PR
    existing_pr = await db.procurement_requisitions.find_one({"status": "DRAFT"}, {"_id": 0})
    if not existing_pr:
        pr = ProcurementRequisition(notes=f"Auto-generated from BOM shortages on {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")
        await db.procurement_requisitions.insert_one(pr.model_dump())
        existing_pr = pr.model_dump()
    
    lines_created = 0
    
    for item_id, shortage_data in shortages.items():
        # Check if line already exists
        existing_line = await db.procurement_requisition_lines.find_one({
            "pr_id": existing_pr["id"],
            "item_id": item_id
        })
        
        if existing_line:
            # Update qty if larger
            if shortage_data["total_shortage"] > existing_line.get("qty", 0):
                await db.procurement_requisition_lines.update_one(
                    {"id": existing_line["id"]},
                    {"$set": {"qty": shortage_data["total_shortage"]}}
                )
        else:
            pr_line = ProcurementRequisitionLine(
                pr_id=existing_pr["id"],
                item_id=item_id,
                item_type=shortage_data["item_type"],
                qty=shortage_data["total_shortage"],
                uom=shortage_data["uom"],
                required_by=shortage_data.get("required_by"),
                reason=f"Shortage for jobs: {', '.join(shortage_data['jobs'][:3])}"
            )
            await db.procurement_requisition_lines.insert_one(pr_line.model_dump())
            lines_created += 1
    
    # Create notification for blocked production
    if lines_created > 0:
        await create_notification(
            event_type="PRODUCTION_BLOCKED",
            title="Material Shortages Detected",
            message=f"{lines_created} items need procurement. View requisition for details.",
            link="/procurement",
            target_roles=["admin", "procurement"],
            notification_type="warning"
        )
    
    return {
        "success": True,
        "message": f"Created {lines_created} procurement requisition lines from BOM shortages",
        "pr_id": existing_pr["id"],
        "lines_created": lines_created,
        "shortages": list(shortages.values())
    }

# ==================== PHASE 5: RFQ FLOW ====================

class RFQCreate(BaseModel):
    supplier_id: str
    rfq_type: str = "PRODUCT"  # PRODUCT or PACKAGING
    lines: List[Dict[str, Any]]  # [{item_id, qty, required_by, job_numbers}]
    billing_company: Optional[str] = None
    billing_address: Optional[str] = None
    shipping_company: Optional[str] = None
    shipping_address: Optional[str] = None
    delivery_date: Optional[str] = None
    payment_terms: Optional[str] = None
    incoterm: Optional[str] = None
    notes: Optional[str] = None

class RFQ(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    rfq_number: str = ""
    rfq_type: str = "PRODUCT"  # PRODUCT or PACKAGING
    supplier_id: str
    supplier_name: str = ""
    supplier_address: str = ""
    billing_company: Optional[str] = None
    billing_address: Optional[str] = None
    shipping_company: Optional[str] = None
    shipping_address: Optional[str] = None
    delivery_date: Optional[str] = None
    payment_terms: Optional[str] = None
    incoterm: Optional[str] = None
    status: str = "DRAFT"  # DRAFT, SENT, QUOTED, CONVERTED, CANCELLED
    lines: List[Dict[str, Any]] = []
    total_amount: float = 0
    currency: str = "USD"
    notes: Optional[str] = None
    quoted_at: Optional[str] = None
    converted_po_id: Optional[str] = None
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class RFQLineQuote(BaseModel):
    item_id: str
    unit_price: float
    lead_time_days: Optional[int] = None

class RFQQuoteUpdate(BaseModel):
    lines: List[RFQLineQuote]
    notes: Optional[str] = None

@api_router.post("/rfq")
async def create_rfq(data: RFQCreate, current_user: dict = Depends(get_current_user)):
    """Create a new RFQ (Request for Quotation)"""
    if current_user["role"] not in ["admin", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement can create RFQs")
    
    supplier = await db.suppliers.find_one({"id": data.supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    rfq_number = await generate_sequence("RFQ", "rfq")
    
    # Enrich lines with item details
    enriched_lines = []
    for line in data.lines:
        item = await db.inventory_items.find_one({"id": line.get("item_id")}, {"_id": 0})
        enriched_lines.append({
            **line,
            "item_name": item.get("name") if item else "Unknown",
            "item_sku": item.get("sku") if item else "N/A",
            "uom": item.get("uom") if item else "KG",
            "unit_price": 0,
            "lead_time_days": None
        })
    
    rfq = RFQ(
        rfq_number=rfq_number,
        rfq_type=data.rfq_type,
        supplier_id=data.supplier_id,
        supplier_name=supplier.get("name", "Unknown"),
        supplier_address=supplier.get("address", ""),
        billing_company=data.billing_company,
        billing_address=data.billing_address,
        shipping_company=data.shipping_company,
        shipping_address=data.shipping_address,
        delivery_date=data.delivery_date,
        payment_terms=data.payment_terms,
        incoterm=data.incoterm,
        lines=enriched_lines,
        notes=data.notes,
        created_by=current_user["id"]
    )
    
    await db.rfq.insert_one(rfq.model_dump())
    return rfq.model_dump()

@api_router.get("/rfq")
async def get_rfqs(status: Optional[str] = None, rfq_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get all RFQs"""
    query = {}
    if status:
        query["status"] = status
    if rfq_type:
        query["rfq_type"] = rfq_type
    rfqs = await db.rfq.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rfqs

# Companies endpoint for billing/shipping
@api_router.get("/companies")
async def get_companies(current_user: dict = Depends(get_current_user)):
    """Get all companies for billing/shipping selection"""
    companies = await db.companies.find({}, {"_id": 0}).to_list(100)
    if not companies:
        # Return default companies if none exist
        return [
            {"id": "1", "name": "Main Factory", "address": "123 Industrial Area, Manufacturing City"},
            {"id": "2", "name": "Warehouse A", "address": "456 Storage Zone, Distribution City"}
        ]
    return companies

@api_router.get("/rfq/{rfq_id}")
async def get_rfq(rfq_id: str, current_user: dict = Depends(get_current_user)):
    """Get RFQ details"""
    rfq = await db.rfq.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return rfq

@api_router.put("/rfq/{rfq_id}/send")
async def send_rfq(rfq_id: str, current_user: dict = Depends(get_current_user)):
    """Mark RFQ as SENT and queue email to supplier"""
    if current_user["role"] not in ["admin", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement can send RFQs")
    
    rfq = await db.rfq.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    
    supplier = await db.suppliers.find_one({"id": rfq["supplier_id"]}, {"_id": 0})
    
    # Queue email
    if supplier and supplier.get("email"):
        items_list = "<br>".join([f"- {l.get('item_name')}: {l.get('qty')} {l.get('uom')}" for l in rfq.get("lines", [])])
        email_body = f"""
        <h2>Request for Quotation: {rfq.get('rfq_number')}</h2>
        <p>Dear {supplier.get('name')},</p>
        <p>Please provide your best quotation for the following items:</p>
        <p>{items_list}</p>
        <p>Notes: {rfq.get('notes', 'N/A')}</p>
        <p>Thank you.</p>
        """
        email_item = EmailQueueItem(
            to_email=supplier.get("email"),
            subject=f"RFQ {rfq.get('rfq_number')} - Request for Quotation",
            body_html=email_body,
            ref_type="RFQ",
            ref_id=rfq_id
        )
        await db.email_outbox.insert_one(email_item.model_dump())
    
    await db.rfq.update_one({"id": rfq_id}, {"$set": {"status": "SENT"}})
    
    return {"success": True, "message": "RFQ sent to supplier", "email_queued": bool(supplier and supplier.get("email"))}

@api_router.put("/rfq/{rfq_id}/quote")
async def update_rfq_quote(rfq_id: str, data: RFQQuoteUpdate, current_user: dict = Depends(get_current_user)):
    """Update RFQ with supplier's quoted prices"""
    if current_user["role"] not in ["admin", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement can update RFQ quotes")
    
    rfq = await db.rfq.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    
    # Update lines with quoted prices
    updated_lines = rfq.get("lines", [])
    total_amount = 0
    
    for quote_line in data.lines:
        for line in updated_lines:
            if line.get("item_id") == quote_line.item_id:
                line["unit_price"] = quote_line.unit_price
                line["lead_time_days"] = quote_line.lead_time_days
                line["total"] = line.get("qty", 0) * quote_line.unit_price
                total_amount += line["total"]
    
    await db.rfq.update_one(
        {"id": rfq_id},
        {"$set": {
            "lines": updated_lines,
            "total_amount": total_amount,
            "status": "QUOTED",
            "quoted_at": datetime.now(timezone.utc).isoformat(),
            "notes": data.notes or rfq.get("notes")
        }}
    )
    
    # Create notification for RFQ quote received
    await create_notification(
        event_type="RFQ_QUOTE_RECEIVED",
        title=f"Quote Received: {rfq.get('rfq_number')}",
        message=f"Supplier {rfq.get('supplier_name')} quoted {rfq.get('currency', 'USD')} {total_amount:.2f}",
        link="/procurement",
        ref_type="RFQ",
        ref_id=rfq_id,
        target_roles=["admin", "procurement"],
        notification_type="success"
    )
    
    return {"success": True, "message": "RFQ quote updated", "total_amount": total_amount}

@api_router.post("/rfq/{rfq_id}/convert-to-po")
async def convert_rfq_to_po(rfq_id: str, current_user: dict = Depends(get_current_user)):
    """Convert a quoted RFQ to a Purchase Order"""
    if current_user["role"] not in ["admin", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement can convert RFQ to PO")
    
    rfq = await db.rfq.find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    
    if rfq.get("status") != "QUOTED":
        raise HTTPException(status_code=400, detail="Only QUOTED RFQs can be converted to PO")
    
    # Create PO
    po_number = await generate_sequence("PO", "purchase_orders")
    
    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=rfq["supplier_id"],
        supplier_name=rfq.get("supplier_name", ""),
        currency=rfq.get("currency", "USD"),
        total_amount=rfq.get("total_amount", 0),
        rfq_id=rfq_id,
        status="DRAFT",  # Requires finance approval
        created_by=current_user["id"]
    )
    await db.purchase_orders.insert_one(po.model_dump())
    
    # Create PO lines
    for line in rfq.get("lines", []):
        po_line = PurchaseOrderLine(
            po_id=po.id,
            item_id=line.get("item_id"),
            item_type=line.get("item_type", "RAW"),
            qty=line.get("qty", 0),
            uom=line.get("uom", "KG"),
            unit_price=line.get("unit_price", 0),
            required_by=line.get("required_by")
        )
        await db.purchase_order_lines.insert_one(po_line.model_dump())
    
    # Update RFQ status
    await db.rfq.update_one({"id": rfq_id}, {"$set": {"status": "CONVERTED", "converted_po_id": po.id}})
    
    # Create notification for PO pending approval
    await create_notification(
        event_type="PO_PENDING_APPROVAL",
        title=f"PO Pending Approval: {po_number}",
        message=f"New PO from {rfq.get('supplier_name')} for {rfq.get('currency', 'USD')} {rfq.get('total_amount', 0):.2f} requires finance approval",
        link="/finance-approval",
        ref_type="PO",
        ref_id=po.id,
        target_roles=["admin", "finance"],
        notification_type="warning"
    )
    
    return {"success": True, "message": f"PO {po_number} created from RFQ", "po_id": po.id, "po_number": po_number}


# ==================== PHASE 2: GENERATE PO DIRECTLY (Bug 5 Fix) ====================

class GeneratePORequest(BaseModel):
    supplier_id: str
    supplier_name: str = ""
    billing_company: Optional[str] = None
    billing_address: Optional[str] = None
    shipping_company: Optional[str] = None
    shipping_address: Optional[str] = None
    delivery_date: Optional[str] = None
    payment_terms: str = "Net 30"
    incoterm: str = "EXW"
    currency: str = "USD"
    total_amount: float = 0
    lines: List[Dict[str, Any]] = []
    notes: Optional[str] = None
    quotation_id: Optional[str] = None  # Link to quotation/PFI
    pfi_number: Optional[str] = None  # PFI number for display

@api_router.post("/purchase-orders/generate")
async def generate_po_directly(data: GeneratePORequest, current_user: dict = Depends(get_current_user)):
    """
    Generate PO directly from procurement shortages (Phase 2 - Bug 5 fix).
    This bypasses the RFQ process and creates a PO with status DRAFT
    that goes immediately to Finance Approval.
    """
    if current_user["role"] not in ["admin", "procurement"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement can generate POs")
    
    if not data.lines:
        raise HTTPException(status_code=400, detail="No items provided")
    
    # Generate PO number
    po_number = await generate_sequence("PO", "purchase_orders")
    
    # Calculate total quantity
    total_quantity = sum(line.get("qty", 0) for line in data.lines)
    # Get UOM from first line (assuming all lines have same UOM)
    total_uom = data.lines[0].get("uom", "KG") if data.lines else "KG"
    
    # Try to get quotation_id and pfi_number if not provided
    quotation_id = data.quotation_id
    pfi_number = data.pfi_number
    
    # If quotation_id/pfi_number not provided, try to get from job_numbers in ALL lines
    if not quotation_id and not pfi_number and data.lines:
        # Try each line's job_numbers until we find a quotation
        for line in data.lines:
            job_numbers = line.get("job_numbers", [])
            if job_numbers and len(job_numbers) > 0:
                for job_number in job_numbers:
                    # Look up job order
                    job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
                    if job:
                        sales_order_id = job.get("sales_order_id")
                        if sales_order_id:
                            sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
                            if sales_order and sales_order.get("quotation_id"):
                                quotation_id = sales_order.get("quotation_id")
                                quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
                                if quotation:
                                    pfi_number = quotation.get("pfi_number")
                                    break  # Found it, no need to check more
                        if quotation_id:  # Break outer loop too
                            break
            if quotation_id:  # Break if we found it
                break
    
    # Log if we couldn't find quotation info (for debugging)
    if not quotation_id and not pfi_number:
        first_line_job_numbers = data.lines[0].get("job_numbers", []) if data.lines else []
        logger.warning(f"PO {po_number} created without quotation_id/pfi_number. Lines: {len(data.lines)}, First line job_numbers: {first_line_job_numbers}")
    
    # Create PO with DRAFT status (pending finance approval)
    po = PurchaseOrder(
        supplier_id=data.supplier_id,
        supplier_name=data.supplier_name,
        currency=data.currency,
        total_amount=data.total_amount,
        notes=data.notes,
        incoterm=data.incoterm,
        payment_terms=data.payment_terms,
        delivery_date=data.delivery_date,  # Set delivery date from form
        quotation_id=quotation_id,  # Link to quotation if provided
        pfi_number=pfi_number,  # PFI number for display
        po_number=po_number,
        status="DRAFT",  # Will require finance approval
        created_by=current_user["id"]
    )
    po_dict = po.model_dump()
    po_dict["total_quantity"] = total_quantity
    po_dict["total_uom"] = total_uom
    await db.purchase_orders.insert_one(po_dict)
    
    # Create PO lines
    for line_data in data.lines:
        # Lookup item details - check both inventory_items and products
        item = await db.inventory_items.find_one({"id": line_data.get("item_id")}, {"_id": 0})
        if not item:
            item = await db.products.find_one({"id": line_data.get("item_id")}, {"_id": 0})
        
        # Get item name from multiple sources
        item_name = (
            line_data.get("item_name") or 
            (item.get("name") if item else None) or
            (item.get("product_name") if item else None) or
            "Unknown"
        )
        
        # Get SKU
        item_sku = (
            line_data.get("item_sku") or
            (item.get("sku") if item else None) or
            "-"
        )
        
        po_line = PurchaseOrderLine(
            po_id=po.id,
            item_id=line_data.get("item_id"),
            item_type=line_data.get("item_type", "RAW"),
            qty=line_data.get("qty", 0),
            uom=line_data.get("uom", "KG"),
            unit_price=line_data.get("unit_price", 0),
            required_by=data.delivery_date,
            procurement_type=line_data.get("procurement_type", "Bulk"),
            packaging_item_id=line_data.get("packaging_item_id"),
            packaging_qty=line_data.get("packaging_qty", 0) if line_data.get("procurement_type") == "Drummed" else None
        )
        po_line_dict = po_line.model_dump()
        po_line_dict["item_name"] = item_name
        po_line_dict["item_sku"] = item_sku
        po_line_dict["job_numbers"] = line_data.get("job_numbers", [])
        await db.purchase_order_lines.insert_one(po_line_dict)
        
        # Clear the material shortage for this item
        await db.material_shortages.update_many(
            {"item_id": line_data.get("item_id"), "status": "PENDING"},
            {"$set": {"status": "PO_CREATED", "po_id": po.id, "po_number": po_number}}
        )
    
    # Create notification for Finance
    await create_notification(
        event_type="PO_PENDING_APPROVAL",
        title=f"PO Pending Approval: {po_number}",
        message=f"New PO from {data.supplier_name} for {data.currency} {data.total_amount:.2f} requires finance approval",
        link="/finance-approval",
        ref_type="PO",
        ref_id=po.id,
        target_roles=["admin", "finance"],
        notification_type="warning"
    )
    
    return {
        "success": True,
        "message": f"PO {po_number} created and sent to Finance Approval",
        "po_id": po.id,
        "po_number": po_number
    }


# ==================== PHASE 6: FINANCE APPROVAL ====================

@api_router.put("/purchase-orders/{po_id}/finance-approve")
async def finance_approve_po(po_id: str, data: Optional[Dict[str, Any]] = None, current_user: dict = Depends(get_current_user)):
    """Finance approves a PO (Phase 6) and routes based on incoterm.
    Optionally accepts line items data to update quantities and prices.
    """
    if not await has_page_access(current_user, "/finance-approval", fallback_roles=["finance"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    
    if po.get("status") != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT POs can be approved")
    
    # If line items data is provided, update them
    if data and data.get("lines"):
        total_amount = 0
        total_quantity = 0
        total_uom = None
        
        for line_data in data.get("lines", []):
            line_id = line_data.get("id")
            if not line_id:
                continue
            
            # Update line with new values
            update_data = {}
            if "qty" in line_data:
                update_data["qty"] = line_data["qty"]
            if "unit_price" in line_data:
                update_data["unit_price"] = line_data["unit_price"]
            if "item_name" in line_data:
                update_data["item_name"] = line_data["item_name"]
            
            if update_data:
                await db.purchase_order_lines.update_one(
                    {"id": line_id, "po_id": po_id},
                    {"$set": update_data}
                )
            
            # Recalculate totals
            qty = line_data.get("qty", 0)
            unit_price = line_data.get("unit_price", 0)
            total_amount += qty * unit_price
            total_quantity += qty
            if not total_uom:
                line = await db.purchase_order_lines.find_one({"id": line_id}, {"_id": 0})
                total_uom = line.get("uom", "KG") if line else "KG"
        
        # Update PO with new totals
        update_po = {
            "status": "APPROVED",
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "total_amount": total_amount,
            "total_quantity": total_quantity,
            "total_uom": total_uom
        }
    else:
        # Just approve without updating lines
        update_po = {
            "status": "APPROVED",
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": update_po}
    )
    
    # Update job orders procurement status to "in_progress" when PO is approved
    # Get PO lines to find which items are being procured
    po_lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(1000)
    
    # Collect all job numbers from PO lines
    all_job_numbers = set()
    for line in po_lines:
        job_numbers = line.get("job_numbers", [])
        all_job_numbers.update(job_numbers)
    
    # Update related job orders to show procurement is in progress
    for job_number in all_job_numbers:
        job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
        if job and job.get("procurement_status") == "pending":
            await db.job_orders.update_one(
                {"job_number": job_number},
                {"$set": {"procurement_status": "in_progress"}}
            )
    
    # Auto-route based on incoterm after finance approval
    incoterm = po.get("incoterm", "EXW").upper()
    route_result = {"routed_to": None}
    
    if incoterm == "EXW":
        # Route to Transport Planner - transport needs to be booked after finance approval
        # Don't create transport_inward record yet - it will be created when transport is booked
        route_result["routed_to"] = "TRANSPORT_PLANNER"
        
        # Create notification for transport team to book transport
        await create_notification(
            event_type="PO_READY_FOR_TRANSPORT_BOOKING",
            title=f"PO {po.get('po_number')} Ready for Transport Booking",
            message=f"PO approved (EXW incoterm) - Please book transport in Transport Planner",
            link="/transport-planner",
            ref_type="PO",
            ref_id=po_id,
            target_roles=["admin", "transport"],
            notification_type="info"
        )
        
    elif incoterm == "DDP":
        # Route to Security & QC - vendor delivers directly
        checklist_number = await generate_sequence("SEC", "security_checklists")
        checklist = {
            "id": str(uuid.uuid4()),
            "checklist_number": checklist_number,
            "ref_type": "PO",
            "ref_id": po_id,
            "ref_number": po.get("po_number"),
            "supplier_name": po.get("supplier_name"),
            "checklist_type": "INWARD",
            "status": "PENDING",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.security_checklists.insert_one(checklist)
        route_result["routed_to"] = "SECURITY_QC"
        route_result["checklist_number"] = checklist_number
        
    elif incoterm == "FOB":
        # FOB: Buyer responsible for shipping - Route to Shipping Window first
        # Create minimal booking record that requires user to fill in details
        booking_number = await generate_sequence("SHP", "shipping_bookings")
        shipping_booking = {
            "id": str(uuid.uuid4()),
            "booking_number": booking_number,
            "job_order_ids": [],  # Empty for PO imports
            "po_ids": [po_id],  # Link to PO
            "customer_name": "",  # Will be filled by user
            "supplier_name": po.get("supplier_name", ""),
            "shipping_line": None,  # User must fill
            "container_type": None,  # User must fill (not default 20ft)
            "container_count": None,  # User must fill (not default 1)
            "port_of_loading": None,  # User must fill
            "port_of_discharge": None,  # User must fill
            "cargo_description": None,  # User must fill
            "cargo_weight": None,  # User must fill
            "is_dg": False,
            "dg_class": None,
            "incoterm": incoterm,
            "status": "PENDING_DETAILS",  # New status indicating details needed
            "ref_type": "PO_IMPORT",
            "ref_id": po_id,
            "po_number": po.get("po_number"),
            "booking_source": "SELLER",  # Seller (buyer's company) books for FOB imports
            "created_at": datetime.now(timezone.utc).isoformat(),
            "notes": f"Auto-created from PO approval. Please fill in shipping details."
        }
        await db.shipping_bookings.insert_one(shipping_booking)
        route_result["routed_to"] = "SHIPPING"
        route_result["booking_number"] = booking_number
        
        # Create notification
        await create_notification(
            event_type="SHIP_BOOKING_REQUIRED",
            title=f"🚢 Shipping Booking Details Required: PO {po.get('po_number')}",
            message=f"PO {po.get('po_number')} (FOB) created booking {booking_number}. Please fill in container type, shipping line, ports, and cargo details.",
            link="/shipping",
            ref_type="PO",
            ref_id=po_id,
            target_roles=["admin", "shipping", "procurement"],
            notification_type="warning"
        )
        
    elif incoterm in ["CFR", "CIF", "CIP"]:
        # CFR/CIF/CIP: Seller arranges shipping - Route directly to Import Window
        import_number = await generate_sequence("IMP", "imports")
        import_record = {
            "id": str(uuid.uuid4()),
            "import_number": import_number,
            "po_id": po_id,
            "po_number": po.get("po_number"),
            "supplier_name": po.get("supplier_name"),
            "incoterm": incoterm,
            "status": "PENDING_DOCS",
            "document_checklist": {
                "bl": False,
                "invoice": False,
                "packing_list": False,
                "coo": False,
                "inspection_cert": False
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.imports.insert_one(import_record)
        route_result["routed_to"] = "IMPORT"
        route_result["import_number"] = import_number
    
    # Update PO with routing info
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "routed_to": route_result.get("routed_to"),
            "routed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "message": "PO approved by finance", "routing": route_result}

@api_router.put("/purchase-orders/{po_id}/finance-reject")
async def finance_reject_po(po_id: str, reason: str = "", current_user: dict = Depends(get_current_user)):
    """Finance rejects a PO"""
    if current_user["role"] not in ["admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only admin/finance can reject POs")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "status": "REJECTED",
            "rejected_by": current_user["id"],
            "rejected_at": datetime.now(timezone.utc).isoformat(),
            "rejection_reason": reason
        }}
    )
    
    return {"success": True, "message": "PO rejected by finance"}

@api_router.post("/purchase-orders/retroactive-enrich-quotations")
async def retroactive_enrich_po_quotations(current_user: dict = Depends(get_current_user)):
    """
    Retroactively enrich existing POs with quotation_id and pfi_number
    by looking up job_numbers in PO lines -> job orders -> sales orders -> quotations
    """
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can run this operation")
    
    # Get all POs missing quotation_id or pfi_number
    pos = await db.purchase_orders.find({
        "$or": [
            {"quotation_id": {"$exists": False}},
            {"quotation_id": None},
            {"pfi_number": {"$exists": False}},
            {"pfi_number": None}
        ]
    }, {"_id": 0}).to_list(1000)
    
    updated_count = 0
    not_found_count = 0
    
    for po in pos:
        po_id = po.get("id")
        lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(1000)
        
        quotation_id = None
        pfi_number = None
        
        # Try to find quotation from job_numbers in PO lines
        for line in lines:
            job_numbers = line.get("job_numbers", [])
            if job_numbers:
                job_number = job_numbers[0]
                job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
                if job:
                    sales_order_id = job.get("sales_order_id")
                    if sales_order_id:
                        sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
                        if sales_order and sales_order.get("quotation_id"):
                            quotation_id = sales_order.get("quotation_id")
                            quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
                            if quotation:
                                pfi_number = quotation.get("pfi_number")
                            break  # Found it
        
        # Update PO if we found quotation info
        if quotation_id or pfi_number:
            update_data = {}
            if quotation_id:
                update_data["quotation_id"] = quotation_id
            if pfi_number:
                update_data["pfi_number"] = pfi_number
            
            await db.purchase_orders.update_one(
                {"id": po_id},
                {"$set": update_data}
            )
            updated_count += 1
        else:
            not_found_count += 1
    
    return {
        "success": True,
        "message": f"Retroactive enrichment complete",
        "updated": updated_count,
        "not_found": not_found_count,
        "total_processed": len(pos)
    }

@api_router.put("/purchase-orders/{po_id}/send")
async def send_po_to_supplier(po_id: str, current_user: dict = Depends(get_current_user)):
    """Send approved PO to supplier via email queue"""
    if current_user["role"] not in ["admin", "procurement", "finance"]:
        raise HTTPException(status_code=403, detail="Only admin/procurement/finance can send POs")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    
    if po.get("status") != "APPROVED":
        raise HTTPException(status_code=400, detail="Only APPROVED POs can be sent")
    
    supplier = await db.suppliers.find_one({"id": po.get("supplier_id")}, {"_id": 0})
    
    # Get PO lines
    lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(1000)
    items_list = ""
    for line in lines:
        item = await db.inventory_items.find_one({"id": line.get("item_id")}, {"_id": 0})
        items_list += f"<tr><td>{item.get('name') if item else 'Unknown'}</td><td>{line.get('qty')} {line.get('uom')}</td><td>{line.get('unit_price')}</td><td>{line.get('qty', 0) * line.get('unit_price', 0):.2f}</td></tr>"
    
    # Queue email
    if supplier and supplier.get("email"):
        email_body = f"""
        <h2>Purchase Order: {po.get('po_number')}</h2>
        <p>Dear {supplier.get('name')},</p>
        <p>Please find below our Purchase Order:</p>
        <table border="1" cellpadding="5">
            <tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
            {items_list}
        </table>
        <p><strong>Total: {po.get('currency', 'USD')} {po.get('total_amount', 0):.2f}</strong></p>
        <p>Please confirm receipt and expected delivery date.</p>
        <p>Thank you.</p>
        """
        email_item = EmailQueueItem(
            to_email=supplier.get("email"),
            subject=f"Purchase Order {po.get('po_number')}",
            body_html=email_body,
            ref_type="PO",
            ref_id=po_id
        )
        await db.email_outbox.insert_one(email_item.model_dump())
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "status": "SENT",
            "sent_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "success": True,
        "message": f"PO {po.get('po_number')} sent to supplier",
        "email_queued": bool(supplier and supplier.get("email"))
    }

# ==================== PHASE 8: INCOTERM-BASED LOGISTICS ROUTING ====================

INCOTERM_ROUTING = {
    # LOCAL incoterms
    "EXW": {"type": "LOCAL", "route": "TRANSPORTATION_INWARD", "description": "Ex Works - buyer arranges transport"},
    "DDP": {"type": "LOCAL", "route": "SECURITY_QC_INWARD", "description": "Delivered Duty Paid - seller delivers to buyer"},
    "DAP": {"type": "LOCAL", "route": "TRANSPORTATION_INWARD", "description": "Delivered at Place"},
    # IMPORT incoterms
    "FOB": {"type": "IMPORT", "route": "SHIPPING_BOOKING", "description": "Free On Board - import via sea"},
    "CFR": {"type": "IMPORT", "route": "IMPORT_INWARD", "description": "Cost and Freight - import with freight"},
    "CIF": {"type": "IMPORT", "route": "IMPORT_INWARD", "description": "Cost Insurance Freight - full import"},
    "FCA": {"type": "IMPORT", "route": "SHIPPING_BOOKING", "description": "Free Carrier - import via air/land"},
}

@api_router.get("/logistics/routing-options")
async def get_routing_options(current_user: dict = Depends(get_current_user)):
    """Get available incoterm routing options"""
    return {
        "incoterms": INCOTERM_ROUTING,
        "local_terms": ["EXW", "DDP", "DAP"],
        "import_terms": ["FOB", "CFR", "CIF", "FCA"]
    }

@api_router.post("/logistics/route-po/{po_id}")
async def route_po_logistics(po_id: str, incoterm: str, current_user: dict = Depends(get_current_user)):
    """Route PO to appropriate logistics flow based on incoterm (Phase 8)"""
    try:
        if current_user["role"] not in ["admin", "procurement", "finance"]:
            raise HTTPException(status_code=403, detail="Only admin/procurement/finance can route POs")
        
        # Validate input
        if not po_id or not po_id.strip():
            raise HTTPException(status_code=400, detail="Invalid PO ID")
        
        if not incoterm or not incoterm.strip():
            raise HTTPException(status_code=400, detail="Incoterm is required")
        
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        if not po:
            raise HTTPException(status_code=404, detail="PO not found")
        
        # Check if PO is in a state that allows routing
        po_status = po.get("status", "")
        if po_status in ["CANCELLED", "CLOSED"]:
            raise HTTPException(status_code=400, detail=f"Cannot route PO with status {po_status}")
        
        if incoterm not in INCOTERM_ROUTING:
            raise HTTPException(status_code=400, detail=f"Invalid incoterm: {incoterm}")
        
        routing = INCOTERM_ROUTING[incoterm]
        
        # Check if PO already has routing
        existing_routing = await db.logistics_routing.find_one({"po_id": po_id}, {"_id": 0})
        if existing_routing:
            raise HTTPException(status_code=400, detail="PO already has a logistics routing assigned")
        
        # Create logistics routing record
        routing_record = {
            "id": str(uuid.uuid4()),
            "po_id": po_id,
            "po_number": po.get("po_number"),
            "incoterm": incoterm,
            "routing_type": routing["type"],
            "route": routing["route"],
            "status": "PENDING",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.get("id", "unknown")
        }
        
        # Insert routing record (MongoDB will add _id which we don't want in response)
        await db.logistics_routing.insert_one(routing_record.copy())
        
        # Update PO with incoterm
        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$set": {
                "incoterm": incoterm,
                "logistics_routing_id": routing_record["id"]
            }}
        )
        
        # For IMPORT types, create import checklist
        import_checklist_id = None
        if routing["type"] == "IMPORT":
            import_checklist = {
                "id": str(uuid.uuid4()),
                "po_id": po_id,
                "routing_id": routing_record["id"],
                "status": "PRE_IMPORT",
                "pre_import_docs": [],
                "post_import_docs": [],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.import_checklists.insert_one(import_checklist)
            import_checklist_id = import_checklist["id"]
        
        # Build response (clean dict without MongoDB ObjectId)
        response_routing = {
            **routing_record,
            **({"import_checklist_id": import_checklist_id} if import_checklist_id else {})
        }
        
        return {
            "success": True,
            "routing": response_routing,
            "message": f"PO routed via {routing['route']} ({routing['description']})"
        }
    
    except HTTPException:
        # Re-raise HTTP exceptions as-is (400, 403, 404)
        raise
    except Exception as e:
        # Log the internal error
        logger.error(f"Logistics routing failed for PO {po_id}: {str(e)}", exc_info=True)
        
        # Return 520 for configuration/internal business logic failures
        raise HTTPException(
            status_code=520, 
            detail=f"Routing configuration error: Unable to route PO. Please contact system administrator."
        )

@api_router.get("/logistics/routing")
async def get_logistics_routing(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get all logistics routing records"""
    query = {}
    if status:
        query["status"] = status
    
    routings = await db.logistics_routing.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return routings

# ==================== PHASE 9: PAYABLES & RECEIVABLES (MVP) ====================

# Payables Model
class PayableBillCreate(BaseModel):
    ref_type: str  # PO, TRANSPORT, SHIPPING
    ref_id: str
    supplier_id: str
    amount: float
    currency: str = "USD"
    due_date: Optional[str] = None
    notes: Optional[str] = None

class PayableBill(PayableBillCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bill_number: str = ""
    status: str = "PENDING"  # PENDING, APPROVED, PAID, CANCELLED
    grn_id: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    paid_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# Receivables Model
class ReceivableInvoiceCreate(BaseModel):
    invoice_type: str  # LOCAL, EXPORT
    customer_id: str
    sales_order_id: Optional[str] = None
    job_order_id: Optional[str] = None
    amount: float
    currency: str = "USD"
    due_date: Optional[str] = None
    notes: Optional[str] = None

class ReceivableInvoice(ReceivableInvoiceCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str = ""
    status: str = "PENDING"  # PENDING, SENT, PARTIAL, PAID, OVERDUE
    amount_paid: float = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finance_approved: bool = False
    finance_approved_by: Optional[str] = None
    finance_approved_at: Optional[str] = None
    delivery_order_id: Optional[str] = None
    line_items: List[Dict[str, Any]] = []
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    tax_rate: Optional[float] = None
    payment_terms: Optional[str] = None

# Payables Endpoints
@api_router.post("/payables/bills")
async def create_payable_bill(data: PayableBillCreate, current_user: dict = Depends(get_current_user)):
    """Create a payable bill"""
    if current_user["role"] not in ["admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only admin/finance can create bills")
    
    bill_number = await generate_sequence("BILL", "payable_bills")
    bill = PayableBill(**data.model_dump(), bill_number=bill_number)
    await db.payable_bills.insert_one(bill.model_dump())
    
    return bill.model_dump()

@api_router.get("/payables/bills")
async def get_payable_bills(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get all payable bills with aging"""
    query = {}
    if status:
        # Normalize status to uppercase to match database values (PENDING, APPROVED, PAID, CANCELLED)
        query["status"] = status.upper()
    
    bills = await db.payable_bills.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich bills with supplier information and ref_number
    for bill in bills:
        supplier_id = bill.get("supplier_id")
        if supplier_id:
            supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
            if supplier:
                bill["supplier_name"] = supplier.get("name", "Unknown Supplier")
            else:
                bill["supplier_name"] = "Unknown Supplier"
        else:
            bill["supplier_name"] = "Unknown Supplier"
        
        # Enrich with ref_number based on ref_type and ref_id
        ref_type = bill.get("ref_type")
        ref_id = bill.get("ref_id")
        if ref_type and ref_id and not bill.get("ref_number"):
            if ref_type == "PO":
                po = await db.purchase_orders.find_one({"id": ref_id}, {"_id": 0})
                if po:
                    bill["ref_number"] = po.get("po_number", ref_id)
            elif ref_type == "RFQ":
                rfq = await db.rfq.find_one({"id": ref_id}, {"_id": 0})
                if rfq:
                    bill["ref_number"] = rfq.get("rfq_number", ref_id)
            elif ref_type == "TRANSPORT":
                transport = await db.transport_bookings.find_one({"id": ref_id}, {"_id": 0})
                if transport:
                    bill["ref_number"] = transport.get("booking_number", ref_id)
            elif ref_type == "SHIPPING":
                shipping = await db.shipping_bookings.find_one({"id": ref_id}, {"_id": 0})
                if shipping:
                    bill["ref_number"] = shipping.get("booking_number", ref_id)
            elif ref_type == "IMPORT":
                import_booking = await db.import_bookings.find_one({"id": ref_id}, {"_id": 0})
                if import_booking:
                    bill["ref_number"] = import_booking.get("booking_number", ref_id)
            else:
                bill["ref_number"] = ref_id
        elif not bill.get("ref_number"):
            bill["ref_number"] = bill.get("ref_id", "-")
    
    # Calculate aging buckets
    today = datetime.now(timezone.utc)
    aging = {"current": 0, "30_days": 0, "60_days": 0, "90_plus": 0}
    
    for bill in bills:
        if bill.get("status") in ["PENDING", "APPROVED"]:
            due_date = datetime.fromisoformat(bill.get("due_date", bill["created_at"]).replace("Z", "+00:00"))
            days_overdue = (today - due_date).days
            
            if days_overdue <= 0:
                aging["current"] += bill.get("amount", 0)
            elif days_overdue <= 30:
                aging["30_days"] += bill.get("amount", 0)
            elif days_overdue <= 60:
                aging["60_days"] += bill.get("amount", 0)
            else:
                aging["90_plus"] += bill.get("amount", 0)
    
    return {
        "bills": bills,
        "aging": aging,
        "total_outstanding": sum(aging.values())
    }

@api_router.put("/payables/bills/{bill_id}/approve")
async def approve_payable_bill(bill_id: str, current_user: dict = Depends(get_current_user)):
    """Approve a payable bill for payment"""
    if current_user["role"] not in ["admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only admin/finance can approve bills")
    
    await db.payable_bills.update_one(
        {"id": bill_id},
        {"$set": {
            "status": "APPROVED",
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"success": True, "message": "Bill approved for payment"}

@api_router.put("/payables/bills/{bill_id}/pay")
async def pay_payable_bill(
    bill_id: str, 
    payment_method: str = "bank_transfer",
    payment_reference: Optional[str] = None,
    payment_notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Mark a payable bill as paid and record payment details"""
    if current_user["role"] not in ["admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only admin/finance can mark bills as paid")
    
    bill = await db.payable_bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    paid_at = datetime.now(timezone.utc).isoformat()
    
    # Update bill status
    await db.payable_bills.update_one(
        {"id": bill_id},
        {"$set": {
            "status": "PAID",
            "paid_at": paid_at,
            "payment_method": payment_method,
            "payment_reference": payment_reference,
            "payment_notes": payment_notes,
            "paid_by": current_user["id"]
        }}
    )
    
    # Create payment record for history
    payment_record = {
        "id": str(uuid.uuid4()),
        "bill_id": bill_id,
        "bill_number": bill.get("bill_number"),
        "supplier_name": bill.get("supplier_name"),
        "amount": bill.get("amount", 0),
        "currency": bill.get("currency", "USD"),
        "payment_method": payment_method,
        "payment_reference": payment_reference,
        "payment_notes": payment_notes,
        "payment_date": paid_at,
        "paid_by": current_user["id"],
        "paid_by_name": current_user.get("username", "Unknown"),
        "ref_type": bill.get("ref_type"),
        "ref_number": bill.get("ref_number"),
        "created_at": paid_at
    }
    await db.payable_payments.insert_one(payment_record)
    
    return {"success": True, "message": "Bill marked as paid"}

@api_router.get("/payables/payments")
async def get_payable_payments(current_user: dict = Depends(get_current_user)):
    """Get all payable payment history"""
    payments = await db.payable_payments.find({}, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    return payments

@api_router.get("/payables/summary")
async def get_payables_summary(current_user: dict = Depends(get_current_user)):
    """Get payables summary including paid and unpaid bills"""
    # Get all bills
    all_bills = await db.payable_bills.find({}, {"_id": 0}).to_list(1000)
    
    # Enrich bills with supplier information and ref_number
    for bill in all_bills:
        supplier_id = bill.get("supplier_id")
        if supplier_id:
            supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
            if supplier:
                bill["supplier_name"] = supplier.get("name", "Unknown Supplier")
            else:
                bill["supplier_name"] = "Unknown Supplier"
        else:
            bill["supplier_name"] = "Unknown Supplier"
        
        # Enrich with ref_number based on ref_type and ref_id
        ref_type = bill.get("ref_type")
        ref_id = bill.get("ref_id")
        if ref_type and ref_id and not bill.get("ref_number"):
            if ref_type == "PO":
                po = await db.purchase_orders.find_one({"id": ref_id}, {"_id": 0})
                if po:
                    bill["ref_number"] = po.get("po_number", ref_id)
            elif ref_type == "RFQ":
                rfq = await db.rfq.find_one({"id": ref_id}, {"_id": 0})
                if rfq:
                    bill["ref_number"] = rfq.get("rfq_number", ref_id)
            elif ref_type == "TRANSPORT":
                transport = await db.transport_bookings.find_one({"id": ref_id}, {"_id": 0})
                if transport:
                    bill["ref_number"] = transport.get("booking_number", ref_id)
            elif ref_type == "SHIPPING":
                shipping = await db.shipping_bookings.find_one({"id": ref_id}, {"_id": 0})
                if shipping:
                    bill["ref_number"] = shipping.get("booking_number", ref_id)
            elif ref_type == "IMPORT":
                import_booking = await db.import_bookings.find_one({"id": ref_id}, {"_id": 0})
                if import_booking:
                    bill["ref_number"] = import_booking.get("booking_number", ref_id)
            else:
                bill["ref_number"] = ref_id
        elif not bill.get("ref_number"):
            bill["ref_number"] = bill.get("ref_id", "-")
    
    # Separate paid and unpaid
    paid_bills = [b for b in all_bills if b.get("status") == "PAID"]
    unpaid_bills = [b for b in all_bills if b.get("status") in ["PENDING", "APPROVED"]]
    
    # Calculate totals
    total_paid = sum(b.get("amount", 0) for b in paid_bills)
    total_unpaid = sum(b.get("amount", 0) for b in unpaid_bills)
    
    # Get payment history and enrich with supplier information
    payments = await db.payable_payments.find({}, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    for payment in payments:
        supplier_id = payment.get("supplier_id")
        if supplier_id:
            supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
            if supplier:
                payment["supplier_name"] = supplier.get("name", "Unknown Supplier")
            else:
                payment["supplier_name"] = "Unknown Supplier"
        else:
            payment["supplier_name"] = "Unknown Supplier"
    
    # Calculate aging for unpaid bills
    today = datetime.now(timezone.utc)
    aging = {"current": 0, "30_days": 0, "60_days": 0, "90_plus": 0}
    
    for bill in unpaid_bills:
        due_date = datetime.fromisoformat(bill.get("due_date", bill["created_at"]).replace("Z", "+00:00"))
        days_overdue = (today - due_date).days
        amount = bill.get("amount", 0)
        
        if days_overdue < 0:
            aging["current"] += amount
        elif days_overdue < 30:
            aging["30_days"] += amount
        elif days_overdue < 60:
            aging["60_days"] += amount
        else:
            aging["90_plus"] += amount
    
    return {
        "paid_bills": paid_bills,
        "unpaid_bills": unpaid_bills,
        "total_paid": total_paid,
        "total_unpaid": total_unpaid,
        "payment_history": payments,
        "aging": aging
    }

@api_router.get("/payables/dashboard")
async def get_payables_dashboard(current_user: dict = Depends(get_current_user)):
    """Get payables dashboard with amounts grouped by category (Transportation, Material, Shipping) and currency"""
    # Get all unpaid bills
    unpaid_bills = await db.payable_bills.find(
        {"status": {"$in": ["PENDING", "APPROVED"]}},
        {"_id": 0}
    ).to_list(1000)
    
    # Get pending GRNs with calculated amounts
    pending_grns = await db.grn.find(
        {"review_status": {"$in": ["PENDING_PAYABLES", None]}},
        {"_id": 0}
    ).to_list(1000)
    
    # Calculate amounts for pending GRNs
    for grn in pending_grns:
        if grn.get("po_id"):
            po = await db.purchase_orders.find_one({"id": grn["po_id"]}, {"_id": 0})
            if po:
                po_lines = await db.purchase_order_lines.find({"po_id": grn["po_id"]}, {"_id": 0}).to_list(1000)
                total_amount = 0
                for grn_item in grn.get("items", []):
                    for po_line in po_lines:
                        if po_line.get("item_id") == grn_item.get("product_id"):
                            total_amount += po_line.get("unit_price", 0) * grn_item.get("quantity", 0)
                            break
                grn["calculated_amount"] = total_amount
                grn["currency"] = po.get("currency", "USD")
            else:
                grn["calculated_amount"] = 0
                grn["currency"] = "USD"
        else:
            grn["calculated_amount"] = 0
            grn["currency"] = "USD"
    
    # Group by category and currency
    dashboard = {
        "material": {},  # PO/RFQ bills + GRN amounts
        "transportation": {},  # TRANSPORT bills
        "shipping": {},  # SHIPPING bills
        "import": {},  # IMPORT bills
        "other": {}  # Other bills
    }
    
    # Process unpaid bills
    for bill in unpaid_bills:
        ref_type = bill.get("ref_type", "OTHER")
        currency = bill.get("currency", "USD")
        amount = bill.get("amount", 0)
        
        # Categorize by ref_type
        if ref_type in ["PO", "RFQ"]:
            category = "material"
        elif ref_type == "TRANSPORT":
            category = "transportation"
        elif ref_type == "SHIPPING":
            category = "shipping"
        elif ref_type == "IMPORT":
            category = "import"
        else:
            category = "other"
        
        # Group by currency
        if currency not in dashboard[category]:
            dashboard[category][currency] = {
                "currency": currency,
                "total_amount": 0,
                "bill_count": 0,
                "bills": []
            }
        
        dashboard[category][currency]["total_amount"] += amount
        dashboard[category][currency]["bill_count"] += 1
        dashboard[category][currency]["bills"].append({
            "bill_number": bill.get("bill_number"),
            "supplier": bill.get("supplier_name"),
            "amount": amount,
            "status": bill.get("status")
        })
    
    # Add pending GRN amounts to material category
    for grn in pending_grns:
        currency = grn.get("currency", "USD")
        amount = grn.get("calculated_amount", 0)
        
        if amount > 0:
            if currency not in dashboard["material"]:
                dashboard["material"][currency] = {
                    "currency": currency,
                    "total_amount": 0,
                    "bill_count": 0,
                    "grn_count": 0,
                    "bills": [],
                    "grns": []
                }
            
            dashboard["material"][currency]["total_amount"] += amount
            dashboard["material"][currency]["grn_count"] = dashboard["material"][currency].get("grn_count", 0) + 1
            dashboard["material"][currency]["grns"].append({
                "grn_number": grn.get("grn_number"),
                "supplier": grn.get("supplier"),
                "amount": amount,
                "po_number": grn.get("po_number")
            })
    
    # Convert to list format for easier frontend consumption
    result = {
        "material": [v for v in dashboard["material"].values()],
        "transportation": [v for v in dashboard["transportation"].values()],
        "shipping": [v for v in dashboard["shipping"].values()],
        "import": [v for v in dashboard["import"].values()],
        "other": [v for v in dashboard["other"].values()],
        "summary": {
            "total_material": sum(c["total_amount"] for c in dashboard["material"].values()),
            "total_transportation": sum(c["total_amount"] for c in dashboard["transportation"].values()),
            "total_shipping": sum(c["total_amount"] for c in dashboard["shipping"].values()),
            "total_import": sum(c["total_amount"] for c in dashboard["import"].values()),
            "total_other": sum(c["total_amount"] for c in dashboard["other"].values())
        }
    }
    
    return result

# Receivables Endpoints
@api_router.post("/receivables/invoices")
async def create_receivable_invoice(data: ReceivableInvoiceCreate, current_user: dict = Depends(get_current_user)):
    """Create a receivable invoice"""
    if current_user["role"] not in ["admin", "finance", "sales"]:
        raise HTTPException(status_code=403, detail="Only admin/finance/sales can create invoices")
    
    # Use APL for local, APE for export (Proforma Invoice codes)
    prefix = "APL" if data.invoice_type == "LOCAL" else "APE"
    invoice_number = await generate_sequence(prefix, "receivable_invoices")
    
    invoice = ReceivableInvoice(**data.model_dump(), invoice_number=invoice_number)
    await db.receivable_invoices.insert_one(invoice.model_dump())
    
    return invoice.model_dump()

@api_router.get("/receivables/invoices")
async def get_receivable_invoices(status: Optional[str] = None, invoice_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get all receivable invoices with aging and related documents"""
    query = {}
    if status:
        query["status"] = status
    if invoice_type:
        query["invoice_type"] = invoice_type
    
    invoices = await db.receivable_invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich invoices with related documents
    enriched_invoices = []
    for inv in invoices:
        enriched_inv = {**inv, "documents": {}}
        
        # Get Delivery Order
        do_id = inv.get("delivery_order_id")
        if do_id:
            do = await db.delivery_orders.find_one({"id": do_id}, {"_id": 0})
            if do:
                enriched_inv["documents"]["delivery_order"] = {
                    "number": do.get("do_number"),
                    "id": do.get("id"),
                    "created_at": do.get("issued_at")
                }
                
                # Get job order to check customer type
                job = await db.job_orders.find_one({"id": do.get("job_order_id")}, {"_id": 0})
                if job:
                    so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
                    quotation = await db.quotations.find_one({"id": so.get("quotation_id") if so else None}, {"_id": 0})
                    is_export = quotation.get("order_type") == "export" if quotation else False
                    
                    # For export orders, get additional documents
                    if is_export:
                        # Get Packing List
                        pl = await db.packing_lists.find_one({"do_number": do.get("do_number")}, {"_id": 0})
                        if pl:
                            enriched_inv["documents"]["packing_list"] = {
                                "number": pl.get("pl_number"),
                                "id": pl.get("id"),
                                "created_at": pl.get("created_at")
                            }
                        
                        # Get Certificate of Origin
                        coo = await db.certificates_of_origin.find_one({"do_number": do.get("do_number")}, {"_id": 0})
                        if coo:
                            enriched_inv["documents"]["certificate_of_origin"] = {
                                "number": coo.get("coo_number"),
                                "id": coo.get("id"),
                                "created_at": coo.get("created_at")
                            }
                        
                        # Get Bill of Lading Draft
                        bl = await db.bill_of_lading_drafts.find_one({"do_number": do.get("do_number")}, {"_id": 0})
                        if bl:
                            enriched_inv["documents"]["bl_draft"] = {
                                "number": bl.get("bl_number"),
                                "id": bl.get("id"),
                                "created_at": bl.get("created_at")
                            }
                    
                    # Get COA (for both local and export)
                    # QC inspection ref_id is the transport_outward ID
                    transport = await db.transport_outward.find_one({"job_order_id": do.get("job_order_id")}, {"_id": 0})
                    qc = None
                    if transport:
                        qc = await db.qc_inspections.find_one({
                            "ref_type": "OUTWARD",
                            "ref_id": transport.get("id")
                        }, {"_id": 0})
                    
                    if qc and qc.get("coa_generated"):
                        enriched_inv["documents"]["certificate_of_analysis"] = {
                            "number": qc.get("coa_number"),
                            "id": qc.get("id"),
                            "created_at": qc.get("coa_generated_at")
                        }
        
        # Add invoice itself to documents
        enriched_inv["documents"]["invoice"] = {
            "number": inv.get("invoice_number"),
            "id": inv.get("id"),
            "created_at": inv.get("created_at")
        }
        
        enriched_invoices.append(enriched_inv)
    
    # Calculate aging buckets
    today = datetime.now(timezone.utc)
    aging = {"current": 0, "30_days": 0, "60_days": 0, "90_plus": 0}
    
    for inv in invoices:
        if inv.get("status") in ["PENDING", "SENT", "PARTIAL"]:
            outstanding = inv.get("amount", 0) - inv.get("amount_paid", 0)
            due_date = datetime.fromisoformat(inv.get("due_date", inv["created_at"]).replace("Z", "+00:00"))
            days_overdue = (today - due_date).days
            
            if days_overdue <= 0:
                aging["current"] += outstanding
            elif days_overdue <= 30:
                aging["30_days"] += outstanding
            elif days_overdue <= 60:
                aging["60_days"] += outstanding
            else:
                aging["90_plus"] += outstanding
    
    return {
        "invoices": enriched_invoices,
        "aging": aging,
        "total_outstanding": sum(aging.values())
    }

class RecordPaymentRequest(BaseModel):
    amount: float

@api_router.put("/receivables/invoices/{invoice_id}/record-payment")
async def record_receivables_invoice_payment(
    invoice_id: str,
    current_user: dict = Depends(get_current_user),
    data: RecordPaymentRequest = None
):
    """Record a payment against a receivables invoice"""
    if current_user["role"] not in ["admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only admin/finance can record payments")
    
    invoice = await db.receivable_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if not data:
        raise HTTPException(status_code=400, detail="Request body is required")
    
    amount = data.amount
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
    
    new_paid = invoice.get("amount_paid", 0) + amount
    new_status = "PAID" if new_paid >= invoice.get("amount", 0) else "PARTIAL"
    
    await db.receivable_invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "amount_paid": new_paid,
            "status": new_status
        }}
    )
    
    # Record the payment
    payment_record = {
        "id": str(uuid.uuid4()),
        "invoice_id": invoice_id,
        "amount": amount,
        "recorded_by": current_user["id"],
        "recorded_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payments_received.insert_one(payment_record)
    
    return {"success": True, "message": f"Payment of {amount} recorded", "new_status": new_status}

@api_router.get("/receivables/invoices/{invoice_id}/payments")
async def get_invoice_payments(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Get payment history for an invoice"""
    invoice = await db.receivable_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    payments = await db.payments_received.find(
        {"invoice_id": invoice_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    return {"payments": payments, "total_paid": sum(p.get("amount", 0) for p in payments)}

@api_router.put("/receivables/invoices/{invoice_id}/finance-approve")
async def finance_approve_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Finance approves an invoice - enables stamp and signature on PDF"""
    if current_user["role"] not in ["admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only admin/finance can approve invoices")
    
    invoice = await db.receivable_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    await db.receivable_invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "finance_approved": True,
            "finance_approved_by": current_user["id"],
            "finance_approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "message": "Invoice approved by finance - stamp and signature will appear on PDF"}

async def calculate_due_date(payment_terms: Optional[str], invoice_date: str) -> str:
    """Calculate due date from payment terms"""
    if not payment_terms:
        return invoice_date
    
    # Extract days from payment terms (e.g., "Net 30" -> 30, "Cash" -> 0)
    days = 0
    if "net" in payment_terms.lower():
        import re
        match = re.search(r'(\d+)', payment_terms)
        if match:
            days = int(match.group(1))
    elif "cash" in payment_terms.lower() or "advance" in payment_terms.lower():
        days = 0
    
    invoice_dt = datetime.fromisoformat(invoice_date.replace('Z', '+00:00'))
    due_dt = invoice_dt + timedelta(days=days)
    return due_dt.isoformat()

async def auto_generate_invoice_from_do(do_id: str, do_number: str, job: dict, current_user: dict):
    """Auto-generate invoice from delivery order"""
    # Check if invoice already exists for this DO
    existing = await db.receivable_invoices.find_one({"delivery_order_id": do_id}, {"_id": 0})
    if existing:
        return {"invoice_number": existing.get("invoice_number"), "invoice_type": existing.get("invoice_type")}
    
    # Get sales order and quotation
    so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
    if not so:
        return {"error": "Sales order not found"}
    
    quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
    if not quotation:
        return {"error": "Quotation not found"}
    
    # Determine invoice type
    order_type = quotation.get("order_type", "local").upper()
    invoice_type = "LOCAL" if order_type == "LOCAL" else "EXPORT"
    
    # Get customer details
    customer_id = so.get("customer_id") or quotation.get("customer_id")
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    customer_name = customer.get("name", "") if customer else so.get("customer_name", "")
    
    # Build line items from job order
    line_items = []
    subtotal = 0
    
    # Handle both single product and items array
    if job.get("items") and len(job.get("items", [])) > 0:
        for item in job["items"]:
            # Get product details
            product = await db.products.find_one({"id": item.get("product_id")}, {"_id": 0})
            if not product:
                continue
            
            # Get price from quotation items
            unit_price = 0
            for q_item in quotation.get("items", []):
                if q_item.get("product_id") == item.get("product_id"):
                    unit_price = q_item.get("unit_price", 0)
                    break
            
            # Calculate total
            quantity = item.get("quantity", 0)
            packaging = item.get("packaging", "Bulk")
            
            # Calculate based on packaging (same logic as quotation)
            if packaging != "Bulk" and item.get("net_weight_kg"):
                weight_mt = (item.get("net_weight_kg") * quantity) / 1000
                item_total = weight_mt * unit_price
            else:
                weight_mt = quantity
                item_total = quantity * unit_price
            
            line_items.append({
                "product_id": item.get("product_id"),
                "product_name": item.get("product_name") or product.get("name", ""),
                "quantity": quantity,
                "unit_price": unit_price,
                "unit": "KG",
                "total": item_total,
                "sku": product.get("sku"),
                "packaging": packaging
            })
            subtotal += item_total
    else:
        # Legacy single product format
        product = await db.products.find_one({"id": job.get("product_id")}, {"_id": 0})
        if product:
            # Get price from quotation
            unit_price = 0
            for q_item in quotation.get("items", []):
                if q_item.get("product_id") == job.get("product_id"):
                    unit_price = q_item.get("unit_price", 0)
                    break
            
            quantity = job.get("quantity", 0)
            packaging = job.get("packaging", "Bulk")
            
            if packaging != "Bulk" and job.get("net_weight_kg"):
                weight_mt = (job.get("net_weight_kg") * quantity) / 1000
                item_total = weight_mt * unit_price
            else:
                item_total = quantity * unit_price
            
            line_items.append({
                "product_id": job.get("product_id"),
                "product_name": job.get("product_name") or product.get("name", ""),
                "quantity": quantity,
                "unit_price": unit_price,
                "unit": "KG",
                "total": item_total,
                "sku": product.get("sku"),
                "packaging": packaging
            })
            subtotal += item_total
    
    # Calculate tax (VAT for local orders)
    tax_rate = 0
    tax_amount = 0
    if invoice_type == "LOCAL" and quotation.get("vat_rate"):
        tax_rate = quotation.get("vat_rate", 0)
        tax_amount = subtotal * (tax_rate / 100)
    
    total_amount = subtotal + tax_amount
    
    # Get payment terms
    payment_terms = quotation.get("payment_terms", "Net 30")
    
    # Calculate due date
    invoice_date = datetime.now(timezone.utc).isoformat()
    due_date = await calculate_due_date(payment_terms, invoice_date)
    
    # Create invoice - Use APL for local, APE for export (Proforma Invoice codes)
    prefix = "APL" if invoice_type == "LOCAL" else "APE"
    invoice_number = await generate_sequence(prefix, "receivable_invoices")
    
    invoice = {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "invoice_type": invoice_type,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "sales_order_id": so.get("id"),
        "job_order_id": job.get("id"),
        "delivery_order_id": do_id,
        "amount": total_amount,
        "currency": quotation.get("currency", "USD"),
        "due_date": due_date,
        "payment_terms": payment_terms,
        "line_items": line_items,
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "tax_rate": tax_rate,
        "status": "PENDING",
        "amount_paid": 0,
        "finance_approved": False,
        "created_at": invoice_date
    }
    
    await db.receivable_invoices.insert_one(invoice)
    
    # Create notification
    await create_notification(
        event_type="INVOICE_GENERATED",
        title=f"Invoice Generated: {invoice_number}",
        message=f"Invoice {invoice_number} for {customer_name} - {total_amount} {invoice['currency']}",
        link="/receivables",
        ref_type="invoice",
        ref_id=invoice["id"],
        target_roles=["admin", "finance", "sales"],
        notification_type="info"
    )
    
    return {"invoice_number": invoice_number, "invoice_type": invoice_type, "invoice_id": invoice["id"]}

# ==================== SECURITY & QC (MVP) ====================

@api_router.post("/security/inward-checklist")
async def create_inward_checklist(
    grn_id: str,
    vehicle_number: str,
    driver_name: str,
    weight_in: float,
    notes: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Create security inward checklist"""
    if current_user["role"] not in ["admin", "security"]:
        raise HTTPException(status_code=403, detail="Only admin/security can create inward checklist")
    
    checklist = {
        "id": str(uuid.uuid4()),
        "grn_id": grn_id,
        "type": "INWARD",
        "vehicle_number": vehicle_number,
        "driver_name": driver_name,
        "weight_in": weight_in,
        "weight_out": None,
        "status": "IN_PROGRESS",
        "notes": notes,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.security_checklists.insert_one(checklist)
    # Return without _id to avoid ObjectId serialization error
    return await db.security_checklists.find_one({"id": checklist["id"]}, {"_id": 0})

@api_router.put("/security/checklist/{checklist_id}/complete")
async def complete_security_checklist(
    checklist_id: str,
    weight_out: float,
    current_user: dict = Depends(get_current_user)
):
    """Complete security checklist with weight out"""
    if current_user["role"] not in ["admin", "security"]:
        raise HTTPException(status_code=403, detail="Only admin/security can complete checklist")
    
    await db.security_checklists.update_one(
        {"id": checklist_id},
        {"$set": {
            "weight_out": weight_out,
            "status": "COMPLETED",
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"success": True, "message": "Security checklist completed"}

@api_router.get("/security/checklists")
async def get_security_checklists(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get all security checklists"""
    query = {}
    if status:
        query["status"] = status
    
    checklists = await db.security_checklists.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return checklists

# QC Endpoints
@api_router.post("/qc/inspection")
async def create_qc_inspection(
    ref_type: str,  # GRN, JOB_ORDER, BLEND
    ref_id: str,
    batch_number: str,
    current_user: dict = Depends(get_current_user)
):
    """Create QC inspection record"""
    if current_user["role"] not in ["admin", "qc"]:
        raise HTTPException(status_code=403, detail="Only admin/qc can create inspections")
    
    inspection = {
        "id": str(uuid.uuid4()),
        "ref_type": ref_type,
        "ref_id": ref_id,
        "batch_number": batch_number,
        "status": "PENDING",  # PENDING, PASS, FAIL, HOLD
        "results": [],
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.qc_inspections.insert_one(inspection)
    return inspection

@api_router.put("/qc/inspection/{inspection_id}/result")
async def update_qc_result(
    inspection_id: str,
    status: str,  # PASS, FAIL, HOLD
    notes: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Update QC inspection result"""
    if current_user["role"] not in ["admin", "qc"]:
        raise HTTPException(status_code=403, detail="Only admin/qc can update inspections")
    
    if status not in ["PASS", "FAIL", "HOLD"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    await db.qc_inspections.update_one(
        {"id": inspection_id},
        {"$set": {
            "status": status,
            "result_notes": notes,
            "inspected_by": current_user["id"],
            "inspected_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"success": True, "message": f"QC inspection marked as {status}"}



# ==================== PHASE 1: TRANSPORT WINDOW (4 Tables) ====================

class TransportInward(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    transport_number: str = ""
    po_id: str
    po_number: str
    supplier_name: str
    incoterm: str
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    eta: Optional[str] = None
    actual_arrival: Optional[str] = None
    status: str = "PENDING"  # PENDING, SCHEDULED, IN_TRANSIT, ARRIVED, COMPLETED
    source: str = "EXW"  # EXW (direct) or IMPORT (post-import)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TransportOutward(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    transport_number: str = ""
    do_id: Optional[str] = None
    do_number: Optional[str] = None
    job_order_id: Optional[str] = None
    job_number: Optional[str] = None
    customer_name: str
    transport_type: str = "LOCAL"  # LOCAL, CONTAINER
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    container_number: Optional[str] = None
    destination: Optional[str] = None
    dispatch_date: Optional[str] = None
    delivery_date: Optional[str] = None
    delivery_order_number: Optional[str] = None
    delivery_order_document: Optional[str] = None
    status: str = "PENDING"  # PENDING, LOADING, DISPATCHED, DELIVERED
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@api_router.get("/transport/inward")
async def get_transport_inward(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get inward transport records with product details"""
    query = {}
    
    # Filter out completed/dispatched statuses unless a specific status is requested
    excluded_statuses = ["DISPATCHED", "DELIVERED", "ARRIVED", "COMPLETED"]
    if status:
        query["status"] = status
    else:
        query["status"] = {"$nin": excluded_statuses}
    
    records = await db.transport_inward.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with PO lines/products
    for record in records:
        if record.get("po_id"):
            po = await db.purchase_orders.find_one({"id": record["po_id"]}, {"_id": 0})
            if po:
                # Ensure po_number, supplier_name, and incoterm are set from PO
                if not record.get("po_number"):
                    record["po_number"] = po.get("po_number", "")
                if not record.get("supplier_name"):
                    record["supplier_name"] = po.get("supplier_name", "")
                if not record.get("incoterm"):
                    record["incoterm"] = po.get("incoterm", "")
                
                # Get PO lines from purchase_order_lines collection
                po_lines = await db.purchase_order_lines.find({"po_id": record["po_id"]}, {"_id": 0}).to_list(1000)
                record["lines"] = po_lines
                # Also set po_items for frontend compatibility
                record["po_items"] = po_lines
                
                # Calculate total quantity from lines
                total_qty = sum(line.get("qty", 0) for line in po_lines)
                record["total_quantity"] = total_qty
                
                # Get unit from first line (assuming all lines have same UOM)
                if po_lines and len(po_lines) > 0:
                    unit = po_lines[0].get("uom", "KG")
                    record["total_uom"] = unit
                    record["total_unit"] = unit  # Also set total_unit for backward compatibility
                
                # Get product/item names summary from lines (now with packaging info)
                product_summaries = [line.get("display_name", line.get("item_name", "Unknown")) for line in po_lines]
                record["products_summary"] = ", ".join(product_summaries[:3])  # First 3 products
                if len(product_summaries) > 3:
                    record["products_summary"] += f" (+{len(product_summaries) - 3} more)"
                
                # Also include legacy items field for backward compatibility (with packaging info)
                record["items"] = [{
                    "product_name": line.get("display_name", line.get("item_name")), 
                    "quantity": line.get("qty"), 
                    "unit": line.get("uom"),
                    "packaging_qty": line.get("packaging_qty"),
                    "packaging_name": line.get("packaging_name")
                } for line in po_lines]
                
                # Include delivery date from PO
                if po.get("delivery_date") and not record.get("delivery_date"):
                    record["delivery_date"] = po.get("delivery_date")
        
        # Ensure ETA is included (already in TransportInward model, but ensure it's present)
        if "eta" not in record:
            record["eta"] = None
        
        # Ensure container_count and drum_count fields exist (default to None if not present)
        if "container_count" not in record:
            record["container_count"] = None
        if "drum_count" not in record:
            record["drum_count"] = None
    
    return records


@api_router.post("/transport/inward")
async def create_transport_inward(data: dict, current_user: dict = Depends(get_current_user)):
    """Create inward transport record"""
    transport_number = await generate_sequence("TIN", "transport_inward")
    record = TransportInward(
        transport_number=transport_number,
        **data
    )
    await db.transport_inward.insert_one(record.model_dump())
    
    # Create notification if ETA is provided
    if record.eta:
        await create_notification(
            event_type="TRANSPORT_ARRIVAL_SCHEDULED",
            title="Transport Arrival Scheduled",
            message=f"Transport {transport_number} scheduled to arrive on {record.eta} - {record.po_number or record.import_number or 'Materials'}",
            link="/loading-unloading",
            ref_type="transport_inward",
            ref_id=record.id,
            target_roles=["admin", "warehouse", "security", "production"],
            notification_type="info"
        )
    
    return record


@api_router.put("/transport/inward/{transport_id}/status")
async def update_transport_inward_status(transport_id: str, status: str, current_user: dict = Depends(get_current_user)):
    """Update inward transport status"""
    update_data = {"status": status}
    if status == "ARRIVED":
        update_data["actual_arrival"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.transport_inward.update_one(
        {"id": transport_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transport record not found")
    
    transport = await db.transport_inward.find_one({"id": transport_id}, {"_id": 0})
    
    # If in transit, notify Security & Unloading
    if status == "IN_TRANSIT" and transport:
        # Notification for Security page
        await create_notification(
            event_type="TRANSPORT_IN_TRANSIT",
            title="Transport In Transit",
            message=f"Transport {transport.get('transport_number')} is now in transit - Prepare for arrival",
            link="/security",
            ref_type="transport_inward",
            ref_id=transport_id,
            target_roles=["admin", "security"],
            notification_type="info"
        )
        
        # Notification for Unloading page
        await create_notification(
            event_type="TRANSPORT_IN_TRANSIT",
            title="Transport In Transit",
            message=f"Transport {transport.get('transport_number')} is now in transit - Prepare for unloading",
            link="/loading-unloading",
            ref_type="transport_inward",
            ref_id=transport_id,
            target_roles=["admin", "warehouse", "unloading"],
            notification_type="info"
        )
    
    # If arrived, route to Security & QC
    if status == "ARRIVED" and transport:
        await create_notification(
            event_type="TRANSPORT_ARRIVED",
            title="Inward Transport Arrived",
            message=f"Transport {transport.get('transport_number')} has arrived at facility - Ready for unloading",
            link="/loading-unloading",
            ref_type="transport_inward",
            ref_id=transport_id,
            target_roles=["admin", "warehouse", "security", "qc", "production"],
            notification_type="info"
        )
    
    # If completed, unloading is done
    if status == "COMPLETED" and transport:
        await create_notification(
            event_type="UNLOADING_COMPLETED",
            title="Unloading Completed",
            message=f"Unloading completed: Transport {transport.get('transport_number')} - Materials received",
            link="/grn",
            ref_type="transport_inward",
            ref_id=transport_id,
            target_roles=["admin", "warehouse", "inventory", "finance", "production"],
            notification_type="success"
        )
    
    return {"success": True, "message": f"Transport status updated to {status}"}


@api_router.put("/transport/inward/{transport_id}/operation-status")
async def update_transport_inward_operation_status(
    transport_id: str,
    status: str,
    eta: Optional[str] = None,
    scheduled_time: Optional[str] = None,
    new_transporter: Optional[str] = None,
    new_delivery_date: Optional[str] = None,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update inward transport operational status (ON_THE_WAY, SCHEDULED, RESCHEDULED, etc.)"""
    update_data = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add optional fields if provided
    if eta:
        update_data["eta"] = eta
    if scheduled_time:
        update_data["scheduled_time"] = scheduled_time
    if new_transporter:
        update_data["transporter"] = new_transporter
    if new_delivery_date:
        update_data["expected_delivery"] = new_delivery_date
    if notes:
        update_data["notes"] = notes
    
    # Set specific timestamps based on status
    if status == "ON_THE_WAY":
        update_data["departed_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "SCHEDULED":
        update_data["scheduled_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "RESCHEDULED":
        update_data["rescheduled_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "ARRIVED":
        update_data["actual_arrival"] = datetime.now(timezone.utc).isoformat()
    elif status == "DELIVERED":
        update_data["delivered_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.transport_inward.update_one(
        {"id": transport_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transport record not found")
    
    # Create notification when ETA is set
    if eta:
        transport = await db.transport_inward.find_one({"id": transport_id}, {"_id": 0})
        if transport:
            await create_notification(
                event_type="TRANSPORT_ARRIVAL_SCHEDULED",
                title="Transport Arrival Scheduled",
                message=f"Transport {transport.get('transport_number')} scheduled to arrive on {eta} - {transport.get('po_number') or transport.get('import_number') or 'Materials'}",
                link="/loading-unloading",
                ref_type="transport_inward",
                ref_id=transport_id,
                target_roles=["admin", "warehouse", "security", "production"],
                notification_type="info"
            )
    
    # Create notification for ARRIVED status (use TRANSPORT_ARRIVED event)
    if status == "ARRIVED":
        transport = await db.transport_inward.find_one({"id": transport_id}, {"_id": 0})
        if transport:
            await create_notification(
                event_type="TRANSPORT_ARRIVED",
                title="Inward Transport Arrived",
                message=f"Transport {transport.get('transport_number')} has arrived at facility - Ready for unloading",
                link="/loading-unloading",
                ref_type="transport_inward",
                ref_id=transport_id,
                target_roles=["admin", "warehouse", "security", "qc", "production"],
                notification_type="info"
            )
    
    return {"success": True, "message": f"Transport operation status updated to {status}"}


@api_router.get("/loading-unloading/loading-ready")
async def get_loading_ready_jobs(current_user: dict = Depends(get_current_user)):
    """Get job orders ready for loading (local customers without shipping bookings)"""
    # Get job orders that are ready for dispatch but don't have shipping bookings
    jobs = await db.job_orders.find(
        {
            "status": {"$in": ["ready_for_dispatch", "Production_Completed"]},
            "$or": [
                {"shipping_booking_id": {"$exists": False}},  # No shipping booking
                {"shipping_booking_id": None}  # Explicitly null
            ]
        },
        {"_id": 0}
    ).sort("delivery_date", 1).to_list(1000)
    
    # Enrich with product details and customer info
    enriched_jobs = []
    for job in jobs:
        # Get sales order for customer info
        so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
        if so:
            job["customer_name"] = so.get("customer_name", "")
            # Check if it's a local customer (no export incoterm)
            quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
            if quotation:
                incoterm = quotation.get("incoterm", "").upper()
                # Only include if it's not an export order (FOB, CFR, CIF, CIP)
                if incoterm not in ["FOB", "CFR", "CIF", "CIP"]:
                    # Get items
                    items = job.get("items", [])
                    if not items and job.get("product_name"):
                        # Legacy format - create items array
                        items = [{
                            "product_name": job.get("product_name"),
                            "quantity": job.get("quantity", 0),
                            "packaging": job.get("packaging", "Bulk"),
                            "unit": job.get("unit", "KG")
                        }]
                    job["job_items"] = items
                    job["job_numbers"] = [job.get("job_number", "")]
                    
                    # Calculate total quantity
                    total_qty = sum(item.get("quantity", 0) for item in items)
                    job["total_quantity"] = total_qty
                    
                    # Get product names
                    product_names = [item.get("product_name", "Unknown") for item in items]
                    job["product_names"] = product_names
                    job["products_summary"] = ", ".join(product_names[:3])
                    if len(product_names) > 3:
                        job["products_summary"] += f" (+{len(product_names) - 3} more)"
                    
                    enriched_jobs.append(job)
    
    return enriched_jobs


@api_router.get("/loading-unloading/unloading-ready")
async def get_unloading_ready_pos(current_user: dict = Depends(get_current_user)):
    """Get approved POs ready for unloading (even if transport not booked yet)"""
    # Get approved POs that don't have transport booked yet
    pos = await db.purchase_orders.find(
        {
            "status": "APPROVED",
            "$or": [
                {"transport_booked": {"$exists": False}},
                {"transport_booked": False},
                {"transport_booked": None}
            ]
        },
        {"_id": 0}
    ).sort("delivery_date", 1).to_list(1000)
    
    # Enrich with PO line items
    enriched_pos = []
    for po in pos:
        # Get PO lines
        lines = await db.purchase_order_lines.find(
            {"po_id": po["id"]}, 
            {"_id": 0}
        ).to_list(1000)
        
        # Format as po_items for consistency with transport_inward format
        po_items = []
        for line in lines:
            po_items.append({
                "item_name": line.get("item_name", "Unknown"),
                "item_sku": line.get("item_sku", ""),
                "product_name": line.get("item_name", "Unknown"),  # Alias for compatibility
                "quantity": line.get("qty", 0),
                "uom": line.get("uom", "KG"),
                "unit": line.get("uom", "KG"),  # Alias for compatibility
                "unit_price": line.get("unit_price", 0)
            })
        
        po["po_items"] = po_items
        po["lines"] = lines  # Also include for backward compatibility
        
        # Calculate total quantity
        total_qty = sum(line.get("qty", 0) for line in lines)
        po["total_quantity"] = total_qty
        
        # Get product names summary
        product_names = [line.get("item_name", "Unknown") for line in lines if line.get("item_name")]
        po["products_summary"] = ", ".join(product_names[:3])
        if len(product_names) > 3:
            po["products_summary"] += f" (+{len(product_names) - 3} more)"
        
        enriched_pos.append(po)
    
    return enriched_pos


@api_router.get("/transport/outward")
async def get_transport_outward(
    status: Optional[str] = None, 
    transport_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get outward transport records with product details"""
    query = {}
    
    # Filter out completed/dispatched statuses unless a specific status is requested
    excluded_statuses = ["DISPATCHED", "DELIVERED", "ARRIVED", "COMPLETED"]
    if status:
        query["status"] = status
    else:
        query["status"] = {"$nin": excluded_statuses}
    
    if transport_type:
        query["transport_type"] = transport_type
    records = await db.transport_outward.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with job order items/products and shipping booking data
    for record in records:
        # Enrich with job order data
        if record.get("job_order_id"):
            job_order = await db.job_orders.find_one({"id": record["job_order_id"]}, {"_id": 0})
            if job_order:
                items = job_order.get("items", [])
                # If no items array, create one from legacy single product fields
                if not items and job_order.get("product_name"):
                    items = [{
                        "product_name": job_order.get("product_name"),
                        "quantity": job_order.get("quantity", 0),
                        "packaging": job_order.get("packaging", "Bulk")
                    }]
                
                record["job_items"] = items
                # Calculate total quantity
                total_qty = sum(item.get("quantity", 0) for item in items)
                record["total_quantity"] = total_qty
                # Get product names summary
                product_names = [item.get("product_name", "Unknown") for item in items]
                record["products_summary"] = ", ".join(product_names[:3])  # First 3 products
                if len(product_names) > 3:
                    record["products_summary"] += f" (+{len(product_names) - 3} more)"
                record["delivery_date"] = job_order.get("delivery_date")
                record["product_names"] = product_names
                # CRITICAL: Pass through the unit and packaging from job order
                record["unit"] = job_order.get("unit", "KG")
                record["packaging"] = job_order.get("packaging", "units")
                
                # Enrich customer_name from job order if missing in transport record
                if not record.get("customer_name") and job_order.get("customer_name"):
                    record["customer_name"] = job_order.get("customer_name")
                # If still missing, try to get from sales order
                if job_order.get("sales_order_id"):
                    sales_order = await db.sales_orders.find_one({"id": job_order.get("sales_order_id")}, {"_id": 0})
                    if sales_order:
                        if not record.get("customer_name") and sales_order.get("customer_name"):
                            record["customer_name"] = sales_order.get("customer_name")
                        # Enrich expected_delivery_date from sales order for dispatch_date
                        if sales_order.get("expected_delivery_date"):
                            record["expected_delivery_date"] = sales_order.get("expected_delivery_date")
                
                # #region agent log
                import json
                with open(r'c:\ERPemergent\.cursor\debug.log', 'a') as f: f.write(json.dumps({"location":"server.py:7935","message":"Transport outward enrichment","data":{"transport_number":record.get("transport_number"),"job_number":job_order.get("job_number"),"total_quantity":total_qty,"unit":job_order.get("unit"),"unit_in_record":record.get("unit")},"timestamp":datetime.now(timezone.utc).timestamp()*1000,"sessionId":"debug-session","runId":"initial","hypothesisId":"B,C"})+'\n')
                # #endregion
        
        # For export containers, enrich with shipping booking data
        if record.get("transport_type") == "CONTAINER":
            shipping_booking = None
            shipping_booking_id = record.get("shipping_booking_id")
            
            # First try direct shipping_booking_id on transport record
            if shipping_booking_id:
                shipping_booking = await db.shipping_bookings.find_one({"id": shipping_booking_id}, {"_id": 0})
            
            # If not found, try to get from linked job orders
            if not shipping_booking:
                # Check job_order_id - search both ways (from job order and from shipping bookings)
                if record.get("job_order_id"):
                    job_id = record["job_order_id"]
                    # First try from job order
                    job_order = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
                    if job_order and job_order.get("shipping_booking_id"):
                        shipping_booking = await db.shipping_bookings.find_one({"id": job_order["shipping_booking_id"]}, {"_id": 0})
                    
                    # If still not found, search shipping bookings that contain this job_id
                    if not shipping_booking:
                        shipping_booking = await db.shipping_bookings.find_one(
                            {"job_order_ids": job_id, "status": {"$nin": ["cancelled", "deleted"]}},
                            {"_id": 0}
                        )
                
                # Check job_numbers array
                if not shipping_booking and record.get("job_numbers"):
                    for job_number in record.get("job_numbers", []):
                        job_order = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
                        if job_order:
                            # Try from job order's shipping_booking_id
                            if job_order.get("shipping_booking_id"):
                                shipping_booking = await db.shipping_bookings.find_one({"id": job_order["shipping_booking_id"]}, {"_id": 0})
                                if shipping_booking:
                                    break
                            
                            # Try searching by job order ID in shipping bookings
                            if not shipping_booking and job_order.get("id"):
                                shipping_booking = await db.shipping_bookings.find_one(
                                    {"job_order_ids": job_order["id"], "status": {"$nin": ["cancelled", "deleted"]}},
                                    {"_id": 0}
                                )
                                if shipping_booking:
                                    break
                
                # If still not found and we have job_number directly, try one more search
                if not shipping_booking and record.get("job_number"):
                    job_order = await db.job_orders.find_one({"job_number": record["job_number"]}, {"_id": 0})
                    if job_order:
                        if job_order.get("shipping_booking_id"):
                            shipping_booking = await db.shipping_bookings.find_one({"id": job_order["shipping_booking_id"]}, {"_id": 0})
                        elif job_order.get("id"):
                            shipping_booking = await db.shipping_bookings.find_one(
                                {"job_order_ids": job_order["id"], "status": {"$nin": ["cancelled", "deleted"]}},
                                {"_id": 0}
                            )
            
            if shipping_booking:
                # Add shipping booking fields to transport record
                # CRITICAL: Use .get() which returns the value (including empty strings) or None if key doesn't exist
                record["si_cutoff"] = shipping_booking.get("si_cutoff")
                record["vgm_cutoff"] = shipping_booking.get("vgm_cutoff")
                record["pull_out_date"] = shipping_booking.get("pull_out_date")
                record["gate_in_date"] = shipping_booking.get("gate_in_date")
                record["container_count"] = shipping_booking.get("container_count") or record.get("container_count") or 1
                record["container_type"] = shipping_booking.get("container_type") or record.get("container_type")
                record["cutoff_date"] = shipping_booking.get("cutoff_date") or None
                record["vessel_name"] = shipping_booking.get("vessel_name") or None
                record["vessel_date"] = shipping_booking.get("vessel_date") or None
                record["port_of_loading"] = shipping_booking.get("port_of_loading") or None
                record["port_of_discharge"] = shipping_booking.get("port_of_discharge") or None
                record["booking_number"] = shipping_booking.get("booking_number") or record.get("booking_number")
                record["cro_number"] = shipping_booking.get("cro_number") or record.get("cro_number")
                record["shipping_line"] = shipping_booking.get("shipping_line") or None
                # Get pickup_date from booking, or calculate from cutoff_date if missing
                pickup_date = shipping_booking.get("pickup_date")
                if not pickup_date:
                    cutoff_date = shipping_booking.get("cutoff_date")
                    if cutoff_date:
                        try:
                            cutoff = datetime.fromisoformat(cutoff_date)
                            pickup = cutoff - timedelta(days=3)
                            pickup_date = pickup.strftime("%Y-%m-%d")
                        except (ValueError, TypeError):
                            pickup_date = None
                record["pickup_date"] = pickup_date
                # Also store the shipping_booking_id for future reference
                if not record.get("shipping_booking_id"):
                    record["shipping_booking_id"] = shipping_booking.get("id")
        
        # Also enrich with job order data from job_numbers if available (for export containers)
        if record.get("job_numbers") and not record.get("job_items"):
            job_items = []
            product_names = []
            for job_number in record.get("job_numbers", []):
                job_order = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
                if job_order:
                    items = job_order.get("items", [])
                    if not items and job_order.get("product_name"):
                        items = [{
                            "product_name": job_order.get("product_name"),
                            "quantity": job_order.get("quantity", 0),
                            "packaging": job_order.get("packaging", "Bulk")
                        }]
                    job_items.extend(items)
                    product_names.extend([item.get("product_name", "Unknown") for item in items])
                    
                    # Enrich customer_name from job order if missing
                    if not record.get("customer_name") and job_order.get("customer_name"):
                        record["customer_name"] = job_order.get("customer_name")
                    # If still missing, try to get from sales order
                    if not record.get("customer_name") and job_order.get("sales_order_id"):
                        sales_order = await db.sales_orders.find_one({"id": job_order.get("sales_order_id")}, {"_id": 0})
                        if sales_order and sales_order.get("customer_name"):
                            record["customer_name"] = sales_order.get("customer_name")
            
            if job_items:
                record["job_items"] = job_items
                record["product_names"] = product_names
                record["products_summary"] = ", ".join(product_names[:3])
                if len(product_names) > 3:
                    record["products_summary"] += f" (+{len(product_names) - 3} more)"
                record["total_quantity"] = sum(item.get("quantity", 0) for item in job_items)
    
    return records


@api_router.post("/transport/outward")
async def create_transport_outward(data: dict, current_user: dict = Depends(get_current_user)):
    """Create outward transport record"""
    transport_number = await generate_sequence("TOUT", "transport_outward")
    record = TransportOutward(
        transport_number=transport_number,
        **data
    )
    await db.transport_outward.insert_one(record.model_dump())
    return record


@api_router.put("/transport/outward/{transport_id}/status")
async def update_transport_outward_status(transport_id: str, status: str, current_user: dict = Depends(get_current_user)):
    """Update outward transport status"""
    update_data = {"status": status}
    if status == "DISPATCHED":
        update_data["dispatch_date"] = datetime.now(timezone.utc).isoformat()
    elif status == "DELIVERED":
        update_data["delivery_date"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.transport_outward.update_one(
        {"id": transport_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transport record not found")
    
    transport = await db.transport_outward.find_one({"id": transport_id}, {"_id": 0})
    
    # If loading started, notify Loading/Unloading page
    if status == "LOADING" and transport:
        transport_type = transport.get("transport_type", "LOCAL")
        transport_label = "Local Dispatch" if transport_type == "LOCAL" else "Export Container"
        
        await create_notification(
            event_type="TRANSPORT_LOADING_STARTED",
            title="Loading Started",
            message=f"{transport_label} {transport.get('transport_number')} - Loading has started. Please proceed to loading area.",
            link="/loading-unloading",
            ref_type="transport_outward",
            ref_id=transport_id,
            target_roles=["admin", "warehouse", "unloading", "loading"],
            notification_type="info"
        )
    
    return {"success": True, "message": f"Transport status updated to {status}"}


@api_router.put("/transport/outward/{transport_id}/operation-status")
async def update_transport_outward_operation_status(
    transport_id: str,
    status: str,
    eta: Optional[str] = None,
    scheduled_time: Optional[str] = None,
    new_transporter: Optional[str] = None,
    new_delivery_date: Optional[str] = None,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update outward transport operational status (ON_THE_WAY, SCHEDULED, RESCHEDULED, etc.)"""
    update_data = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add optional fields if provided
    if eta:
        update_data["eta"] = eta
    if scheduled_time:
        update_data["scheduled_time"] = scheduled_time
    if new_transporter:
        update_data["transporter"] = new_transporter
    if new_delivery_date:
        update_data["expected_delivery"] = new_delivery_date
    if notes:
        update_data["notes"] = notes
    
    # Set specific timestamps based on status
    if status == "ON_THE_WAY":
        update_data["departed_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "SCHEDULED":
        update_data["scheduled_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "RESCHEDULED":
        update_data["rescheduled_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "DISPATCHED":
        update_data["dispatch_date"] = datetime.now(timezone.utc).isoformat()
    elif status == "DELIVERED":
        update_data["delivery_date"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.transport_outward.update_one(
        {"id": transport_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transport record not found")
    
    # Create notifications for key status changes
    if status in ["ON_THE_WAY", "DISPATCHED", "DELIVERED"]:
        transport = await db.transport_outward.find_one({"id": transport_id}, {"_id": 0})
        if transport:
            notification_messages = {
                "ON_THE_WAY": f"Transport {transport.get('transport_number')} is on the way",
                "DISPATCHED": f"Transport {transport.get('transport_number')} has been dispatched",
                "DELIVERED": f"Transport {transport.get('transport_number')} has been delivered"
            }
            await create_notification(
                event_type="TRANSPORT_STATUS_UPDATED",
                title=f"Transport {status.replace('_', ' ').title()}",
                message=notification_messages.get(status, f"Transport status updated to {status}"),
                link="/transport-operations",
                target_roles=["admin", "transport", "shipping"],
                notification_type="info"
            )
    
    return {"success": True, "message": f"Transport operation status updated to {status}"}

# ==================== TRANSPORT BOOKING ENDPOINTS ====================

@api_router.post("/transport/inward/book")
async def book_transport_inward_exw(data: dict, current_user: dict = Depends(get_current_user)):
    """Book transport for EXW purchase orders"""
    po_id = data.get("po_id")
    if not po_id:
        raise HTTPException(status_code=400, detail="PO ID is required")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    # Create transport inward record
    transport_number = await generate_sequence("TIN", "transport_inward")
    transport_data = {
        "id": str(uuid.uuid4()),
        "transport_number": transport_number,
        "po_id": po_id,
        "po_number": po.get("po_number", ""),
        "supplier_name": po.get("supplier_name", ""),
        "incoterm": po.get("incoterm", "EXW"),
        "source": "PO_EXW",
        "transporter": data.get("transporter", ""),
        "transporter_name": data.get("transporter", ""),  # Ensure transporter_name is set
        "vehicle_type": data.get("vehicle_type", ""),
        "vehicle_number": data.get("vehicle_number", ""),
        "driver_name": data.get("driver_name", ""),
        "driver_phone": data.get("driver_phone", ""),
        "driver_contact": data.get("driver_phone", ""),  # Ensure driver_contact is set
        "pickup_date": data.get("pickup_date", ""),
        "eta": data.get("eta", ""),
        "delivery_date": data.get("delivery_date") or po.get("delivery_date", ""),  # Get delivery date from form or PO
        "transport_charges": data.get("transport_charges"),  # Save transport charges
        "delivery_note_number": data.get("delivery_note_number", ""),  # Save delivery note number
        "delivery_note_document": data.get("delivery_note_document", ""),  # Save delivery note document path/ID
        "status": "PENDING",  # Set to PENDING so it can be marked as IN_TRANSIT
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.transport_inward.insert_one(transport_data)
    
    # Update PO with transport booking
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "transport_number": transport_number,
            "transport_booked": True,
            "transport_status": "BOOKED"
        }}
    )
    
    return {"success": True, "transport_number": transport_number, "message": "Transport booked successfully"}

@api_router.post("/transport/inward/book-import")
async def book_transport_inward_import(data: dict, current_user: dict = Depends(get_current_user)):
    """Book transport for import shipments"""
    import_id = data.get("import_id")
    if not import_id:
        raise HTTPException(status_code=400, detail="Import ID is required")
    
    import_record = await db.imports.find_one({"id": import_id}, {"_id": 0})
    if not import_record:
        raise HTTPException(status_code=404, detail="Import record not found")
    
    # Create transport inward record
    transport_number = await generate_sequence("TIN", "transport_inward")
    transport_data = {
        "id": str(uuid.uuid4()),
        "transport_number": transport_number,
        "import_id": import_id,
        "import_number": import_record.get("import_number", ""),
        "po_id": import_record.get("po_id", ""),
        "po_number": import_record.get("po_number", ""),
        "supplier_name": import_record.get("supplier_name", ""),
        "incoterm": import_record.get("incoterm", "FOB"),
        "source": "IMPORT",
        "transporter": data.get("transporter", ""),
        "transporter_name": data.get("transporter", ""),  # Ensure transporter_name is set
        "vehicle_type": data.get("vehicle_type", ""),
        "vehicle_number": data.get("vehicle_number", ""),
        "driver_name": data.get("driver_name", ""),
        "driver_phone": data.get("driver_phone", ""),
        "driver_contact": data.get("driver_phone", ""),  # Ensure driver_contact is set
        "pickup_date": data.get("pickup_date", ""),
        "eta": data.get("eta", ""),
        "delivery_date": data.get("delivery_date") or import_record.get("delivery_date", ""),  # Get delivery date from form or import record
        "transport_charges": data.get("transport_charges"),  # Save transport charges
        "delivery_note_number": data.get("delivery_note_number", ""),  # Save delivery note number
        "delivery_note_document": data.get("delivery_note_document", ""),  # Save delivery note document path/ID
        "status": "PENDING",  # Set to PENDING so it can be marked as IN_TRANSIT
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.transport_inward.insert_one(transport_data)
    
    # Update import with transport booking
    await db.imports.update_one(
        {"id": import_id},
        {"$set": {
            "transport_number": transport_number,
            "transport_booked": True,
            "transport_status": "BOOKED"
        }}
    )
    
    return {"success": True, "transport_number": transport_number, "message": "Transport booked successfully"}

@api_router.post("/transport/outward/book")
async def book_transport_outward(data: dict, current_user: dict = Depends(get_current_user)):
    """Book transport for dispatch/job orders"""
    job_id = data.get("job_id") or data.get("job_order_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="Job ID is required")
    
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Get transport type from data or determine from job
    transport_type = data.get("transport_type", "LOCAL")
    
    # Get quantity from request in MT (allows partial bookings - multiple transports for the same job)
    booking_quantity_mt = data.get("quantity")
    if booking_quantity_mt is None or booking_quantity_mt == "":
        # If no quantity provided, use job order total_weight_mt
        booking_quantity_mt = job.get("total_weight_mt", 0)
    else:
        try:
            booking_quantity_mt = float(booking_quantity_mt)
            if booking_quantity_mt <= 0:
                raise HTTPException(status_code=400, detail="Booking quantity must be greater than 0")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Invalid quantity value: {booking_quantity_mt}")
    
    # Validate quantity doesn't exceed job order total_weight_mt
    job_total_weight_mt = job.get("total_weight_mt", 0)
    if booking_quantity_mt > job_total_weight_mt:
        raise HTTPException(status_code=400, detail=f"Booking quantity ({booking_quantity_mt} MT) cannot exceed job order total weight ({job_total_weight_mt} MT)")
    
    # Check if transport already exists for this job (e.g., auto-created from CRO for export containers)
    existing_transport = await db.transport_outward.find_one({
        "job_order_id": job_id,
        "transport_type": transport_type,
        "status": "PENDING"
    }, {"_id": 0})
    
    if existing_transport:
        # Update existing transport record with booking details
        transport_number = existing_transport.get("transport_number")
        transport_id = existing_transport.get("id")
        
        update_data = {
            "transporter_name": data.get("transporter_name") or data.get("transporter", ""),
            "vehicle_number": data.get("vehicle_number", ""),
            "vehicle_type": data.get("vehicle_type", ""),
            "driver_name": data.get("driver_name", ""),
            "driver_contact": data.get("driver_contact") or data.get("driver_phone", ""),
            "scheduled_date": data.get("scheduled_date") or data.get("pickup_date", ""),
            "delivery_date": data.get("delivery_date") or data.get("expected_delivery", ""),
            "notes": data.get("notes", ""),
            "transport_charges": data.get("transport_charges"),
            "delivery_order_number": data.get("delivery_order_number"),
            "delivery_order_document": data.get("delivery_order_document"),
            "source": "TRANSPORT_PLANNER",  # Update source to indicate it's been booked through planner
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"]
        }
        
        # Only update quantity if provided (don't overwrite CRO-created quantity)
        if data.get("quantity") is not None and data.get("quantity") != "":
            update_data["quantity"] = booking_quantity_mt
            update_data["unit"] = "MT"
        
        await db.transport_outward.update_one(
            {"id": transport_id},
            {"$set": update_data}
        )
        
        transport_data = {**existing_transport, **update_data}
    else:
        # Create new transport outward record
        transport_number = await generate_sequence("TOUT", "transport_outward")
        transport_id = str(uuid.uuid4())
        transport_data = {
            "id": transport_id,
            "transport_number": transport_number,
            "job_order_id": job_id,
            "job_number": job.get("job_number", ""),
            "customer_name": job.get("customer_name", ""),
            "product_name": job.get("product_name", ""),
            "quantity": booking_quantity_mt,  # Use booking quantity in MT (allows partial bookings)
            "unit": "MT",  # Always use MT for transport bookings
            "packaging": job.get("packaging", ""),
            "transporter_name": data.get("transporter_name") or data.get("transporter", ""),
            "vehicle_number": data.get("vehicle_number", ""),
            "vehicle_type": data.get("vehicle_type", ""),
            "driver_name": data.get("driver_name", ""),
            "driver_contact": data.get("driver_contact") or data.get("driver_phone", ""),
            "scheduled_date": data.get("scheduled_date") or data.get("pickup_date", ""),
            "delivery_date": data.get("delivery_date") or data.get("expected_delivery", ""),
            "transport_type": transport_type,
            "incoterm": job.get("incoterm", ""),
            "notes": data.get("notes", ""),
            "transport_charges": data.get("transport_charges"),  # Save transport charges
            "delivery_order_number": data.get("delivery_order_number"),  # Save delivery order number
            "delivery_order_document": data.get("delivery_order_document"),  # Save delivery order document path
            "status": "PENDING",  # Set to PENDING so it can be marked as LOADING/DISPATCHED
            "source": "TRANSPORT_PLANNER",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }
        
        await db.transport_outward.insert_one(transport_data)
    
    # Update job with transport booking
    await db.job_orders.update_one(
        {"id": job_id},
        {"$set": {
            "transport_outward_id": transport_data["id"],
            "transport_number": transport_number,
            "transport_booked": True,
            "transport_status": "BOOKED"
        }}
    )
    
    # Create notification for transport booking
    await create_notification(
        event_type="TRANSPORT_BOOKING_REQUIRED",
        title=f"Transport Booked: {transport_number}",
        message=f"Transport {transport_number} booked for job {job.get('job_number', '')} - Quantity: {booking_quantity_mt:.2f} MT",
        link="/transport-window",
        ref_type="TRANSPORT_OUTWARD",
        ref_id=transport_data["id"],
        target_roles=["admin", "transport", "dispatch", "warehouse"],
        notification_type="success"
    )
    
    return {"success": True, "transport_number": transport_number, "message": "Transport booked successfully"}

@api_router.post("/transport/check-unbooked")
async def check_unbooked_transports(current_user: dict = Depends(get_current_user)):
    """Check for unbooked transports (EXW POs, Imports, Dispatch Jobs)"""
    # Get EXW POs without transport
    exw_pos = await db.purchase_orders.find(
        {
            "incoterm": "EXW",
            "status": {"$in": ["APPROVED", "CONFIRMED"]},
            "$or": [
                {"transport_booked": {"$ne": True}},
                {"transport_number": {"$exists": False}},
                {"transport_number": None}
            ]
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Get imports without transport
    unbooked_imports = await db.imports.find(
        {
            "status": {"$ne": "COMPLETED"},
            "$or": [
                {"transport_booked": {"$ne": True}},
                {"transport_number": {"$exists": False}},
                {"transport_number": None}
            ]
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Get jobs ready for dispatch without transport
    unbooked_jobs = await db.job_orders.find(
        {
            "status": "ready_for_dispatch",
            "$or": [
                {"transport_booked": {"$ne": True}},
                {"transport_outward_id": {"$exists": False}},
                {"transport_outward_id": None}
            ]
        },
        {"_id": 0}
    ).to_list(1000)
    
    return {
        "exw_pos": exw_pos,
        "imports": unbooked_imports,
        "dispatch_jobs": unbooked_jobs,
        "total_unbooked": len(exw_pos) + len(unbooked_imports) + len(unbooked_jobs)
    }

@api_router.get("/transport/dispatch-analytics")
async def get_dispatch_analytics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get dispatch analytics data for the transport planner"""
    from collections import defaultdict
    
    # Build query with date range
    query = {}
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query["created_at"] = {"$gte": start_dt.isoformat()}
        except:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "created_at" in query:
                query["created_at"]["$lte"] = end_dt.isoformat()
            else:
                query["created_at"] = {"$lte": end_dt.isoformat()}
        except:
            pass
    
    # Get all outward transport records
    records = await db.transport_outward.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich records with job order data
    for record in records:
        if record.get("job_order_id") or record.get("job_id"):
            job_id = record.get("job_order_id") or record.get("job_id")
            job_order = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
            if job_order:
                items = job_order.get("items", [])
                if not items and job_order.get("product_name"):
                    items = [{
                        "product_name": job_order.get("product_name"),
                        "quantity": job_order.get("quantity", 0),
                        "packaging": job_order.get("packaging", "Bulk")
                    }]
                record["job_items"] = items
                total_qty = sum(item.get("quantity", 0) for item in items)
                record["total_quantity"] = total_qty
                record["delivery_date"] = job_order.get("delivery_date")
                record["unit"] = job_order.get("unit", "KG")
                record["packaging"] = job_order.get("packaging") or record.get("packaging", "units")
    
    # Calculate summary statistics
    total_dispatches = len(records)
    total_quantity = sum(r.get("total_quantity", r.get("quantity", 0)) for r in records)
    
    # Calculate date range
    if records:
        dates = [datetime.fromisoformat(r.get("created_at", r.get("dispatch_date", "")).replace('Z', '+00:00')) for r in records if r.get("created_at") or r.get("dispatch_date")]
        if dates:
            min_date = min(dates)
            max_date = max(dates)
            days_diff = (max_date - min_date).days + 1
            average_per_day = total_quantity / days_diff if days_diff > 0 else 0
        else:
            min_date = datetime.now(timezone.utc)
            max_date = datetime.now(timezone.utc)
            average_per_day = 0
    else:
        min_date = datetime.now(timezone.utc)
        max_date = datetime.now(timezone.utc)
        average_per_day = 0
    
    # Group by day for daily volumes
    daily_volumes = defaultdict(lambda: {"date": "", "quantity": 0, "count": 0})
    for record in records:
        date_str = record.get("dispatch_date") or record.get("created_at", "")
        if date_str:
            try:
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                date_key = date_obj.date().isoformat()
                daily_volumes[date_key]["date"] = date_key
                daily_volumes[date_key]["quantity"] += record.get("total_quantity", record.get("quantity", 0))
                daily_volumes[date_key]["count"] += 1
            except:
                pass
    
    daily_volumes_list = sorted([v for v in daily_volumes.values()], key=lambda x: x["date"])
    
    # Group by product
    product_volumes = defaultdict(lambda: {"product": "", "quantity": 0, "count": 0})
    for record in records:
        product_name = record.get("product_name", "Unknown")
        if record.get("job_items"):
            for item in record.get("job_items", []):
                item_product = item.get("product_name", product_name)
                product_volumes[item_product]["product"] = item_product
                product_volumes[item_product]["quantity"] += item.get("quantity", 0)
                product_volumes[item_product]["count"] += 1
        else:
            product_volumes[product_name]["product"] = product_name
            product_volumes[product_name]["quantity"] += record.get("total_quantity", record.get("quantity", 0))
            product_volumes[product_name]["count"] += 1
    
    product_volumes_list = sorted([v for v in product_volumes.values()], key=lambda x: x["quantity"], reverse=True)
    
    # Group by customer
    customer_volumes = defaultdict(lambda: {"customer": "", "quantity": 0, "count": 0})
    for record in records:
        customer_name = record.get("customer_name", "Unknown")
        customer_volumes[customer_name]["customer"] = customer_name
        customer_volumes[customer_name]["quantity"] += record.get("total_quantity", record.get("quantity", 0))
        customer_volumes[customer_name]["count"] += 1
    
    customer_volumes_list = sorted([v for v in customer_volumes.values()], key=lambda x: x["quantity"], reverse=True)
    
    # Prepare timeline data for Gantt chart
    timeline_data = []
    for record in records:
        dispatch_date = record.get("dispatch_date") or record.get("created_at", "")
        if dispatch_date:
            timeline_data.append({
                "transport_number": record.get("transport_number", ""),
                "job_number": record.get("job_number", ""),
                "product_name": record.get("product_name", "Unknown"),
                "quantity": record.get("total_quantity", record.get("quantity", 0)),
                "status": record.get("status", "PENDING"),
                "customer_name": record.get("customer_name", "Unknown"),
                "dispatch_date": dispatch_date,
                "packaging": record.get("packaging", "units")
            })
    
    timeline_data.sort(key=lambda x: x.get("dispatch_date", ""))
    
    return {
        "summary": {
            "total_dispatches": total_dispatches,
            "total_quantity": total_quantity,
            "average_per_day": round(average_per_day, 2),
            "date_range": {
                "start": min_date.isoformat(),
                "end": max_date.isoformat()
            }
        },
        "daily_volumes": daily_volumes_list,
        "product_volumes": product_volumes_list,
        "customer_volumes": customer_volumes_list,
        "timeline_data": timeline_data
    }


# ==================== PHASE 1: IMPORT WINDOW ====================

class ImportRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    import_number: str = ""
    po_id: str
    po_number: str
    supplier_name: str
    incoterm: str
    country_of_origin: str = ""
    destination_port: str = ""
    eta: Optional[str] = None
    actual_arrival: Optional[str] = None
    status: str = "PENDING_DOCS"  # PENDING_DOCS, IN_TRANSIT, AT_PORT, CLEARED, COMPLETED
    document_checklist: List[Dict] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def get_default_import_checklist():
    return [
        {"type": "COMMERCIAL_INVOICE", "name": "Commercial Invoice", "required": True, "received": False},
        {"type": "PACKING_LIST", "name": "Packing List", "required": True, "received": False},
        {"type": "BILL_OF_LADING", "name": "Bill of Lading (B/L)", "required": True, "received": False},
        {"type": "CERTIFICATE_OF_ORIGIN", "name": "Certificate of Origin (COO)", "required": True, "received": False},
        {"type": "CERTIFICATE_OF_ANALYSIS", "name": "Certificate of Analysis (COA)", "required": True, "received": False},
        {"type": "INSURANCE_CERT", "name": "Insurance Certificate", "required": False, "received": False},
        {"type": "PHYTO_CERT", "name": "Phytosanitary Certificate", "required": False, "received": False},
        {"type": "MSDS", "name": "Material Safety Data Sheet", "required": False, "received": False},
    ]


@api_router.get("/imports")
async def get_imports(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get import records"""
    query = {}
    if status:
        query["status"] = status
    records = await db.imports.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Normalize document_checklist to object format for frontend compatibility
    # and enrich with PO items/products
    for record in records:
        checklist = record.get("document_checklist", [])
        if isinstance(checklist, list):
            # Convert array format to object format for easier frontend access
            checklist_obj = {}
            for doc in checklist:
                doc_key = doc.get("key")
                if not doc_key:
                    # Try to infer key from type
                    type_to_key = {
                        "DELIVERY_ORDER": "delivery_order",
                        "BILL_OF_LADING": "bill_of_lading",
                        "EPDA": "epda",
                        "SIRA": "sira"
                    }
                    doc_key = type_to_key.get(doc.get("type", ""), doc.get("type", "").lower())
                if doc_key:
                    checklist_obj[doc_key] = doc.get("received", False)
            # Keep both formats for compatibility
            record["document_checklist"] = checklist_obj
        
        # Enrich with PO lines/products if po_id exists
        if record.get("po_id"):
            po = await db.purchase_orders.find_one({"id": record["po_id"]}, {"_id": 0})
            if po:
                # Get PO lines from purchase_order_lines collection
                po_lines = await db.purchase_order_lines.find({"po_id": record["po_id"]}, {"_id": 0}).to_list(1000)
                record["lines"] = po_lines
                
                # Also include legacy po_items for backward compatibility
                record["po_items"] = [{"product_name": line.get("item_name"), "quantity": line.get("qty"), "unit": line.get("uom")} for line in po_lines]
                
                # Calculate total quantity from lines
                total_qty = sum(line.get("qty", 0) for line in po_lines)
                record["total_quantity"] = total_qty
                
                # Get unit from first line (assuming all lines have same UOM)
                if po_lines and len(po_lines) > 0:
                    record["total_uom"] = po_lines[0].get("uom", "KG")
                    record["total_unit"] = po_lines[0].get("uom", "KG")  # Legacy field
                
                # Get product/item names summary from lines
                product_names = [line.get("item_name", "Unknown") for line in po_lines if line.get("item_name")]
                record["products_summary"] = ", ".join(product_names[:3])  # First 3 products
                if len(product_names) > 3:
                    record["products_summary"] += f" (+{len(product_names) - 3} more)"
        
        # Ensure container_count and drum_count fields exist (default to None if not present)
        if "container_count" not in record:
            record["container_count"] = None
        if "drum_count" not in record:
            record["drum_count"] = None
    
    return records


@api_router.post("/imports")
async def create_import(data: dict, current_user: dict = Depends(get_current_user)):
    """Create import record from PO"""
    import_number = await generate_sequence("IMP", "imports")
    record = ImportRecord(
        import_number=import_number,
        document_checklist=get_default_import_checklist(),
        **data
    )
    await db.imports.insert_one(record.model_dump())
    return record


@api_router.put("/imports/{import_id}/checklist")
async def update_import_checklist(import_id: str, checklist: List[Dict], current_user: dict = Depends(get_current_user)):
    """Update import document checklist"""
    result = await db.imports.update_one(
        {"id": import_id},
        {"$set": {"document_checklist": checklist}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Import record not found")
    return {"success": True, "message": "Checklist updated"}


@api_router.put("/imports/{import_id}/document")
async def update_import_document(import_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a specific document in the import checklist"""
    document_key = data.get("document_key")
    checked = data.get("checked", False)
    
    if not document_key:
        raise HTTPException(status_code=400, detail="document_key is required")
    
    # Get the import record
    import_record = await db.imports.find_one({"id": import_id}, {"_id": 0})
    if not import_record:
        raise HTTPException(status_code=404, detail="Import record not found")
    
    # Map frontend document keys to backend document types
    document_type_map = {
        "delivery_order": "DELIVERY_ORDER",
        "bill_of_lading": "BILL_OF_LADING",
        "epda": "EPDA",
        "sira": "SIRA"
    }
    
    doc_type = document_type_map.get(document_key, document_key.upper())
    
    # Update or initialize document_checklist
    checklist = import_record.get("document_checklist", [])
    
    # Handle case where checklist is an object (convert to array)
    if isinstance(checklist, dict):
        checklist = []
        for key, value in import_record.get("document_checklist", {}).items():
            type_map = {
                "delivery_order": "DELIVERY_ORDER",
                "bill_of_lading": "BILL_OF_LADING",
                "epda": "EPDA",
                "sira": "SIRA"
            }
            checklist.append({
                "type": type_map.get(key, key.upper()),
                "key": key,
                "name": key.replace("_", " ").title(),
                "required": True,
                "received": bool(value)
            })
    
    # Ensure checklist is a list
    if not isinstance(checklist, list):
        checklist = []
    
    # Find existing document or create new one
    doc_found = False
    for doc in checklist:
        if doc.get("type") == doc_type or doc.get("key") == document_key:
            doc["received"] = checked
            if checked:
                doc["received_at"] = datetime.now(timezone.utc).isoformat()
            else:
                doc.pop("received_at", None)
            doc_found = True
            break
    
    # If document not found, add it
    if not doc_found:
        doc_name_map = {
            "delivery_order": "Delivery Order",
            "bill_of_lading": "Bill of Lading",
            "epda": "EPDA",
            "sira": "SIRA"
        }
        checklist.append({
            "type": doc_type,
            "key": document_key,
            "name": doc_name_map.get(document_key, document_key.replace("_", " ").title()),
            "required": True,
            "received": checked,
            "received_at": datetime.now(timezone.utc).isoformat() if checked else None
        })
    
    # Update the import record
    result = await db.imports.update_one(
        {"id": import_id},
        {"$set": {"document_checklist": checklist}}
    )
    
    # Check if all required documents are received and update status
    all_received = all(doc.get("received", False) for doc in checklist if doc.get("required", False))
    if all_received and import_record.get("status") == "PENDING_DOCS":
        await db.imports.update_one(
            {"id": import_id},
            {"$set": {"status": "PENDING"}}
        )
    
    return {"success": True, "message": "Document updated"}


@api_router.post("/imports/{import_id}/move-to-transport")
async def move_import_to_transport(import_id: str, current_user: dict = Depends(get_current_user)):
    """Move import to transport window after customs clearance"""
    import_record = await db.imports.find_one({"id": import_id}, {"_id": 0})
    if not import_record:
        raise HTTPException(status_code=404, detail="Import record not found")
    
    # Update import status to COMPLETED
    await db.imports.update_one(
        {"id": import_id},
        {"$set": {
            "status": "COMPLETED",
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create transport inward record
    transport_number = await generate_sequence("TIN", "transport_inward")
    transport = TransportInward(
        transport_number=transport_number,
        po_id=import_record.get("po_id"),
        po_number=import_record.get("po_number"),
        supplier_name=import_record.get("supplier_name"),
        incoterm=import_record.get("incoterm"),
        source="IMPORT",
        status="PENDING"
    )
    await db.transport_inward.insert_one(transport.model_dump())
    
    # Create notification
    await create_notification(
        event_type="IMPORT_COMPLETED",
        title="Import Moved to Transport",
        message=f"Import {import_record.get('import_number')} has been moved to Transport Window",
        link="/transport-window",
        target_roles=["admin", "transport"],
        notification_type="success"
    )
    
    return {"success": True, "message": "Import moved to transport window", "transport_number": transport_number}


@api_router.put("/imports/{import_id}/status")
async def update_import_status(import_id: str, status: str, current_user: dict = Depends(get_current_user)):
    """Update import status"""
    update_data = {"status": status}
    if status == "AT_PORT":
        update_data["actual_arrival"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.imports.update_one(
        {"id": import_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Import record not found")
    
    # If completed, create inward transport
    if status == "COMPLETED":
        import_record = await db.imports.find_one({"id": import_id}, {"_id": 0})
        if import_record:
            # Auto-create transport inward record
            transport_number = await generate_sequence("TIN", "transport_inward")
            transport = TransportInward(
                transport_number=transport_number,
                po_id=import_record.get("po_id"),
                po_number=import_record.get("po_number"),
                supplier_name=import_record.get("supplier_name"),
                incoterm=import_record.get("incoterm"),
                source="IMPORT"
            )
            await db.transport_inward.insert_one(transport.model_dump())
            
            await create_notification(
                event_type="IMPORT_COMPLETED",
                title="Import Customs Cleared",
                message=f"Import {import_record.get('import_number')} cleared - Transport scheduled",
                link="/transport-window",
                target_roles=["admin", "transport"],
                notification_type="success"
            )
    
    return {"success": True, "message": f"Import status updated to {status}"}


# ==================== PHASE 1: UNIFIED PRODUCTION SCHEDULE ====================

@api_router.get("/production/unified-schedule")
async def get_unified_production_schedule(
    start_date: Optional[str] = None,
    days: int = 14,
    current_user: dict = Depends(get_current_user)
):
    """
    Get unified production schedule with 600 drums/day constraint.
    Combines drum schedule and production schedule into one view.
    """
    if not start_date:
        start_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    DRUMS_PER_DAY = 600
    
    # Get all pending/approved job orders
    job_orders = await db.job_orders.find(
        {"status": {"$in": ["pending", "approved", "in_production"]}},
        {"_id": 0}
    ).sort("delivery_date", 1).to_list(1000)
    
    # Build schedule day by day
    schedule = []
    current_date = datetime.strptime(start_date, "%Y-%m-%d")
    remaining_jobs = list(job_orders)
    
    for day_offset in range(days):
        day_date = current_date + timedelta(days=day_offset)
        day_str = day_date.strftime("%Y-%m-%d")
        
        day_schedule = {
            "date": day_str,
            "day_name": day_date.strftime("%A"),
            "drums_capacity": DRUMS_PER_DAY,
            "drums_scheduled": 0,
            "drums_remaining": DRUMS_PER_DAY,
            "jobs": [],
            "is_full": False,
            "utilization": 0
        }
        
        # Allocate jobs to this day
        jobs_to_remove = []
        for job in remaining_jobs:
            job_drums = job.get("quantity", 0)
            
            # Check if job fits in day's capacity
            if day_schedule["drums_remaining"] >= job_drums:
                # Check material availability
                material_status = await check_job_material_availability(job)
                
                day_schedule["jobs"].append({
                    "job_number": job.get("job_number"),
                    "job_id": job.get("id"),
                    "product_id": job.get("product_id"),
                    "product_name": job.get("product_name"),
                    "product_sku": job.get("product_sku"),
                    "quantity": job_drums,
                    "packaging": job.get("packaging", "200L Drum"),
                    "delivery_date": job.get("delivery_date"),
                    "priority": job.get("priority", "normal"),
                    "material_ready": material_status["ready"],
                    "shortage_items": material_status.get("shortage_count", 0),
                    "status": job.get("status")
                })
                
                day_schedule["drums_scheduled"] += job_drums
                day_schedule["drums_remaining"] -= job_drums
                jobs_to_remove.append(job)
            elif day_schedule["drums_remaining"] > 0:
                # Partial allocation - split job across days
                partial_drums = day_schedule["drums_remaining"]
                material_status = await check_job_material_availability(job)
                
                day_schedule["jobs"].append({
                    "job_number": job.get("job_number"),
                    "job_id": job.get("id"),
                    "product_id": job.get("product_id"),
                    "product_name": job.get("product_name"),
                    "product_sku": job.get("product_sku"),
                    "quantity": partial_drums,
                    "packaging": job.get("packaging", "200L Drum"),
                    "delivery_date": job.get("delivery_date"),
                    "priority": job.get("priority", "normal"),
                    "material_ready": material_status["ready"],
                    "shortage_items": material_status.get("shortage_count", 0),
                    "status": job.get("status"),
                    "is_partial": True,
                    "total_quantity": job_drums
                })
                
                day_schedule["drums_scheduled"] += partial_drums
                day_schedule["drums_remaining"] = 0
                
                # Update remaining quantity in job
                job["quantity"] = job_drums - partial_drums
                break
        
        # Remove fully allocated jobs
        for job in jobs_to_remove:
            remaining_jobs.remove(job)
        
        day_schedule["is_full"] = day_schedule["drums_remaining"] == 0
        day_schedule["utilization"] = round((day_schedule["drums_scheduled"] / DRUMS_PER_DAY) * 100, 1)
        schedule.append(day_schedule)
    
    # Summary stats
    total_drums = sum(d["drums_scheduled"] for d in schedule)
    jobs_scheduled = sum(len(d["jobs"]) for d in schedule)
    unscheduled_jobs = len(remaining_jobs)
    
    return {
        "schedule": schedule,
        "summary": {
            "total_drums_scheduled": total_drums,
            "jobs_scheduled": jobs_scheduled,
            "unscheduled_jobs": unscheduled_jobs,
            "days_with_capacity": len([d for d in schedule if not d["is_full"]]),
            "average_utilization": round(sum(d["utilization"] for d in schedule) / len(schedule), 1) if schedule else 0
        },
        "constraints": {
            "drums_per_day": DRUMS_PER_DAY
        }
    }


async def check_job_material_availability(job: dict) -> dict:
    """Check if all materials are available for a job"""
    product_id = job.get("product_id")
    quantity = job.get("quantity", 0)
    
    shortage_count = 0
    
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
            
            # Assume 200kg per drum
            finished_kg = quantity * 200
            required_qty = finished_kg * qty_per_kg
            
            balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
            available = (balance.get("on_hand", 0) - balance.get("reserved", 0)) if balance else 0
            
            if available < required_qty:
                shortage_count += 1
    
    return {
        "ready": shortage_count == 0,
        "shortage_count": shortage_count
    }


# ==================== INCOTERM ROUTING ON PO APPROVAL ====================

@api_router.put("/purchase-orders/{po_id}/route-by-incoterm")
async def route_po_by_incoterm(po_id: str, current_user: dict = Depends(get_current_user)):
    """
    Route PO to appropriate window based on incoterm:
    - EXW → Transportation Window (Inward)
    - DDP → Security & QC Module
    - FOB → Shipping Module  
    - CFR → Import Window
    """
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    incoterm = po.get("incoterm", "EXW").upper()
    route_result = {"po_id": po_id, "incoterm": incoterm, "routed_to": None}
    
    if incoterm == "EXW":
        # Route to Transportation Window (Inward)
        transport_number = await generate_sequence("TIN", "transport_inward")
        transport = TransportInward(
            transport_number=transport_number,
            po_id=po_id,
            po_number=po.get("po_number"),
            supplier_name=po.get("supplier_name"),
            incoterm=incoterm,
            source="EXW"
        )
        await db.transport_inward.insert_one(transport.model_dump())
        route_result["routed_to"] = "TRANSPORTATION_INWARD"
        route_result["transport_number"] = transport_number
        
    elif incoterm == "DDP":
        # Route to Security & QC
        checklist_number = await generate_sequence("SEC", "security_checklists")
        checklist = {
            "id": str(uuid.uuid4()),
            "checklist_number": checklist_number,
            "ref_type": "PO",
            "ref_id": po_id,
            "ref_number": po.get("po_number"),
            "supplier_name": po.get("supplier_name"),
            "checklist_type": "INWARD",
            "status": "PENDING",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.security_checklists.insert_one(checklist)
        route_result["routed_to"] = "SECURITY_QC"
        route_result["checklist_number"] = checklist_number
        
    elif incoterm == "FOB":
        # Route to Shipping Module (Buyer books shipping for FOB)
        shipping_number = await generate_sequence("SHP", "shipping_bookings")
        shipping = {
            "id": str(uuid.uuid4()),
            "booking_number": shipping_number,
            "job_order_ids": [],  # Empty for PO imports
            "customer_name": po.get("supplier_name", ""),  # Supplier for imports
            "port_of_loading": po.get("port_of_loading", ""),
            "port_of_discharge": po.get("port_of_discharge", ""),
            "ref_type": "PO_IMPORT",
            "ref_id": po_id,
            "po_number": po.get("po_number"),
            "supplier_name": po.get("supplier_name"),
            "incoterm": incoterm,
            "status": "PENDING",
            "booking_source": "SELLER",  # Seller (buyer's company) books for FOB imports
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.shipping_bookings.insert_one(shipping)
        route_result["routed_to"] = "SHIPPING"
        route_result["booking_number"] = shipping_number
        
    elif incoterm in ["CFR", "CIF", "CIP"]:
        # Route to Import Window
        import_number = await generate_sequence("IMP", "imports")
        import_record = ImportRecord(
            import_number=import_number,
            po_id=po_id,
            po_number=po.get("po_number"),
            supplier_name=po.get("supplier_name"),
            incoterm=incoterm,
            document_checklist=get_default_import_checklist()
        )
        await db.imports.insert_one(import_record.model_dump())
        route_result["routed_to"] = "IMPORT"
        route_result["import_number"] = import_number
    
    else:
        # Default to EXW behavior
        transport_number = await generate_sequence("TIN", "transport_inward")
        transport = TransportInward(
            transport_number=transport_number,
            po_id=po_id,
            po_number=po.get("po_number"),
            supplier_name=po.get("supplier_name"),
            incoterm=incoterm,
            source="OTHER"
        )
        await db.transport_inward.insert_one(transport.model_dump())
        route_result["routed_to"] = "TRANSPORTATION_INWARD"
        route_result["transport_number"] = transport_number
    
    # Update PO with routing info
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {
            "routed_to": route_result["routed_to"],
            "routed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return route_result


# ==================== MATERIAL SHORTAGE ENDPOINTS ====================

@api_router.get("/material-shortages")
async def get_material_shortages(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get material shortages for RFQ creation"""
    query = {}
    if status:
        query["status"] = status
    shortages = await db.material_shortages.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return shortages


@api_router.put("/material-shortages/{shortage_id}/link-rfq")
async def link_shortage_to_rfq(shortage_id: str, rfq_id: str, current_user: dict = Depends(get_current_user)):
    """Link a material shortage to an RFQ"""
    result = await db.material_shortages.update_one(
        {"id": shortage_id},
        {"$set": {"rfq_id": rfq_id, "status": "IN_RFQ"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Shortage not found")
    return {"success": True, "message": "Shortage linked to RFQ"}


# ==================== PHASE 2: QC & SECURITY MODULE ====================

# Security Checklist Models
class SecurityChecklistCreate(BaseModel):
    ref_type: str  # INWARD, OUTWARD
    ref_id: str  # transport_inward_id or job_order_id
    ref_number: str
    checklist_type: str  # INWARD or OUTWARD
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_license: Optional[str] = None
    seal_number: Optional[str] = None
    gross_weight: Optional[float] = None
    tare_weight: Optional[float] = None
    net_weight: Optional[float] = None
    notes: Optional[str] = None
    arrival_time: Optional[str] = None
    arrival_quantity: Optional[float] = None
    transport_company: Optional[str] = None
    discharge_checklist_items: Optional[Dict[str, bool]] = None
    load_status: Optional[str] = None
    batch_number: Optional[str] = None
    loading_time: Optional[str] = None
    loading_checklist_items: Optional[Dict[str, bool]] = None

class SecurityChecklistUpdate(BaseModel):
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_license: Optional[str] = None
    seal_number: Optional[str] = None
    gross_weight: Optional[float] = None
    tare_weight: Optional[float] = None
    net_weight: Optional[float] = None
    container_number: Optional[str] = None
    checklist_items: Optional[Dict[str, bool]] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    arrival_time: Optional[str] = None
    arrival_quantity: Optional[float] = None
    transport_company: Optional[str] = None
    discharge_checklist_items: Optional[Dict[str, bool]] = None
    load_status: Optional[str] = None  # ASSIGNED, LOADED, APPROVED
    batch_number: Optional[str] = None
    loading_time: Optional[str] = None
    loading_checklist_items: Optional[Dict[str, bool]] = None

# QC Inspection Models
class QCInspectionCreate(BaseModel):
    ref_type: str  # INWARD, OUTWARD
    ref_id: str
    ref_number: str
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    supplier: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = []
    quantity: Optional[float] = None
    vehicle_number: Optional[str] = None
    po_number: Optional[str] = None
    sampling_size: Optional[str] = None
    arrival_quantity: Optional[float] = None
    sample_type: Optional[str] = None
    qc_parameters: Optional[List[Dict[str, Any]]] = None
    security_checklist_id: Optional[str] = None

class QCInspectionUpdate(BaseModel):
    batch_number: Optional[str] = None
    test_results: Optional[Dict[str, Any]] = None
    specifications: Optional[Dict[str, Any]] = None
    passed: Optional[bool] = None
    coa_generated: Optional[bool] = None
    coa_number: Optional[str] = None
    inspector_notes: Optional[str] = None
    status: Optional[str] = None
    supplier: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    quantity: Optional[float] = None
    vehicle_number: Optional[str] = None
    po_number: Optional[str] = None
    sampling_size: Optional[str] = None
    arrival_quantity: Optional[float] = None
    sample_type: Optional[str] = None
    qc_parameters: Optional[List[Dict[str, Any]]] = None
    security_checklist_id: Optional[str] = None

# QC Parameter Models (for configurable QC testing parameters)
class QCParameter(BaseModel):
    id: str
    product_type: str  # SOLVENT, OIL, CHEMICAL, etc.
    parameter_name: str
    test_type: str  # PASS_FAIL, MEASUREMENT, VISUAL
    required: bool = True
    order: int = 0
    unit: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    description: Optional[str] = None
    created_at: str
    updated_at: str

class QCParameterCreate(BaseModel):
    product_type: str
    parameter_name: str
    test_type: str = "PASS_FAIL"
    required: bool = True
    order: int = 0
    unit: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    description: Optional[str] = None

class QCParameterUpdate(BaseModel):
    parameter_name: Optional[str] = None
    test_type: Optional[str] = None
    required: Optional[bool] = None
    order: Optional[int] = None
    unit: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    description: Optional[str] = None

# Quantity Claims Model (for tracking partial deliveries)
class QuantityClaim(BaseModel):
    id: str
    po_id: str
    po_number: str
    po_line_id: str
    product_name: str
    ordered_qty: float
    received_qty: float
    pending_qty: float
    claim_status: str  # PENDING_REVIEW, APPROVED, DISPUTED, RESOLVED
    supplier_name: str
    claim_reason: Optional[str] = None
    created_at: str
    updated_at: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None

# ==================== SECURITY ENDPOINTS ====================

@api_router.get("/security/dashboard")
async def get_security_dashboard(current_user: dict = Depends(get_current_user)):
    """Get security dashboard with 3 windows: Inward, Outward, and RFQ status"""
    
    # Inward transport pending security check
    inward_pending = await db.transport_inward.find(
        {"status": {"$in": ["PENDING", "IN_TRANSIT", "ARRIVED"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Outward dispatch pending security check
    outward_pending = await db.transport_outward.find(
        {"status": {"$in": ["PENDING", "LOADING"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Security checklists
    checklists = await db.security_checklists.find(
        {"status": {"$in": ["PENDING", "IN_PROGRESS"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {
        "inward_pending": inward_pending,
        "outward_pending": outward_pending,
        "checklists": checklists,
        "stats": {
            "inward_count": len(inward_pending),
            "outward_count": len(outward_pending),
            "pending_checklists": len(checklists)
        }
    }

@api_router.get("/security/inward")
async def get_security_inward(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get inward transports for security check"""
    query = {}
    if status:
        query["status"] = status
    
    # Get all fields including delivery_note_document
    inward = await db.transport_inward.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Enrich with security checklist status and product information
    for transport in inward:
        checklist = await db.security_checklists.find_one({
            "ref_type": "INWARD",
            "ref_id": transport["id"]
        }, {"_id": 0})
        transport["security_checklist"] = checklist
        
        # Enrich with PO items/product information
        if transport.get("po_id"):
            po = await db.purchase_orders.find_one({"id": transport["po_id"]}, {"_id": 0})
            if po:
                po_lines = await db.purchase_order_lines.find({"po_id": transport["po_id"]}, {"_id": 0}).to_list(100)
                if po_lines:
                    transport["po_items"] = po_lines
                    product_names = [line.get("item_name") or line.get("product_name", "Unknown") for line in po_lines]
                    transport["product_names"] = product_names
                    transport["products_summary"] = ", ".join(product_names[:3])
                    if len(product_names) > 3:
                        transport["products_summary"] += f" (+{len(product_names) - 3} more)"
    
    # Also include standalone security checklists for DDP POs (ref_type: "PO")
    po_checklist_query = {"ref_type": "PO", "checklist_type": "INWARD"}
    if status:
        # Map status filter to checklist status
        po_checklist_query["status"] = status
    else:
        # Only show non-completed checklists by default
        po_checklist_query["status"] = {"$ne": "COMPLETED"}
    
    po_checklists = await db.security_checklists.find(
        po_checklist_query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Convert PO checklists to transport-like format for frontend compatibility
    for checklist in po_checklists:
        po = await db.purchase_orders.find_one({"id": checklist["ref_id"]}, {"_id": 0})
        if po:
            # Try to get vehicle_type from related transport_inward if it exists
            vehicle_type = None
            transport_inward = await db.transport_inward.find_one(
                {"po_id": checklist["ref_id"]},
                {"_id": 0, "vehicle_type": 1}
            )
            if transport_inward:
                vehicle_type = transport_inward.get("vehicle_type")
            
            # Create a transport-like object from the PO checklist
            po_transport = {
                "id": checklist["id"],  # Use checklist ID as transport ID
                "transport_number": checklist.get("checklist_number", f"SEC-{checklist['ref_number']}"),
                "po_id": checklist["ref_id"],
                "po_number": checklist.get("ref_number", po.get("po_number")),
                "supplier_name": checklist.get("supplier_name", po.get("supplier_name")),
                "incoterm": po.get("incoterm", "DDP"),
                "source": "PO_DDP",
                "security_checklist": checklist,
                "created_at": checklist.get("created_at"),
                "vehicle_number": checklist.get("vehicle_number"),  # May be set later
                "vehicle_type": vehicle_type  # Include vehicle_type from transport_inward if available
            }
            
            # Enrich with PO items/product information
            po_lines = await db.purchase_order_lines.find({"po_id": checklist["ref_id"]}, {"_id": 0}).to_list(100)
            if po_lines:
                po_transport["po_items"] = po_lines
                product_names = [line.get("item_name") or line.get("product_name", "Unknown") for line in po_lines]
                po_transport["product_names"] = product_names
                po_transport["products_summary"] = ", ".join(product_names[:3])
                if len(product_names) > 3:
                    po_transport["products_summary"] += f" (+{len(product_names) - 3} more)"
            
            inward.append(po_transport)
    
    return inward

@api_router.get("/security/outward")
async def get_security_outward(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get outward transports for security check"""
    query = {}
    if status:
        query["status"] = status
    
    outward = await db.transport_outward.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Enrich with security checklist status and delivery date from job order
    for transport in outward:
        checklist = await db.security_checklists.find_one({
            "ref_type": "OUTWARD",
            "ref_id": transport["id"]
        }, {"_id": 0})
        transport["security_checklist"] = checklist
        
        # Fetch delivery_date and job_number from job order
        # Priority: Use transport's delivery_date (from booking modal) if exists, otherwise fall back to job_order's delivery_date
        if transport.get("job_order_id"):
            job = await db.job_orders.find_one({"id": transport["job_order_id"]}, {"_id": 0, "delivery_date": 1, "job_number": 1})
            if job:
                # Only use job_order's delivery_date if transport doesn't have one (from booking)
                if not transport.get("delivery_date") and job.get("delivery_date"):
                    transport["delivery_date"] = job["delivery_date"]
                # Populate job_numbers if not already present
                if not transport.get("job_numbers") and job.get("job_number"):
                    transport["job_numbers"] = [job["job_number"]]
        
        # Handle CONTAINER transports with shipping_booking_id
        elif transport.get("shipping_booking_id"):
            booking = await db.shipping_bookings.find_one({"id": transport["shipping_booking_id"]}, {"_id": 0, "job_order_ids": 1})
            if booking and booking.get("job_order_ids"):
                job_numbers = []
                delivery_dates = []
                
                # Fetch all job orders from the booking
                for job_id in booking["job_order_ids"]:
                    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0, "delivery_date": 1, "job_number": 1})
                    if job:
                        if job.get("job_number"):
                            job_numbers.append(job["job_number"])
                        if job.get("delivery_date"):
                            delivery_dates.append(job["delivery_date"])
                
                # Populate job_numbers if not already present or if it's incomplete
                if job_numbers:
                    transport["job_numbers"] = job_numbers
                
                # Use the earliest delivery date, or any available one
                if delivery_dates and not transport.get("delivery_date"):
                    # Sort dates and use the earliest
                    delivery_dates.sort()
                    transport["delivery_date"] = delivery_dates[0]
        
        # If job_numbers already exists but delivery_date is missing, try to fetch it
        if transport.get("job_numbers") and not transport.get("delivery_date"):
            # Try to get delivery_date from all job numbers
            for job_number in transport["job_numbers"]:
                job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0, "delivery_date": 1})
                if job and job.get("delivery_date"):
                    transport["delivery_date"] = job["delivery_date"]
                    break
    
    return outward

@api_router.post("/security/checklists")
async def create_security_checklist(data: SecurityChecklistCreate, current_user: dict = Depends(get_current_user)):
    """Create a security checklist for inward or outward transport"""
    if not has_permission(current_user, required_roles=["admin", "security"], required_page="/security-qc"):
        raise HTTPException(status_code=403, detail="Only security can create checklists")
    
    checklist_number = await generate_sequence("SEC", "security_checklists")
    
    checklist = {
        "id": str(uuid.uuid4()),
        "checklist_number": checklist_number,
        **data.model_dump(),
        "checklist_items": {
            "vehicle_inspected": False,
            "driver_verified": False,
            "seal_checked": False,
            "documents_verified": False,
            "weight_recorded": False
        },
        "status": "IN_PROGRESS",
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.security_checklists.insert_one(checklist)
    # Return without _id to avoid ObjectId serialization error
    return await db.security_checklists.find_one({"id": checklist["id"]}, {"_id": 0})

@api_router.put("/security/checklists/{checklist_id}")
async def update_security_checklist(checklist_id: str, data: SecurityChecklistUpdate, current_user: dict = Depends(get_current_user)):
    """Update security checklist with weighment and details"""
    if not has_permission(current_user, required_roles=["admin", "security"], required_page="/security-qc"):
        raise HTTPException(status_code=403, detail="Only security can update checklists")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Calculate net weight if gross and tare provided
    if data.gross_weight and data.tare_weight:
        update_data["net_weight"] = data.gross_weight - data.tare_weight
    
    result = await db.security_checklists.update_one(
        {"id": checklist_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Checklist not found")
    
    return await db.security_checklists.find_one({"id": checklist_id}, {"_id": 0})

@api_router.put("/security/checklists/{checklist_id}/complete")
async def complete_security_checklist(checklist_id: str, current_user: dict = Depends(get_current_user)):
    """
    Complete security checklist and route to QC.
    For INWARD: Creates QC inspection and routes to GRN after QC pass.
    For OUTWARD: Creates QC inspection and generates Delivery Order after QC pass.
    """
    if not has_permission(current_user, required_roles=["admin", "security"], required_page="/security-qc"):
        raise HTTPException(status_code=403, detail="Only security can complete checklists")
    
    checklist = await db.security_checklists.find_one({"id": checklist_id}, {"_id": 0})
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    
    if not checklist.get("net_weight"):
        raise HTTPException(status_code=400, detail="Please record weighment before completing")
    
    # Mark checklist as completed
    await db.security_checklists.update_one(
        {"id": checklist_id},
        {"$set": {
            "status": "COMPLETED",
            "completed_by": current_user["id"],
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create QC inspection
    qc_number = await generate_sequence("QC", "qc_inspections")
    
    # Get product information based on ref_type
    product_id = None
    product_name = None
    supplier = None
    quantity = None
    
    if checklist["checklist_type"] == "OUTWARD":
        # For outward, get product from job order via transport
        transport = await db.transport_outward.find_one({"id": checklist["ref_id"]}, {"_id": 0})
        if transport and transport.get("job_order_id"):
            job = await db.job_orders.find_one({"id": transport["job_order_id"]}, {"_id": 0})
            if job:
                product_id = job.get("product_id")
                product_name = job.get("product_name")
                quantity = job.get("quantity")
    elif checklist["checklist_type"] == "INWARD":
        # Check if this is a PO-based checklist (DDP) or transport-based (EXW)
        if checklist.get("ref_type") == "PO":
            # For DDP POs, ref_id is the PO ID
            po_id = checklist["ref_id"]
            po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
            if po:
                supplier = po.get("supplier_name")
                
                # Get product info from PO lines
                po_lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(100)
                
                if po_lines:
                    # If multiple lines, concatenate product names or use first one
                    if len(po_lines) == 1:
                        line = po_lines[0]
                        product_id = line.get("item_id")
                        product_name = line.get("item_name")
                        quantity = line.get("qty")
                    else:
                        # Multiple products - show count or concatenate names
                        product_names = [line.get("item_name", "Unknown") for line in po_lines[:3]]  # Show first 3
                        if len(po_lines) > 3:
                            product_name = f"{', '.join(product_names)} +{len(po_lines)-3} more"
                        else:
                            product_name = ", ".join(product_names)
                        total_qty = sum(line.get("qty", 0) for line in po_lines)
                        quantity = total_qty
        else:
            # For EXW, get product from PO lines via transport_inward
            transport = await db.transport_inward.find_one({"id": checklist["ref_id"]}, {"_id": 0})
            if transport:
                supplier = transport.get("supplier_name")
                
                # Get product info from PO lines
                po_id = transport.get("po_id")
                if po_id:
                    # Get all PO lines for this PO
                    po_lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(100)
                    
                    if po_lines:
                        # If multiple lines, concatenate product names or use first one
                        if len(po_lines) == 1:
                            line = po_lines[0]
                            product_id = line.get("item_id")
                            product_name = line.get("item_name")
                            quantity = line.get("qty")
                        else:
                            # Multiple products - show count or concatenate names
                            product_names = [line.get("item_name", "Unknown") for line in po_lines[:3]]  # Show first 3
                            if len(po_lines) > 3:
                                product_name = f"{', '.join(product_names)} +{len(po_lines)-3} more"
                            else:
                                product_name = ", ".join(product_names)
                            total_qty = sum(line.get("qty", 0) for line in po_lines)
                            quantity = total_qty
    
    qc_inspection = {
        "id": str(uuid.uuid4()),
        "qc_number": qc_number,
        "ref_type": checklist["checklist_type"],
        "ref_id": checklist["ref_id"],
        "ref_number": checklist["ref_number"],
        "security_checklist_id": checklist_id,
        "net_weight": checklist.get("net_weight"),
        "product_id": product_id,
        "product_name": product_name,
        "supplier": supplier,
        "quantity": quantity,
        "status": "PENDING",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.qc_inspections.insert_one(qc_inspection)
    
    # Notify QC
    await create_notification(
        event_type="QC_INSPECTION_REQUIRED",
        title=f"QC Inspection Required: {qc_number}",
        message=f"{checklist['checklist_type']} cargo requires QC inspection",
        link="/qc",
        ref_type="QC_INSPECTION",
        ref_id=qc_inspection["id"],
        target_roles=["admin", "qc"],
        notification_type="warning"
    )
    
    return {
        "success": True,
        "message": "Security checklist completed. Sent to QC for inspection.",
        "qc_number": qc_number
    }

# ==================== QC ENDPOINTS ====================

async def enrich_qc_inspection_with_product(inspection: dict):
    """Enrich QC inspection with product information if not already present"""
    # If product info already exists, return as is
    if inspection.get("product_name"):
        return inspection
    
    # Otherwise, fetch product info based on ref_type
    if inspection.get("ref_type") == "OUTWARD":
        # For outward, get product from job order via transport
        transport = await db.transport_outward.find_one({"id": inspection.get("ref_id")}, {"_id": 0})
        if transport and transport.get("job_order_id"):
            job = await db.job_orders.find_one({"id": transport["job_order_id"]}, {"_id": 0})
            if job:
                inspection["product_id"] = job.get("product_id")
                inspection["product_name"] = job.get("product_name")
                inspection["quantity"] = job.get("quantity")
    elif inspection.get("ref_type") == "INWARD":
        # Check if ref_id is a PO ID (for DDP) or transport_inward ID (for EXW)
        # Try to find transport_inward first
        transport = await db.transport_inward.find_one({"id": inspection.get("ref_id")}, {"_id": 0})
        
        if transport:
            # Found transport_inward (EXW case)
            inspection["supplier"] = transport.get("supplier_name")
            
            # Get product info from PO lines
            po_id = transport.get("po_id")
            if po_id:
                # Get all PO lines for this PO
                po_lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(100)
                
                if po_lines:
                    # If multiple lines, concatenate product names or use first one
                    if len(po_lines) == 1:
                        line = po_lines[0]
                        inspection["product_id"] = line.get("item_id")
                        inspection["product_name"] = line.get("item_name")
                        inspection["quantity"] = line.get("qty")
                    else:
                        # Multiple products - show count or concatenate names
                        product_names = [line.get("item_name", "Unknown") for line in po_lines[:3]]  # Show first 3
                        if len(po_lines) > 3:
                            inspection["product_name"] = f"{', '.join(product_names)} +{len(po_lines)-3} more"
                        else:
                            inspection["product_name"] = ", ".join(product_names)
                        total_qty = sum(line.get("qty", 0) for line in po_lines)
                        inspection["quantity"] = total_qty
        else:
            # No transport_inward found, check if ref_id is a PO ID (DDP case)
            po = await db.purchase_orders.find_one({"id": inspection.get("ref_id")}, {"_id": 0})
            if po:
                inspection["supplier"] = po.get("supplier_name")
                
                # Get product info from PO lines
                po_lines = await db.purchase_order_lines.find({"po_id": inspection.get("ref_id")}, {"_id": 0}).to_list(100)
                
                if po_lines:
                    # If multiple lines, concatenate product names or use first one
                    if len(po_lines) == 1:
                        line = po_lines[0]
                        inspection["product_id"] = line.get("item_id")
                        inspection["product_name"] = line.get("item_name")
                        inspection["quantity"] = line.get("qty")
                    else:
                        # Multiple products - show count or concatenate names
                        product_names = [line.get("item_name", "Unknown") for line in po_lines[:3]]  # Show first 3
                        if len(po_lines) > 3:
                            inspection["product_name"] = f"{', '.join(product_names)} +{len(po_lines)-3} more"
                        else:
                            inspection["product_name"] = ", ".join(product_names)
                        total_qty = sum(line.get("qty", 0) for line in po_lines)
                        inspection["quantity"] = total_qty
    
    return inspection

@api_router.get("/qc/dashboard")
async def get_qc_dashboard(current_user: dict = Depends(get_current_user)):
    """Get QC dashboard with pending inspections"""
    
    # Pending inspections
    pending = await db.qc_inspections.find(
        {"status": {"$in": ["PENDING", "IN_PROGRESS"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with product info
    pending = [await enrich_qc_inspection_with_product(insp) for insp in pending]
    
    # Completed today
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    completed_today = await db.qc_inspections.find(
        {"status": "PASSED", "completed_at": {"$regex": f"^{today}"}},
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with product info
    completed_today = [await enrich_qc_inspection_with_product(insp) for insp in completed_today]
    
    # COAs generated
    coas = await db.qc_inspections.find(
        {"coa_generated": True},
        {"_id": 0}
    ).sort("coa_generated_at", -1).to_list(50)
    
    # Enrich with product info
    coas = [await enrich_qc_inspection_with_product(insp) for insp in coas]
    
    return {
        "pending_inspections": pending,
        "completed_today": completed_today,
        "recent_coas": coas,
        "stats": {
            "pending_count": len(pending),
            "completed_today_count": len(completed_today),
            "coas_generated": len(coas)
        }
    }

# ==================== QC PARAMETERS ENDPOINTS ====================

@api_router.get("/qc/parameters")
async def get_qc_parameters(product_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get QC testing parameters, optionally filtered by product type"""
    query = {}
    if product_type:
        query["product_type"] = product_type.upper()
    
    parameters = await db.qc_parameters.find(query, {"_id": 0}).sort("order", 1).to_list(100)
    
    # If no parameters found and product_type is specified, create defaults
    if len(parameters) == 0 and product_type:
        await initialize_default_qc_parameters()
        parameters = await db.qc_parameters.find(query, {"_id": 0}).sort("order", 1).to_list(100)
    
    return parameters

@api_router.post("/qc/parameters")
async def create_qc_parameter(data: QCParameterCreate, current_user: dict = Depends(get_current_user)):
    """Create a new QC parameter (admin only)"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin can create QC parameters")
    
    parameter = {
        "id": str(uuid.uuid4()),
        "product_type": data.product_type.upper(),
        "parameter_name": data.parameter_name,
        "test_type": data.test_type,
        "required": data.required,
        "order": data.order,
        "unit": data.unit,
        "min_value": data.min_value,
        "max_value": data.max_value,
        "description": data.description,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.qc_parameters.insert_one(parameter)
    return parameter

@api_router.put("/qc/parameters/{parameter_id}")
async def update_qc_parameter(parameter_id: str, data: QCParameterUpdate, current_user: dict = Depends(get_current_user)):
    """Update QC parameter (admin only)"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin can update QC parameters")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.qc_parameters.update_one(
        {"id": parameter_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Parameter not found")
    
    parameter = await db.qc_parameters.find_one({"id": parameter_id}, {"_id": 0})
    return parameter

@api_router.delete("/qc/parameters/{parameter_id}")
async def delete_qc_parameter(parameter_id: str, current_user: dict = Depends(get_current_user)):
    """Delete QC parameter (admin only)"""
    if not has_permission(current_user, required_roles=["admin"], required_page="/settings"):
        raise HTTPException(status_code=403, detail="Only admin can delete QC parameters")
    
    result = await db.qc_parameters.delete_one({"id": parameter_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Parameter not found")
    
    return {"success": True, "message": "Parameter deleted"}

async def initialize_default_qc_parameters():
    """Initialize default QC parameters for Solvent and Oil if they don't exist"""
    
    # Check if parameters already exist
    existing = await db.qc_parameters.count_documents({})
    if existing > 0:
        return
    
    default_parameters = [
        # Solvent Parameters
        {"product_type": "SOLVENT", "parameter_name": "Appearance", "test_type": "VISUAL", "required": True, "order": 1, "description": "Visual inspection of clarity and color"},
        {"product_type": "SOLVENT", "parameter_name": "Color", "test_type": "PASS_FAIL", "required": True, "order": 2, "description": "Color specification check"},
        {"product_type": "SOLVENT", "parameter_name": "Odor", "test_type": "PASS_FAIL", "required": True, "order": 3, "description": "Characteristic odor check"},
        {"product_type": "SOLVENT", "parameter_name": "Moisture Content", "test_type": "MEASUREMENT", "required": True, "order": 4, "unit": "%", "max_value": 0.1, "description": "Karl Fischer moisture analysis"},
        {"product_type": "SOLVENT", "parameter_name": "Density", "test_type": "MEASUREMENT", "required": True, "order": 5, "unit": "g/ml", "description": "Density at 20°C"},
        {"product_type": "SOLVENT", "parameter_name": "Purity", "test_type": "MEASUREMENT", "required": True, "order": 6, "unit": "%", "min_value": 99.0, "description": "GC purity analysis"},
        {"product_type": "SOLVENT", "parameter_name": "Container Integrity", "test_type": "PASS_FAIL", "required": True, "order": 7, "description": "Check for leaks or damage"},
        
        # Oil Parameters
        {"product_type": "OIL", "parameter_name": "Appearance", "test_type": "VISUAL", "required": True, "order": 1, "description": "Visual inspection of clarity and color"},
        {"product_type": "OIL", "parameter_name": "Color", "test_type": "PASS_FAIL", "required": True, "order": 2, "description": "Color specification check"},
        {"product_type": "OIL", "parameter_name": "Odor", "test_type": "PASS_FAIL", "required": True, "order": 3, "description": "Characteristic odor check"},
        {"product_type": "OIL", "parameter_name": "Moisture Content", "test_type": "MEASUREMENT", "required": True, "order": 4, "unit": "%", "max_value": 0.2, "description": "Karl Fischer moisture analysis"},
        {"product_type": "OIL", "parameter_name": "Acid Value", "test_type": "MEASUREMENT", "required": True, "order": 5, "unit": "mg KOH/g", "max_value": 2.0, "description": "Free fatty acid content"},
        {"product_type": "OIL", "parameter_name": "Specific Gravity", "test_type": "MEASUREMENT", "required": True, "order": 6, "unit": "g/ml", "description": "Specific gravity at 20°C"},
        {"product_type": "OIL", "parameter_name": "Peroxide Value", "test_type": "MEASUREMENT", "required": False, "order": 7, "unit": "meq/kg", "max_value": 10.0, "description": "Oxidation indicator"},
        {"product_type": "OIL", "parameter_name": "Container Integrity", "test_type": "PASS_FAIL", "required": True, "order": 8, "description": "Check for leaks or damage"},
    ]
    
    for param_data in default_parameters:
        parameter = {
            "id": str(uuid.uuid4()),
            **param_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.qc_parameters.insert_one(parameter)

# ==================== QC QUANTITY CLAIMS ENDPOINTS ====================

@api_router.get("/procurement/quantity-claims")
async def get_quantity_claims(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get quantity claims for procurement/finance review"""
    query = {}
    if status:
        query["claim_status"] = status
    
    claims = await db.quantity_claims.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return claims

@api_router.put("/procurement/quantity-claims/{claim_id}")
async def update_quantity_claim(claim_id: str, claim_status: str, claim_reason: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Update quantity claim status (procurement/finance only)"""
    if not has_permission(current_user, required_roles=["admin", "procurement", "finance"], required_page="/procurement"):
        raise HTTPException(status_code=403, detail="Only procurement/finance can update claims")
    
    update_data = {
        "claim_status": claim_status,
        "reviewed_by": current_user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if claim_reason:
        update_data["claim_reason"] = claim_reason
    
    result = await db.quantity_claims.update_one(
        {"id": claim_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Claim not found")
    
    claim = await db.quantity_claims.find_one({"id": claim_id}, {"_id": 0})
    return claim

@api_router.get("/qc/inspections")
async def get_qc_inspections(status: Optional[str] = None, ref_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get QC inspections"""
    query = {}
    if status:
        query["status"] = status
    if ref_type:
        query["ref_type"] = ref_type
    
    inspections = await db.qc_inspections.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Enrich with product info
    inspections = [await enrich_qc_inspection_with_product(insp) for insp in inspections]
    
    return inspections

@api_router.get("/qc/inspections/completed")
async def get_completed_qc_inspections(current_user: dict = Depends(get_current_user)):
    """Get completed QC inspections (PASS or FAIL status)"""
    query = {"status": {"$in": ["PASS", "FAIL"]}}
    inspections = await db.qc_inspections.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with product info
    inspections = [await enrich_qc_inspection_with_product(insp) for insp in inspections]
    
    return inspections

@api_router.put("/qc/inspections/{inspection_id}")
async def update_qc_inspection(inspection_id: str, data: QCInspectionUpdate, current_user: dict = Depends(get_current_user)):
    """Update QC inspection with test results"""
    if not has_permission(current_user, required_roles=["admin", "qc"], required_page="/qc-inspection"):
        raise HTTPException(status_code=403, detail="Only QC can update inspections")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    result = await db.qc_inspections.update_one(
        {"id": inspection_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    inspection = await db.qc_inspections.find_one({"id": inspection_id}, {"_id": 0})
    
    # Enrich with product info
    inspection = await enrich_qc_inspection_with_product(inspection)
    
    return inspection

@api_router.post("/qc/inspections")
async def create_qc_inspection_new(data: QCInspectionCreate, current_user: dict = Depends(get_current_user)):
    """Create a new QC inspection from discharge processing"""
    if not has_permission(current_user, required_roles=["admin", "qc", "security"], required_page="/security-qc"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate QC number
    qc_number = await generate_sequence("QC", "qc_inspections")
    
    # Determine status based on whether QC parameters are provided
    # If qc_parameters are passed, it means QC has been performed
    has_qc_results = data.qc_parameters and len(data.qc_parameters) > 0
    all_passed = False
    
    if has_qc_results:
        # Check if all required parameters passed
        all_passed = all(param.get("result") == "PASS" for param in data.qc_parameters if param.get("required", True))
        status = "PASSED" if all_passed else "FAILED"
    else:
        status = "IN_PROGRESS"
    
    inspection = {
        "id": str(uuid.uuid4()),
        "qc_number": qc_number,
        "ref_type": data.ref_type,
        "ref_id": data.ref_id,
        "ref_number": data.ref_number,
        "product_id": data.product_id,
        "product_name": data.product_name,
        "batch_number": data.batch_number,
        "supplier": data.supplier,
        "items": data.items or [],
        "quantity": data.quantity,
        "vehicle_number": data.vehicle_number,
        "po_number": data.po_number,
        "sampling_size": data.sampling_size,
        "arrival_quantity": data.arrival_quantity,
        "sample_type": data.sample_type,
        "qc_parameters": data.qc_parameters or [],
        "security_checklist_id": data.security_checklist_id,
        "status": status,
        "passed": all_passed if has_qc_results else None,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    if has_qc_results and status == "PASSED":
        inspection["completed_by"] = current_user["id"]
        inspection["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.qc_inspections.insert_one(inspection)
    
    # Remove MongoDB's _id field to avoid serialization issues
    if "_id" in inspection:
        del inspection["_id"]
    
    # If QC passed, trigger GRN/DO creation
    if status == "PASSED":
        if data.ref_type == "INWARD":
            grn_result = await create_grn_from_qc(inspection, current_user)
            inspection["grn_created"] = True
            inspection["grn_number"] = grn_result.get("grn_number")
        elif data.ref_type == "OUTWARD":
            do_result = await create_do_from_qc(inspection, current_user)
            inspection["do_created"] = True
            inspection["do_number"] = do_result.get("do_number")
    
    # Enrich with product info
    inspection = await enrich_qc_inspection_with_product(inspection)
    
    return inspection

@api_router.put("/qc/inspections/{inspection_id}/pass")
async def pass_qc_inspection(inspection_id: str, current_user: dict = Depends(get_current_user)):
    """
    Pass QC inspection and trigger next steps:
    - INWARD: Create GRN and update stock, notify payables
    - OUTWARD: Generate Delivery Order and documents, notify receivables
    """
    if current_user["role"] not in ["admin", "qc"]:
        raise HTTPException(status_code=403, detail="Only QC can pass inspections")
    
    inspection = await db.qc_inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    # Update inspection status
    await db.qc_inspections.update_one(
        {"id": inspection_id},
        {"$set": {
            "status": "PASSED",
            "passed": True,
            "completed_by": current_user["id"],
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    result_message = ""
    
    if inspection["ref_type"] == "INWARD":
        # Create GRN and update stock
        grn_result = await create_grn_from_qc(inspection, current_user)
        result_message = f"GRN {grn_result['grn_number']} created. Stock updated. Payables notified."
        
    elif inspection["ref_type"] == "OUTWARD":
        # Generate Delivery Order and documents
        do_result = await create_do_from_qc(inspection, current_user)
        result_message = f"Delivery Order {do_result['do_number']} created. Receivables notified."
    
    return {
        "success": True,
        "message": f"QC Passed. {result_message}"
    }

@api_router.put("/qc/inspections/{inspection_id}/fail")
async def fail_qc_inspection(inspection_id: str, reason: str = "", current_user: dict = Depends(get_current_user)):
    """Fail QC inspection"""
    if not has_permission(current_user, required_roles=["admin", "qc"], required_page="/qc-inspection"):
        raise HTTPException(status_code=403, detail="Only QC can fail inspections")
    
    await db.qc_inspections.update_one(
        {"id": inspection_id},
        {"$set": {
            "status": "FAILED",
            "passed": False,
            "fail_reason": reason,
            "completed_by": current_user["id"],
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "message": "QC Failed. Material on hold."}

@api_router.post("/qc/inspections/{inspection_id}/generate-coa")
async def generate_coa(inspection_id: str, current_user: dict = Depends(get_current_user)):
    """Generate Certificate of Analysis for outward shipment"""
    if not has_permission(current_user, required_roles=["admin", "qc"], required_page="/qc-inspection"):
        raise HTTPException(status_code=403, detail="Only QC can generate COA")
    
    inspection = await db.qc_inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    if not inspection.get("passed"):
        raise HTTPException(status_code=400, detail="Cannot generate COA for failed inspection")
    
    coa_number = await generate_sequence("COA", "coas")
    
    await db.qc_inspections.update_one(
        {"id": inspection_id},
        {"$set": {
            "coa_generated": True,
            "coa_number": coa_number,
            "coa_generated_by": current_user["id"],
            "coa_generated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "coa_number": coa_number}

# Helper function to create GRN from QC pass (Inward flow)
async def create_grn_from_qc(inspection: dict, current_user: dict):
    """Create GRN after QC pass for inward materials"""
    
    # Check if ref_id is a PO ID (DDP) or transport_inward ID (EXW)
    transport = await db.transport_inward.find_one({"id": inspection["ref_id"]}, {"_id": 0})
    po_id = None
    supplier_name = None
    
    if transport:
        # Found transport_inward (EXW case)
        po_id = transport.get("po_id")
        supplier_name = transport.get("supplier_name", "Unknown")
    else:
        # No transport_inward found, check if ref_id is a PO ID (DDP case)
        po = await db.purchase_orders.find_one({"id": inspection["ref_id"]}, {"_id": 0})
        if po:
            po_id = po.get("id")
            supplier_name = po.get("supplier_name", "Unknown")
        else:
            return {"grn_number": "N/A", "error": "Transport or PO not found"}
    
    # Get PO lines to create GRN items
    po_lines = []
    if po_id:
        po_lines = await db.purchase_order_lines.find({"po_id": po_id}, {"_id": 0}).to_list(100)
    
    if not po_lines:
        return {"grn_number": "N/A", "error": "PO lines not found"}
    
    grn_number = await generate_sequence("GRN", "grn")
    
    # Get arrival quantity from inspection
    arrival_qty = inspection.get("arrival_quantity")
    
    # Check for quantity mismatch and create quantity claims if needed
    quantity_mismatch = False
    has_pending_claims = False
    
    grn_items = []
    for line in po_lines:
        item = await db.inventory_items.find_one({"id": line.get("item_id")}, {"_id": 0})
        ordered_qty = line.get("qty", 0)
        
        # Determine received quantity
        # If arrival_quantity is provided in inspection and there's only one line, use it
        # Otherwise, assume full quantity received
        received_qty = ordered_qty
        if arrival_qty is not None and len(po_lines) == 1:
            received_qty = arrival_qty
            if received_qty < ordered_qty:
                quantity_mismatch = True
                pending_qty = ordered_qty - received_qty
                
                # Create quantity claim
                claim = {
                    "id": str(uuid.uuid4()),
                    "po_id": po_id,
                    "po_number": (await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})).get("po_number", "Unknown"),
                    "po_line_id": line.get("id"),
                    "product_name": line.get("item_name", "Unknown"),
                    "ordered_qty": ordered_qty,
                    "received_qty": received_qty,
                    "pending_qty": pending_qty,
                    "claim_status": "PENDING_REVIEW",
                    "supplier_name": supplier_name,
                    "qc_inspection_id": inspection.get("id"),
                    "grn_number": grn_number,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                await db.quantity_claims.insert_one(claim)
                has_pending_claims = True
        
        grn_items.append({
            "product_id": line.get("item_id"),
            "product_name": line.get("item_name") or (item.get("name") if item else "Unknown"),
            "sku": item.get("sku") if item else "-",
            "quantity": received_qty,  # Use received quantity instead of ordered
            "ordered_quantity": ordered_qty,  # Keep track of ordered quantity
            "unit": line.get("uom", "KG")
        })
    
    # Send notification if there are pending claims
    if has_pending_claims:
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        await create_notification(
            event_type="QUANTITY_CLAIM_CREATED",
            title=f"Quantity Mismatch: {po.get('po_number', 'Unknown')}",
            message=f"Received {arrival_qty}/{ordered_qty} units for {grn_items[0]['product_name']}. Partial GRN {grn_number} created. Claim pending review.",
            link="/procurement/claims",
            ref_type="QUANTITY_CLAIM",
            ref_id=po_id,
            target_roles=["procurement", "finance"],
            notification_type="warning"
        )
    
    grn = {
        "id": str(uuid.uuid4()),
        "grn_number": grn_number,
        "supplier": supplier_name,
        "items": grn_items,
        "received_by": current_user["id"],
        "received_at": datetime.now(timezone.utc).isoformat(),
        "review_status": "PENDING_PAYABLES",
        "po_id": po_id,
        "qc_inspection_id": inspection["id"],
        "net_weight": inspection.get("net_weight")
    }
    # Enrich GRN items with SKU if missing
    for item in grn_items:
        if not item.get("sku") or item.get("sku") == "-" or item.get("sku") == "":
            # Try to get from inventory_item first
            inventory_item = await db.inventory_items.find_one({"id": item["product_id"]}, {"_id": 0})
            if inventory_item and inventory_item.get("sku"):
                item["sku"] = inventory_item.get("sku")
            else:
                # Fallback to product
                product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
                if product and product.get("sku"):
                    item["sku"] = product.get("sku")
                else:
                    item["sku"] = "-"  # Keep as "-" if not found
    
    grn["items"] = grn_items
    await db.grn.insert_one(grn)
    
    # Update inventory balances and create movements
    for item in grn_items:
        # Find the correct inventory_item_id using improved lookup
        item_id_for_balance = await find_inventory_item_id(
            item["product_id"],
            item.get("product_name"),
            item.get("sku")
        )
        
        # Get inventory item and product for unit conversion
        inventory_item = await db.inventory_items.find_one({"id": item_id_for_balance}, {"_id": 0})
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        
        # Determine the inventory item's unit (from inventory_items.uom or products.unit)
        if inventory_item:
            inventory_item_unit = inventory_item.get("uom", "KG").upper()
        elif product:
            inventory_item_unit = product.get("unit", "KG").upper()
        else:
            inventory_item_unit = "KG"  # Default
        
        # Convert GRN quantity to match inventory item's unit
        grn_unit = item.get("unit", "KG").upper()
        
        if inventory_item_unit == "KG":
            if grn_unit == "MT":
                quantity_to_add = item["quantity"] * 1000  # Convert MT to KG
            else:  # GRN is already in KG
                quantity_to_add = item["quantity"]
        elif inventory_item_unit == "MT":
            if grn_unit == "KG":
                quantity_to_add = item["quantity"] / 1000  # Convert KG to MT
            else:  # GRN is already in MT
                quantity_to_add = item["quantity"]
        else:
        # Same unit or non-weight units (EA, PCS, etc.) - use as-is
            quantity_to_add = item["quantity"]
        
        # Update inventory_balances using the correct item_id
        await db.inventory_balances.update_one(
            {"item_id": item_id_for_balance},
            {"$inc": {"on_hand": quantity_to_add}},  # Use converted quantity
            upsert=True
        )
        
        # Update products table if item exists there (for finished goods)
        if product:
            prev_stock = product.get("current_stock", 0)
            new_stock = prev_stock + quantity_to_add  # Use converted quantity
            await db.products.update_one(
                {"id": item["product_id"]},
                {"$set": {"current_stock": new_stock}}
            )
            
            # Create inventory movement record
            movement = InventoryMovement(
                product_id=item["product_id"],
                product_name=item["product_name"],
                sku=item.get("sku", ""),
                movement_type="grn_add",
                quantity=quantity_to_add,  # Use converted quantity
                reference_type="grn",
                reference_id=grn["id"],
                reference_number=grn_number,
                previous_stock=prev_stock,
                new_stock=new_stock,
                created_by=current_user["id"]
            )
            await db.inventory_movements.insert_one(movement.model_dump())
    
    # Update transport status (only if transport exists)
    if transport:
        await db.transport_inward.update_one(
            {"id": transport["id"]},
            {"$set": {"status": "COMPLETED", "grn_number": grn_number}}
        )
    
    # Notify Payables
    await create_notification(
        event_type="GRN_PAYABLES_REVIEW",
        title=f"GRN Pending Review: {grn_number}",
        message=f"GRN from {supplier_name} requires payables review",
        link="/payables",
        ref_type="GRN",
        ref_id=grn["id"],
        target_roles=["admin", "finance"],
        notification_type="warning"
    )
    
    return {"grn_number": grn_number, "grn_id": grn["id"]}

# Helper functions to generate export documents
async def generate_packing_list(do_number: str, job: dict, so: dict, quotation: dict, current_user: dict):
    """Generate Packing List for export shipment"""
    try:
        pl_number = await generate_sequence("PL", "packing_lists")
        
        # Get product details
        items = []
        if job.get("items") and len(job.get("items", [])) > 0:
            for item in job["items"]:
                items.append({
                    "product_name": item.get("product_name", ""),
                    "quantity": item.get("quantity", 0),
                    "unit": item.get("unit", "KG"),
                    "packaging": item.get("packaging", "Bulk"),
                    "net_weight_kg": item.get("net_weight_kg", 0),
                    "gross_weight_kg": item.get("gross_weight_kg", 0)
                })
        else:
            # Single product format
            items.append({
                "product_name": job.get("product_name", ""),
                "quantity": job.get("quantity", 0),
                "unit": job.get("unit", "KG"),
                "packaging": job.get("packaging", "Bulk"),
                "net_weight_kg": job.get("net_weight_kg", 0),
                "gross_weight_kg": job.get("gross_weight_kg", 0)
            })
        
        packing_list = {
            "id": str(uuid.uuid4()),
            "pl_number": pl_number,
            "do_number": do_number,
            "job_order_id": job.get("id"),
            "job_number": job.get("job_number", ""),
            "customer_name": so.get("customer_name", ""),
            "items": items,
            "total_packages": len(items),
            "total_net_weight": sum(item.get("net_weight_kg", 0) for item in items),
            "total_gross_weight": sum(item.get("gross_weight_kg", 0) for item in items),
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.packing_lists.insert_one(packing_list)
        return {"pl_number": pl_number, "pl_id": packing_list["id"]}
    except Exception as e:
        print(f"Error generating Packing List: {str(e)}")
        return None

async def generate_certificate_of_origin(do_number: str, job: dict, so: dict, quotation: dict, current_user: dict):
    """Generate Certificate of Origin for export shipment"""
    try:
        coo_number = await generate_sequence("COO", "certificates_of_origin")
        
        certificate_of_origin = {
            "id": str(uuid.uuid4()),
            "coo_number": coo_number,
            "do_number": do_number,
            "job_order_id": job.get("id"),
            "job_number": job.get("job_number", ""),
            "customer_name": so.get("customer_name", ""),
            "product_name": job.get("product_name", ""),
            "quantity": job.get("quantity", 0),
            "country_of_origin": quotation.get("country_of_origin", "UAE"),
            "destination_country": quotation.get("destination_country", ""),
            "port_of_loading": quotation.get("port_of_loading", ""),
            "port_of_discharge": quotation.get("port_of_discharge", ""),
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.certificates_of_origin.insert_one(certificate_of_origin)
        return {"coo_number": coo_number, "coo_id": certificate_of_origin["id"]}
    except Exception as e:
        print(f"Error generating Certificate of Origin: {str(e)}")
        return None

async def generate_bl_draft(do_number: str, job: dict, so: dict, quotation: dict, current_user: dict):
    """Generate Bill of Lading Draft for export shipment"""
    try:
        bl_number = await generate_sequence("BL", "bill_of_lading_drafts")
        
        bill_of_lading = {
            "id": str(uuid.uuid4()),
            "bl_number": bl_number,
            "do_number": do_number,
            "job_order_id": job.get("id"),
            "job_number": job.get("job_number", ""),
            "customer_name": so.get("customer_name", ""),
            "product_name": job.get("product_name", ""),
            "quantity": job.get("quantity", 0),
            "port_of_loading": quotation.get("port_of_loading", ""),
            "port_of_discharge": quotation.get("port_of_discharge", ""),
            "final_port_delivery": quotation.get("final_port_delivery", ""),
            "incoterm": quotation.get("incoterm", ""),
            "shipping_line": quotation.get("shipping_line", ""),
            "container_number": quotation.get("container_number", ""),
            "status": "DRAFT",
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.bill_of_lading_drafts.insert_one(bill_of_lading)
        return {"bl_number": bl_number, "bl_id": bill_of_lading["id"]}
    except Exception as e:
        print(f"Error generating Bill of Lading Draft: {str(e)}")
        return None

# Helper function to create DO from QC pass (Outward flow)
async def create_do_from_qc(inspection: dict, current_user: dict):
    """Create Delivery Order after QC pass for outward dispatch"""
    
    job = None
    transport = None
    
    # Get transport outward details
    transport = await db.transport_outward.find_one({"id": inspection["ref_id"]}, {"_id": 0})
    if transport:
        # Get job from transport's job_order_id
        job_id = transport.get("job_order_id")
        if job_id:
            job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
        
        # If transport exists but no job_order_id or job not found, this is an error
        if not job:
            print(f"WARNING: Transport {transport.get('id')} found but no valid job_order_id. Cannot create DO with complete information.")
            # Try to find job by matching transport number in job_orders
            if transport.get("transport_number"):
                job = await db.job_orders.find_one({"transport_number": transport.get("transport_number")}, {"_id": 0})
    else:
        # Try to find job order directly using ref_id (in case ref_id IS a job_order_id)
        job = await db.job_orders.find_one({"id": inspection.get("ref_id")}, {"_id": 0})
        if job:
            # Create minimal transport dict
            transport = {"job_order_id": job["id"], "customer_name": ""}
    
    # If still no job found, return error
    if not job:
        return {"do_number": "N/A", "error": "Job order not found. Cannot create DO without job information."}
    
    do_number = await generate_sequence("DO", "delivery_orders")
    
    # Get customer info from sales order
    customer_name = transport.get("customer_name", "")
    customer_type = "local"
    
    # Get sales order and quotation info
    so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
    if so:
        customer_name = so.get("customer_name", customer_name)
        quotation = await db.quotations.find_one({"id": so.get("quotation_id")}, {"_id": 0})
        if quotation:
            customer_type = quotation.get("order_type", "local")
    
    # Get vehicle and driver info from transport if available
    vehicle_number = None
    driver_name = None
    if transport and transport.get("id"):
        vehicle_number = transport.get("vehicle_number")
        driver_name = transport.get("driver_name")  # May not exist in transport_outward model
    
    delivery_order = {
        "id": str(uuid.uuid4()),
        "do_number": do_number,
        "job_order_id": job["id"],
        "job_number": job.get("job_number", "-"),
        "product_name": job.get("product_name", "-"),
        "quantity": job.get("quantity", 0),
        "customer_name": customer_name,
        "customer_type": customer_type,
        "qc_inspection_id": inspection["id"],
        "net_weight": inspection.get("net_weight"),
        "vehicle_number": vehicle_number,  # Include vehicle number from transport
        "driver_name": driver_name,  # Include driver name if available
        "issued_by": current_user["id"],
        "issued_at": datetime.now(timezone.utc).isoformat()
    }
    await db.delivery_orders.insert_one(delivery_order)
    
    # Update job status
    await db.job_orders.update_one(
        {"id": job["id"]},
        {"$set": {"status": "dispatched"}}
    )
    
    # Deduct from inventory (CRITICAL - must update both products.current_stock and inventory_balances.on_hand)
    product = await db.products.find_one({"id": job.get("product_id")}, {"_id": 0})
    if not product:
        print(f"WARNING: Product {job.get('product_id')} not found. Cannot deduct stock for delivery order {do_number}.")
    else:
        prev_stock = product.get("current_stock", 0)
        new_stock = max(0, prev_stock - job.get("quantity", 0))
        
        # Update products collection
        await db.products.update_one(
            {"id": job.get("product_id")},
            {"$set": {"current_stock": new_stock}}
        )
        
        # ALSO update inventory_balances (CRITICAL - ensures sync with Inventory page)
        await db.inventory_balances.update_one(
            {"item_id": job.get("product_id")},
            {"$inc": {"on_hand": -job.get("quantity", 0)}},
            upsert=True
        )
        
        # Create inventory movement record
        movement = InventoryMovement(
            product_id=job.get("product_id"),
            product_name=job.get("product_name", "Unknown"),
            sku=product.get("sku", ""),
            movement_type="do_deduct",
            quantity=job.get("quantity", 0),
            reference_type="delivery_order",
            reference_id=delivery_order["id"],
            reference_number=do_number,
            previous_stock=prev_stock,
            new_stock=new_stock,
            created_by=current_user["id"]
        )
        await db.inventory_movements.insert_one(movement.model_dump())
    
    # Update transport status
    if transport.get("id"):
        await db.transport_outward.update_one(
            {"id": transport["id"]},
            {"$set": {"status": "DISPATCHED", "do_number": do_number}}
        )
    
    # Auto-generate invoice from delivery order
    invoice_result = await auto_generate_invoice_from_do(delivery_order["id"], do_number, job, current_user)
    
    # Generate documents based on customer type
    generated_docs = []
    
    if customer_type == "local":
        # Local customer: DO, Invoice, COA (by QC)
        # DO and Invoice already generated above
        # COA will be generated by QC separately
        generated_docs = ["DO", "Invoice"]
    else:
        # Export/International customer: DO, Invoice, P.L, COA (by QC), COO, BL DRAFT
        # DO and Invoice already generated above
        
        # Generate Packing List (P.L)
        pl_result = await generate_packing_list(do_number, job, so, quotation, current_user)
        if pl_result:
            generated_docs.append("Packing List")
        
        # Generate Certificate of Origin (COO)
        coo_result = await generate_certificate_of_origin(do_number, job, so, quotation, current_user)
        if coo_result:
            generated_docs.append("Certificate of Origin")
        
        # Generate Bill of Lading Draft (BL DRAFT)
        bl_result = await generate_bl_draft(do_number, job, so, quotation, current_user)
        if bl_result:
            generated_docs.append("Bill of Lading Draft")
        
        generated_docs.extend(["DO", "Invoice"])
        # COA will be generated by QC separately
    
    # Notify Receivables
    invoice_type = "Tax Invoice" if customer_type == "local" else "Commercial Invoice"
    doc_list = ", ".join(generated_docs)
    await create_notification(
        event_type="DO_DOCUMENTS_GENERATED",
        title=f"Documents Generated: {do_number}",
        message=f"Delivery Order {do_number} for {customer_name} - Generated: {doc_list}. Available in Receivables.",
        link="/receivables",
        ref_type="DO",
        ref_id=delivery_order["id"],
        target_roles=["admin", "finance"],
        notification_type="info"
    )
    
    return {
        "do_number": do_number,
        "do_id": delivery_order["id"],
        "invoice_type": invoice_type,
        "invoice_number": invoice_result.get("invoice_number") if invoice_result else None,
        "generated_documents": generated_docs,
        "customer_type": customer_type
    }

# ==================== EXPORT DOCUMENTS GENERATION ====================

@api_router.get("/documents/export/{job_id}")
async def get_export_documents_status(job_id: str, current_user: dict = Depends(get_current_user)):
    """Get status of export documents for a job (Packing List, COO, BL Draft, COA)"""
    
    job = await db.job_orders.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get QC inspection and COA status
    # QC inspection ref_id is the transport_outward ID, so we need to find transport first
    do = await db.delivery_orders.find_one({"job_order_id": job_id}, {"_id": 0})
    qc = None
    if do:
        # Find transport that has this job_order_id
        transport = await db.transport_outward.find_one({"job_order_id": job_id}, {"_id": 0})
        if transport:
            qc = await db.qc_inspections.find_one({
                "ref_type": "OUTWARD",
                "ref_id": transport.get("id")
            }, {"_id": 0})
    
    # Get sales order and quotation for export check
    so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
    quotation = await db.quotations.find_one({"id": so.get("quotation_id") if so else None}, {"_id": 0})
    
    is_export = quotation.get("order_type") == "export" if quotation else False
    
    documents = {
        "delivery_order": {"status": "PENDING", "number": None, "id": None},
        "invoice": {"status": "PENDING", "number": None, "id": None},
        "packing_list": {"status": "NOT_REQUIRED" if not is_export else "PENDING", "number": None, "id": None},
        "certificate_of_origin": {"status": "NOT_REQUIRED" if not is_export else "PENDING", "number": None, "id": None},
        "bl_draft": {"status": "NOT_REQUIRED" if not is_export else "PENDING", "number": None, "id": None},
        "certificate_of_analysis": {
            "status": "GENERATED" if (qc and qc.get("coa_generated")) else "PENDING",
            "number": qc.get("coa_number") if qc else None,
            "id": qc.get("id") if qc else None
        }
    }
    
    # Check if DO exists (already fetched above)
    if do:
        documents["delivery_order"] = {"status": "GENERATED", "number": do.get("do_number"), "id": do.get("id")}
        
        # Check if Invoice exists
        invoice = await db.receivable_invoices.find_one({"delivery_order_id": do.get("id")}, {"_id": 0})
        if invoice:
            documents["invoice"] = {"status": "GENERATED", "number": invoice.get("invoice_number"), "id": invoice.get("id")}
        
        # For export orders, check for other documents
        if is_export:
            # Check Packing List
            pl = await db.packing_lists.find_one({"do_number": do.get("do_number")}, {"_id": 0})
            if pl:
                documents["packing_list"] = {"status": "GENERATED", "number": pl.get("pl_number"), "id": pl.get("id")}
            
            # Check Certificate of Origin
            coo = await db.certificates_of_origin.find_one({"do_number": do.get("do_number")}, {"_id": 0})
            if coo:
                documents["certificate_of_origin"] = {"status": "GENERATED", "number": coo.get("coo_number"), "id": coo.get("id")}
            
            # Check Bill of Lading Draft
            bl = await db.bill_of_lading_drafts.find_one({"do_number": do.get("do_number")}, {"_id": 0})
            if bl:
                documents["bl_draft"] = {"status": "GENERATED", "number": bl.get("bl_number"), "id": bl.get("id")}
    
    return {
        "job_number": job.get("job_number"),
        "job_id": job_id,
        "is_export": is_export,
        "customer_type": quotation.get("order_type") if quotation else "local",
        "documents": documents
    }

@api_router.get("/documents/job-orders")
async def get_job_orders_with_documents(current_user: dict = Depends(get_current_user)):
    """Get all job orders with their generated documents for Documentation window"""
    
    # Get all job orders that have delivery orders (dispatched jobs)
    dos = await db.delivery_orders.find({}, {"_id": 0}).sort("issued_at", -1).to_list(1000)
    
    job_orders_with_docs = []
    
    for do in dos:
        job = await db.job_orders.find_one({"id": do.get("job_order_id")}, {"_id": 0})
        if not job:
            continue
        
        # Get sales order and quotation
        so = await db.sales_orders.find_one({"id": job.get("sales_order_id")}, {"_id": 0})
        quotation = await db.quotations.find_one({"id": so.get("quotation_id") if so else None}, {"_id": 0})
        
        is_export = quotation.get("order_type") == "export" if quotation else False
        
        # Get all documents
        documents = {
            "delivery_order": {"number": do.get("do_number"), "id": do.get("id"), "created_at": do.get("issued_at")},
            "invoice": None,
            "packing_list": None,
            "certificate_of_origin": None,
            "bl_draft": None,
            "certificate_of_analysis": None
        }
        
        # Get Invoice
        invoice = await db.receivable_invoices.find_one({"delivery_order_id": do.get("id")}, {"_id": 0})
        if invoice:
            documents["invoice"] = {"number": invoice.get("invoice_number"), "id": invoice.get("id"), "created_at": invoice.get("created_at")}
        
        # Get QC and COA
        # QC inspection ref_id is the transport_outward ID
        transport = await db.transport_outward.find_one({"job_order_id": do.get("job_order_id")}, {"_id": 0})
        qc = None
        if transport:
            qc = await db.qc_inspections.find_one({
                "ref_type": "OUTWARD",
                "ref_id": transport.get("id")
            }, {"_id": 0})
        
        if qc and qc.get("coa_generated"):
            documents["certificate_of_analysis"] = {
                "number": qc.get("coa_number"),
                "id": qc.get("id"),
                "created_at": qc.get("coa_generated_at")
            }
        
        # For export orders, get additional documents
        if is_export:
            pl = await db.packing_lists.find_one({"do_number": do.get("do_number")}, {"_id": 0})
            if pl:
                documents["packing_list"] = {"number": pl.get("pl_number"), "id": pl.get("id"), "created_at": pl.get("created_at")}
            
            coo = await db.certificates_of_origin.find_one({"do_number": do.get("do_number")}, {"_id": 0})
            if coo:
                documents["certificate_of_origin"] = {"number": coo.get("coo_number"), "id": coo.get("id"), "created_at": coo.get("created_at")}
            
            bl = await db.bill_of_lading_drafts.find_one({"do_number": do.get("do_number")}, {"_id": 0})
            if bl:
                documents["bl_draft"] = {"number": bl.get("bl_number"), "id": bl.get("id"), "created_at": bl.get("created_at")}
        
        job_orders_with_docs.append({
            "job_id": job.get("id"),
            "job_number": job.get("job_number"),
            "customer_name": do.get("customer_name", ""),
            "customer_type": "export" if is_export else "local",
            "product_name": job.get("product_name", ""),
            "quantity": job.get("quantity", 0),
            "do_number": do.get("do_number"),
            "documents": documents,
            "created_at": do.get("issued_at")
        })
    
    return job_orders_with_docs

# ==================== SETTINGS MANAGEMENT ====================

@api_router.get("/settings/all")
async def get_all_settings(current_user: dict = Depends(get_current_user)):
    """Get all system settings - admin gets full access, others get limited access"""
    # Check if user has settings page access or is admin
    has_full_access = await has_page_access(current_user, "/settings", fallback_roles=[])
    
    if not has_full_access:
        # For non-admin users, return limited settings needed for operations
        # (bank accounts, payment terms, packaging types)
        banks_doc = await db.settings.find_one({"type": "bank_accounts"}, {"_id": 0})
        payment_terms_doc = await db.settings.find_one({"type": "payment_terms"}, {"_id": 0})
        packaging_types_doc = await db.settings.find_one({"type": "packaging_types"}, {"_id": 0})
        
        return {
            "bank_accounts": banks_doc.get("data", []) if banks_doc else [],
            "payment_terms": payment_terms_doc.get("data", []) if payment_terms_doc else [],
            "packaging_types": packaging_types_doc.get("data", []) if packaging_types_doc else [],
        }
    
    # Admin gets full access - continue with existing code
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
    
    # Get bank accounts
    banks_doc = await db.settings.find_one({"type": "bank_accounts"}, {"_id": 0})
    if not banks_doc:
        default_banks = [
            {"id": "1", "bank_name": "HABIB BANK AG ZURICH", "account_type": "US DOLLAR ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "2", "bank_name": "HABIB BANK AG ZURICH", "account_type": "EURO ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "3", "bank_name": "HABIB BANK AG ZURICH", "account_type": "UAE DIRHAMS ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "4", "bank_name": "COMMERCIAL BANK OF DUBAI", "account_type": "US DOLLAR ACCOUNT", "iban": "AE6002300001005833726", "swift": "CBDBUAEADXXX", "branch_address": "P.O. Box 2668. Al Ittihad Street. Port Saeed, Deira- DUBAI-UAE"},
            {"id": "5", "bank_name": "COMMERCIAL BANK OF DUBAI", "account_type": "UAE DIRHAMS ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "6", "bank_name": "EMIRATES ISLAMIC BANK", "account_type": "US DOLLAR ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "7", "bank_name": "EMIRATES ISLAMIC BANK", "account_type": "UAE DIRHAMS ACCOUNT", "iban": "", "swift": "", "branch_address": ""}
        ]
        await db.settings.insert_one({"type": "bank_accounts", "data": default_banks})
        banks = default_banks
    else:
        banks = banks_doc.get("data", [])
    
    # Get contact for dispatch
    contact_doc = await db.settings.find_one({"type": "contact_for_dispatch"}, {"_id": 0})
    if not contact_doc:
        default_contact = {
            "name": "Vidhesh",
            "phone": "+971 52 299 7006",
            "email": "vidhesh@asia-petrochem.com"
        }
        await db.settings.insert_one({"type": "contact_for_dispatch", "data": default_contact})
        contact_for_dispatch = default_contact
    else:
        contact_for_dispatch = contact_doc.get("data", {})
    
    return {
        "payment_terms": payment_terms,
        "document_templates": doc_templates,
        "container_types": container_types,
        "packaging_types": packaging_types,
        "companies": companies,
        "bank_accounts": banks,
        "contact_for_dispatch": contact_for_dispatch
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
    
    # Support both old format (net_weight_kg) and new format (net_weights array)
    net_weights = data.get("net_weights", [])
    if not net_weights and data.get("net_weight_kg"):
        net_weights = [data.get("net_weight_kg")]
    
    new_packaging = {
        "id": str(uuid.uuid4()),
        "name": data.get("name"),
        "type": data.get("type", ""),
        "net_weights": net_weights if isinstance(net_weights, list) else [],
        "description": data.get("description", "")
    }
    # Keep backward compatibility
    if net_weights and len(net_weights) > 0:
        new_packaging["net_weight_kg"] = net_weights[0]
    
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
    
    # Support both old format (net_weight_kg) and new format (net_weights array)
    net_weights = data.get("net_weights", [])
    if not net_weights and data.get("net_weight_kg"):
        net_weights = [data.get("net_weight_kg")]
    
    update_data = {
        "data.$.name": data.get("name"),
        "data.$.type": data.get("type", ""),
        "data.$.net_weights": net_weights if isinstance(net_weights, list) else [],
        "data.$.description": data.get("description", "")
    }
    # Keep backward compatibility
    if net_weights and len(net_weights) > 0:
        update_data["data.$.net_weight_kg"] = net_weights[0]
    
    await db.settings.update_one(
        {"type": "packaging_types", "data.id": packaging_id},
        {"$set": update_data}
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

@api_router.get("/settings/packaging-types")
async def get_packaging_types(current_user: dict = Depends(get_current_user)):
    """Get packaging types - accessible to all authenticated users"""
    packaging_types_doc = await db.settings.find_one({"type": "packaging_types"}, {"_id": 0})
    if not packaging_types_doc:
        default_packaging_types = [
            {"id": "1", "name": "200L Drum", "description": "Standard 200 liter drum"},
            {"id": "2", "name": "IBC", "description": "Intermediate Bulk Container"},
            {"id": "3", "name": "Bulk", "description": "Bulk tanker delivery"}
        ]
        return default_packaging_types
    return packaging_types_doc.get("data", [])

@api_router.get("/settings/payment-terms")
async def get_payment_terms(current_user: dict = Depends(get_current_user)):
    """Get payment terms - accessible to all authenticated users"""
    payment_terms_doc = await db.settings.find_one({"type": "payment_terms"}, {"_id": 0})
    if not payment_terms_doc:
        default_payment_terms = [
            {"id": "1", "name": "Net 30", "days": 30, "description": "Payment due in 30 days"},
            {"id": "2", "name": "Net 60", "days": 60, "description": "Payment due in 60 days"},
            {"id": "3", "name": "Advance", "days": 0, "description": "Payment in advance"},
            {"id": "4", "name": "LC", "days": 0, "description": "Letter of Credit"},
            {"id": "5", "name": "COD", "days": 0, "description": "Cash on Delivery"}
        ]
        return default_payment_terms
    return payment_terms_doc.get("data", [])

@api_router.get("/settings/bank-accounts")
async def get_bank_accounts(current_user: dict = Depends(get_current_user)):
    """Get all bank accounts - accessible to sales, user, admin, and finance roles"""
    if current_user["role"] not in ["admin", "sales", "user", "finance"]:
        raise HTTPException(status_code=403, detail="Access denied")

    banks_doc = await db.settings.find_one({"type": "bank_accounts"}, {"_id": 0})
    if not banks_doc:
        # Return default banks if none configured
        default_banks = [
            {"id": "1", "bank_name": "HABIB BANK AG ZURICH", "account_type": "US DOLLAR ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "2", "bank_name": "HABIB BANK AG ZURICH", "account_type": "EURO ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "3", "bank_name": "HABIB BANK AG ZURICH", "account_type": "UAE DIRHAMS ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "4", "bank_name": "COMMERCIAL BANK OF DUBAI", "account_type": "US DOLLAR ACCOUNT", "iban": "AE6002300001005833726", "swift": "CBDBUAEADXXX", "branch_address": "P.O. Box 2668. Al Ittihad Street. Port Saeed, Deira- DUBAI-UAE"},
            {"id": "5", "bank_name": "COMMERCIAL BANK OF DUBAI", "account_type": "UAE DIRHAMS ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "6", "bank_name": "EMIRATES ISLAMIC BANK", "account_type": "US DOLLAR ACCOUNT", "iban": "", "swift": "", "branch_address": ""},
            {"id": "7", "bank_name": "EMIRATES ISLAMIC BANK", "account_type": "UAE DIRHAMS ACCOUNT", "iban": "", "swift": "", "branch_address": ""}
        ]
        return default_banks
    
    return banks_doc.get("data", [])

@api_router.post("/settings/bank-accounts")
async def create_bank_account(data: dict, current_user: dict = Depends(get_current_user)):
    """Add a new bank account"""
    if current_user["role"] not in ["admin", "sales", "user"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    doc = await db.settings.find_one({"type": "bank_accounts"})
    if not doc:
        doc = {"type": "bank_accounts", "data": []}
        await db.settings.insert_one(doc)
    
    new_bank = {
        "id": str(uuid.uuid4()),
        "bank_name": data.get("bank_name"),
        "account_type": data.get("account_type"),
        "iban": data.get("iban", ""),
        "swift": data.get("swift", ""),
        "branch_address": data.get("branch_address", "")
    }
    await db.settings.update_one(
        {"type": "bank_accounts"},
        {"$push": {"data": new_bank}}
    )
    return new_bank

@api_router.put("/settings/bank-accounts/{bank_id}")
async def update_bank_account(bank_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a bank account"""
    if current_user["role"] not in ["admin", "sales", "user"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.settings.update_one(
        {"type": "bank_accounts", "data.id": bank_id},
        {"$set": {
            "data.$.bank_name": data.get("bank_name"),
            "data.$.account_type": data.get("account_type"),
            "data.$.iban": data.get("iban", ""),
            "data.$.swift": data.get("swift", ""),
            "data.$.branch_address": data.get("branch_address", "")
        }}
    )
    return {"success": True}

@api_router.delete("/settings/bank-accounts/{bank_id}")
async def delete_bank_account(bank_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a bank account"""
    if current_user["role"] not in ["admin", "sales", "user"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.settings.update_one(
        {"type": "bank_accounts"},
        {"$pull": {"data": {"id": bank_id}}}
    )
    return {"success": True}

# ==================== PRODUCT PACKAGING CONFIGURATIONS ====================

@api_router.get("/product-packaging-configs")
async def get_product_packaging_configs(
    product_id: Optional[str] = Query(None),
    packaging_type: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Get all product packaging configurations, optionally filtered"""
    query = {}
    if product_id:
        query["product_id"] = product_id
    if packaging_type:
        query["packaging_type"] = packaging_type
    
    configs = await db.product_packaging_configs.find(query, {"_id": 0}).to_list(1000)
    return configs

@api_router.post("/product-packaging-configs")
async def create_product_packaging_config(
    config: ProductPackagingConfigCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new product packaging configuration"""
    if current_user["role"] not in ["admin", "inventory"]:
        raise HTTPException(status_code=403, detail="Only admin/inventory can manage configurations")
    
    # Check if product exists
    product = await db.products.find_one({"id": config.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Check for duplicate
    existing = await db.product_packaging_configs.find_one({
        "product_id": config.product_id,
        "packaging_name": config.packaging_name,
        "packaging_type": config.packaging_type
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Configuration already exists for this product-packaging combination")
    
    config_dict = config.model_dump()
    config_dict["id"] = str(uuid.uuid4())
    config_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    config_dict["updated_at"] = config_dict["created_at"]
    
    await db.product_packaging_configs.insert_one(config_dict)
    return {"id": config_dict["id"], **config_dict}

@api_router.put("/product-packaging-configs/{config_id}")
async def update_product_packaging_config(
    config_id: str,
    config: ProductPackagingConfigCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a product packaging configuration"""
    if current_user["role"] not in ["admin", "inventory"]:
        raise HTTPException(status_code=403, detail="Only admin/inventory can manage configurations")
    
    config_dict = config.model_dump()
    config_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.product_packaging_configs.update_one(
        {"id": config_id},
        {"$set": config_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    return {"message": "Configuration updated successfully"}

@api_router.delete("/product-packaging-configs/{config_id}")
async def delete_product_packaging_config(
    config_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a product packaging configuration"""
    if current_user["role"] not in ["admin", "inventory"]:
        raise HTTPException(status_code=403, detail="Only admin/inventory can manage configurations")
    
    result = await db.product_packaging_configs.delete_one({"id": config_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    return {"message": "Configuration deleted successfully"}

@api_router.get("/product-packaging-configs/lookup")
async def lookup_product_packaging_config(
    product_id: str = Query(...),
    packaging_name: str = Query(...),
    container_type: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user_optional)
):
    """Lookup packaging configuration for a product-packaging-container combination"""
    query = {
        "product_id": product_id,
        "packaging_name": packaging_name,
        "is_active": True
    }
    
    config = await db.product_packaging_configs.find_one(query, {"_id": 0})
    
    if not config:
        return None
    
    # Return all relevant data
    # Determine net weight based on packaging_type from config
    net_weight_kg = None
    packaging_type = config.get("packaging_type", "").lower()
    
    if packaging_type in ["drum", "carton"]:
        net_weight_kg = config.get("drum_carton_filling_kg")
    elif packaging_type == "ibc":
        net_weight_kg = config.get("ibc_filling_kg")
    elif packaging_type in ["flexi/iso", "flexi", "iso"]:
        flexi_mt = config.get("flexi_iso_filling_mt")
        if flexi_mt:
            net_weight_kg = flexi_mt * 1000  # Convert MT to KG
    
    result = {
        "packaging_type": config.get("packaging_type"),  # Include packaging_type in response
        "net_weight_kg": net_weight_kg,
        "drum_carton_filling_kg": config.get("drum_carton_filling_kg"),
        "ibc_filling_kg": config.get("ibc_filling_kg"),
        "flexi_iso_filling_mt": config.get("flexi_iso_filling_mt"),
        "hscode": config.get("hscode"),
        "origin": config.get("origin"),
    }
    
    # Add container-specific data
    if container_type == "20ft":
        result["total_units_palletised"] = config.get("container_20ft_palletised")
        result["total_units_non_palletised"] = config.get("container_20ft_non_palletised")
        result["total_ibc"] = config.get("container_20ft_ibc")
        result["total_nw_mt"] = config.get("container_20ft_total_nw_mt")
    elif container_type == "40ft":
        result["total_units_palletised"] = config.get("container_40ft_palletised")
        result["total_units_non_palletised"] = config.get("container_40ft_non_palletised")
        result["total_ibc"] = config.get("container_40ft_ibc")
        result["total_nw_mt"] = config.get("container_40ft_total_nw_mt")
    
    return result

@api_router.post("/product-packaging-configs/import-excel")
async def import_product_packaging_configs_excel(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Import product packaging configurations from Excel file"""
    if current_user["role"] not in ["admin", "inventory"]:
        raise HTTPException(status_code=403, detail="Only admin/inventory can import configurations")
    
    try:
        import pandas as pd
        from io import BytesIO
        
        # Read Excel file
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents))
        
        # Helper functions to parse values
        def parse_numeric(value, default=None):
            if pd.isna(value) or str(value).strip().upper() in ['NA', 'N/A', '', 'NONE', 'NULL']:
                return default
            try:
                return float(value)
            except:
                return default
        
        def parse_int(value, default=None):
            if pd.isna(value) or str(value).strip().upper() in ['NA', 'N/A', '', 'NONE', 'NULL']:
                return default
            try:
                return int(float(value))
            except:
                return default
        
        imported = 0
        updated = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # Get product by name (case-insensitive)
                product = await db.products.find_one(
                    {"name": {"$regex": f"^{re.escape(str(row.get('Product Name', '')))}$", "$options": "i"}},
                    {"_id": 0}
                )
                
                if not product:
                    errors.append(f"Row {idx+2}: Product '{row.get('Product Name', '')}' not found")
                    continue
                
                packaging_type = str(row.get("Packaging Type", "")).strip()
                packaging_name = str(row.get("Packaging Name", "")).strip()
                
                if not packaging_name:
                    errors.append(f"Row {idx+2}: Packaging Name is required")
                    continue
                
                # Check if config already exists
                existing = await db.product_packaging_configs.find_one({
                    "product_id": product["id"],
                    "packaging_name": packaging_name,
                    "packaging_type": packaging_type
                })
                
                config_data = {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "packaging_type": packaging_type,
                    "packaging_name": packaging_name,
                    
                    # Specific filling fields
                    "drum_carton_filling_kg": parse_numeric(row.get("Drum/Carton Fillings (KG)")),
                    "ibc_filling_kg": parse_numeric(row.get("IBC Fillings (KG)")),
                    "flexi_iso_filling_mt": parse_numeric(row.get("Flexi/ISO Fillings (MT)")),
                    
                    # 20ft Container fields
                    "container_20ft_palletised": parse_int(row.get("20ft Palletised")),
                    "container_20ft_non_palletised": parse_int(row.get("20ft Non-Palletised")),
                    "container_20ft_ibc": parse_int(row.get("20ft IBC")),
                    "container_20ft_total_nw_mt": parse_numeric(row.get("20ft Total NW (MT)")),
                    
                    # 40ft Container fields
                    "container_40ft_palletised": parse_int(row.get("40ft Palletised")),
                    "container_40ft_non_palletised": parse_int(row.get("40ft Non-Palletised")),
                    "container_40ft_ibc": parse_int(row.get("40ft IBC")),
                    "container_40ft_total_nw_mt": parse_numeric(row.get("40ft Total NW (MT)")),
                    
                    # Classification
                    "hscode": str(row.get("HS Code", "")).strip() if pd.notna(row.get("HS Code")) else None,
                    "origin": str(row.get("Origin", "")).strip() if pd.notna(row.get("Origin")) else None,
                    
                    "is_active": True,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                
                if existing:
                    # Update existing
                    await db.product_packaging_configs.update_one(
                        {"id": existing["id"]},
                        {"$set": config_data}
                    )
                    updated += 1
                else:
                    # Create new
                    config_data["id"] = str(uuid.uuid4())
                    config_data["created_at"] = datetime.now(timezone.utc).isoformat()
                    await db.product_packaging_configs.insert_one(config_data)
                    imported += 1
                
            except Exception as e:
                errors.append(f"Row {idx+2}: {str(e)}")
        
        return {
            "message": f"Import completed: {imported} new, {updated} updated",
            "imported": imported,
            "updated": updated,
            "errors": errors
        }
        
    except Exception as e:
        import traceback
        logging.error(f"Excel import error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Failed to import Excel: {str(e)}")

@api_router.get("/settings/contact-for-dispatch")
async def get_contact_for_dispatch(current_user: dict = Depends(get_current_user)):
    """Get contact for dispatch information"""
    settings = await db.settings.find_one({"type": "contact_for_dispatch"}, {"_id": 0})
    if settings and settings.get("data"):
        return settings["data"]
    # Return default
    return {
        "name": "Dispatch Department",
        "phone": "+971 4 2384533",
        "email": "dispatch@asia-petrochem.com",
        "address": "Plot # A 23 B, Al Jazeera Industrial Area, Ras Al Khaimah, UAE"
    }

@api_router.put("/settings/contact-for-dispatch")
async def update_contact_for_dispatch(data: dict, current_user: dict = Depends(get_current_user)):
    """Update contact for dispatch information"""
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can update contact for dispatch")
    
    result = await db.settings.update_one(
        {"type": "contact_for_dispatch"},
        {
            "$set": {
                "type": "contact_for_dispatch",
                "data": data,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user["id"]
            }
        },
        upsert=True
    )
    return {"message": "Contact for dispatch updated successfully", "data": data}

@api_router.post("/migrate/vehicle-fields")
async def migrate_vehicle_fields(current_user: dict = Depends(get_current_user)):
    """
    Migration endpoint: Add vehicle_type, vehicle_number, and driver_name fields to existing records.
    This populates the new vehicle-related fields that were added to TransportInward, TransportOutward, and DeliveryOrder models.
    """
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can run migrations")
    
    results = {
        "transport_inward": {"updated": 0, "total": 0},
        "transport_outward": {"updated": 0, "total": 0},
        "delivery_orders": {"updated": 0, "total": 0}
    }
    
    # 1. Update TransportInward records - add vehicle_type if missing
    inward_count = await db.transport_inward.count_documents({})
    inward_result = await db.transport_inward.update_many(
        {"vehicle_type": {"$exists": False}},
        {"$set": {"vehicle_type": None}}
    )
    results["transport_inward"]["updated"] = inward_result.modified_count
    results["transport_inward"]["total"] = inward_count
    
    # 2. Update TransportOutward records - add vehicle_type and driver_name if missing
    outward_count = await db.transport_outward.count_documents({})
    
    # Update vehicle_type
    outward_vehicle_type_result = await db.transport_outward.update_many(
        {"vehicle_type": {"$exists": False}},
        {"$set": {"vehicle_type": None}}
    )
    
    # Update driver_name
    outward_driver_result = await db.transport_outward.update_many(
        {"driver_name": {"$exists": False}},
        {"$set": {"driver_name": None}}
    )
    
    results["transport_outward"]["updated"] = max(
        outward_vehicle_type_result.modified_count,
        outward_driver_result.modified_count
    )
    results["transport_outward"]["total"] = outward_count
    
    # 3. Update DeliveryOrder records - add vehicle_type if missing
    do_count = await db.delivery_orders.count_documents({})
    do_result = await db.delivery_orders.update_many(
        {"vehicle_type": {"$exists": False}},
        {"$set": {"vehicle_type": None}}
    )
    results["delivery_orders"]["updated"] = do_result.modified_count
    results["delivery_orders"]["total"] = do_count
    
    return {
        "message": "Vehicle fields migration completed",
        "results": results,
        "summary": {
            "transport_inward_updated": results["transport_inward"]["updated"],
            "transport_outward_updated": results["transport_outward"]["updated"],
            "delivery_orders_updated": results["delivery_orders"]["updated"],
            "total_records_processed": results["transport_inward"]["total"] + results["transport_outward"]["total"] + results["delivery_orders"]["total"]
        }
    }

# File Upload/Download Endpoints
@api_router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a file and return the file path"""
    try:
        # Generate unique filename
        file_ext = Path(file.filename).suffix if file.filename else ''
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{file_ext}"
        file_path = UPLOAD_DIR / filename
        
        # Save file
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
        
        # Return file path relative to uploads directory
        return {
            "success": True,
            "path": filename,
            "file_id": file_id,
            "id": filename,
            "original_filename": file.filename
        }
    except Exception as e:
        logging.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")



@api_router.get("/files/{file_path:path}")
async def get_file(
    file_path: str,
    token: Optional[str]=None,
    current_user: dict = Depends(get_current_user_optional) 
):
    """Serve uploaded file"""
    try:
        file_full_path = UPLOAD_DIR / file_path
        if not file_full_path.exists() or not file_full_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Security check: ensure file is within upload directory
        if not str(file_full_path.resolve()).startswith(str(UPLOAD_DIR.resolve())):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Determine content type
        content_type = "application/octet-stream"
        if file_path.lower().endswith('.pdf'):
            content_type = "application/pdf"
        elif file_path.lower().endswith(('.jpg', '.jpeg')):
            content_type = "image/jpeg"
        elif file_path.lower().endswith('.png'):
            content_type = "image/png"
        
        return StreamingResponse(
            open(file_full_path, "rb"),
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_path}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"File retrieval error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve file: {str(e)}")

app.include_router(api_router)
# API routes registered

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
    # Create indexes for product_packaging_configs collection
    try:
        await db.product_packaging_configs.create_index([("product_id", 1), ("packaging_name", 1), ("packaging_type", 1)], unique=True, name="product_packaging_unique")
        await db.product_packaging_configs.create_index([("product_id", 1)], name="product_id_idx")
        await db.product_packaging_configs.create_index([("is_active", 1)], name="is_active_idx")
        logging.info("Product packaging configs indexes created")
    except Exception as e:
        logging.warning(f"Failed to create product_packaging_configs indexes: {e}")
    """Start background tasks"""
    # Start the orphaned dispatch routing checker
    asyncio.create_task(check_orphaned_dispatch_routing())
    logger.info("Started orphaned dispatch routing background task")

# ==================== SHIPPING LINES MANAGEMENT ====================

@api_router.get("/shipping-lines")
async def get_shipping_lines(current_user: dict = Depends(get_current_user)):
    """Get all shipping lines"""
    shipping_lines = await db.shipping_lines.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return shipping_lines

@api_router.post("/shipping-lines")
async def create_shipping_line(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new shipping line"""
    if not data.get("name"):
        raise HTTPException(status_code=400, detail="Shipping line name is required")
    
    # Check if shipping line already exists
    existing = await db.shipping_lines.find_one({"name": {"$regex": f"^{data['name']}$", "$options": "i"}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Shipping line '{data['name']}' already exists")
    
    shipping_line = {
        "id": str(uuid.uuid4()),
        "name": data.get("name", "").strip(),
        "code": data.get("code", "").strip(),
        "contact_person": data.get("contact_person", ""),
        "contact_email": data.get("contact_email", ""),
        "contact_phone": data.get("contact_phone", ""),
        "website": data.get("website", ""),
        "is_active": data.get("is_active", True),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.shipping_lines.insert_one(shipping_line)
    return shipping_line

@api_router.put("/shipping-lines/{shipping_line_id}")
async def update_shipping_line(shipping_line_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a shipping line"""
    if not data.get("name"):
        raise HTTPException(status_code=400, detail="Shipping line name is required")
    
    # Check if another shipping line with the same name exists
    existing = await db.shipping_lines.find_one({
        "name": {"$regex": f"^{data['name']}$", "$options": "i"},
        "id": {"$ne": shipping_line_id}
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Shipping line '{data['name']}' already exists")
    
    update_data = {
        "name": data.get("name", "").strip(),
        "code": data.get("code", "").strip(),
        "contact_person": data.get("contact_person", ""),
        "contact_email": data.get("contact_email", ""),
        "contact_phone": data.get("contact_phone", ""),
        "website": data.get("website", ""),
        "is_active": data.get("is_active", True),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    
    result = await db.shipping_lines.update_one(
        {"id": shipping_line_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Shipping line not found")
    
    updated = await db.shipping_lines.find_one({"id": shipping_line_id}, {"_id": 0})
    return updated

@api_router.delete("/shipping-lines/{shipping_line_id}")
async def delete_shipping_line(shipping_line_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a shipping line"""
    # Check if shipping line is used in any bookings
    booking_count = await db.shipping_bookings.count_documents({"shipping_line": {"$regex": shipping_line_id, "$options": "i"}})
    if booking_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete shipping line: it is used in {booking_count} booking(s). Deactivate it instead."
        )
    
    result = await db.shipping_lines.delete_one({"id": shipping_line_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Shipping line not found")
    
    return {"message": "Shipping line deleted successfully"}

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
