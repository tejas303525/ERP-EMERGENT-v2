# backend/unit_conversion_engine.py

"""
Unit Conversion Engine - Financial-Critical Component

This engine is responsible for:
- Unit normalization via alias mapping
- Packaging snapshot resolution
- Density-based volume ↔ weight conversion
- Physical (liter) derivation
- Accounting (kg/mt) derivation
- Validation and error signaling
- Conversion audit trail

This engine MUST NOT:
- Decide container fit
- Modify stock
- Modify transactions
- Guess units
- Infer packaging from strings

GLOBAL INVARIANTS (ENFORCED):
1) All quantities MUST have an explicit unit
2) All units MUST be normalized via alias mapping
3) Unknown units → HARD ERROR
4) Packaged goods MT is NEVER entered manually (always derived)
5) Density-based conversions are MANDATORY for liquids
6) Legacy fallbacks are FORBIDDEN
7) Stock is ALWAYS stored in KG (accounting layer)
8) Historical transactions are IMMUTABLE
9) Container logic is OUT OF SCOPE
10) Every conversion must be auditable and reversible (when possible)

FINANCIAL SAFETY:
- Wrong conversions = corrupted stock, wrong invoices, legal exposure
- This engine protects financial truth by failing hard on bad data
- No silent assumptions, no fallbacks, no guessing
"""

from enum import Enum
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN, ROUND_UP
from pydantic import BaseModel, Field, field_validator
import logging

logger = logging.getLogger(__name__)

# ==================== ENUMS ====================

class CommercialUnitEnum(str, Enum):
    """Canonical commercial units"""
    CARTON = "CARTON"
    PAIL = "PAIL"
    DRUM = "DRUM"
    IBC = "IBC"
    EA = "EA"
    LTR = "LTR"
    KG = "KG"
    MT = "MT"


class TransactionContext(str, Enum):
    """Transaction context types"""
    QUOTATION = "QUOTATION"
    SALES_ORDER = "SALES_ORDER"
    JOB_ORDER = "JOB_ORDER"
    GRN = "GRN"
    DISPATCH = "DISPATCH"
    STOCK_ADJUSTMENT = "STOCK_ADJUSTMENT"
    AVAILABILITY_CHECK = "AVAILABILITY_CHECK"


class ConversionStatus(str, Enum):
    """Conversion result status"""
    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"
    ERROR = "ERROR"


# ==================== UNIT ALIAS MAPPING ====================

UNIT_ALIASES: Dict[str, str] = {
    # Carton aliases
    "CRTN": "CARTON",
    "CTN": "CARTON",
    "CARTONS": "CARTON",
    "CARTON": "CARTON",  # Already canonical
    
    # Pail aliases
    "PAILS": "PAIL",
    "PAIL": "PAIL",  # Already canonical
    
    # Drum aliases
    "DRUMS": "DRUM",
    "DR": "DRUM",
    "DRUM": "DRUM",  # Already canonical
    
    # IBC aliases
    "IBC": "IBC",  # Already canonical
    "IBCS": "IBC",
    
    # Liter aliases
    "L": "LTR",
    "LITERS": "LTR",
    "LITRES": "LTR",
    "LTR": "LTR",  # Already canonical
    
    # Kilogram aliases
    "KG": "KG",  # Already canonical
    "KGS": "KG",
    "KILOGRAM": "KG",
    "KILOGRAMS": "KG",
    
    # Metric ton aliases
    "MT": "MT",  # Already canonical
    "TON": "MT",
    "TONNE": "MT",
    "TONNES": "MT",
    "MTS": "MT",
    
    # Each aliases
    "EA": "EA",  # Already canonical
    "EACH": "EA",
    "UNIT": "EA",
    "UNITS": "EA",
    "PCS": "EA",
    "PIECES": "EA"
}

# Package units (require packaging_type_id)
PACKAGE_UNITS = {CommercialUnitEnum.CARTON, CommercialUnitEnum.PAIL, CommercialUnitEnum.DRUM, CommercialUnitEnum.IBC, CommercialUnitEnum.EA}

# Volume units
VOLUME_UNITS = {CommercialUnitEnum.LTR}

# Weight units
WEIGHT_UNITS = {CommercialUnitEnum.KG, CommercialUnitEnum.MT}

# ==================== PRECISION RULES ====================

