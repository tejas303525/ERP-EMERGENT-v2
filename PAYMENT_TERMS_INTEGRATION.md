# Payment Terms Integration - Settings to Pages

## Overview
This document describes the implementation that integrates payment terms from the Settings page into the Quotations and Procurement pages.

## Problem Statement
Previously, both QuotationsPage.js and ProcurementPage.js had hardcoded payment terms arrays. Any payment terms configured in the Settings page were not being populated in these dropdowns, leading to inconsistency and user confusion.

## Solution Implemented

### Approach
- **Merge Strategy**: Keep hardcoded default payment terms and append any additional terms from Settings
- **Duplicate Detection**: Check for duplicates (case-insensitive) and show a warning when duplicates are found
- **Fallback**: If Settings API fails or returns empty data, use the hardcoded defaults

### Files Modified

#### 1. `frontend/src/pages/QuotationsPage.js`

**Changes:**
1. Added state variable for dynamic payment terms:
   ```javascript
   const [paymentTerms, setPaymentTerms] = useState(PAYMENT_TERMS);
   ```

2. Updated `loadData()` function to fetch and merge payment terms:
   - Fetches settings from `/settings/all` API
   - Extracts payment terms from settings
   - Merges with hardcoded defaults
   - Detects duplicates (case-insensitive comparison)
   - Shows warning toast if duplicates found
   - Updates state with merged list

3. Updated payment terms dropdown to use dynamic state:
   ```javascript
   {paymentTerms.map(t => (
     <SelectItem key={t} value={t}>{t}</SelectItem>
   ))}
   ```

**Default Terms (31 total):**
- 100% CASH /TT/CDC IN ADVANCE
- 100% cash In Advance Before Shipment/Loading
- 100% CASH/TT/CDC AGAINST DELIVERY
- 20% Advance Balance 80% against scan copy docs
- 25% Advance and Balance 75% CAD at sight thru bank
- 30 DAYS FROM INVOICE/DELIVERY DATE
- 30 DAYS PDC AGAINST DELIVERY
- 30 DAYS PDC IN ADVANCE
- 30% Advance Balance 70% against scan copy docs
- 50% Advance and Balance 50% CAD at sight thru bank
- 50% Advance Balance 50% against scan copy docs
- 60 DAYS FROM INVOICE /DELIVERY DATE
- 60 DAYS PDC AGAINST DELIVERY
- 60 DAYS PDC IN ADVANCE
- 90 DAYS FROM INVOICE/ DELIVERY DATE
- 90 DAYS PDC AGAINST DELIVERY
- 90 DAYS PDC IN ADVANCE
- Avalised Draft 30 Days from Bill of Lading date
- Avalised Draft 60 Days from Bill of Lading date
- Avalised Draft 90 Days from Bill of Lading date
- Cash against Documents (CAD)
- Cash against Documents (CAD) Payable at sight through Bank
- Confirm Letter of credit payable at 30 days from Bill of Lading date
- Confirm Letter of credit payable at 60 days from Bill of Lading date
- Confirm Letter of credit payable at 90 days from Bill of Lading date
- Irrevocable Letter of Credit payable at sight
- Payable at 30 days from Bill of Lading Date thru Bank
- Payable at 30 days from Shipped on Board Date
- Payable at 60 days from Bill of Lading Date thru Bank
- Payable at 60 days from Shipped on Board Date
- Payable at 90 days from Bill of Lading Date thru Bank
- Payable at 90 days from Shipped on Board Date

#### 2. `frontend/src/pages/ProcurementPage.js`

**Changes:**
1. Added state variable for dynamic payment terms:
   ```javascript
   const [paymentTerms, setPaymentTerms] = useState(PAYMENT_TERMS);
   ```

2. Updated `loadData()` function:
   - Added `/settings/all` to the Promise.all array
   - Implemented same merge and duplicate detection logic as QuotationsPage
   - Shows warning toast if duplicates found

3. Updated payment terms dropdown to use dynamic state:
   ```javascript
   {paymentTerms.map(t => (
     <SelectItem key={t} value={t}>{t}</SelectItem>
   ))}
   ```

**Default Terms (8 total):**
- Advance
- Net 15
- Net 30
- Net 45
- Net 60
- COD
- LC
- TT

## Merge Logic

```javascript
// Load payment terms from settings and merge with defaults
const paymentTermsFromSettings = settings.payment_terms || [];
const termsFromSettings = paymentTermsFromSettings.map(t => t.name || t).filter(Boolean);

// Merge defaults with settings terms, checking for duplicates
const merged = [...PAYMENT_TERMS];
const duplicates = [];

termsFromSettings.forEach(term => {
  const existsIndex = merged.findIndex(t => t.toLowerCase() === term.toLowerCase());
  if (existsIndex >= 0) {
    duplicates.push(term);
  } else {
    merged.push(term);
  }
});

if (duplicates.length > 0) {
  console.warn('Duplicate payment terms found:', duplicates);
  toast.warning(`Duplicate payment terms ignored: ${duplicates.join(', ')}`);
}

setPaymentTerms(merged);
```

## Duplicate Detection

- **Case-Insensitive**: "Net 30" and "NET 30" are considered duplicates
- **Warning Display**: Users see a toast notification listing all duplicates
- **Console Logging**: Duplicates are also logged to browser console for debugging
- **Behavior**: Only the first occurrence (from defaults) is kept; duplicates from settings are ignored

## User Experience

### Before
- Payment terms dropdown showed only hardcoded values
- Settings page payment terms had no effect
- Inconsistent data between pages

### After
- Payment terms dropdown shows default terms + settings terms
- Any new terms added in Settings appear immediately (after page refresh)
- Duplicate warnings prevent confusion
- Consistent experience across Quotations and Procurement pages

## Testing Checklist

- [x] Code compiles without errors
- [ ] Quotations page loads payment terms from settings
- [ ] Procurement page loads payment terms from settings
- [ ] Duplicate detection works correctly
- [ ] Toast warning appears for duplicates
- [ ] Default terms are always available even if settings fail
- [ ] New terms from settings appear in dropdown
- [ ] Selected payment term saves correctly

## API Dependencies

- **GET `/settings/all`**: Returns all settings including payment_terms array
- **Expected Format**: 
  ```json
  {
    "payment_terms": [
      { "name": "Net 30", "days": 30, "description": "..." },
      ...
    ]
  }
  ```

## Future Enhancements

1. **Real-time Updates**: Use WebSocket or polling to update payment terms without page refresh
2. **Custom Sorting**: Allow users to define the order of payment terms
3. **Favorites**: Mark frequently used payment terms for quick access
4. **Validation**: Ensure selected payment term still exists before saving quotation/PO

