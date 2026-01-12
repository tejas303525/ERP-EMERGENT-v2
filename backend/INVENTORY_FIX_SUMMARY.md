# Inventory Data Sync Fix - Summary

## Problem Identified

ETHANOL inventory was showing different values in different parts of the system:
- **GUI (Inventory Page)**: 195,261.587 KG (from `products.current_stock`)
- **Procurement Calculations**: 933,720.27 KG (from `inventory_balances.on_hand`)

### Root Cause

ETHANOL exists in both:
1. `products` table (as a finished product) with `current_stock = 195,261.59`
2. `inventory_balances` table with `on_hand = 933,720.27`

The GUI was showing the `products.current_stock` value, while procurement correctly uses `inventory_balances.on_hand` as the source of truth.

## Fixes Applied

### 1. Created Sync Script (`sync_inventory_data.py`)
- **Purpose**: Syncs `products.current_stock` with `inventory_balances.on_hand` for items that exist in both tables
- **Strategy**: Uses `inventory_balances.on_hand` as the authoritative source
- **Usage**:
  ```bash
  # Dry run (check what would change)
  python sync_inventory_data.py --dry-run --item-name ETHANOL
  
  # Actually apply changes
  python sync_inventory_data.py --execute --item-name ETHANOL
  
  # Sync all items
  python sync_inventory_data.py --execute
  ```

### 2. Fixed `/inventory` Endpoint (`backend/server.py`)
- **Change**: Modified the endpoint to check `inventory_balances` first and use `on_hand` as the source of truth
- **Result**: GUI now shows the correct value (933,720.27 KG) from `inventory_balances`
- **Fallback**: If no balance record exists, falls back to `products.current_stock`

### 3. Verified Procurement Endpoint
- **Status**: Already correct - uses `inventory_balances.on_hand` as source of truth
- **Added**: Comment to clarify this is intentional and ensures consistency

### 4. Created Diagnostic Script (`diagnose_inventory_discrepancy.py`)
- **Purpose**: Diagnose inventory discrepancies between GUI and database
- **Usage**: `python diagnose_inventory_discrepancy.py [ITEM_NAME]`

## Data Sync Results

✅ **ETHANOL Sync Completed**:
- `products.current_stock`: 195,261.59 → **933,720.27** ✓
- `inventory_balances.on_hand`: 933,720.27 (unchanged, source of truth)

## Verification

After the fixes:
1. ✅ GUI Inventory Page now shows: **933,720.27 KG** (from `inventory_balances`)
2. ✅ Procurement calculations use: **933,720.27 KG** (from `inventory_balances`)
3. ✅ Both systems now use the same source of truth

## Best Practices Going Forward

1. **Source of Truth**: Always use `inventory_balances.on_hand` for inventory quantities
2. **Regular Sync**: Run the sync script periodically to keep `products.current_stock` in sync:
   ```bash
   python sync_inventory_data.py --execute
   ```
3. **New Items**: When creating new inventory items:
   - Raw materials should be in `inventory_items` table
   - Finished products can be in `products` table
   - Always create corresponding `inventory_balances` record

## Files Modified

1. `backend/server.py` - Fixed `/inventory` endpoint
2. `backend/sync_inventory_data.py` - New sync script
3. `backend/diagnose_inventory_discrepancy.py` - New diagnostic script

## Notes

- The `net_weight_kg` (200 KG) in job orders refers to the **net weight of the packaging when filled with product**, not just the product or packaging alone
- It's determined by: `product_packaging_specs.net_weight_kg` → `packaging.net_weight_kg_default` → `packaging.capacity_liters × product.density_kg_per_l`

