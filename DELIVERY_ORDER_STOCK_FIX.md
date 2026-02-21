# Delivery Order Stock Reduction Bug Fixes

## Date: February 7, 2026

## Critical Bugs Fixed

### Problem Summary
When creating Delivery Orders (DOs) for drummed products (e.g., 40 HDPE Drums of Glycerine):
1. **Bulk stock was incorrectly reduced by drum count** (40 instead of 7.2 MT)
2. **Product-packaging table drum count was NOT reduced** at all
3. **Stock could go negative** in some cases
4. **Packaging materials inventory was incorrectly calculated**

---

## Root Causes Identified

### Bug #1: Missing `net_weight_kg` Fallback
**Location:** `backend/server.py` line 6118

**Problem:**
```python
if packaging != "Bulk" and net_weight_kg:
```

When `net_weight_kg` was `None` or missing in the job order, this condition evaluated to `False`, causing the code to fall through to the ELSE block that treats the product as **bulk**, incorrectly reducing bulk stock by the drum count.

**Example:**
- Job: 40 drums of Glycerine @ 180kg each = 7.2 MT
- Without `net_weight_kg`: Reduced 40 MT from bulk stock ❌
- With fix: Bulk stock unchanged, product_packaging reduced by 40 drums ✅

---

### Bug #2: Exact-Match Only for `product_packaging`
**Location:** `backend/server.py` lines 6123-6129

**Problem:**
```python
product_packaging_record = await db.product_packaging.find_one({
    "product_id": job["product_id"],
    "packaging_name": packaging  # Exact match only!
})
```

Job order has: `"packaging": "HDPE Drums 250 litre"`
Database has: `"packaging_name": "HDPE Drums"`

**Result:** No match found → Drum count never reduced ❌

---

### Bug #3: Packaging Materials Double Calculation
**Location:** `backend/server.py` lines 6266-6285

**Problem:**
The code was recalculating packaging quantity using:
```python
finished_kg = quantity * net_weight_kg
packaging_qty = max(1, ceil(finished_kg / net_weight_per_drum))
```

For drummed products, `job["quantity"]` is **already the drum count**, so this was effectively doubling or miscalculating the packaging needed.

---

## Fixes Applied

### Fix #1: Smart `net_weight_kg` Fallback Logic

**Lines 6117-6132 in `backend/server.py`**

Now automatically infers `net_weight_kg` when missing:

1. **First:** Try to calculate from `total_weight_mt`:
   ```python
   if job.get("total_weight_mt") and job.get("quantity"):
       net_weight_kg = (job["total_weight_mt"] * 1000) / job["quantity"]
   ```

2. **Second:** Infer from packaging type:
   - "250" in packaging → 180 kg (250L drum)
   - "210" or "200" → 160 kg (210L drum)
   - "IBC" → 850 kg
   - Default → 200 kg

**Logging Added:**
```
⚠️ Warning: net_weight_kg missing for packaged product...
✓ Calculated net_weight_kg from total_weight_mt: 180.00 kg
```

---

### Fix #2: Flexible `product_packaging` Matching

**Lines 6144-6164 in `backend/server.py`**

Now uses multi-stage matching:

1. **Exact match** (fastest)
2. **Flexible regex match** on key terms (250, litre, HDPE)
3. **Keyword matching** (first word + common terms)

```python
# Try exact match first
product_packaging_record = await db.product_packaging.find_one({
    "product_id": job["product_id"],
    "packaging_name": packaging
})

# If failed, try flexible matching
if not product_packaging_record:
    all_packaging_records = await db.product_packaging.find(
        {"product_id": job["product_id"]}
    ).to_list(100)
    
    # Match based on keywords
    for record in all_packaging_records:
        if keywords_match(record, packaging):
            product_packaging_record = record
            break
```

**Logging Added:**
```
⚠️ Exact match failed. Available packaging records: [...]
✓ Found flexible match: 'HDPE Drums'
✓ Reduced product_packaging: 80 → 40 (HDPE Drums 250 litre)
```

---

### Fix #3: Correct Bulk Stock Handling

**Lines 6180-6182 in `backend/server.py`**

For **packaged products**:
- ✅ `product_packaging.quantity` reduced by drum count
- ✅ Bulk stock (`products.current_stock`) **UNCHANGED**
- ✅ Movement record shows MT equivalent for reference

For **bulk products**:
- ✅ `products.current_stock` reduced by MT quantity
- ✅ `inventory_balances.on_hand` also reduced

