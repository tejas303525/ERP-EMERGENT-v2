# Stock Sync Fix - Complete Solution

## Problem
When stock was adjusted in Stock Management page, it only updated `products.current_stock` but NOT `inventory_balances.on_hand`, causing discrepancies between Products page and Inventory page.

## Solutions Implemented

### 1. Fixed `/stock/{item_id}/adjust` Endpoint ✅
**Location**: `backend/server.py` line ~2980

**Change**: Now updates BOTH tables when adjusting products:
- Updates `products.current_stock` (as before)
- **ALSO updates `inventory_balances.on_hand`** (NEW - critical fix)
- Creates balance record if it doesn't exist

**Result**: Stock adjustments now keep both tables in sync automatically.

### 2. Fixed `/products` Endpoint ✅
**Location**: `backend/server.py` line ~774

**Change**: Now uses `inventory_balances.on_hand` as source of truth:
- Checks if product has `inventory_balances` record
- If yes: Uses `inventory_balances.on_hand` for `current_stock`
- If no: Falls back to `products.current_stock`

**Result**: Products page now shows the same values as Inventory page.

### 3. Updated Sync Script ✅
**Location**: `backend/sync_inventory_data.py`

**Change**: 
- Added `sync_products_to_inventory_balances()` function
- Only CREATES missing balance records (doesn't overwrite existing ones)
- Preserves existing `inventory_balances` values as source of truth

**Usage**:
```bash
# Create missing balance records (safe - doesn't overwrite)
python sync_inventory_data.py --sync-all-products --execute
```

## How It Works Now

### Stock Adjustment Flow:
1. User adjusts stock in Stock Management page
2. `/stock/{item_id}/adjust` endpoint is called
3. **For Products**: Updates BOTH `products.current_stock` AND `inventory_balances.on_hand`
4. **For Raw Materials**: Updates `inventory_balances.on_hand` (as before)
5. Both pages now show the same value ✅

### Data Display Flow:
1. **Products Page**: Calls `/products` → Uses `inventory_balances.on_hand` if available
2. **Inventory Page**: Calls `/inventory` → Uses `inventory_balances.on_hand` if available
3. Both pages show the same value ✅

## Source of Truth

**`inventory_balances.on_hand` is now the authoritative source** for all inventory quantities:
- Used by procurement calculations
- Used by Products page
- Used by Inventory page
- Updated by Stock Management adjustments

## Going Forward

✅ **All future stock adjustments will automatically sync both tables**
✅ **Both pages will always show the same values**
✅ **No manual sync needed after this fix**

## Note on Existing Data

If some products show incorrect values after the initial sync:
1. Use Stock Management page to adjust them
2. The adjustment will now update both tables correctly
3. Both pages will reflect the change immediately

## Files Modified

1. `backend/server.py`:
   - Fixed `/products` endpoint (line ~774)
   - Fixed `/stock/{item_id}/adjust` endpoint (line ~2980)

2. `backend/sync_inventory_data.py`:
   - Added `sync_products_to_inventory_balances()` function
   - Added `--sync-all-products` flag

