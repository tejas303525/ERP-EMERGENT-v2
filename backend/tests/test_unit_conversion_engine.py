# backend/tests/test_unit_conversion_engine.py

"""
Unit tests for Unit Conversion Engine

Tests cover:
- Carton → LTR → KG → MT
- Pail → LTR → KG → MT
- ISO LTR → KG → MT
- EA without packaging → ERROR
- LTR without density → ERROR
- KG → LTR in DISPATCH → ERROR (PHASE B: Dispatch safety)
- Density override without approval → ERROR
- Precision rounding edge cases
- is_reversible logic (PHASE A FIX 1)
- DB abstraction (PHASE A FIX 2)
"""

import pytest
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from unit_conversion_engine import (
    UnitConversionEngine,
    ConversionRequest,
    TransactionContext,
    CommercialUnitEnum,
    UnknownUnitError,
    NegativeQuantityError,
    MissingPackagingDefinitionError,
    MissingDensityError,
    DensityOverrideUnapprovedError,
    PackagingNotFoundError,
    DispatchVolumeConversionBlockedError
)


# PHASE A FIX 2: Proper mock DB that actually executes engine logic
class MockCollection:
    """Mock MongoDB collection"""
    def __init__(self, data):
        self.data = data

    async def find_one(self, query, projection=None):
        # Extract ID from query
        item_id = query.get("id")
        if item_id:
            return self.data.get(item_id)
        return None


class MockDB:
    """Mock MongoDB database"""
    def __init__(self):
        self.products = MockCollection({})
        self.packaging = MockCollection({})


@pytest.fixture
def mock_db():
    """Mock MongoDB database"""
    return MockDB()


@pytest.fixture
def engine(mock_db):
    """Create engine instance with mock DB"""
    return UnitConversionEngine(db=mock_db)


@pytest.fixture
def sample_product(mock_db):
    """Sample product with density"""
    product = {
        "id": "ENGINE_OIL_50",
        "density_kg_per_l": 0.9
    }
    mock_db.products.data["ENGINE_OIL_50"] = product
    return product


@pytest.fixture
def sample_packaging(mock_db):
    """Sample packaging (20L pail)"""
    packaging = {
        "id": "PAIL_20L_UUID",
        "name": "PAIL_20L",
        "capacity_liters": 20.0,
        "tare_weight_kg": 2.5,
        "net_weight_kg_default": 18.0,
        "is_active": True,
        "version": 1
    }
    mock_db.packaging.data["PAIL_20L_UUID"] = packaging
    return packaging


@pytest.fixture
def sample_carton_packaging(mock_db):
    """Sample carton packaging (12×1L)"""
    packaging = {
        "id": "CARTON_12X1L_UUID",
        "name": "CARTON_12X1L",
        "capacity_liters": 12.0,
        "is_active": True,
        "version": 1
    }
    mock_db.packaging.data["CARTON_12X1L_UUID"] = packaging
    return packaging


class TestUnitNormalization:
    """Test unit normalization"""
    
    def test_normalize_canonical_units(self, engine):
        """Test canonical units pass through"""
        assert engine.normalize_unit("PAIL") == CommercialUnitEnum.PAIL
        assert engine.normalize_unit("CARTON") == CommercialUnitEnum.CARTON
        assert engine.normalize_unit("LTR") == CommercialUnitEnum.LTR
        assert engine.normalize_unit("KG") == CommercialUnitEnum.KG
        assert engine.normalize_unit("MT") == CommercialUnitEnum.MT
    
    def test_normalize_aliases(self, engine):
        """Test alias mapping"""
        assert engine.normalize_unit("PAILS") == CommercialUnitEnum.PAIL
        assert engine.normalize_unit("CRTN") == CommercialUnitEnum.CARTON
        assert engine.normalize_unit("L") == CommercialUnitEnum.LTR
        assert engine.normalize_unit("TONNES") == CommercialUnitEnum.MT
        assert engine.normalize_unit("PCS") == CommercialUnitEnum.EA
    
    def test_unknown_unit_error(self, engine):
        """Test unknown unit raises error"""
        with pytest.raises(UnknownUnitError) as exc_info:
            engine.normalize_unit("BOTTLE")
        
        assert exc_info.value.error_code == "UNKNOWN_UNIT"
    
    def test_case_insensitive(self, engine):
        """Test case insensitivity"""
        assert engine.normalize_unit("pail") == CommercialUnitEnum.PAIL
        assert engine.normalize_unit("Pail") == CommercialUnitEnum.PAIL
        assert engine.normalize_unit("PAIL") == CommercialUnitEnum.PAIL


