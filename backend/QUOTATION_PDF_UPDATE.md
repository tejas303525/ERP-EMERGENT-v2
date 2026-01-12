# Quotation PDF Format Update

## Summary
Updated the quotation PDF generation to match the invoice format with a centered logo, matching the format shown in the provided image.

## Changes Made

### 1. Backend - Quotation PDF Generation (`backend/server.py`)

**Updated `generate_quotation_pdf()` function:**
- Added centered company logo at the top
- Added company header with full address and contact details
- Changed title to "QUOTATION" (instead of "PROFORMA INVOICE / QUOTATION")
- Updated header section to match invoice format with SHIPPER and RECEIVER/CONSIGNEE
- Changed items table headers to match format: "S.No", "Description of Goods", "Container", "Total Weight (MT)", "Unit Price", "Grand Total"
- Added detailed product descriptions with packing, net weight, country of origin, and HS code
- Added amount in words (e.g., "AMOUNT IN WORDS: US Dollar Forty Seven Thousand Five Hundred Twenty Only")
- Added shipping details (Point of Loading, Point of Destination)
- Added documents required section
- Added comprehensive terms & conditions (10 points)
- Added contact for dispatch and delivery section
- Added bank details section
- Added acceptance statement: "Please Sign and Return copy of this sales contract as a token of your acceptance"
- Added conditional stamp and signature (only if finance approved or printing)

**Updated `download_quotation_pdf()` endpoint:**
- Added `print` query parameter (boolean, default: false)
- When `print=true`, stamp and signature are always included
- When `print=false`, stamp and signature only shown if `finance_approved=true`

### 2. Frontend - API Updates (`frontend/src/lib/api.js`)

**Updated `pdfAPI.getQuotationUrl()`:**
```javascript
getQuotationUrl: (quotationId, print = false) => 
  `${API_BASE}/pdf/quotation/${quotationId}${print ? '?print=true' : ''}`
```

### 3. Frontend - Quotation View Dialog (`frontend/src/pages/QuotationsPage.js`)

**Added PDF buttons to view dialog:**
- "View PDF" button - Opens PDF without stamp/signature (unless finance approved)
- "Print PDF" button - Opens PDF with stamp/signature always included

## Format Comparison

### Before:
- Simple title "PROFORMA INVOICE / QUOTATION"
- Basic header with PFI Number, Customer, Currency, Order Type
- Simple items table with Product, SKU, Qty, Unit Price, Packaging, Total
- Basic totals section
- Status at bottom

### After (Matching Invoice Format):
- Centered company logo
- Full company header with address and contact details
- "QUOTATION" title
- SHIPPER and RECEIVER/CONSIGNEE sections
- Detailed items table with S.No, Description of Goods, Container, Total Weight (MT), Unit Price, Grand Total
- Amount in words
- Shipping details (Point of Loading/Destination)
- Documents required list
- Comprehensive terms & conditions (10 points)
- Contact for dispatch and delivery
- Bank details
- Acceptance statement
- Conditional stamp and signature

## Usage

### View Quotation PDF (no stamp/signature unless approved):
```
GET /api/pdf/quotation/{quotation_id}
```

### Print Quotation PDF (always includes stamp/signature):
```
GET /api/pdf/quotation/{quotation_id}?print=true
```

### Frontend Usage:
```javascript
// View PDF
window.open(pdfAPI.getQuotationUrl(quotationId, false), '_blank');

// Print PDF
window.open(pdfAPI.getQuotationUrl(quotationId, true), '_blank');
```

## Where to View

1. **Quotations Page** (`/quotations`)
   - Click the eye icon on any quotation to open the view dialog
   - In the dialog, click "View PDF" to see the PDF (stamp/signature only if finance approved)
   - In the dialog, click "Print PDF" to see the PDF with stamp/signature for printing

2. **Invoices Page** (`/receivables`)
   - Click the eye icon to view invoice details
   - Click the PDF button to download

## Assets Required

Place these images in `backend/assets/`:
1. `logo.png` - Company logo (400x400px, PNG, transparent)
2. `stamp.png` - Company stamp (300x300px, PNG, transparent)
3. `signature.png` - MD signature (400x150px, PNG, transparent)

If images are missing, placeholders will be shown: [LOGO], [STAMP], [SIGNATURE]

## Notes

- Both quotation and invoice PDFs now have the same format
- Logo is always displayed (if available)
- Stamp and signature are conditional:
  - Viewing: Only if `finance_approved = true`
  - Printing: Always included when `?print=true`
- Format matches the example image provided