# PHASE A FIX 4: Document that ROUND_HALF_UP is invariant
# We support rounding_method in PrecisionRule for future extensibility,
# but currently only ROUND_HALF_UP is implemented.
# This is intentional: financial rounding must be consistent and predictable.

PRECISION_RULES: Dict[str, Dict[str, Any]] = {
    "CARTON": {"decimal_places": 0, "rounding": "ROUND_HALF_UP"},
    "PAIL": {"decimal_places": 0, "rounding": "ROUND_HALF_UP"},
    "DRUM": {"decimal_places": 0, "rounding": "ROUND_HALF_UP"},
    "IBC": {"decimal_places": 0, "rounding": "ROUND_HALF_UP"},
    "EA": {"decimal_places": 0, "rounding": "ROUND_HALF_UP"},
    "LTR": {"decimal_places": 2, "rounding": "ROUND_HALF_UP"},
    "KG": {"decimal_places": 2, "rounding": "ROUND_HALF_UP"},
    "MT": {"decimal_places": 2, "rounding": "ROUND_HALF_UP"}
}

# Rounding method mapping
ROUNDING_METHODS = {
    "ROUND_HALF_UP": ROUND_HALF_UP,
    "ROUND_DOWN": ROUND_DOWN,
    "ROUND_UP": ROUND_UP
}

# ==================== ERROR CLASSES ====================

class ConversionError(Exception):
    """Base conversion error"""
    def __init__(self, error_code: str, message: str, field: Optional[str] = None, severity: str = "HARD_ERROR"):
        self.error_code = error_code
        self.message = message
        self.field = field
        self.severity = severity
        super().__init__(self.message)


class UnknownUnitError(ConversionError):
    """Unit not recognized"""
    def __init__(self, unit: str, allowed_units: List[str]):
        super().__init__(
            "UNKNOWN_UNIT",
            f"Unit '{unit}' is not recognized. Allowed units: {', '.join(allowed_units)}",
            field="commercial_uom",
            severity="HARD_ERROR"
        )


class NegativeQuantityError(ConversionError):
    """Quantity must be positive"""
    def __init__(self, quantity: float):
        super().__init__(
            "NEGATIVE_QUANTITY",
            f"Commercial quantity must be positive. Received: {quantity}",
            field="commercial_qty",
            severity="HARD_ERROR"
        )


class MissingPackagingDefinitionError(ConversionError):
    """Packaging required for package units"""
    def __init__(self, commercial_uom: str):
        super().__init__(
            "MISSING_PACKAGING_DEFINITION",
            f"Packaging definition required for package-based unit '{commercial_uom}'. packaging_type_id must be provided.",
            field="packaging_type_id",
            severity="HARD_ERROR"
        )


class PackagingNotFoundError(ConversionError):
    """Packaging not found or inactive"""
    def __init__(self, packaging_type_id: str):
        super().__init__(
            "PACKAGING_NOT_FOUND",
            f"Packaging '{packaging_type_id}' not found in master data or is inactive.",
            field="packaging_type_id",
            severity="HARD_ERROR"
        )


class MissingDensityError(ConversionError):
    """Density required for conversion"""
    def __init__(self, from_unit: str, to_unit: str, product_id: str):
        super().__init__(
            "MISSING_DENSITY",
            f"Density required for conversion from {from_unit} to {to_unit}. Product '{product_id}' has no density_kg_per_l.",
            field="density_kg_per_l",
            severity="HARD_ERROR"
        )


class DensityOverrideUnapprovedError(ConversionError):
    """Density override requires approval"""
    def __init__(self, value: float, reason: str):
        super().__init__(
            "DENSITY_OVERRIDE_UNAPPROVED",
            f"Density override requires approval. Override value: {value}, Reason: {reason}",
            field="density_override",
            severity="HARD_ERROR"
        )


class IncompatibleUnitsError(ConversionError):
    """Conversion not supported"""
    def __init__(self, from_unit: str, to_unit: str):
        super().__init__(
            "INCOMPATIBLE_UNITS",
            f"Cannot convert from '{from_unit}' to '{to_unit}'. Conversion not supported.",
            field="commercial_uom",
            severity="HARD_ERROR"
        )


