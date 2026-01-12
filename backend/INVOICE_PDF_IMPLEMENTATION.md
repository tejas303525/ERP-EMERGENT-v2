# Export Invoice PDF Implementation

## Overview
This document describes the implementation of the export invoice PDF generation that matches the Proforma Invoice format with logo, stamp, and signature.

## Changes Made

### 1. Invoice Model Updates
- Added `finance_approved` field (boolean)
- Added `finance_approved_by` field (string, user ID)
- Added `finance_approved_at` field (string, ISO timestamp)

### 2. Invoice Number Prefix Changes
- **Local invoices**: Changed from `INV-L` to `APL` (Asia Petrochemicals Local)
- **Export invoices**: Changed from `INV-E` to `APE` (Asia Petrochemicals Export)

These match the Proforma Invoice (PI) code format shown in the example.

### 3. PDF Generation Function
The `generate_invoice_pdf()` function has been completely rewritten to match the Proforma Invoice format:

**Features:**
- Centered company logo at the top
- Company header with address and contact details
- "PROFORMA INVOICE" title for export invoices
- Shipper and Receiver information table
- Items table matching the proforma format (S.No, Description, Packing, Quantity, Unit Price, Total)
- Shipping information (Country of Origin, Ports, etc.)
- Total amount with amount in words
- Payment terms and validity
- Bank details for export invoices
- Conditional stamp and signature (only after finance approval or when printing)

### 4. Finance Approval Endpoint
New endpoint: `PUT /api/receivables/invoices/{invoice_id}/finance-approve`

- Only accessible by admin/finance roles
- Sets `finance_approved = True` on the invoice
- Records who approved and when
- After approval, stamp and signature appear on PDF when viewing

### 5. PDF Download Endpoint Updates
Updated: `GET /api/pdf/invoice/{invoice_id}`

**New Query Parameter:**
- `print` (boolean, default: false) - When `true`, includes stamp and signature even if not finance approved

**Behavior:**
- **Viewing (print=false)**: Stamp and signature only shown if `finance_approved = True`
- **Printing (print=true)**: Stamp and signature always shown

### 6. Assets Directory
Created `backend/assets/` directory for:
- `logo.png` - Company logo (centered at top)
- `stamp.png` - Company stamp/seal
- `signature.png` - MD signature

See `backend/assets/README.md` for details.

## Usage

### Finance Approval Workflow
1. Invoice is created (status: PENDING, finance_approved: false)
2. Finance reviews invoice
3. Finance approves via: `PUT /api/receivables/invoices/{invoice_id}/finance-approve`
4. Invoice now has `finance_approved = true`
5. PDF downloads will include stamp and signature

### PDF Download URLs

**Viewing (stamp/signature only if approved):**
```
GET /api/pdf/invoice/{invoice_id}
```

**Printing (always includes stamp/signature):**
```
GET /api/pdf/invoice/{invoice_id}?print=true
```

### Frontend Integration

To download PDF for printing:
```javascript
const url = `${API_BASE}/pdf/invoice/${invoiceId}?print=true`;
window.open(url, '_blank');
```

To approve invoice:
```javascript
await receivablesAPI.financeApprove(invoiceId);
```

## Image Requirements

Place the following images in `backend/assets/`:

1. **logo.png** - 400x400px, PNG, transparent background
2. **stamp.png** - 300x300px, PNG, transparent background  
3. **signature.png** - 400x150px, PNG, transparent background

If images are missing, PDF generation will continue but show placeholders.

## Testing

1. Create an export invoice (will have APE prefix)
2. Download PDF - should NOT show stamp/signature
3. Approve invoice via finance approval endpoint
4. Download PDF again - should NOW show stamp/signature
5. Download PDF with `?print=true` - should always show stamp/signature

## Notes

- Logo is always displayed (if available)
- Stamp and signature are conditional based on finance approval
- Export invoices show "PROFORMA INVOICE" title
- Local invoices show "TAX INVOICE" title
- All export invoice details (shipping, bank, terms) are pulled from the associated quotation