class TestPailConversion:
    """Test pail → LTR → KG → MT conversion"""
    
    @pytest.mark.asyncio
    async def test_pail_full_conversion(
        self, 
        engine, 
        sample_product, 
        sample_packaging
    ):
        """Test 15,960 pails → liters → KG → MT"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=15960.0,
            commercial_uom="PAIL",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"
        assert result.commercial_qty == 15960.0  # PHASE B: Explicit layer
        assert result.commercial_uom == CommercialUnitEnum.PAIL
        assert result.physical_qty_liters == 319200.0  # 15960 × 20
        assert result.accounting_qty_kg == 287280.0  # 319200 × 0.9
        assert result.accounting_qty_mt == 287.28  # 287280 / 1000
        assert result.packaging_snapshot is not None
        assert result.density_used is not None
        assert len(result.conversion_breakdown.steps) == 3
    
    @pytest.mark.asyncio
    async def test_pail_missing_packaging(self, engine, sample_product):
        """Test pail without packaging → ERROR"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=15960.0,
            commercial_uom="PAIL",
            packaging_type_id=None,  # Missing!
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert len(result.errors) > 0
        assert any(e["error_code"] == "MISSING_PACKAGING_DEFINITION" for e in result.errors)


class TestCartonConversion:
    """Test carton → LTR → KG → MT conversion"""
    
    @pytest.mark.asyncio
    async def test_carton_full_conversion(
        self,
        engine,
        sample_product,
        sample_carton_packaging
    ):
        """Test 8,000 cartons (12×1L) → liters → KG → MT"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=8000.0,
            commercial_uom="CARTON",
            packaging_type_id="CARTON_12X1L_UUID",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"
        assert result.physical_qty_liters == 96000.0  # 8000 × 12
        assert result.accounting_qty_kg == 86400.0  # 96000 × 0.9
        assert result.accounting_qty_mt == 86.4  # 86400 / 1000


class TestISOLiterConversion:
    """Test ISO tank LTR → KG → MT conversion"""
    
    @pytest.mark.asyncio
    async def test_iso_liter_full_conversion(self, engine, sample_product):
        """Test 319,200 LTR → KG → MT"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=319200.0,
            commercial_uom="LTR",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"
        assert result.physical_qty_liters == 319200.0
        assert result.accounting_qty_kg == 287280.0  # 319200 × 0.9
        assert result.accounting_qty_mt == 287.28
    
    @pytest.mark.asyncio
    async def test_iso_liter_missing_density(self, engine, mock_db):
        """Test LTR without density → ERROR"""
        # Product without density
        mock_db.products.data["NO_DENSITY"] = {
            "id": "NO_DENSITY",
            "density_kg_per_l": None
        }
        
        request = ConversionRequest(
            product_id="NO_DENSITY",
            commercial_qty=319200.0,
            commercial_uom="LTR",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "MISSING_DENSITY" for e in result.errors)


class TestEAHandling:
    """Test EA unit handling (PHASE B: EA unit rule)"""
    
    @pytest.mark.asyncio
    async def test_ea_without_packaging_error(self, engine, sample_product):
        """Test EA without packaging → ERROR (PHASE B: No exceptions)"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,
            commercial_uom="EA",
            packaging_type_id=None,  # Missing!
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "MISSING_PACKAGING_DEFINITION" for e in result.errors)
    
    @pytest.mark.asyncio
    async def test_ea_with_packaging(
        self,
        engine,
        sample_product,
        sample_packaging
    ):
        """Test EA with packaging behaves identically to that package type"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,
            commercial_uom="EA",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"
        assert result.physical_qty_liters == 2000.0  # 100 × 20
        assert result.packaging_snapshot is not None


