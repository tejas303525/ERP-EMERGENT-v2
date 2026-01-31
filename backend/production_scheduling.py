"""
DRUMS-ONLY Production Scheduling Module
Phase 1: Capacity-aware weekly planning with material availability
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta, date
import uuid

# ==================== MODELS ====================

# A) Products (extend existing)
class ProductType:
    MANUFACTURED = "MANUFACTURED"
    TRADED = "TRADED"

# B) Packaging (customizable drums)
class PackagingCreate(BaseModel):
    name: str
    category: str = "DRUM"  # DRUM, BOTTLE, BAG, etc.
    material_type: str  # STEEL, HDPE, RECON
    capacity_liters: float  # 200, 210, 250
    tare_weight_kg: Optional[float] = None
    net_weight_kg_default: Optional[float] = None  # default net weight
    is_active: bool = True

class Packaging(PackagingCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# C) Inventory Items (RAW + PACK)
class InventoryItemType:
    RAW = "RAW"
    PACK = "PACK"

class InventoryItemCreate(BaseModel):
    sku: str
    name: str
    item_type: str  # RAW or PACK
    uom: str  # KG or EA
    is_active: bool = True

class InventoryItem(InventoryItemCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class InventoryBalance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_id: str
    warehouse_id: str = "MAIN"  # default warehouse
    on_hand: float = 0

class InventoryReservation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_id: str
    ref_type: str  # SCHEDULE_DAY, JOB_ORDER, etc.
    ref_id: str
    qty: float
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# D) Job Orders (extend existing)
class JobOrderItemCreate(BaseModel):
    job_order_id: str
    product_id: str
    packaging_id: str
    qty_drums: int
    delivery_date: str  # ISO date
    spec_id: Optional[str] = None
    bom_version: Optional[int] = None

class JobOrderItem(JobOrderItemCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "OPEN"  # OPEN, ALLOCATED, IN_PRODUCTION, DONE
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# E) Product BOM Master (KG-based)
class ProductBOMCreate(BaseModel):
    product_id: str
    version: int
    is_active: bool = True
    notes: Optional[str] = None

class ProductBOM(ProductBOMCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ProductBOMItemCreate(BaseModel):
    bom_id: str
    material_item_id: str
    qty_kg_per_kg_finished: float  # e.g., 0.5 means 0.5 kg material per 1 kg finished

class ProductBOMItem(ProductBOMItemCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

# F) Product-Packaging conversion specs
class ProductPackagingSpecCreate(BaseModel):
    product_id: str
    packaging_id: str
    net_weight_kg: float  # finished product KG per drum
    is_default: bool = False

class ProductPackagingSpec(ProductPackagingSpecCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

# G) Packaging BOM (packaging materials per drum)
class PackagingBOMCreate(BaseModel):
    packaging_id: str
    is_active: bool = True

class PackagingBOM(PackagingBOMCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PackagingBOMItemCreate(BaseModel):
    packaging_bom_id: str
    pack_item_id: str  # inventory_item_id for packaging component
    qty_per_drum: float
    uom: str  # EA or KG

class PackagingBOMItem(PackagingBOMItemCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

# H) Procurement + POs
class SupplierCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True

class Supplier(SupplierCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ProcurementRequisitionCreate(BaseModel):
    notes: Optional[str] = None

class ProcurementRequisition(ProcurementRequisitionCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "DRAFT"  # DRAFT, APPROVED, PO_CREATED
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ProcurementRequisitionLineCreate(BaseModel):
    pr_id: str
    item_id: str
    item_type: str  # RAW or PACK
    qty: float
    uom: str  # KG or EA
    required_by: Optional[str] = None  # ISO date - optional
    linked_campaign_id: Optional[str] = None
    linked_schedule_day_id: Optional[str] = None
    reason: Optional[str] = None

class ProcurementRequisitionLine(ProcurementRequisitionLineCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    supplier_name: str = ""
    currency: str = "USD"
    total_amount: float = 0
    rfq_id: Optional[str] = None
    quotation_id: Optional[str] = None  # Reference to quotation/PFI
    pfi_number: Optional[str] = None  # PFI number for display
    notes: Optional[str] = None
    incoterm: str = "EXW"
    payment_terms: str = "Net 30"
    delivery_date: Optional[str] = None

class PurchaseOrder(PurchaseOrderCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    po_number: str = ""
    status: str = "DRAFT"  # DRAFT, APPROVED, SENT, PARTIAL, RECEIVED, REJECTED
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    sent_at: Optional[str] = None
    email_status: str = "NOT_CONFIGURED"  # NOT_CONFIGURED, QUEUED, SENT, FAILED
    routed_to: Optional[str] = None
    routed_at: Optional[str] = None

class PurchaseOrderLineCreate(BaseModel):
    po_id: str
    item_id: str
    item_type: str  # RAW or PACK
    qty: float
    uom: str
    unit_price: float = 0
    required_by: Optional[str] = None  # ISO date
    promised_delivery_date: Optional[str] = None  # ETA from supplier
    procurement_type: Optional[str] = None  # Bulk or Drummed
    packaging_item_id: Optional[str] = None  # Packaging inventory item ID when procurement_type is Drummed
    packaging_qty: Optional[float] = None  # Quantity of packaging units needed

class PurchaseOrderLine(PurchaseOrderLineCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    received_qty: float = 0
    status: str = "OPEN"  # OPEN, PARTIAL, RECEIVED

class EmailOutboxCreate(BaseModel):
    to: str
    subject: str
    body: str
    ref_type: str  # PO, NOTIFICATION, etc.
    ref_id: str

class EmailOutbox(EmailOutboxCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "QUEUED"  # QUEUED, SENT, FAILED
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    sent_at: Optional[str] = None
    error_message: Optional[str] = None

# Production Scheduling Models
class ProductionCapacityConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    line_type: str = "DRUM"
    daily_capacity: int = 600  # drums per day

class ProductionCampaignCreate(BaseModel):
    product_id: str
    packaging_id: str
    spec_id: Optional[str] = None
    bom_id: str
    bom_version: int
    total_drums: int
    earliest_due_date: str  # ISO date

class ProductionCampaign(ProductionCampaignCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "DRAFT"  # DRAFT, READY, BLOCKED, IN_PROGRESS, DONE
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ProductionCampaignJobLink(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    campaign_id: str
    job_order_item_id: str
    drums_allocated: int

class ProductionScheduleDayCreate(BaseModel):
    week_start: str  # ISO date (Monday)
    schedule_date: str  # ISO date
    campaign_id: str
    planned_drums: int

class ProductionScheduleDay(ProductionScheduleDayCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "DRAFT"  # DRAFT, READY, BLOCKED, IN_PROGRESS, DONE
    blocking_reason: str = "NONE"  # NONE, BOM_MISSING, CONVERSION_MISSING, RAW_SHORTAGE, PACK_SHORTAGE, CAPACITY
    blocking_details: Optional[Dict[str, Any]] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ProductionDayRequirement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    schedule_day_id: str
    item_id: str
    item_type: str  # RAW or PACK
    required_qty: float
    available_qty_snapshot: float
    shortage_qty: float

# ==================== HELPER CLASSES ====================

class ConsolidationKey:
    """Key for consolidating job orders into campaigns"""
    def __init__(self, product_id: str, packaging_id: str, spec_id: Optional[str], bom_id: str):
        self.product_id = product_id
        self.packaging_id = packaging_id
        self.spec_id = spec_id or "NONE"
        self.bom_id = bom_id
    
    def __hash__(self):
        return hash((self.product_id, self.packaging_id, self.spec_id, self.bom_id))
    
    def __eq__(self, other):
        return (self.product_id == other.product_id and 
                self.packaging_id == other.packaging_id and
                self.spec_id == other.spec_id and
                self.bom_id == other.bom_id)

class CampaignData:
    """Temporary data structure for campaign consolidation"""
    def __init__(self, product_id: str, packaging_id: str, spec_id: Optional[str], bom_id: str, bom_version: int):
        self.product_id = product_id
        self.packaging_id = packaging_id
        self.spec_id = spec_id
        self.bom_id = bom_id
        self.bom_version = bom_version
        self.total_drums = 0
        self.earliest_due_date: Optional[datetime] = None
        self.job_links: List[Dict[str, Any]] = []
    
    def add_job_item(self, job_item: Dict[str, Any]):
        """Add a job order item to this campaign"""
        self.total_drums += job_item['qty_drums']
        
        due_date = datetime.fromisoformat(job_item['delivery_date'].replace('Z', '+00:00'))
        if self.earliest_due_date is None or due_date < self.earliest_due_date:
            self.earliest_due_date = due_date
        
        self.job_links.append({
            'job_order_item_id': job_item['id'],
            'drums_allocated': job_item['qty_drums']
        })

# ==================== SCHEDULING ALGORITHM ====================

class ProductionScheduler:
    """Main scheduling algorithm for drums-only production"""
    
    def __init__(self, db):
        self.db = db
        self.daily_capacity = 600  # drums per day
    
    async def get_net_weight_kg(self, product_id: str, packaging_id: str) -> Optional[float]:
        """
        Get net weight KG per drum using conversion rules:
        1) product_packaging_specs.net_weight_kg
        2) packaging.net_weight_kg_default
        3) packaging.capacity_liters * product.density_kg_per_l
        Returns None if conversion not possible
        """
        # Try product-packaging spec first
        spec = await self.db.product_packaging_specs.find_one({
            'product_id': product_id,
            'packaging_id': packaging_id
        })
        if spec and spec.get('net_weight_kg'):
            return spec['net_weight_kg']
        
        # Try packaging default
        packaging = await self.db.packaging.find_one({'id': packaging_id})
        if packaging and packaging.get('net_weight_kg_default'):
            return packaging['net_weight_kg_default']
        
        # Try density calculation
        product = await self.db.products.find_one({'id': product_id})
        if (packaging and packaging.get('capacity_liters') and 
            product and product.get('density_kg_per_l')):
            return packaging['capacity_liters'] * product['density_kg_per_l']
        
        return None
    
    async def get_available_quantity(self, item_id: str, schedule_date: date) -> float:
        """
        Calculate available quantity for an item on a given date:
        available = on_hand - reserved + inbound_po_qty
        """
        # Get on-hand quantity
        balance = await self.db.inventory_balances.find_one({'item_id': item_id})
        on_hand = balance['on_hand'] if balance else 0
        
        # Get reserved quantity
        reservations = await self.db.inventory_reservations.find({'item_id': item_id}).to_list(None)
        reserved = sum(r['qty'] for r in reservations)
        
        # Get inbound PO quantities (promised_delivery_date <= schedule_date)
        pipeline = [
            {'$match': {
                'item_id': item_id,
                'promised_delivery_date': {'$lte': schedule_date.isoformat()}
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
            {'$project': {
                'inbound_qty': {'$subtract': ['$qty', '$received_qty']}
            }}
        ]
        
        inbound_lines = await self.db.purchase_order_lines.aggregate(pipeline).to_list(None)
        inbound = sum(line['inbound_qty'] for line in inbound_lines if line['inbound_qty'] > 0)
        
        return on_hand - reserved + inbound
    
    async def regenerate_schedule(self, week_start_str: str) -> Dict[str, Any]:
        """
        Main scheduling algorithm - regenerates weekly schedule
        Returns summary with campaigns created, days scheduled, blocked reasons
        """
        week_start = datetime.fromisoformat(week_start_str).date()
        
        # Step 1: Pull open job orders (DRUM packaging only)
        # Using existing job_orders structure with packaging_type field
        pipeline = [
            {'$lookup': {
                'from': 'products',
                'localField': 'product_id',
                'foreignField': 'id',
                'as': 'product'
            }},
            {'$unwind': '$product'},
            {'$lookup': {
                'from': 'packaging',
                'localField': 'packaging_id',
                'foreignField': 'id',
                'as': 'packaging'
            }},
            {'$unwind': '$packaging'},
            {'$match': {
                'status': {'$in': ['pending', 'in_production']},
                'packaging_type': 'DRUM',
                'product.type': 'MANUFACTURED'
            }}
        ]
        
        job_items = await self.db.job_orders.aggregate(pipeline).to_list(None)
        
        if not job_items:
            return {
                'success': True,
                'message': 'No open drum job orders found',
                'campaigns_created': 0,
                'schedule_days': 0
            }
        
        # Step 2: Consolidate into campaigns
        campaigns_map: Dict[ConsolidationKey, CampaignData] = {}
        
        for job_item in job_items:
            # Get active BOM for product
            bom_version = job_item.get('bom_version')
            if bom_version:
                bom = await self.db.product_boms.find_one({
                    'product_id': job_item['product_id'],
                    'version': bom_version
                })
            else:
                bom = await self.db.product_boms.find_one({
                    'product_id': job_item['product_id'],
                    'is_active': True
                })
            
            if not bom:
                # Skip items without BOM - will be marked as blocked later
                continue
            
            key = ConsolidationKey(
                job_item['product_id'],
                job_item['packaging_id'],
                job_item.get('spec_id'),
                bom['id']
            )
            
            if key not in campaigns_map:
                campaigns_map[key] = CampaignData(
                    job_item['product_id'],
                    job_item['packaging_id'],
                    job_item.get('spec_id'),
                    bom['id'],
                    bom['version']
                )
            
            # For existing job_orders, quantity field is in drums
            campaigns_map[key].add_job_item({
                'id': job_item['id'],
                'qty_drums': int(job_item['quantity']),  # quantity is already in drums
                'delivery_date': job_item.get('delivery_date', datetime.now(timezone.utc).isoformat())
            })
        
        # Step 3: Sort campaigns by earliest due date
        campaigns_list = sorted(
            campaigns_map.values(),
            key=lambda c: c.earliest_due_date or datetime.max
        )
        
        # Delete existing DRAFT schedule days for this week
        await self.db.production_schedule_days.delete_many({
            'week_start': week_start_str,
            'status': 'DRAFT'
        })
        
        # Step 4: Allocate campaigns across 7 days
        schedule_days = []
        daily_allocations = {i: [] for i in range(7)}  # day_offset -> list of allocations
        
        for campaign_data in campaigns_list:
            remaining_drums = campaign_data.total_drums
            day_offset = 0
            
            while remaining_drums > 0 and day_offset < 7:
                # Calculate remaining capacity for this day
                day_total = sum(a['drums'] for a in daily_allocations[day_offset])
                day_remaining = self.daily_capacity - day_total
                
                if day_remaining > 0:
                    # Allocate what we can to this day
                    drums_to_allocate = min(remaining_drums, day_remaining)
                    
                    daily_allocations[day_offset].append({
                        'campaign_data': campaign_data,
                        'drums': drums_to_allocate
                    })
                    
                    remaining_drums -= drums_to_allocate
                
                if remaining_drums > 0:
                    day_offset += 1
            
            if remaining_drums > 0:
                # Campaign doesn't fit in 7 days - still create it but mark as blocked
                pass
        
        # Step 5: Create campaign records and schedule day records
        campaigns_created = 0
        schedule_days_created = 0
        
        for campaign_data in campaigns_list:
            # Create campaign
            campaign = ProductionCampaign(
                product_id=campaign_data.product_id,
                packaging_id=campaign_data.packaging_id,
                spec_id=campaign_data.spec_id,
                bom_id=campaign_data.bom_id,
                bom_version=campaign_data.bom_version,
                total_drums=campaign_data.total_drums,
                earliest_due_date=campaign_data.earliest_due_date.isoformat() if campaign_data.earliest_due_date else datetime.now(timezone.utc).isoformat()
            )
            
            await self.db.production_campaigns.insert_one(campaign.model_dump())
            campaigns_created += 1
            
            # Create job links
            for job_link in campaign_data.job_links:
                link = ProductionCampaignJobLink(
                    campaign_id=campaign.id,
                    job_order_item_id=job_link['job_order_item_id'],  # This is now job_order id
                    drums_allocated=job_link['drums_allocated']
                )
                await self.db.production_campaign_job_links.insert_one(link.model_dump())
        
        # Step 6: Create schedule days and check material availability
        for day_offset in range(7):
            schedule_date = week_start + timedelta(days=day_offset)
            
            for allocation in daily_allocations[day_offset]:
                campaign_data = allocation['campaign_data']
                planned_drums = allocation['drums']
                
                # Find the campaign record we created
                campaign_record = await self.db.production_campaigns.find_one({
                    'product_id': campaign_data.product_id,
                    'packaging_id': campaign_data.packaging_id,
                    'bom_id': campaign_data.bom_id
                })
                
                if not campaign_record:
                    continue
                
                # Create schedule day
                schedule_day = ProductionScheduleDay(
                    week_start=week_start_str,
                    schedule_date=schedule_date.isoformat(),
                    campaign_id=campaign_record['id'],
                    planned_drums=planned_drums
                )
                
                # Check material availability
                await self._check_material_availability(schedule_day, campaign_record)
                
                await self.db.production_schedule_days.insert_one(schedule_day.model_dump())
                schedule_days_created += 1
        
        return {
            'success': True,
            'message': f'Schedule regenerated for week starting {week_start_str}',
            'campaigns_created': campaigns_created,
            'schedule_days_created': schedule_days_created,
            'week_start': week_start_str
        }
    
    async def _check_material_availability(self, schedule_day: ProductionScheduleDay, campaign: Dict[str, Any]):
        """Check RAW and PACK material availability for a schedule day"""
        schedule_date = datetime.fromisoformat(schedule_day.schedule_date).date()
        
        # Get net weight conversion
        net_weight_kg = await self.get_net_weight_kg(
            campaign['product_id'],
            campaign['packaging_id']
        )
        
        if not net_weight_kg:
            schedule_day.status = "BLOCKED"
            schedule_day.blocking_reason = "CONVERSION_MISSING"
            schedule_day.blocking_details = {
                'message': 'Net weight KG per drum not configured'
            }
            return
        
        # Calculate finished KG
        finished_kg = schedule_day.planned_drums * net_weight_kg
        
        # Check RAW materials from BOM
        bom_items = await self.db.product_bom_items.find({
            'bom_id': campaign['bom_id']
        }).to_list(None)
        
        if not bom_items:
            schedule_day.status = "BLOCKED"
            schedule_day.blocking_reason = "BOM_MISSING"
            schedule_day.blocking_details = {
                'message': 'No BOM items configured for this product'
            }
            return
        
        shortages = []
        
        # Check each RAW material
        for bom_item in bom_items:
            required_kg = finished_kg * bom_item['qty_kg_per_kg_finished']
            available = await self.get_available_quantity(bom_item['material_item_id'], schedule_date)
            
            shortage = max(0, required_kg - available)
            
            # Create requirement record
            requirement = ProductionDayRequirement(
                schedule_day_id=schedule_day.id,
                item_id=bom_item['material_item_id'],
                item_type='RAW',
                required_qty=required_kg,
                available_qty_snapshot=available,
                shortage_qty=shortage
            )
            await self.db.production_day_requirements.insert_one(requirement.model_dump())
            
            if shortage > 0:
                material = await self.db.inventory_items.find_one({'id': bom_item['material_item_id']})
                shortages.append({
                    'item_id': bom_item['material_item_id'],
                    'item_name': material['name'] if material else 'Unknown',
                    'item_type': 'RAW',
                    'required': required_kg,
                    'available': available,
                    'shortage': shortage
                })
        
        # Check PACK materials from packaging BOM
        packaging_bom = await self.db.packaging_boms.find_one({
            'packaging_id': campaign['packaging_id'],
            'is_active': True
        })
        
        if packaging_bom:
            pack_items = await self.db.packaging_bom_items.find({
                'packaging_bom_id': packaging_bom['id']
            }).to_list(None)
            
            for pack_item in pack_items:
                required_qty = schedule_day.planned_drums * pack_item['qty_per_drum']
                available = await self.get_available_quantity(pack_item['pack_item_id'], schedule_date)
                
                shortage = max(0, required_qty - available)
                
                requirement = ProductionDayRequirement(
                    schedule_day_id=schedule_day.id,
                    item_id=pack_item['pack_item_id'],
                    item_type='PACK',
                    required_qty=required_qty,
                    available_qty_snapshot=available,
                    shortage_qty=shortage
                )
                await self.db.production_day_requirements.insert_one(requirement.model_dump())
                
                if shortage > 0:
                    pack_material = await self.db.inventory_items.find_one({'id': pack_item['pack_item_id']})
                    shortages.append({
                        'item_id': pack_item['pack_item_id'],
                        'item_name': pack_material['name'] if pack_material else 'Unknown',
                        'item_type': 'PACK',
                        'required': required_qty,
                        'available': available,
                        'shortage': shortage
                    })
        
        # Update schedule day status
        if shortages:
            schedule_day.status = "BLOCKED"
            raw_shortages = [s for s in shortages if s['item_type'] == 'RAW']
            pack_shortages = [s for s in shortages if s['item_type'] == 'PACK']
            
            if raw_shortages and pack_shortages:
                schedule_day.blocking_reason = "RAW_PACK_SHORTAGE"
            elif raw_shortages:
                schedule_day.blocking_reason = "RAW_SHORTAGE"
            else:
                schedule_day.blocking_reason = "PACK_SHORTAGE"
            
            schedule_day.blocking_details = {
                'shortages': shortages
            }
            
            # Auto-create procurement requisition lines
            await self._create_procurement_requisitions(schedule_day, shortages)
        else:
            schedule_day.status = "READY"
            schedule_day.blocking_reason = "NONE"
    
    async def _create_procurement_requisitions(self, schedule_day: ProductionScheduleDay, shortages: List[Dict[str, Any]]):
        """Auto-create procurement requisition lines for shortages"""
        # Find or create a PR for this week
        pr = await self.db.procurement_requisitions.find_one({
            'status': 'DRAFT'
        })
        
        if not pr:
            pr_record = ProcurementRequisition(notes=f"Auto-generated for week {schedule_day.week_start}")
            await self.db.procurement_requisitions.insert_one(pr_record.model_dump())
            pr = pr_record.model_dump()
        
        # Create PR lines for each shortage
        for shortage in shortages:
            # Check if line already exists
            existing = await self.db.procurement_requisition_lines.find_one({
                'pr_id': pr['id'],
                'item_id': shortage['item_id'],
                'required_by': schedule_day.schedule_date,
                'linked_schedule_day_id': schedule_day.id
            })
            
            if not existing:
                item = await self.db.inventory_items.find_one({'id': shortage['item_id']})
                
                pr_line = ProcurementRequisitionLine(
                    pr_id=pr['id'],
                    item_id=shortage['item_id'],
                    item_type=shortage['item_type'],
                    qty=shortage['shortage'],
                    uom=item['uom'] if item else 'KG',
                    required_by=schedule_day.schedule_date,
                    linked_campaign_id=schedule_day.campaign_id,
                    linked_schedule_day_id=schedule_day.id,
                    reason=f"{shortage['item_type']} shortage for {schedule_day.schedule_date}"
                )
                await self.db.procurement_requisition_lines.insert_one(pr_line.model_dump())
