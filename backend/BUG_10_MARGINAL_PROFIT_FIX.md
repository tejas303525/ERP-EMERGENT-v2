# Bug #10 Fix: Marginal Profit Calculation Issues

## Problem Identified

The marginal profit calculation was showing incorrect values because:

1. **Raw material cost defaulted to 0** when no GRN/PO history existed
2. **Packaging cost defaulted to 0** when packaging items couldn't be matched by name
3. **No validation** to prevent users from confirming costing with zero costs
4. **No visual warnings** in the Finance Approval page when costs were missing

This led to **inflated profit margins** that didn't reflect reality.

## Solutions Implemented

### 1. Backend: Improved Cost Fallback Logic (`backend/costing_service.py`)

**Added product price fallback:**
```python
# FALLBACK: Try product's price fields before returning 0
if product:
    fallback_price = product.get("price_usd") or product.get("price_aed") or product.get("price_eur") or 0.0
    if fallback_price > 0:
        return {
            "cost": fallback_price * quantity,
            "unit_cost": fallback_price,
            "source": "PRODUCT_PRICE_FALLBACK",
            "details": {"method": "product_master_price"},
            "warning": "Using product master price - no GRN/PO history found"
        }
```

**Added explicit warning when no data available:**
```python
# Last resort: return 0 with explicit warning
return {
    "cost": 0.0, 
    "unit_cost": 0.0, 
    "source": "NONE", 
    "details": {"method": "no_data"},
    "warning": "⚠️ No cost data available - manual entry required"
}
```

### 2. Frontend: Added Validation in CostingModal (`frontend/src/components/CostingModal.js`)

**handleSave() - Warning on zero costs:**
```javascript
// ⚠️ WARNING: Check for zero costs (allow save but warn user)
const rawMaterialCost = costs['raw_material_cost'] ?? costing['raw_material_cost'];
if (!rawMaterialCost || rawMaterialCost === 0) {
  toast.warning('⚠️ Warning: Raw material cost is 0. Margin calculation may be incorrect.', {
    duration: 5000
  });
}
```

**handleConfirm() - Block confirmation with zero costs:**
```javascript
// ⚠️ CRITICAL VALIDATION: Check for zero or missing costs
const rawMaterialCost = costs['raw_material_cost'] ?? costing['raw_material_cost'];
if (!rawMaterialCost || rawMaterialCost === 0) {
  toast.error('⚠️ Raw material cost is 0 or missing. Please enter manually before confirming.');
  return; // Block confirmation
}

// Check packaging cost if not bulk
const items = quotation?.items || [];
const hasDrumPackaging = items.some(item => {
  const packaging = (item.packaging || 'Bulk').toUpperCase();
  return packaging !== 'BULK';
});

const packagingCost = costs['packaging_cost'] ?? costing['packaging_cost'];
if (hasDrumPackaging && (!packagingCost || packagingCost === 0)) {
  const confirmed = window.confirm(
    '⚠️ Warning: Packaging cost is 0 for a drummed product. This may indicate missing cost data.\n\n' +
    'Do you want to proceed anyway? (Not recommended)'
  );
  if (!confirmed) {
    return; // Block if user cancels
  }
}
```

### 3. Frontend: Visual Warning in Finance Approval (`frontend/src/pages/FinanceApprovalPage.js`)

**Added warning banner when costs are missing:**
```javascript
{/* Warning banner if costs are zero or missing */}
{(costing.raw_material_cost === 0 || !costing.raw_material_cost || 
  (costing.packaging_type !== 'BULK' && (costing.packaging_cost === 0 || !costing.packaging_cost))) && (
  <div className="mb-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-2">
    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
    <div className="text-xs">
      <p className="font-medium text-amber-400">⚠️ Cost Data Warning</p>
      <p className="text-muted-foreground mt-1">
        {!costing.raw_material_cost || costing.raw_material_cost === 0 ? 
          'Raw material cost is 0 or missing. ' : ''}
        {costing.packaging_type !== 'BULK' && (!costing.packaging_cost || costing.packaging_cost === 0) ?
          'Packaging cost is 0 or missing. ' : ''}
        Profit margin may be incorrect.
      </p>
    </div>
  </div>
)}
```

## Impact

### Before Fix:
- ❌ Raw material cost: $0 (no data) → Margin: 100%
- ❌ User could confirm costing with zero costs
- ❌ Finance approval page showed inflated margins
- ❌ No visibility into data quality issues

### After Fix:
- ✅ Raw material cost: Falls back to product price or shows explicit warning
- ✅ Users **cannot confirm** costing with zero raw material cost
- ✅ Warning prompt for zero packaging cost
- ✅ Finance approval page shows clear **warning banner** when costs are missing
- ✅ Toast notifications alert users to data issues
- ✅ Profit margins accurately reflect available cost data

## Testing

1. **Test with complete cost data:**
   - Create quotation with products that have GRN/PO history
   - Verify costing calculates correctly
   - Verify no warnings appear

2. **Test with missing raw material cost:**
   - Create quotation with new product (no GRN history)
   - If product has price_usd/price_aed: Verify fallback is used with warning
   - If product has no price: Verify explicit warning appears
   - Try to confirm: Should be **blocked**

3. **Test with missing packaging cost:**
   - Create drummed quotation with packaging not in system
   - Verify confirmation shows warning prompt
   - Can proceed with explicit confirmation

4. **Test Finance Approval page:**
   - View quotation with missing costs
   - Verify warning banner appears
   - Verify profit calculation shows correctly (even if $0)

## Files Modified

1. `backend/costing_service.py` - Improved fallback logic
2. `frontend/src/components/CostingModal.js` - Added validation and warnings
3. `frontend/src/pages/FinanceApprovalPage.js` - Added visual warning banner

## Status

✅ **FIXED** - Bug #10 resolved

Users are now protected from confirming costing with missing data, and finance team has clear visibility into data quality issues.