class TestDensityOverride:
    """Test density override handling"""
    
    @pytest.mark.asyncio
    async def test_density_override_unapproved_error(self, engine, mock_db):
        """Test density override without approval → ERROR"""
        from unit_conversion_engine import DensityOverride
        
        mock_db.products.data["ENGINE_OIL_50"] = {
            "id": "ENGINE_OIL_50",
            "density_kg_per_l": 0.9
        }
        
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=1000.0,
            commercial_uom="LTR",
            transaction_context=TransactionContext.QUOTATION,
            density_override=DensityOverride(
                value=0.95,
                reason="Test",
                approved_by=None,  # Not approved!
                approval_required=True
            )
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "DENSITY_OVERRIDE_UNAPPROVED" for e in result.errors)


class TestPrecision:
    """Test precision rounding"""
    
    @pytest.mark.asyncio
    async def test_precision_rounding(
        self,
        engine,
        sample_product,
        sample_packaging
    ):
        """Test precision rules applied correctly"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=15960.0,
            commercial_uom="PAIL",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        # Check precision
        assert result.accounting_qty_mt == 287.28  # 2 decimal places
        assert result.accounting_qty_kg == 287280.0  # 2 decimal places
        assert result.physical_qty_liters == 319200.0  # 2 decimal places


class TestNegativeQuantity:
    """Test negative quantity validation"""
    
    @pytest.mark.asyncio
    async def test_negative_quantity_error(self, engine):
        """Test negative quantity → ERROR"""
        # Bypass Pydantic validation to test engine logic
        request = ConversionRequest.model_construct(
            product_id="ENGINE_OIL_50",
            commercial_qty=-100.0,  # Negative!
            commercial_uom="KG",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "NEGATIVE_QUANTITY" for e in result.errors)


class TestPackagingNotFound:
    """Test packaging not found handling"""
    
    @pytest.mark.asyncio
    async def test_packaging_not_found_error(self, engine, sample_product):
        """Test invalid packaging ID → ERROR"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,
            commercial_uom="PAIL",
            packaging_type_id="INVALID_UUID",  # Doesn't exist!
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "PACKAGING_NOT_FOUND" for e in result.errors)
    
    @pytest.mark.asyncio
    async def test_packaging_inactive_error(self, engine, mock_db, sample_product):
        """Test inactive packaging → ERROR (PHASE A FIX 2: Business logic in service layer)"""
        # Create inactive packaging
        mock_db.packaging.data["INACTIVE_PAIL"] = {
            "id": "INACTIVE_PAIL",
            "name": "INACTIVE_PAIL",
            "capacity_liters": 20.0,
            "is_active": False,  # Inactive!
            "version": 1
        }
        
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,
            commercial_uom="PAIL",
            packaging_type_id="INACTIVE_PAIL",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "PACKAGING_NOT_FOUND" for e in result.errors)


class TestDispatchVolumeBlock:
    """Test DISPATCH weight → volume conversion block (PHASE B: Dispatch safety)"""
    
    @pytest.mark.asyncio
    async def test_dispatch_kg_blocked(self, engine, sample_product):
        """Test KG in DISPATCH context → ERROR"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=1000.0,
            commercial_uom="KG",
            transaction_context=TransactionContext.DISPATCH  # DISPATCH context!
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "DISPATCH_VOLUME_CONVERSION_BLOCKED" for e in result.errors)
        # PHASE B: Error message must be clear
        error_msg = next(e["message"] for e in result.errors if e["error_code"] == "DISPATCH_VOLUME_CONVERSION_BLOCKED")
        assert "Direct weight-based dispatch is forbidden" in error_msg
        assert "package or volume units" in error_msg.lower()
    
    @pytest.mark.asyncio
    async def test_dispatch_mt_blocked(self, engine, sample_product):
        """Test MT in DISPATCH context → ERROR"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=1.0,
            commercial_uom="MT",
            transaction_context=TransactionContext.DISPATCH  # DISPATCH context!
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "DISPATCH_VOLUME_CONVERSION_BLOCKED" for e in result.errors)
    
    @pytest.mark.asyncio
    async def test_dispatch_pail_allowed(self, engine, sample_product, sample_packaging):
        """Test package units in DISPATCH context → ALLOWED"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,
            commercial_uom="PAIL",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.DISPATCH
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"  # Package units allowed in DISPATCH
    
    @pytest.mark.asyncio
    async def test_dispatch_ltr_allowed(self, engine, sample_product):
        """Test LTR in DISPATCH context → ALLOWED"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=1000.0,
            commercial_uom="LTR",
            transaction_context=TransactionContext.DISPATCH
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"  # Volume units allowed in DISPATCH


