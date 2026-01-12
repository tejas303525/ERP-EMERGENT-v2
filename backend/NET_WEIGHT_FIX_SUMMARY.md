# Net Weight Preservation Fix - Complete Solution

## Problem
The `net_weight_kg` entered during quotation creation was not being preserved through the sales order → job order flow. Instead, the system was defaulting to 200kg in multiple places, overriding the user's entered value.

## Solutions Implemented

### 1. Store net_weight_kg in Job Order Creation ✅
**Location**: `backend/server.py` line ~1357

**Change**: Added `net_weight_kg` field to job order document:
- Preserves `net_weight_kg` from quotation when provided
- Only defaults to 200kg if not provided AND packaging is not "Bulk"
- For Bulk packaging, stores `null` (no net weight needed)

### 2. Fixed BOM Calculation in Job Order Creation ✅
**Location**: `backend/server.py` line ~1292

**Change**: Updated BOM calculation logic:
- **Before**: Always defaulted to 200kg for non-Bulk packaging
- **After**: Uses `item.net_weight_kg` if provided, only defaults to 200 if not provided
- For Bulk: correctly uses `quantity * 1000` (MT to KG conversion)

### 3. Fixed Sales Order Conversion ✅
**Location**: `backend/server.py` line ~975

**Change**: Updated material availability check for quotations:
- **Before**: Always defaulted to 200kg: `net_weight_kg = item.get("net_weight_kg", 200)`
- **After**: Preserves `net_weight_kg` from quotation, only defaults if not provided and not Bulk

### 4. Fixed Procurement Endpoints ✅
**Location**: `backend/server.py` multiple locations (~2096, ~5178, ~5349)

**Change**: Updated all procurement calculation endpoints:
- Use stored `net_weight_kg` from job order (preserved from quotation)
- Only fall back to product_packaging_specs or default 200 if not stored
- Correctly handles Bulk vs packaged items

### 5. Fixed Frontend JobOrdersPage ✅
**Location**: `frontend/src/pages/JobOrdersPage.js`

**Changes**:
- **`loadProductBOM` function** (line ~139):
  - Changed default parameter from `200` to `null`
  - Only defaults to 200 if `net_weight_kg` is null/undefined AND packaging is not Bulk
  
- **Job order submission** (line ~261, ~328):
  - Preserves `net_weight_kg` from sales order items
  - Only defaults to 200 if not provided and not Bulk
  - Uses proper null checking instead of `||` operator (which would default 0 to 200)

### 6. Added net_weight_kg to JobOrderCreate Model ✅
**Location**: `backend/server.py` line ~283

**Change**: Added `net_weight_kg: Optional[float] = None` to `JobOrderCreate` model for backward compatibility with single-product job orders.

## How It Works Now

### Flow: Quotation → Sales Order → Job Order

1. **Quotation Creation**:
   - User enters `net_weight_kg` for packaged items (not required for Bulk)
   - Stored in `quotation.items[].net_weight_kg`

2. **Sales Order Creation**:
   - `net_weight_kg` is copied from quotation items to sales order items
   - Preserved in `sales_order.items[].net_weight_kg`

3. **Job Order Creation**:
   - `net_weight_kg` is read from sales order items
   - Stored in `job_order.net_weight_kg` (for single product) or `job_order.items[].net_weight_kg` (for multiple products)
   - Used in BOM calculations for material requirements

4. **Procurement Calculations**:
   - Uses stored `net_weight_kg` from job order
   - Only defaults to 200kg if not provided and packaging is not Bulk

## Default Behavior

- **Bulk Packaging**: No `net_weight_kg` needed (stores `null`)
- **Packaged Items**: 
  - Uses `net_weight_kg` from quotation if provided
  - Defaults to 200kg only if not provided
  - Never defaults if value is explicitly 0 (preserves user intent)

## Files Modified

1. **`backend/server.py`**:
   - Added `net_weight_kg` to `JobOrderCreate` model
   - Fixed job order creation to store `net_weight_kg`
   - Fixed BOM calculation in job order creation
   - Fixed sales order conversion
   - Fixed all procurement endpoints (~2096, ~5178, ~5349)
   - Fixed backward compatibility section

2. **`frontend/src/pages/JobOrdersPage.js`**:
   - Fixed `loadProductBOM` function signature and logic
   - Fixed job order item submission to preserve `net_weight_kg`
   - Fixed BOM calculation in sales order item processing

## Testing Recommendations

1. Create a quotation with a custom `net_weight_kg` (e.g., 180kg)
2. Convert to sales order - verify `net_weight_kg` is preserved
3. Create job order - verify `net_weight_kg` is stored and used in BOM calculations
4. Check procurement shortages - verify calculations use the custom `net_weight_kg`, not 200kg
5. Test with Bulk packaging - verify no `net_weight_kg` is used
6. Test with 0kg `net_weight_kg` - verify it's preserved (not defaulted to 200)

## Result

✅ **`net_weight_kg` is now preserved from quotation through to job order**
✅ **Only defaults to 200kg when not provided and packaging is not Bulk**
✅ **All procurement calculations use the correct `net_weight_kg`**
✅ **Bulk packaging correctly uses MT quantities without net weight**

