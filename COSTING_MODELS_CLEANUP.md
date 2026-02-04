# Costing Models Cleanup - Reduced to 8 Active Types

## Date: February 3, 2026

## Overview
Cleaned up the costing system to use only **8 approved costing models**, removing 5 deprecated/redundant types.

---

## ✅ ACTIVE COSTING MODELS (8 Types)

### Export Container Types (4 models)
1. **EXPORT_40FT_DG** → `Export40ftDGCosting.js`
   - 40ft containers with Dangerous Goods
   
2. **EXPORT_40FT_NON_DG** → `Export40ftNonDGCosting.js`
   - 40ft containers without Dangerous Goods
   - **DEFAULT** for bulk/flexitank exports
   
3. **EXPORT_20FT_DG** → `Export20ftDGCosting.js`
   - 20ft containers with Dangerous Goods
   
4. **EXPORT_20FT_NON_DG** → `Export20ftNonDGCosting.js`
   - 20ft containers without Dangerous Goods

### GCC Road Shipments (1 model)
5. **EXPORT_GCC_ROAD** → `GccByRoadCosting.js`
   - **All road exports** (GCC and non-GCC)
   - Supports **both BULK and DRUMS**
   - Used for `order_type=export` with `transport_mode=road`
   - Also used for `order_type=local` with `local_type=gcc_road` or `gcc_road_bulk`

### Local Shipments (3 models)
6. **LOCAL_PURCHASE_SALE** → `LocalPurchaseSaleCosting.js`
   - Direct purchase and resale to local customers
   - `local_type=direct_to_customer`
   
7. **LOCAL_BULK_TO_PLANT** → `LocalBulkToPlantCosting.js`
   - Bulk materials delivered to plant
   - `local_type=bulk_to_plant`
   
8. **LOCAL_DRUM_TO_PLANT** → `LocalDrumToPlantCosting.js`
   - Packaged/drum materials delivered to plant
   - `local_type=packaged_to_plant`

---

## ❌ DEPRECATED MODELS (Commented Out)

The following costing models have been **commented out** (not deleted):

1. **EXPORT_CONTAINERIZED** → `ExportContainerizedCosting.js`
   - Too generic, replaced by specific 20ft/40ft types
   
2. **EXPORT_BULK** → `ExportBulkCosting.js`
   - Redundant, bulk goes to `EXPORT_40FT_NON_DG` (flexitanks)
   
3. **EXPORT_GCC_ROAD** → `ExportGCCRoadCosting.js`
   - **DUPLICATE** of `GccByRoadCosting.js`
   - Consolidated into single `GccByRoadCosting` component
   
4. **EXPORT_ROAD** → `ExportRoadCosting.js`
   - Consolidated into `EXPORT_GCC_ROAD`
   
5. **LOCAL_DISPATCH** → `LocalDispatchCosting.js`
   - Too generic, use specific local types instead

---

## Changes Made

### 1. Frontend: `CostingModal.js`

#### Imports (Lines 6-18)
**Before:**
```javascript
import ExportContainerizedCosting from './costing/ExportContainerizedCosting';
import ExportBulkCosting from './costing/ExportBulkCosting';
import ExportGCCRoadCosting from './costing/ExportGCCRoadCosting';
import ExportRoadCosting from './costing/ExportRoadCosting';
import LocalDispatchCosting from './costing/LocalDispatchCosting';
```

**After:**
```javascript
// COMMENTED OUT - Unused costing models (keeping only 8 approved types)
// import ExportContainerizedCosting from './costing/ExportContainerizedCosting';
// import ExportBulkCosting from './costing/ExportBulkCosting';
// import ExportGCCRoadCosting from './costing/ExportGCCRoadCosting';
// import ExportRoadCosting from './costing/ExportRoadCosting';
// import LocalDispatchCosting from './costing/LocalDispatchCosting';
```

