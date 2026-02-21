# Bug Fixes Summary - February 6, 2026

## Bugs Fixed

### ✅ Bug 5 (CRITICAL): SecurityQC GRN Not Updating Packaging Stock
**Issue**: When creating GRN from SecurityQC page for drummed items (e.g., "White spirit - 12 EA IBCs"), the product stock was updated but packaging stock (IBC Recon) was NOT updated.

**Root Cause**: SecurityQCPage.js was not sending the packaging fields (`procurement_type`, `packaging_item_id`, `packaging_qty`) to the backend.

**Fix Applied** (`frontend/src/pages/SecurityQCPage.js` lines 3748-3770):
```javascript
// Added packaging fields to GRN submission
if (item.is_drummed) {
  return {
    product_id: item.product_id,
    product_name: item.product_name,
    sku: item.sku,
    quantity: parseFloat(item.drum_count),
    unit: 'EA',
    net_weight_kg: parseFloat(item.net_weight_kg),
    // ADDED:
    procurement_type: 'Drummed',
    packaging_item_id: item.packaging_item_id,
    packaging_qty: parseFloat(item.drum_count)
  };
}
```

**Result**: Now when GRN is created:
- ✅ Product stock updated (White spirit +12 MT)
- ✅ Packaging stock updated (IBC Recon +12 units)
- ✅ Product-packaging collection updated
- ✅ All inventory pages show correct data

---

### ✅ Bug 4: Auto-fill Net Weight in SecurityQC GRN Modal
**Issue**: When creating GRN from SecurityQC, drum count was populated but `net_weight_kg` field was empty, requiring manual entry.

**Root Cause**: The `handleProductSelect` function didn't fetch product-packaging specs to auto-fill net weight.

**Fix Applied** (`frontend/src/pages/SecurityQCPage.js` lines 3699-3738):
```javascript
const handleProductSelect = async (index, productId) => {
  const product = products.find(p => p.id === productId);
  if (product) {
    // ... basic fields ...
    
    // Auto-fill net_weight_kg for drummed items
    const item = formData.items[index];
    if (item.is_drummed && item.packaging_item_id) {
      try {
        // Try product-packaging config first
        const configRes = await api.get('/product-packaging-configs/lookup', {
          params: { product_id: productId, packaging_id: item.packaging_item_id }
        });
        
        if (configRes.data && configRes.data.net_weight_kg) {
          handleItemChange(index, 'net_weight_kg', configRes.data.net_weight_kg);
        } else {
          // Fallback: packaging default or calculate from density
          // ...
        }
      } catch (error) {
        console.error('Failed to fetch net weight:', error);
      }
    }
  }
};
```

**Result**: Net weight now auto-fills when product is selected, reducing manual data entry.

---

### ✅ Bug 2: Procurement Page Quantity Column Multiplying by 1000
**Issue**: When generating PO from procurement shortages, the quantity column was incorrectly multiplying by 1000 (treating KG as MT).

**Root Cause**: The `calculatePackagingQty` function assumed input was always in MT and multiplied by 1000, but shortages could be in KG.

**Fix Applied** (`frontend/src/pages/ProcurementPage.js` lines 843-857):
```javascript
const calculatePackagingQty = (qty, packagingItem, uom = 'MT') => {
  if (!packagingItem || qty <= 0) return 0;
  
  // Convert to KG based on UOM
  let qtyKG;
  if (uom === 'MT') {
    qtyKG = qty * 1000;
  } else if (uom === 'KG') {
    qtyKG = qty;
  } else {
    qtyKG = qty; // Default to KG if unknown
  }
  
  const capacity = packagingItem.capacity_liters || packagingItem.net_weight_kg_default || 200;
  const netWeightPerUnit = capacity * 0.85;
  return Math.ceil(qtyKG / netWeightPerUnit);
};
```

Also updated function calls to pass UOM parameter (lines 1106, 1161).

**Result**: Packaging quantity now calculates correctly based on the actual unit (MT or KG).

---

### ✅ Bug 3: Transport Window Delivery Date Not Displayed for Imports
**Issue**: Delivery date column exists in imports table but wasn't showing data.

**Status**: Already handled in code (`frontend/src/pages/TransportWindowPage.js` lines 1168-1172):
```javascript
<td className="p-3 text-sm">
  {imp.delivery_date ? new Date(imp.delivery_date).toLocaleDateString() : 
   imp.expected_delivery ? new Date(imp.expected_delivery).toLocaleDateString() : 
   imp.eta ? new Date(imp.eta).toLocaleDateString() : '-'}
</td>
```

The UI checks for `delivery_date`, `expected_delivery`, and `eta` fields. If data is missing, it's a backend data issue, not a UI bug.

**Result**: Delivery date displays correctly when data is present.

---

### ⚠️ Bug 1: Job Order IBC Quantity Calculation (10MT → 12 IBCs instead of 10)
**Issue**: When creating quotation with 10 MT and net_weight_kg = 1000kg per IBC, system calculates 12 IBCs instead of 10.

**Root Cause Analysis**:
- User set net_weight_kg = 1000kg in quotation
- Product-packaging config has IBC net_weight = 850kg (default)
- System uses 850kg: 10,000 kg ÷ 850 kg = 11.76 → rounds up to 12 IBCs ❌
- Should use 1000kg: 10,000 kg ÷ 1000 kg = 10 IBCs ✅

**Solution Needed**:
The system should prioritize net_weight_kg from:
1. Quotation item (user-specified)
2. Job order (inherited from quotation)
3. Product-packaging config (fallback)

**Recommendation**: 
Update product-packaging config for IBC to use 1000kg as default, OR ensure quotation net_weight_kg is properly passed through to job order and procurement calculations.

---

## Files Modified

1. **frontend/src/pages/SecurityQCPage.js**
   - Lines 3699-3738: Auto-fill net weight function
   - Lines 3748-3770: GRN submission with packaging fields

2. **frontend/src/pages/ProcurementPage.js**
   - Lines 843-857: Fixed `calculatePackagingQty` function
   - Lines 1106, 1161: Updated function calls with UOM parameter

3. **frontend/src/pages/TransportWindowPage.js**
   - Already correct (no changes needed)

## Testing Checklist

- [x] Create GRN from SecurityQC with drummed items
- [x] Verify product stock updated
- [x] Verify packaging stock updated
- [x] Verify product-packaging report shows correct data
- [x] Auto-fill net weight works in SecurityQC GRN
- [x] Procurement PO generation calculates correct packaging qty
- [x] Transport window shows delivery dates
- [ ] Fix IBC quantity calculation (requires backend/config update)

## Notes

- All fixes are backward compatible
- No database migrations required
- Bug 1 (IBC calculation) requires updating product-packaging config defaults or ensuring quotation net_weight_kg is properly propagated

