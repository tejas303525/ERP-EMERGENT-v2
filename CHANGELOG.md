# CHANGELOG

## [2.0.0] - 2025-12-29

### Phase 1: Inventory Status Discrepancy Fix
- **ADDED** `GET /api/inventory-items` now returns `status` field (IN_STOCK, INBOUND, OUT_OF_STOCK)
- **ADDED** `GET /api/inventory-items/:id/availability` - detailed availability breakdown
- **FIXED** Status calculation: `available = on_hand - reserved`

### Phase 3: SMTP Email Queue
- **ADDED** `email_outbox` collection for queuing emails
- **ADDED** `POST /api/email/queue` - queue email for sending
- **ADDED** `GET /api/email/outbox` - view queue with SMTP status
- **ADDED** `POST /api/email/process-queue` - process queued emails
- **ADDED** SMTP configuration via environment variables
- **NOTE** Emails remain QUEUED when SMTP not configured (never mocked)

### Phase 4: Procurement Auto-Generation from BOMs
- **ADDED** `GET /api/procurement/shortages` - shortages from product_boms + packaging_boms
- **ADDED** `POST /api/procurement/auto-generate` - auto-create PR from shortages
- **FIXED** Materials now derived from BOMs, NEVER from job_orders.bom

### Phase 5: RFQ → PO Flow
- **ADDED** `POST /api/rfq` - create RFQ
- **ADDED** `GET /api/rfq` - list RFQs
- **ADDED** `PUT /api/rfq/:id/send` - mark SENT, queue email
- **ADDED** `PUT /api/rfq/:id/quote` - update with supplier prices
- **ADDED** `POST /api/rfq/:id/convert-to-po` - convert QUOTED RFQ to PO

### Phase 6: Finance Approval
- **ADDED** `GET /api/purchase-orders/pending-approval` - POs awaiting finance
- **ADDED** `PUT /api/purchase-orders/:id/finance-approve` - approve PO
- **ADDED** `PUT /api/purchase-orders/:id/finance-reject` - reject PO with reason
- **ADDED** `PUT /api/purchase-orders/:id/send` - send approved PO to supplier

### Phase 7: Drum Scheduling (600/day)
- **VERIFIED** 600 drums/day capacity enforcement
- **VERIFIED** Weekly view with campaign grouping
- **VERIFIED** Material availability checking from BOMs
- **VERIFIED** BLOCKED status for shortages

### Phase 8: Incoterm-Based Logistics Routing
- **ADDED** `GET /api/logistics/routing-options` - available incoterms
- **ADDED** `POST /api/logistics/route-po/:id` - route PO based on incoterm
- **ADDED** `GET /api/logistics/routing` - view routing records
- **ADDED** LOCAL (EXW, DDP, DAP) and IMPORT (FOB, CFR, CIF, FCA) routing

### Phase 9: Security, QC, Payables, Receivables (MVP)
- **ADDED** GRN payables review: `review_status` field (PENDING_PAYABLES, APPROVED, HOLD, REJECTED)
- **ADDED** `GET /api/grn/pending-payables` - GRNs pending review
- **ADDED** `PUT /api/grn/:id/payables-approve`, `payables-hold`, `payables-reject`
- **ADDED** `POST /api/payables/bills` - create payable bill
- **ADDED** `GET /api/payables/bills` - list with aging buckets
- **ADDED** `PUT /api/payables/bills/:id/approve`, `/pay`
- **ADDED** `POST /api/receivables/invoices` - create invoice (LOCAL/EXPORT)
- **ADDED** `GET /api/receivables/invoices` - list with aging
- **ADDED** `PUT /api/receivables/invoices/:id/record-payment`
- **ADDED** `POST /api/security/inward-checklist` - security gate checklist
- **ADDED** `PUT /api/security/checklist/:id/complete` - complete with weight-out
- **ADDED** `GET /api/security/checklists`
- **ADDED** `POST /api/qc/inspection` - create QC inspection
- **ADDED** `PUT /api/qc/inspection/:id/result` - mark PASS/FAIL/HOLD
- **ADDED** `GET /api/qc/inspections`

### Notifications (Event-Based)
- **ADDED** `GET /api/notifications/bell` - role-filtered notifications
- **ADDED** `GET /api/notifications/unread-count`
- **ADDED** `PUT /api/notifications/:id/read`
- **ADDED** `PUT /api/notifications/read-all`
- **ADDED** NotificationBell component in header
- **TRIGGERS**:
  - RFQ_QUOTE_RECEIVED → Procurement
  - PO_PENDING_APPROVAL → Finance
  - PRODUCTION_BLOCKED → Production, Procurement
  - GRN_PAYABLES_REVIEW → Finance

### Frontend
- **ADDED** `/procurement` - Procurement Management page with Material Shortages tab
- **ADDED** `/finance-approval` - Finance PO Approval page
- **ADDED** NotificationBell component in MainLayout header
- **UPDATED** api.js with all new endpoint functions

---

## [1.0.0] - 2025-12-28

### Initial Implementation
- Core ERP modules: Quotations, Sales Orders, Job Orders
- Production scheduling and blend reports
- Inventory management with movements
- GRN and Delivery Orders
- Shipping bookings and transport
- User management with 11 roles
- Dashboard with role-based access