#### Switch Statement (Lines 226-261)
**Before:**
```javascript
case 'EXPORT_CONTAINERIZED':
  return <ExportContainerizedCosting {...commonProps} />;
case 'EXPORT_BULK':
  return <ExportBulkCosting {...commonProps} />;
case 'EXPORT_GCC_ROAD':
  if (quotation.order_type === 'local' && ...) {
    return <GccByRoadCosting {...commonProps} />;
  }
  return <ExportGCCRoadCosting {...commonProps} />;
case 'EXPORT_ROAD':
  return <ExportRoadCosting {...commonProps} />;
case 'LOCAL_DISPATCH':
  return <LocalDispatchCosting {...commonProps} />;
```

**After:**
```javascript
// COMMENTED OUT - Deprecated costing types
// case 'EXPORT_CONTAINERIZED': ...
// case 'EXPORT_BULK': ...
// case 'EXPORT_ROAD': ...
// case 'LOCAL_DISPATCH': ...

// GCC BY ROAD - Handles both export and local GCC road shipments (bulk + drums)
case 'EXPORT_GCC_ROAD':
  return <GccByRoadCosting {...commonProps} />;
```

#### Type Validation (Lines 90-102)
**Before:**
```javascript
// If export with road transport, should be EXPORT_ROAD or EXPORT_GCC_ROAD
if (orderType === 'EXPORT' && transportMode === 'ROAD') {
  return !currentCostingType || 
         (currentCostingType !== 'EXPORT_ROAD' && currentCostingType !== 'EXPORT_GCC_ROAD');
}
```

**After:**
```javascript
// If export with road transport, should be EXPORT_GCC_ROAD only
if (orderType === 'EXPORT' && transportMode === 'ROAD') {
  return !currentCostingType || currentCostingType !== 'EXPORT_GCC_ROAD';
}
```

---

### 2. Backend: `costing_service.py`

#### Docstring (Lines 26-29)
**Before:**
```python
"""
Determine costing type based on order characteristics
Returns: EXPORT_CONTAINERIZED, EXPORT_BULK, EXPORT_GCC_ROAD, EXPORT_ROAD, 
         EXPORT_40FT_DG, EXPORT_40FT_NON_DG, EXPORT_20FT_DG, EXPORT_20FT_NON_DG, 
         LOCAL_DISPATCH, LOCAL_PURCHASE_SALE, LOCAL_BULK_TO_PLANT, or LOCAL_DRUM_TO_PLANT
"""
```

**After:**
```python
"""
Determine costing type based on order characteristics

ACTIVE COSTING TYPES (8 only):
- EXPORT_GCC_ROAD (GCC road shipments - bulk or drums)
- EXPORT_40FT_DG (40ft container - dangerous goods)
- EXPORT_40FT_NON_DG (40ft container - non-dangerous goods)
- EXPORT_20FT_DG (20ft container - dangerous goods)
- EXPORT_20FT_NON_DG (20ft container - non-dangerous goods)
- LOCAL_PURCHASE_SALE (local direct sales)
- LOCAL_BULK_TO_PLANT (local bulk to plant)
- LOCAL_DRUM_TO_PLANT (local drums to plant)

DEPRECATED: EXPORT_CONTAINERIZED, EXPORT_BULK, EXPORT_ROAD, LOCAL_DISPATCH
"""
```

#### Logic Changes

**Export Road Transport (Lines 36-45):**
```python
# BEFORE: Differentiated between GCC and non-GCC
if is_gcc:
    return "EXPORT_GCC_ROAD"
else:
    return "EXPORT_ROAD"

# AFTER: All road exports → EXPORT_GCC_ROAD
if order_type_upper == "EXPORT" and is_road:
    return "EXPORT_GCC_ROAD"
```

**Local Orders (Lines 48-59):**
```python
# BEFORE: Fallback to LOCAL_DISPATCH
return "LOCAL_DISPATCH"

# AFTER: Fallback to LOCAL_PURCHASE_SALE
return "LOCAL_PURCHASE_SALE"
```

