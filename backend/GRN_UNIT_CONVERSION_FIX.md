# GRN Unit Conversion Fix - Complete Solution

## Problem
When creating a GRN (Goods Received Note) with quantities in MT (Metric Tons), the system was adding the MT value directly to inventory without converting to the inventory item's unit. This caused incorrect stock levels.

**Example:**
- GRN shows: 15.93 MT of Acetic acid
- Stock shows: 15.93 KG (should be 15,930 KG)
- GRN shows: 12.97 MT of ETHANOL  
- Stock shows: 13.24 KG (should be 12,970 KG)

## Root Cause
The GRN creation code was using `item.quantity` directly without checking:
1. What unit the GRN item is in (MT or KG)
2. What unit the inventory item stores stock in (from `inventory_items.uom` or `products.unit`)

## Solution
The fix checks the inventory item's unit from the database and converts the GRN quantity to match before updating stock.

### Conversion Logic

```
Get inventory_item_unit from database:
  - From inventory_items.uom (for raw materials)
  - From products.unit (for finished products)
  - Default: "KG"

If inventory_item_unit is KG:
  - If GRN unit is MT: convert to KG (multiply by 1000)
  - If GRN unit is KG: use as-is

If inventory_item_unit is MT:
  - If GRN unit is KG: convert to MT (divide by 1000)
  - If GRN unit is MT: use as-is
```

## Implementation

### 1. Fixed `create_grn` Endpoint ✅
**Location**: `backend/server.py` line ~2042

**Changes**:
- Gets inventory item's unit from `inventory_items.uom` or `products.unit`
- Converts GRN quantity based on unit comparison
- Uses converted `quantity_to_add` for all stock updates:
  - `products.current_stock`
  - `inventory_balances.on_hand`
  - `inventory_movements.quantity`

### 2. Fixed `create_grn_from_qc` Function ✅
**Location**: `backend/server.py` line ~8013

**Changes**:
- Same unit conversion logic as `create_grn`
- Converts quantity before updating both `inventory_balances` and `products` tables

## Example Scenarios

### Scenario 1: GRN in MT, Inventory in KG
- **GRN**: 15.93 MT of Acetic acid
- **Inventory Unit**: KG (from `inventory_items.uom`)
- **Conversion**: 15.93 MT × 1000 = 15,930 KG
- **Result**: Stock increases by 15,930 KG ✅

### Scenario 2: GRN in MT, Inventory in MT
- **GRN**: 15.93 MT of Product X
- **Inventory Unit**: MT (from `products.unit`)
- **Conversion**: No conversion needed
- **Result**: Stock increases by 15.93 MT ✅

### Scenario 3: GRN in KG, Inventory in KG
- **GRN**: 15.93 KG of Product Y
- **Inventory Unit**: KG
- **Conversion**: No conversion needed
- **Result**: Stock increases by 15.93 KG ✅

### Scenario 4: GRN in KG, Inventory in MT
- **GRN**: 15,930 KG of Product Z
- **Inventory Unit**: MT
- **Conversion**: 15,930 KG ÷ 1000 = 15.93 MT
- **Result**: Stock increases by 15.93 MT ✅

## Files Modified

1. **`backend/server.py`**:
   - `create_grn` endpoint (line ~2042)
   - `create_grn_from_qc` function (line ~8013)

## Testing

To verify the fix works:
1. Create a GRN with quantities in MT
2. Check stock management page
3. Verify stock shows correct converted values

**Before Fix:**
- GRN: 15.93 MT → Stock: 15.93 KG ❌

**After Fix:**
- GRN: 15.93 MT → Stock: 15,930 KG ✅

## Result

✅ **GRN quantities are now correctly converted based on inventory item's unit**
✅ **Works for both manual GRN creation and automatic GRN from QC**
✅ **Handles all unit combinations: MT→KG, KG→MT, MT→MT, KG→KG**

