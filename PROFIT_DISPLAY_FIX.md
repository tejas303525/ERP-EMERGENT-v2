# Profit Display Fix - Use Saved Costing Values

## Problem
The Finance Approval page was **recalculating** Net Profit and Margin from scratch:
```javascript
profit = selling_price - total_cost
```

This caused incorrect values because:
1. `total_cost` calculation had issues with different costing types
2. Backend and frontend were calculating differently
3. Currency conversions could be inconsistent

### Example Issue (PFI-000210):
- **Costing Modal** (Correct): Net Profit = AED 83,266.76
- **Finance Approval** (Wrong): Net Profit = AED 4,000.00
- **Reason**: Total Cost was showing 80,000 instead of 733.24

## Solution
Instead of recalculating, **use the saved margin values** from the costing object as the source of truth:

```javascript
// Use saved values from confirmed costing
const profit = costing?.margin_amount ?? ((quotation.total || 0) - totalCost);
const profitPercentage = costing?.margin_percentage ?? (quotation.total > 0 ? (profit / quotation.total) * 100 : 0);
```

## Why This Works

1. **Single Source of Truth**: The costing modal calculates everything correctly when confirmed
2. **Backend Stores Values**: When costing is confirmed, it saves:
   - `margin_amount` (Net Profit)
   - `margin_percentage` (Profit %)
   - `total_cost`
3. **Frontend Displays Saved Values**: Finance Approval now displays these saved values directly

## Benefits

✅ **Consistency**: Costing Modal and Finance Approval show identical values  
✅ **Reliability**: No recalculation errors or data mismatches  
✅ **Simplicity**: One place calculates, everywhere else just displays  
✅ **Performance**: No need to reconstruct cost breakdown to recalculate  

## Files Modified

- `frontend/src/pages/FinanceApprovalPage.js` (lines 799-800)

## Change Details

**Before:**
```javascript
const profit = (quotation.total || 0) - totalCost;
const profitPercentage = quotation.total > 0 ? (profit / quotation.total) * 100 : 0;
```

**After:**
```javascript
const profit = costing?.margin_amount ?? ((quotation.total || 0) - totalCost);
const profitPercentage = costing?.margin_percentage ?? (quotation.total > 0 ? (profit / quotation.total) * 100 : 0);
```

## Expected Behavior

### PFI-000210 Example:
- **Selling Price**: AED 84,000.00
- **Total Cost**: AED 733.24 (from costing)
- **Net Profit**: **AED 83,266.76** ✅ (from `costing.margin_amount`)
- **Margin**: **99.13%** ✅ (from `costing.margin_percentage`)

### All Quotations:
- If costing is confirmed → Display saved `margin_amount` and `margin_percentage`
- If costing not confirmed → Fallback to calculation (for backward compatibility)

## Testing

1. **Open Finance Approval page**
2. **Find PFI-000210** (or any quotation with confirmed costing)
3. **Check Profit & Loss section**:
   - Net Profit should match the costing modal exactly
   - Margin percentage should match
   - No more discrepancies between modal and approval page

## Date Implemented
February 2, 2026

## Status
✅ **COMPLETED** - Profit now displays saved costing values