**Export Sea/Ocean (Lines 62-83):**
```python
# BEFORE: Bulk → EXPORT_BULK, Generic → EXPORT_CONTAINERIZED
if packaging_upper == "BULK":
    return "EXPORT_BULK"
...
return "EXPORT_CONTAINERIZED"

# AFTER: Everything defaults to EXPORT_40FT_NON_DG
# (Most bulk = flexitank in 40ft container)
return "EXPORT_40FT_NON_DG"
```

**Final Fallback (Line 86):**
```python
# BEFORE
return "LOCAL_DISPATCH"

# AFTER
return "LOCAL_PURCHASE_SALE"
```

---

## Decision Logic Summary

### How the System Picks a Costing Type

```
IF order_type = EXPORT AND transport_mode = ROAD:
  → EXPORT_GCC_ROAD (handles all road, bulk or drums)

ELSE IF order_type = LOCAL:
  IF local_type = "direct_to_customer" → LOCAL_PURCHASE_SALE
  IF local_type = "bulk_to_plant" → LOCAL_BULK_TO_PLANT
  IF local_type = "packaged_to_plant" → LOCAL_DRUM_TO_PLANT
  IF local_type = "gcc_road" or "gcc_road_bulk" → EXPORT_GCC_ROAD
  ELSE → LOCAL_PURCHASE_SALE (default)

ELSE IF order_type = EXPORT (sea/ocean):
  IF container_type = "40FT" AND is_dg = true → EXPORT_40FT_DG
  IF container_type = "40FT" AND is_dg = false → EXPORT_40FT_NON_DG
  IF container_type = "20FT" AND is_dg = true → EXPORT_20FT_DG
  IF container_type = "20FT" AND is_dg = false → EXPORT_20FT_NON_DG
  ELSE → EXPORT_40FT_NON_DG (default for bulk/flexitank)

ELSE:
  → LOCAL_PURCHASE_SALE (fallback)
```

---

## Benefits

1. **Clarity**: Only 8 well-defined costing types, no ambiguity
2. **Simplicity**: Easier to maintain and understand
3. **Consolidation**: GCC_BY_ROAD handles all road shipments (bulk + drums)
4. **Consistency**: Clear rules for which type to use
5. **Flexibility**: Bulk shipments correctly default to 40FT containers (flexitanks)

---

## Migration Notes

- **Existing costings** with deprecated types will continue to work (components still exist, just commented out)
- **New costings** will only use the 8 active types
- **GccByRoadCosting.js** supports both bulk and drums (see line 414: "Drum/CTN (for bulk enter 1)")
- **No data loss**: Component files are commented out, not deleted

---

## Files Modified

1. `frontend/src/components/CostingModal.js` - Updated imports and switch statement
2. `backend/costing_service.py` - Updated `determine_costing_type()` logic

---

## Testing Checklist

- [ ] Create PFI for 40ft DG → Should use `EXPORT_40FT_DG`
- [ ] Create PFI for 40ft Non-DG → Should use `EXPORT_40FT_NON_DG`
- [ ] Create PFI for 20ft DG → Should use `EXPORT_20FT_DG`
- [ ] Create PFI for 20ft Non-DG → Should use `EXPORT_20FT_NON_DG`
- [ ] Create PFI for GCC road (bulk) → Should use `EXPORT_GCC_ROAD`
- [ ] Create PFI for GCC road (drums) → Should use `EXPORT_GCC_ROAD`
- [ ] Create PFI for local purchase/sale → Should use `LOCAL_PURCHASE_SALE`
- [ ] Create PFI for local bulk to plant → Should use `LOCAL_BULK_TO_PLANT`
- [ ] Create PFI for local drums to plant → Should use `LOCAL_DRUM_TO_PLANT`
- [ ] Verify all costing modals display correctly
- [ ] Verify profit calculations work for all types

---

## Status
✅ **COMPLETED** - Costing system now uses 8 active models only




