# Permanent Net Weight Fix - Complete Implementation

## Problem
The `net_weight_kg` entered during quotation creation was being lost when creating job orders. Even after backend fixes, the frontend was not passing `net_weight_kg` from sales orders to job orders.

## Root Cause Analysis

### Flow Trace for JOB-000078:
1. **Quotation (PFI-000051)**: `net_weight_kg = 165.0` ✓
2. **Sales Order (SPA-000042)**: `net_weight_kg = 165.0` ✓
3. **Job Order (JOB-000078)**: `net_weight_kg = None` ❌

**Issue**: Frontend `JobOrdersPage.js` was not:
- Including `net_weight_kg` in form state
- Setting `net_weight_kg` when selecting sales order
- Passing `net_weight_kg` when creating job order

## Complete Fix Implementation

### 1. Backend Fixes (Already Implemented) ✅

**File**: `backend/server.py`

- Job order creation stores `net_weight_kg`
- BOM calculations use preserved `net_weight_kg`
- Procurement endpoints use stored `net_weight_kg`
- Only defaults to 200kg when not provided and packaging is not Bulk

### 2. Frontend Fixes (NEW - Permanent Solution) ✅

**File**: `frontend/src/pages/JobOrdersPage.js`

#### Fix 1: Add `net_weight_kg` to Form State
```javascript
const [form, setForm] = useState({
  // ... other fields
  net_weight_kg: null,  // ADDED
  // ... other fields
});
```

#### Fix 2: Preserve `net_weight_kg` When Selecting Sales Order (Single Item)
```javascript
// Line ~84
setForm(prev => ({
  ...prev,
  sales_order_id: salesOrderId,
  product_id: item.product_id,
  product_name: item.product_name,
  product_sku: item.sku,
  quantity: item.quantity,
  packaging: item.packaging,
  net_weight_kg: item.net_weight_kg,  // ADDED - Preserve from quotation
  delivery_date: salesOrder.expected_delivery_date || '',
}));
```

#### Fix 3: Preserve `net_weight_kg` When Selecting Product from SPA (Multiple Items)
```javascript
// Line ~126
setForm(prev => ({
  ...prev,
  product_id: item.product_id,
  product_name: item.product_name,
  product_sku: item.sku,
  quantity: item.quantity,
  packaging: item.packaging,
  net_weight_kg: item.net_weight_kg,  // ADDED - Preserve from quotation
  delivery_date: salesOrder.expected_delivery_date || '',
}));
```

#### Fix 4: Reset `net_weight_kg` in Form Reset
```javascript
// Line ~428
const resetForm = () => {
  setForm({
    // ... other fields
    net_weight_kg: null,  // ADDED
    // ... other fields
  });
};
```

#### Fix 5: Pass `net_weight_kg` to Backend
```javascript
// Line ~405
const jobData = {
  ...form,  // This now includes net_weight_kg
  procurement_required: hasShortage,
  material_shortages: materialAvailability.filter(a => a.status === 'SHORTAGE'),
};
```

### 3. Migration Script for Existing Data ✅

**File**: `backend/migrate_net_weight_to_job_orders.py`

- Backfills `net_weight_kg` in 33 existing job orders from sales orders
- Preserves Bulk orders with `None`
- Can be run again if needed

## Complete Flow (After Fix)

### 1. Quotation Creation
- User enters `net_weight_kg` (e.g., 165kg) for packaged items
- Stored in `quotation.items[].net_weight_kg`

### 2. Sales Order Creation
- `net_weight_kg` copied from quotation to sales order
- Stored in `sales_order.items[].net_weight_kg`

### 3. Job Order Creation (Frontend)
- User selects sales order
- Frontend reads `item.net_weight_kg` from sales order
- Sets it in form state: `form.net_weight_kg = 165`
- Sends to backend in job order creation request

### 4. Job Order Creation (Backend)
- Receives `net_weight_kg` from frontend
- Stores in `job_order.net_weight_kg = 165`
- Uses in BOM calculations

### 5. Procurement Calculations
- Reads `job_order.net_weight_kg = 165`
- Uses in material requirement calculations
- No more defaulting to 200kg

## Testing Checklist

- [x] Create quotation with custom `net_weight_kg` (165kg)
- [x] Convert to sales order - verify preserved
- [x] Create job order - verify preserved in database
- [x] Run trace script - verify shows correct value
- [x] Check procurement calculations - verify uses correct value
- [x] Test with Bulk packaging - verify `None` is preserved
- [x] Test with multiple items in sales order
- [x] Migrate existing job orders

## Files Modified

### Backend:
1. `backend/server.py` - Job order creation and calculations
2. `backend/trace_job_calculation.py` - Handle `None` values
3. `backend/trace_net_weight_flow.py` - Diagnostic script (NEW)
4. `backend/migrate_net_weight_to_job_orders.py` - Migration script (NEW)

### Frontend:
1. `frontend/src/pages/JobOrdersPage.js` - Form state and sales order selection

## Result

✅ **Permanent Fix Implemented**
- New job orders preserve `net_weight_kg` from quotation
- Existing job orders migrated with correct values
- Calculations use actual entered weight, not 200kg default
- Works for single and multiple item sales orders
- Properly handles Bulk packaging (stores `None`)

## Verification Commands

```bash
# Check specific job order
python trace_net_weight_flow.py JOB-000078

# Verify calculations
python trace_job_calculation.py JOB-000078

# Migrate existing job orders (if needed)
python migrate_net_weight_to_job_orders.py --execute
```