class DispatchVolumeConversionBlockedError(ConversionError):
    """Direct weight-based dispatch is forbidden"""
    def __init__(self, commercial_uom: str):
        super().__init__(
            "DISPATCH_VOLUME_CONVERSION_BLOCKED",
            f"Direct weight-based dispatch is forbidden. Commercial unit '{commercial_uom}' is a weight unit (KG/MT). "
            f"Dispatch must use package units (CARTON, PAIL, DRUM, IBC, EA) or volume units (LTR). "
            f"Please convert to package or volume units before dispatch.",
            field="commercial_uom",
            severity="HARD_ERROR"
        )


class UnitlessTransactionEntityError(ConversionError):
    """Transaction has quantity without unit"""
    def __init__(self, entity_type: str):
        super().__init__(
            "UNITLESS_TRANSACTION_ENTITY",
            f"Transaction entity '{entity_type}' has quantity without unit. All quantities must have explicit unit.",
            field="commercial_uom",
            severity="HARD_ERROR"
        )


class LegacyFallbackBlockedError(ConversionError):
    """Legacy fallback logic blocked"""
    def __init__(self, unit: str):
        super().__init__(
            "LEGACY_FALLBACK_BLOCKED",
            f"Legacy fallback logic blocked. Unit '{unit}' requires explicit handling. Silent fallback to default unit is not allowed.",
            field="commercial_uom",
            severity="HARD_ERROR"
        )


# ==================== DATA MODELS ====================

class PackagingSnapshot(BaseModel):
    """Immutable packaging definition snapshot"""
    packaging_id: str
    packaging_code: str
    capacity_liters: float = Field(gt=0)
    tare_weight_kg: Optional[float] = None
    net_weight_kg_default: Optional[float] = None
    snapshot_timestamp: datetime
    snapshot_version: int = 1


class DensityInfo(BaseModel):
    """Density information with source tracking"""
    value: float = Field(gt=0)
    source: str  # "PRODUCT_MASTER" | "MANUAL_OVERRIDE" | "QC_MEASUREMENT"
    version: int = 1
    effective_date: datetime
    validated_by: Optional[str] = None
    validation_date: Optional[datetime] = None


class DensityOverride(BaseModel):
    """Density override with approval"""
    value: float = Field(gt=0)
    reason: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_required: bool = True


class PrecisionRule(BaseModel):
    """Precision rule for rounding"""
    unit: str
    decimal_places: int = Field(ge=0)
    rounding_method: str = "ROUND_HALF_UP"  # Currently only ROUND_HALF_UP is implemented


class ConversionStep(BaseModel):
    """Single conversion step in audit trail"""
    step_number: int
    from_unit: str
    from_qty: float
    to_unit: str
    to_qty: float
    conversion_factor: float
    factor_source: str  # "PACKAGING_SNAPSHOT" | "DENSITY" | "FIXED_1000" | "IDENTITY"
    calculation_formula: str
    precision_applied: Optional[PrecisionRule] = None
    raw_value: Optional[float] = None  # PHASE A FIX 1: Track raw value for reversibility check


class ConversionBreakdown(BaseModel):
    """Complete conversion audit trail"""
    steps: List[ConversionStep]
    total_steps: int
    is_reversible: bool = True


class ConversionWarning(BaseModel):
    """Conversion warning (non-blocking)"""
    warning_code: str
    message: str
    field: Optional[str] = None
    recommendation: Optional[str] = None


class ConversionRequest(BaseModel):
    """Engine input contract"""
    product_id: str
    commercial_qty: float = Field(gt=0)
    commercial_uom: str
    transaction_context: TransactionContext
    packaging_type_id: Optional[str] = None
    density_override: Optional[DensityOverride] = None
    precision_override: Optional[PrecisionRule] = None
    existing_density: Optional[DensityInfo] = None  # PHASE B: Frozen density per transaction
    requested_by: str = "system"
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConversionResult(BaseModel):
    """Engine output contract"""
    # PHASE B: Explicit conversion layers (never collapse)
    # Commercial layer (what user enters)
    commercial_qty: float
    commercial_uom: CommercialUnitEnum
    
    # Physical layer (liters - universal physical unit)
    physical_qty_liters: Optional[float] = None
    
    # Accounting layer (kg/mt - for stock, freight, costing)
    accounting_qty_kg: Optional[float] = None
    accounting_qty_mt: Optional[float] = None
    
    # Immutable snapshots
    packaging_snapshot: Optional[PackagingSnapshot] = None
    density_used: Optional[DensityInfo] = None
    
    # Audit trail
    conversion_breakdown: ConversionBreakdown
    
    # Status
    status: ConversionStatus
    errors: List[Dict[str, Any]] = []
    warnings: List[ConversionWarning] = []
    
    # Metadata
    calculated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    calculation_version: str = "1.0.0"