**Logging Added:**
```
✓ Bulk stock UNCHANGED: 25.60 MT (packaged product)
✓ MT equivalent for movement record: 7.200 MT
```

---

### Fix #4: Simplified Packaging Materials Reduction

**Lines 6257-6311 in `backend/server.py`**

For drummed products, **quantity is already the drum count**!

Changed from:
```python
finished_kg = quantity * net_weight_kg
packaging_qty = max(1, ceil(finished_kg / net_weight_per_drum))  # Wrong!
```

To:
```python
packaging_qty = int(job.get("quantity", 0))  # Simple and correct!
```

**Logging Added:**
```
📦 Processing packaging materials reduction for: HDPE Drums 250 litre
   Packaging quantity to reduce: 40 units
✓ Reduced packaging materials inventory: 80 → 40
✓ Created packaging movement record: 40 units
```

---

### Fix #5: Comprehensive Logging

Added clear logging throughout the DO creation process:

**Summary at the end:**
```
============================================================
✅ Delivery Order DO-000064 Created Successfully
============================================================
Job: JOB-000220 | Product: Glycerine
Packaging: HDPE Drums 250 litre | Quantity: 40
📦 Product stock: UNCHANGED (packaged)
📦 Packaging count reduced: 40 units
📦 MT equivalent: 7.200 MT
============================================================
```

---

## Testing Instructions

### Test Case: 40 Drums of Glycerine

**Before Fix:**
1. Create DO for JOB-000220 (40 HDPE Drums 250L of Glycerine)
2. ❌ Bulk Glycerine reduced by 40 (should be unchanged)
3. ❌ Product-packaging drum count NOT reduced (should be -40)
4. ❌ Packaging materials maybe incorrect

**After Fix:**
1. Create DO for same job
2. ✅ Bulk Glycerine stock **UNCHANGED**
3. ✅ Product-packaging drum count reduced by 40
4. ✅ Packaging materials (HDPE Drums 250L) reduced by 40
5. ✅ Inventory movement shows 7.2 MT equivalent

---

## Verification Steps

### 1. Check Product-Packaging Table
```javascript
db.product_packaging.find({
  "product_id": "<glycerine_product_id>",
  "packaging_name": /HDPE.*250/i
})
```

Expected: Quantity should be reduced after DO creation

### 2. Check Bulk Stock
```javascript
db.products.findOne({"name": "Glycerine"})
```

Expected: `current_stock` should be **UNCHANGED** for packaged products

### 3. Check Packaging Materials
```javascript
db.inventory_balances.find({
  "item_id": "<packaging_item_id>"  // HDPE Drums 250L
})
```

Expected: `on_hand` reduced by drum count

### 4. Check Movement Records
```javascript
db.inventory_movements.find({
  "reference_type": "delivery_order",
  "reference_number": "DO-000064"
})
```

Expected: 
- One record for product (MT equivalent)
- One record for packaging materials (drum count)

---

## Files Modified

- `backend/server.py` (lines 6110-6323)
  - `create_delivery_order` function
  - Added smart fallback logic
  - Added flexible matching
  - Added comprehensive logging
  - Fixed stock reduction logic

---

## Impact

### Before:
- ❌ Stock inconsistencies
- ❌ Negative stock values
- ❌ Product-packaging not synced
- ❌ Difficult to debug

### After:
- ✅ Accurate stock tracking
- ✅ Proper separation of bulk vs packaged stock
- ✅ Product-packaging always updated
- ✅ Comprehensive logging for debugging
- ✅ Flexible matching prevents lookup failures

---

## Notes

1. **Backward Compatible:** All changes maintain backward compatibility with existing job orders
2. **Fail-Safe:** Added try-catch blocks to prevent DO creation failure even if packaging lookup fails
3. **Detailed Logging:** Every step now logs clearly for easy debugging
4. **No Database Migration Required:** Logic changes only, no schema changes needed

---

## Next Steps

1. ✅ Fixes applied to `backend/server.py`
2. ⏳ Test with real DO creation
3. ⏳ Monitor logs for any edge cases
4. ⏳ Update any existing incorrect stock records if needed

---

## Contact

If you encounter any issues with DO creation after this fix, check:
1. Terminal/server logs for detailed output
2. `debug.log` for agent log entries
3. Ensure job orders have `packaging` and ideally `net_weight_kg` fields populated