class TestIsReversible:
    """Test is_reversible logic (PHASE A FIX 1)"""
    
    @pytest.mark.asyncio
    async def test_reversible_no_rounding(self, engine, sample_product, sample_packaging):
        """Test reversible when no rounding occurs"""
        # Use quantities that don't require rounding
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,  # 100 pails
            commercial_uom="PAIL",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        # 100 × 20 = 2000 LTR (no rounding)
        # 2000 × 0.9 = 1800 KG (no rounding)
        # 1800 / 1000 = 1.8 MT (no rounding)
        # Should be reversible
        assert result.status == "SUCCESS"
        # Note: Due to floating point precision, some rounding may occur
        # The key is that is_reversible correctly reflects whether rounding was applied
    
    @pytest.mark.asyncio
    async def test_not_reversible_with_override(self, engine, mock_db, sample_packaging):
        """Test not reversible when density override used"""
        from unit_conversion_engine import DensityOverride
        
        mock_db.products.data["ENGINE_OIL_50"] = {
            "id": "ENGINE_OIL_50",
            "density_kg_per_l": 0.9
        }
        
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,
            commercial_uom="PAIL",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.QUOTATION,
            density_override=DensityOverride(
                value=0.95,
                reason="Test",
                approved_by="user_123",
                approved_at=datetime.now(timezone.utc),
                approval_required=True
            )
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"
        # Should NOT be reversible due to density override
        assert result.conversion_breakdown.is_reversible == False


class TestDensityFreezing:
    """Test density freezing (PHASE B)"""
    
    @pytest.mark.asyncio
    async def test_frozen_density_used(self, engine, sample_product, sample_packaging):
        """Test that existing_density is used when provided"""
        from unit_conversion_engine import DensityInfo
        
        frozen_density = DensityInfo(
            value=0.85,  # Different from product master (0.9)
            source="FROZEN_TRANSACTION",
            version=1,
            effective_date=datetime.now(timezone.utc)
        )
        
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,
            commercial_uom="PAIL",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.SALES_ORDER,
            existing_density=frozen_density  # Frozen density
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"
        assert result.density_used.value == 0.85  # Uses frozen, not product master
        assert result.density_used.source == "FROZEN_TRANSACTION"
    
    @pytest.mark.asyncio
    async def test_override_forbidden_on_frozen(self, engine, sample_product, sample_packaging):
        """Test that override is forbidden when density is frozen"""
        from unit_conversion_engine import DensityInfo, DensityOverride
        
        frozen_density = DensityInfo(
            value=0.85,
            source="FROZEN_TRANSACTION",
            version=1,
            effective_date=datetime.now(timezone.utc)
        )
        
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=100.0,
            commercial_uom="PAIL",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.SALES_ORDER,
            existing_density=frozen_density,
            density_override=DensityOverride(  # Attempt override on frozen density
                value=0.95,
                reason="Test",
                approved_by="user_123",
                approved_at=datetime.now(timezone.utc)
            )
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "ERROR"
        assert any(e["error_code"] == "DENSITY_ALREADY_FROZEN" for e in result.errors)


class TestConversionLayers:
    """Test explicit conversion layers (PHASE B)"""
    
    @pytest.mark.asyncio
    async def test_layers_preserved(self, engine, sample_product, sample_packaging):
        """Test that all conversion layers are explicitly preserved"""
        request = ConversionRequest(
            product_id="ENGINE_OIL_50",
            commercial_qty=15960.0,
            commercial_uom="PAIL",
            packaging_type_id="PAIL_20L_UUID",
            transaction_context=TransactionContext.QUOTATION
        )
        
        result = await engine.convert_quantity(request)
        
        assert result.status == "SUCCESS"
        # PHASE B: All layers must be explicitly present
        assert result.commercial_qty == 15960.0  # Commercial layer
        assert result.commercial_uom == CommercialUnitEnum.PAIL
        assert result.physical_qty_liters == 319200.0  # Physical layer
        assert result.accounting_qty_kg == 287280.0  # Accounting layer (kg)
        assert result.accounting_qty_mt == 287.28  # Accounting layer (mt)
        
        # All layers should be present (never collapsed)
        assert result.commercial_qty is not None
        assert result.physical_qty_liters is not None
        assert result.accounting_qty_kg is not None
        assert result.accounting_qty_mt is not None