# ==================== UNIT CONVERSION ENGINE ====================

class UnitConversionEngine:
    """
    Stateless unit conversion engine.
    
    This engine performs unit conversions following strict rules:
    - All units must be normalized
    - Package units require packaging snapshot
    - Volume ↔ weight requires density
    - All conversions are auditable
    
    FINANCIAL SAFETY:
    - Fails hard on bad data (no silent fallbacks)
    - Every conversion is traceable and reversible (when possible)
    - Protects against stock corruption and invoice errors
    """
    
    def __init__(self, db=None):
        """
        Initialize engine.
        
        Args:
            db: MongoDB database instance (for lookups)
        """
        self.db = db
        self.version = "1.0.0"
    
    def normalize_unit(self, unit: str) -> CommercialUnitEnum:
        """
        Normalize unit via alias mapping.
        
        INVARIANT: All units MUST normalize via alias map.
        Unknown units → HARD ERROR (no fallback).
        
        Args:
            unit: Input unit string (may be alias)
            
        Returns:
            Normalized CommercialUnitEnum
            
        Raises:
            UnknownUnitError: If unit not in alias map
        """
        if not unit:
            raise UnknownUnitError(unit or "", list(CommercialUnitEnum))
        
        unit_upper = unit.upper().strip()
        
        # Check alias map
        normalized = UNIT_ALIASES.get(unit_upper)
        
        if not normalized:
            raise UnknownUnitError(unit, list(CommercialUnitEnum))
        
        # Return enum
        try:
            return CommercialUnitEnum(normalized)
        except ValueError:
            raise UnknownUnitError(unit, list(CommercialUnitEnum))
    
    # PHASE A FIX 2: Truly abstracted DB access (no business logic)
    async def get_packaging_by_id(self, packaging_id: str) -> Optional[dict]:
        """
        Get packaging by ID (pure data access, no validation).
        
        This method ONLY fetches data. All validation (is_active, etc.)
        happens in service logic (resolve_packaging_snapshot).
        
        Args:
            packaging_id: Packaging master ID
            
        Returns:
            Packaging dict or None (if not found)
        """
        if not self.db:
            return None
        
        # Pure data fetch - no business logic
        return await self.db.packaging.find_one({"id": packaging_id}, {"_id": 0})
    
    async def get_product_by_id(self, product_id: str) -> Optional[dict]:
        """
        Get product by ID (pure data access, no validation).
        
        This method ONLY fetches data. All validation happens in service logic.
        
        Args:
            product_id: Product ID
            
        Returns:
            Product dict or None (if not found)
        """
        if not self.db:
            return None
        
        # Pure data fetch - no business logic
        return await self.db.products.find_one({"id": product_id}, {"_id": 0})
    
    async def resolve_packaging_snapshot(
        self, 
        packaging_type_id: str
    ) -> PackagingSnapshot:
        """
        Resolve packaging master and create immutable snapshot.
        
        INVARIANT: Package units REQUIRE packaging snapshot.
        Historical transactions are IMMUTABLE (snapshot never changes).
        
        Args:
            packaging_type_id: Packaging master ID
            
        Returns:
            PackagingSnapshot (immutable)
            
        Raises:
            PackagingNotFoundError: If packaging not found or inactive
        """
        if not self.db:
            raise RuntimeError("Database connection required for packaging lookup")
        
        # PHASE A FIX 2: Pure data fetch, validation in service logic
        packaging = await self.get_packaging_by_id(packaging_type_id)
        
        if not packaging:
            raise PackagingNotFoundError(packaging_type_id)
        
        # PHASE A FIX 2: Business logic validation in service layer
        if not packaging.get("is_active", False):
            raise PackagingNotFoundError(packaging_type_id)
        
        # Validate required fields
        capacity_liters = packaging.get("capacity_liters", 0)
        if capacity_liters <= 0:
            raise PackagingNotFoundError(packaging_type_id)
        
        # Create immutable snapshot (PHASE B: Historical transactions are IMMUTABLE)
        snapshot = PackagingSnapshot(
            packaging_id=packaging["id"],
            packaging_code=packaging.get("name", packaging["id"]),
            capacity_liters=capacity_liters,
            tare_weight_kg=packaging.get("tare_weight_kg"),
            net_weight_kg_default=packaging.get("net_weight_kg_default"),
            snapshot_timestamp=datetime.now(timezone.utc),
            snapshot_version=packaging.get("version", 1)
        )
        
        return snapshot
    
    async def resolve_density(
        self,
        product_id: str,
        density_override: Optional[DensityOverride] = None
    ) -> Optional[DensityInfo]:
        """
        Resolve density from product master or override.
        
        INVARIANT: Density is MANDATORY for liquid volume ↔ weight conversion.
        
        Args:
            product_id: Product ID
            density_override: Optional density override (requires approval)
            
        Returns:
            DensityInfo or None
            
        Raises:
            DensityOverrideUnapprovedError: If override not approved
        """
        # Check override first
        if density_override:
            if density_override.approval_required and not density_override.approved_by:
                raise DensityOverrideUnapprovedError(
                    density_override.value,
                    density_override.reason
                )
            
            return DensityInfo(
                value=density_override.value,
                source="MANUAL_OVERRIDE",
                version=1,
                effective_date=density_override.approved_at or datetime.now(timezone.utc),
                validated_by=density_override.approved_by,
                validation_date=density_override.approved_at
            )
        
        # PHASE A FIX 2: Pure data fetch
        product = await self.get_product_by_id(product_id)
        
        if not product:
            return None
        
        density_value = product.get("density_kg_per_l")
        
        if density_value is None or density_value <= 0:
            return None
        
        return DensityInfo(
            value=float(density_value),
            source="PRODUCT_MASTER",
            version=1,
            effective_date=datetime.now(timezone.utc)
        )
    
    def apply_precision(
        self,
        value: float,
        unit: str,
        precision_override: Optional[PrecisionRule] = None
    ) -> Tuple[float, bool]:
        """
        Apply precision rules to value.
        
        PHASE A FIX 1 & 4: Returns (rounded_value, was_rounded) tuple.
        was_rounded is True only if rounding actually changed the value.
        This enables proper is_reversible calculation.
        
        PHASE A FIX 4: Currently only ROUND_HALF_UP is implemented.
        Other rounding methods are reserved for future use.
        
        Args:
            value: Raw calculated value
            unit: Unit for precision lookup
            precision_override: Optional override
            
        Returns:
            Tuple of (rounded_value, was_rounded)
            was_rounded is True only if value actually changed
        """
        # Use override if provided
        if precision_override:
            decimal_places = precision_override.decimal_places
            rounding_method_str = precision_override.rounding_method
        else:
            # Use default rules
            rule = PRECISION_RULES.get(unit, {"decimal_places": 2, "rounding": "ROUND_HALF_UP"})
            decimal_places = rule["decimal_places"]
            rounding_method_str = rule["rounding"]
        
        # PHASE A FIX 4: Support rounding method (currently only ROUND_HALF_UP used)
        rounding_method = ROUNDING_METHODS.get(rounding_method_str, ROUND_HALF_UP)
        
        # Round using Decimal for precision
        decimal_value = Decimal(str(value))
        rounded_decimal = decimal_value.quantize(
            Decimal(10) ** -decimal_places,
            rounding=rounding_method
        )
        rounded_value = float(rounded_decimal)
        
        # PHASE A FIX 1: Detect if rounding actually changed the value
        was_rounded = (decimal_value != rounded_decimal)
        
        return (rounded_value, was_rounded)
    
    async def convert_quantity(self, request: ConversionRequest) -> ConversionResult:
        """
        Main conversion method.
        
        Follows strict step-by-step process:
        1) Normalize unit (INVARIANT: All units MUST normalize)
        2) Validate quantity (INVARIANT: Must be positive)
        3) Enforce DISPATCH safety (PHASE B: Block weight units in DISPATCH)
        4) Resolve packaging (INVARIANT: Package units REQUIRE packaging)
        5) Resolve density (INVARIANT: Density MANDATORY for liquids)
        6) Convert commercial → physical (liters)
        7) Convert physical → accounting (kg)
        8) Convert accounting (kg) → accounting (mt)
        9) Apply precision
        10) Build breakdown (PHASE A FIX 5: Trustworthy audit trail)
        11) Calculate reversibility (PHASE A FIX 1: Correct logic)
        12) Return result
        
        Args:
            request: ConversionRequest
            
        Returns:
            ConversionResult
            
        Raises:
            Various ConversionError subclasses
        """
        errors: List[Dict[str, Any]] = []
        warnings: List[ConversionWarning] = []
        steps: List[ConversionStep] = []
        normalized_uom: Optional[CommercialUnitEnum] = None
        precision_was_applied: bool = False  # PHASE A FIX 1: Track if any rounding occurred
        
        try:
            # Step 1: Normalize unit (INVARIANT: All units MUST normalize via alias map)
            normalized_uom = self.normalize_unit(request.commercial_uom)
            
            # Step 2: Validate quantity (INVARIANT: Must be positive)
            if request.commercial_qty <= 0:
                raise NegativeQuantityError(request.commercial_qty)
            
            # Step 3: PHASE B - DISPATCH SAFETY
            # INVARIANT: DISPATCH context MUST reject KG and MT commercial units
            # Direct weight-based dispatch is forbidden; dispatch must be package- or volume-driven
            if (
                normalized_uom in WEIGHT_UNITS
                and request.transaction_context == TransactionContext.DISPATCH
            ):
                raise DispatchVolumeConversionBlockedError(normalized_uom.value)
            
            # Step 4: Resolve packaging snapshot (INVARIANT: Package units REQUIRE packaging)
            # PHASE B: EA unit rule - EA WITHOUT packaging_type_id → HARD ERROR
            packaging_snapshot = None
            if normalized_uom in PACKAGE_UNITS:
                if not request.packaging_type_id:
                    raise MissingPackagingDefinitionError(normalized_uom.value)
                
                packaging_snapshot = await self.resolve_packaging_snapshot(
                    request.packaging_type_id
                )
            
            # Step 5: Resolve density (INVARIANT: Density MANDATORY for liquid volume ↔ weight)
            # PHASE B: Density freezing - once used, must be frozen
            if hasattr(request, "existing_density") and request.existing_density:
                # Use frozen density from transaction (PHASE B: Historical transactions are IMMUTABLE)
                density_info = request.existing_density
                
                # PHASE B: Overrides forbidden after density is frozen
                if request.density_override:
                    raise ConversionError(
                        "DENSITY_ALREADY_FROZEN",
                        f"Density already frozen for this transaction. Override not allowed.",
                        field="density_override",
                        severity="HARD_ERROR"
                    )
            else:
                # Resolve density normally
                density_info = None
                needs_density = (
                    normalized_uom in VOLUME_UNITS or
                    normalized_uom in PACKAGE_UNITS or
                    (normalized_uom in WEIGHT_UNITS and 
                     request.transaction_context in {TransactionContext.QUOTATION, TransactionContext.AVAILABILITY_CHECK})
                )
                
                if needs_density:
                    density_info = await self.resolve_density(
                        request.product_id,
                        request.density_override
                    )
                    
                    if not density_info:
                        raise MissingDensityError(
                            normalized_uom.value,
                            "KG",
                            request.product_id
                        )
            
            # Step 6: Convert commercial → physical (PHASE B: Preserve conversion layers)
            # Commercial layer → Physical layer (liters)
            physical_liters = None
            if normalized_uom in PACKAGE_UNITS:
                # Package → liters
                if not packaging_snapshot:
                    raise MissingPackagingDefinitionError(normalized_uom.value)
                
                raw_liters = request.commercial_qty * packaging_snapshot.capacity_liters
                rounded_liters, was_rounded = self.apply_precision(
                    raw_liters,
                    "LTR",
                    request.precision_override
                )
                physical_liters = rounded_liters
                precision_was_applied = precision_was_applied or was_rounded
                
                # PHASE A FIX 5: Trustworthy audit trail - correct factor_source
                steps.append(ConversionStep(
                    step_number=len(steps) + 1,
                    from_unit=normalized_uom.value,
                    from_qty=request.commercial_qty,
                    to_unit="LTR",
                    to_qty=physical_liters,
                    conversion_factor=packaging_snapshot.capacity_liters,
                    factor_source="PACKAGING_SNAPSHOT",
                    calculation_formula=f"{request.commercial_qty} × {packaging_snapshot.capacity_liters} = {physical_liters}",
                    precision_applied=PrecisionRule(unit="LTR", decimal_places=2) if was_rounded else None,
                    raw_value=raw_liters  # PHASE A FIX 1: Track raw value
                ))
            
            elif normalized_uom == CommercialUnitEnum.LTR:
                # Direct liters (identity conversion)
                raw_liters = request.commercial_qty
                rounded_liters, was_rounded = self.apply_precision(
                    raw_liters,
                    "LTR",
                    request.precision_override
                )
                physical_liters = rounded_liters
                precision_was_applied = precision_was_applied or was_rounded
                
                # PHASE A FIX 5: No "IDENTITY" with hidden rounding - show true conversion
                if was_rounded:
                    steps.append(ConversionStep(
                        step_number=len(steps) + 1,
                        from_unit="LTR",
                        from_qty=request.commercial_qty,
                        to_unit="LTR",
                        to_qty=physical_liters,
                        conversion_factor=1.0,
                        factor_source="IDENTITY",
                        calculation_formula=f"{request.commercial_qty} LTR → {physical_liters} LTR (rounded)",
                        precision_applied=PrecisionRule(unit="LTR", decimal_places=2),
                        raw_value=raw_liters
                    ))
                # If no rounding, skip identity step (not needed in audit trail)
            
            # Step 7: Convert physical → accounting (PHASE B: Preserve conversion layers)
            # Physical layer (liters) → Accounting layer (kg)
            accounting_kg = None
            if physical_liters is not None:
                if not density_info:
                    raise MissingDensityError("LTR", "KG", request.product_id)
                
                raw_kg = physical_liters * density_info.value
                rounded_kg, was_rounded = self.apply_precision(
                    raw_kg,
                    "KG",
                    request.precision_override
                )
                accounting_kg = rounded_kg
                precision_was_applied = precision_was_applied or was_rounded
                
                # PHASE A FIX 5: Correct factor_source
                steps.append(ConversionStep(
                    step_number=len(steps) + 1,
                    from_unit="LTR",
                    from_qty=physical_liters,
                    to_unit="KG",
                    to_qty=accounting_kg,
                    conversion_factor=density_info.value,
                    factor_source="DENSITY",
                    calculation_formula=f"{physical_liters} × {density_info.value} = {accounting_kg}",
                    precision_applied=PrecisionRule(unit="KG", decimal_places=2) if was_rounded else None,
                    raw_value=raw_kg
                ))
            
            elif normalized_uom == CommercialUnitEnum.KG:
                # Direct KG (identity conversion)
                raw_kg = request.commercial_qty
                rounded_kg, was_rounded = self.apply_precision(
                    raw_kg,
                    "KG",
                    request.precision_override
                )
                accounting_kg = rounded_kg
                precision_was_applied = precision_was_applied or was_rounded
                
                if was_rounded:
                    steps.append(ConversionStep(
                        step_number=len(steps) + 1,
                        from_unit="KG",
                        from_qty=request.commercial_qty,
                        to_unit="KG",
                        to_qty=accounting_kg,
                        conversion_factor=1.0,
                        factor_source="IDENTITY",
                        calculation_formula=f"{request.commercial_qty} KG → {accounting_kg} KG (rounded)",
                        precision_applied=PrecisionRule(unit="KG", decimal_places=2),
                        raw_value=raw_kg
                    ))
            
            elif normalized_uom == CommercialUnitEnum.MT:
                # MT → KG (fixed factor)
                raw_kg = request.commercial_qty * 1000
                rounded_kg, was_rounded = self.apply_precision(
                    raw_kg,
                    "KG",
                    request.precision_override
                )
                accounting_kg = rounded_kg
                precision_was_applied = precision_was_applied or was_rounded
                
                # PHASE A FIX 5: Correct factor_source
                steps.append(ConversionStep(
                    step_number=len(steps) + 1,
                    from_unit="MT",
                    from_qty=request.commercial_qty,
                    to_unit="KG",
                    to_qty=accounting_kg,
                    conversion_factor=1000.0,
                    factor_source="FIXED_1000",
                    calculation_formula=f"{request.commercial_qty} × 1000 = {accounting_kg}",
                    precision_applied=PrecisionRule(unit="KG", decimal_places=2) if was_rounded else None,
                    raw_value=raw_kg
                ))
            
            # Step 8: Convert accounting (kg) → accounting (mt)
            # PHASE B: Preserve accounting layer (both kg and mt)
            accounting_mt = None
            if accounting_kg is not None:
                raw_mt = accounting_kg / 1000.0
                rounded_mt, was_rounded = self.apply_precision(
                    raw_mt,
                    "MT",
                    request.precision_override
                )
                accounting_mt = rounded_mt
                precision_was_applied = precision_was_applied or was_rounded
                
                # PHASE A FIX 5: Correct factor_source
                steps.append(ConversionStep(
                    step_number=len(steps) + 1,
                    from_unit="KG",
                    from_qty=accounting_kg,
                    to_unit="MT",
                    to_qty=accounting_mt,
                    conversion_factor=1000.0,
                    factor_source="FIXED_1000",
                    calculation_formula=f"{accounting_kg} ÷ 1000 = {accounting_mt}",
                    precision_applied=PrecisionRule(unit="MT", decimal_places=2) if was_rounded else None,
                    raw_value=raw_mt
                ))
            
            # Step 9: Build breakdown
            # PHASE A FIX 1: Correct is_reversible logic
            # Reversible ONLY IF:
            # - No density override (override is manual, not reversible)
            # - No rounding loss (precision_was_applied = False)
            is_reversible = (
                request.density_override is None
                and not precision_was_applied
            )
            
            breakdown = ConversionBreakdown(
                steps=steps,
                total_steps=len(steps),
                is_reversible=is_reversible
            )
            
            # Determine status
            status = ConversionStatus.SUCCESS if not errors else ConversionStatus.ERROR
            
            # Build result (PHASE B: Explicit conversion layers)
            result = ConversionResult(
                # PHASE B: Explicit layers (never collapse)
                commercial_qty=request.commercial_qty,
                commercial_uom=normalized_uom,
                physical_qty_liters=physical_liters,
                accounting_qty_kg=accounting_kg,
                accounting_qty_mt=accounting_mt,
                packaging_snapshot=packaging_snapshot,
                density_used=density_info,
                conversion_breakdown=breakdown,
                status=status,
                errors=errors,
                warnings=warnings,
                calculated_at=datetime.now(timezone.utc),
                calculation_version=self.version
            )
            
            return result
        
        except ConversionError as e:
            # Convert exception to error dict
            errors.append({
                "error_code": e.error_code,
                "message": e.message,
                "field": e.field,
                "severity": e.severity
            })
            
            # Use tracked normalized_uom if available, otherwise fallback for error payload stability
            # NOTE: fallback enum used ONLY for error payload stability (not for actual conversion)
            fallback_uom = normalized_uom if normalized_uom else CommercialUnitEnum.KG
            
            # Return partial result with error
            return ConversionResult(
                commercial_qty=request.commercial_qty,
                commercial_uom=fallback_uom,
                conversion_breakdown=ConversionBreakdown(
                    steps=steps,
                    total_steps=len(steps),
                    is_reversible=False
                ),
                status=ConversionStatus.ERROR,
                errors=errors,
                warnings=warnings,
                calculated_at=datetime.now(timezone.utc),
                calculation_version=self.version
            )
        
        except Exception as e:
            # Unexpected error
            logger.error(f"Unexpected error in unit conversion: {e}", exc_info=True)
            errors.append({
                "error_code": "UNEXPECTED_ERROR",
                "message": f"Unexpected error: {str(e)}",
                "field": None,
                "severity": "HARD_ERROR"
            })
            
            # Fallback enum for error payload stability
            return ConversionResult(
                commercial_qty=request.commercial_qty,
                commercial_uom=CommercialUnitEnum.KG,  # Fallback (should not happen)
                conversion_breakdown=ConversionBreakdown(
                    steps=[],
                    total_steps=0,
                    is_reversible=False
                ),
                status=ConversionStatus.ERROR,
                errors=errors,
                warnings=warnings,
                calculated_at=datetime.now(timezone.utc),
                calculation_version=self.version
            )

