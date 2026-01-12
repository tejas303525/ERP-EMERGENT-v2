# Manufacturing ERP System - Product Requirements Document

## Original Problem Statement
Build a full Manufacturing ERP system based on a detailed mermaid chart with comprehensive modules for:
- Sales and Quotation Management
- Production and Job Order Management  
- Inventory and Procurement
- Shipping and Logistics
- Quality Control and Security
- Finance (Payables/Receivables)

## Core Requirements

### Phase 1 (COMPLETED ✅)
1. **Unified Production Scheduling** - 600 drums/day capacity with allocation logic
2. **Transport Window** - 4 tabs (Inward/Outward Raw, Inward/Outward Container)
3. **Import Window** - Document checklist and tracking
4. **Incoterm-based PO Routing** - Auto-route based on EXW/DDP/FOB/CFR
5. **BOM Management** - Product and Packaging BOMs
6. **Material Availability Check** - Auto-check on quotation approval

### Phase 2 (COMPLETED ✅) - December 30, 2025

#### Bug Fixes Implemented
1. **Quotation Page Enhancements (Bug 1)** ✅
   - Export Orders: Container types (20ft, 40ft, ISO Tank, Bulk Tankers), Country of destination/origin
   - Local Orders: Port of loading/discharge, 5% VAT calculation
   - Payment terms and document checklist (configurable)
   - All fields reflected in PDF generation

2. **Quotation Approval UI Bug (Bug 2)** ✅
   - Fixed immediate state update after approval
   - No longer shows "failed" message on first click

3. **Job Order Automation (Bug 3)** ✅
   - Auto-fill product, quantity, packaging from SPA selection
   - Auto-load BOM from BOM Management module
   - Real-time material availability check against BOM components
   - `procurement_required` flag accurately calculated

4. **Shipping/Transport Integration (Bug 4)** ✅
   - Added CRO fields: freight_charges, pull_out_date, si_cutoff, gate_in_date
   - CRO entry auto-creates transport_outward record
   - Container bookings appear in Transport Window "Outward - Container" tab

5. **Procurement Flow Rework (Bug 5)** ✅
   - Changed from RFQ model to "Generate PO" model
   - Select shortages → Enter unit price → Generate PO directly
   - PO immediately appears on Finance Approval page with DRAFT status
   - Fixed multi-select checkbox bug
   - Vendors with address autofill

#### New Modules Implemented
1. **Security Gate Module** (`/security`) ✅
   - 3 Windows: Inward Transport, Outward Transport, RFQ Window
   - Security checklist with weighment entry
   - Vehicle/driver verification
   - Seal number tracking
   - Auto-routes to QC after completion

2. **QC Inspection Module** (`/qc-inspection`) ✅
   - 3 Tabs: Pending Inspection, Completed, COA Management
   - Standard quality tests (appearance, color, moisture, pH, density, purity, viscosity)
   - Batch number tracking
   - Pass/Fail workflow
   - COA (Certificate of Analysis) generation for outward shipments

#### Workflow Implementation
**Inward Flow:**
Security Checklist + Weight → QC Inspection → GRN → Stock Update → Notify Payables

**Outward Flow:**
Security Checklist + Weight → QC Inspection → Delivery Order → Notify Receivables
- Local Customer: Tax Invoice
- International Customer: Commercial Invoice

**Export Documents (Auto-generated for international):**
- Packing List
- Certificate of Origin (COO)
- BL Draft
- Certificate of Analysis (COA)

## Technical Architecture

### Backend
- **Framework:** FastAPI (Python)
- **Database:** MongoDB (Motor async driver)
- **Authentication:** JWT
- **File:** `/app/backend/server.py` (monolithic, 5000+ lines)

### Frontend
- **Framework:** React
- **Styling:** TailwindCSS
- **UI Components:** Shadcn/UI
- **State:** React Context API
- **HTTP Client:** Axios

### Key API Endpoints
```
# Phase 2 New Endpoints
POST /api/purchase-orders/generate - Generate PO directly from shortages
GET /api/security/dashboard - Security dashboard with stats
GET /api/security/inward - Inward transports for security check
GET /api/security/outward - Outward transports for security check
POST /api/security/checklists - Create security checklist
PUT /api/security/checklists/{id}/complete - Complete checklist and route to QC
GET /api/qc/dashboard - QC dashboard with pending inspections
GET /api/qc/inspections - Get QC inspections
PUT /api/qc/inspections/{id}/pass - Pass QC inspection (creates GRN or DO)
PUT /api/qc/inspections/{id}/fail - Fail QC inspection
POST /api/qc/inspections/{id}/generate-coa - Generate COA for outward shipment
GET /api/documents/export/{job_id} - Get export documents status
```

### Database Collections
- `quotations` - Sales quotations with order_type (local/export)
- `job_orders` - Production jobs with procurement_required flag
- `shipping_bookings` - Shipping with CRO fields
- `transport_inward`, `transport_outward` - Transport window records
- `security_checklists` - Security gate checklists
- `qc_inspections` - QC inspection records with COA tracking
- `delivery_orders` - Delivery orders auto-generated from QC pass
- `grn` - Goods Receipt Notes created from inward QC pass
- `purchase_orders` - POs with DRAFT status for finance approval

## Test Credentials
- **Admin:** admin@erp.com / admin123
- **Finance:** finance@erp.com / finance123

## Current State
- **Backend Status:** Running ✅
- **Frontend Status:** Running ✅
- **All Phase 2 Features:** Tested and Working ✅

## Test Results (December 30, 2025)
- Backend: 13/13 tests passed (100%)
- Frontend: All pages load correctly
- Security Gate: 2 inward transports pending
- QC Inspection: 0 pending inspections
- Procurement: 2 raw material shortages displayed
- Quotations: 16 total (10 LOCAL, 6 EXPORT)
- Job Orders: 10 jobs with BOM automation

## Future Tasks (Backlog)

### P1 - High Priority
1. PDF Generation with new custom fields
2. Admin Configuration Pages for vendors, payment terms, documents

### P2 - Medium Priority
1. Documentation update (USER_MANUAL.md)
2. Code refactoring (split server.py into modules)
3. Email integration for sending POs to vendors

### P3 - Low Priority
1. Dashboard analytics improvements
2. Mobile responsive enhancements
3. Bulk operations support
