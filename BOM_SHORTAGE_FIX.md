# BOM Shortage Auto-Creation Fix

## Problem
When job orders were auto-created by finance approval, RAW material shortages from the BOM were not being calculated or stored in the `material_shortages` array. This caused:
1. Job orders to show only packaging shortages (HDPE drums, etc.)
2. RAW material shortages (N-Butanol, Acetic acid, etc.) not appearing in the Procurement window
3. Procurement team unable to see what raw materials needed to be ordered

## Root Cause
In `backend/server.py` lines 2528-2586, the auto-creation logic had several issues:

1. **Incorrect stock comparison**: Compared finished product stock (in MT) with order quantity (in drums/units)
   ```python
   if finished_product_stock >= item.get("quantity", 0):  # Wrong comparison!
   ```

2. **Silent BOM failure**: If no BOM was found, the code silently skipped BOM checking without logging
   ```python
   if product_bom:
       # check BOM items
   # else: nothing - just continue
   ```

3. **Missing recalculation**: No fallback mechanism to recalculate shortages after creation

## Solution Implemented

### 1. Fixed Stock Comparison (Lines 2528-2547)
```python
# Calculate required quantity in MT for proper comparison
required_mt = finished_kg / 1000

# Only mark ready_for_dispatch if we have enough finished product in stock
if finished_product_stock >= required_mt:
    item_status = "ready_for_dispatch"
    print(f"[AUTO-CREATE] Product {item.get('product_name')}: Have {finished_product_stock} MT in stock, need {required_mt} MT")
else:
    item_status = "pending"
    print(f"[AUTO-CREATE] Product {item.get('product_name')}: Only {finished_product_stock} MT in stock, need {required_mt} MT - checking BOM")
```

### 2. Added Comprehensive Logging (Lines 2548-2600)
```python
if product_bom:
    print(f"[AUTO-CREATE] Found active BOM {product_bom.get('id')} for product {item.get('product_name')}")
    bom_items = await db.product_bom_items.find({...}).to_list(100)
    print(f"[AUTO-CREATE] BOM has {len(bom_items)} items")
    
    for bom_item in bom_items:
        # ... calculate shortages ...
        print(f"[AUTO-CREATE]   - {material_item.get('name')}: need {required_raw_qty:.2f} KG, available {available_raw:.2f} KG, shortage {shortage_qty:.2f} KG")
        
        if shortage_qty > 0:
            # Add to material_shortages
            print(f"[AUTO-CREATE]   ⚠️ SHORTAGE DETECTED: {material_item.get('name')} short by {shortage_qty:.2f} KG")
else:
    print(f"[AUTO-CREATE] ⚠️ WARNING: No active BOM found for manufacturing product {item.get('product_name')}")
    item_status = "procurement"
    item_needs_procurement = True
```

### 3. Added Fallback Recalculation (Lines 2635-2647)
```python
# CRITICAL FIX: Immediately recalculate BOM shortages to ensure accuracy
if product_type == "MANUFACTURED" and product_bom:
    try:
        print(f"[AUTO-CREATE] Running BOM shortage recalculation for {job_number}")
        recalc_result = await recalculate_bom_shortages(job_order.id, current_user)
        if recalc_result.get("success"):
            print(f"[AUTO-CREATE] ✓ BOM recalculation complete: {recalc_result.get('raw_shortages_found', 0)} RAW shortage(s)")
        else:
            print(f"[AUTO-CREATE] ⚠️ BOM recalculation warning: {recalc_result.get('message')}")
    except Exception as e:
        print(f"[AUTO-CREATE] ⚠️ BOM recalculation failed (non-critical): {e}")
```

## Testing Instructions

### For Existing Job Order JOB-000221:
1. Open the job order detail page
2. Click the **"Recalculate from BOM"** button
3. The system will now properly calculate RAW material shortages
4. Check the Procurement → Material Shortages page to see the N-Butanol shortage

### For New Job Orders:
1. Create a new quotation with BUTAC (or any manufactured product)
2. Finance approves the quotation
3. Job order is auto-created
4. Check the server logs for `[AUTO-CREATE]` messages showing BOM checking
5. Verify the job order has RAW material shortages in `material_shortages` array
6. Check Procurement → Material Shortages page to see the shortages

## Expected Behavior

### Before Fix:
- JOB-000221 shows only HDPE drums shortage (40 EA)
- No RAW material shortages visible
- Procurement page doesn't show N-Butanol or Acetic acid shortages

### After Fix:
- JOB-000221 shows:
  - HDPE Drums 250 litre: 40 EA shortage (PACK)
  - N-Butanol: 8764 KG shortage (RAW)
  - Acetic acid: 0 KG shortage (RAW - sufficient stock)
- Procurement page displays all shortages
- Server logs show detailed BOM checking process

## Additional Fix: Recalculation Function

### Issue
The "Recalculate from BOM" button was showing "0 RAW material(s) found" because it only checked the `inventory_items` table. If RAW materials (N-Butanol, Acetic acid) were stored in the `products` table, they would be skipped.

### Solution (Lines 4304-4340)
```python
# Get material details - check both inventory_items and products tables
material = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
if not material:
    # Fallback to products table for RAW materials that might be stored there
    material = await db.products.find_one({"id": material_id}, {"_id": 0})

if not material:
    print(f"[BOM-RECALC] WARNING: Material {material_id} not found - skipping")
    continue

# ALWAYS add to shortages array (even if no shortage) for visibility
new_raw_shortages.append({
    # ... shortage details ...
    "status": "SHORTAGE" if shortage_qty > 0 else "AVAILABLE"
})
```

Now recalculation:
- Checks both `inventory_items` and `products` tables
- Adds ALL BOM items to the array (not just shortages)
- Shows correct count in notification
- Provides detailed logging

## Files Modified
- `backend/server.py` (lines 2528-2647, 4304-4375)

## Related Endpoints
- `POST /api/quotations/{id}/finance-approve` - Auto-creates job orders
- `POST /api/job-orders/{id}/recalculate-bom-shortages` - Recalculates BOM shortages
- `GET /api/procurement/shortages` - Displays material shortages

## Notes
- The fix includes comprehensive logging to help debug future issues
- The fallback recalculation ensures data accuracy even if initial calculation fails
- Existing job orders can be fixed by clicking "Recalculate from BOM" button
- Future auto-created job orders will have correct shortages from the start

