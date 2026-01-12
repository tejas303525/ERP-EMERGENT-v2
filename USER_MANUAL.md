# Manufacturing ERP System - User Manual

## Overview
This ERP system manages the complete production workflow for a manufacturing plant, from sales quotations through production, procurement, shipping, and finance.

---

## Table of Contents
1. [Login & Roles](#login--roles)
2. [Dashboard](#dashboard)
3. [Sales Workflow](#sales-workflow)
4. [Production Workflow](#production-workflow)
5. [Procurement Workflow](#procurement-workflow)
6. [Finance Workflow](#finance-workflow)
7. [Inventory Management](#inventory-management)
8. [Shipping & Logistics](#shipping--logistics)
9. [Security & QC](#security--qc)
10. [Notifications](#notifications)

---

## Login & Roles

### Test Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@erp.com | admin123 |
| Sales | sales@erp.com | sales123 |
| Finance | finance@erp.com | finance123 |
| Production | production@erp.com | production123 |

### Role Permissions
- **Admin**: Full access to all modules
- ***OPS***: Create ops window fpr job order creation.
- **Sales**: Quotations, Sales Orders, Customers
- **Finance**: PO Approval, Payables, Receivables, GRN Review
- **Production**: Job Orders, Drum Schedule, Blend Reports
- **Procurement**: RFQ, Purchase Orders, Suppliers
- **Inventory**: Stock Management, GRN
- **Security**: GRN, Delivery Orders, Gate Checklists
- **QC**: Quality Inspections, Blend Approval

---

## Dashboard

The dashboard shows:
- Summary cards for open quotations, orders, jobs
- Role-specific quick actions
- Notification bell (top-right) with unread count

---

## Sales Workflow

### 1. Create Quotation
1. Navigate to **Quotations** page
2. Click **Create Quotation**
3. Select customer, add line items with products and quantities
4. Save as DRAFT or submit for APPROVAL

### 2. Quotation Approval (Finance)
1. Finance user reviews quotation
2. Can APPROVE or REQUEST CHANGES
3. Approved quotations can be converted to Sales Orders

### 3. Convert to Sales Order (SPA)
1. On approved quotation, click **Convert to SPA**
2. System creates Sales Order with SPA number
3. Job Orders are auto-created for each line item

---

## Production Workflow

### 1. Job Orders
- Auto-created from Sales Orders
- Shows product, quantity, delivery date, priority
- Statuses: pending, in_production, completed, dispatched

### 2. Drum Schedule (600/day Capacity)
Navigate to **Drum Schedule** to see:
- Weekly view (Mon-Sat) with 600 drums/day capacity
- Campaigns grouped by product + packaging
- Status: READY (green), PARTIAL (yellow), BLOCKED (red)

**Key Rules:**
- Maximum 600 drums per day (hard limit)
- Materials derived from `product_boms` and `packaging_boms`
- Blocked campaigns trigger procurement notifications

### 3. Blend Reports
1. Production creates blend report for each batch
2. Records actual materials used, batch numbers
3. QC approves blend before release

---

## Procurement Workflow

### 1. Material Shortages (Auto-Derived from BOMs)
Navigate to **Procurement** → **Material Shortages** tab:
- Shows RAW and PACK material shortages
- Calculated from `product_boms` and `packaging_boms`
- Never manual entry - always auto-derived

### 2. Auto-Generate Procurement Requisition
1. Click **Auto-Generate PR** button
2. Creates requisition lines for all shortages
3. Review and proceed to RFQ

### 3. Create RFQ (Request for Quotation)
1. Go to **RFQ / Quotes** tab
2. Click **Create RFQ**
3. Select supplier, add items from shortages
4. Save and **Send** to supplier (queues email)

### 4. Receive Quote
1. When supplier responds, open RFQ
2. Enter quoted prices for each line
3. Click **Save Quote** - status changes to QUOTED
4. Notification sent to procurement

### 5. Convert RFQ to PO
1. On QUOTED RFQ, click **Convert to PO**
2. PO created in DRAFT status
3. Notification sent to Finance for approval

---

## Finance Workflow

### 1. PO Approval
Navigate to **Finance Approval** page:
1. Review POs in **Pending Approval** tab
2. Check line items, amounts, supplier
3. Click **Approve** or **Reject** (with reason)
4. Approved POs can be sent to supplier

### 2. Send PO to Supplier
1. Go to **Approved** tab
2. Click **Send to Supplier**
3. Email queued (if SMTP configured)
4. PO status changes to SENT

### 3. Email Queue Status
- Check **Email Outbox** tab for queue status
- Shows QUEUED, SENT, FAILED emails
- "SMTP Not Configured" banner if no SMTP settings

### 4. GRN Payables Review
When goods are received (GRN created):
1. Notification sent to Finance
2. Review GRN details
3. **Approve**, **Hold**, or **Reject** for payables

### 5. Payables & Receivables
Navigate to respective pages for:
- Outstanding bills with aging buckets (Current, 30, 60, 90+ days)
- Invoice management
- Payment recording

---

## Inventory Management

### Inventory Status Logic
```
available = on_hand - reserved

Status:
- IN_STOCK: available > 0
- INBOUND: available <= 0 AND open PO exists
- OUT_OF_STOCK: otherwise
```

### Inventory Items
- **RAW**: Raw materials (Base Oil, Additives)
- **PACK**: Packaging materials (Drums, Closures, Pallets)

### GRN (Goods Received Note)
1. Security creates GRN when goods arrive
2. Updates inventory balances
3. Triggers payables review notification

---

## Shipping & Logistics

### Incoterm-Based Routing
After PO finance approval, route based on incoterm:

| Incoterm | Type | Route |
|----------|------|-------|
| EXW | LOCAL | Transportation Inward |
| DDP | LOCAL | Security + QC Inward |
| FOB | IMPORT | Shipping Booking |
| CFR/CIF | IMPORT | Import Checklist |

### Shipping Flow
1. Create Delivery Order from Job Order
2. Book shipping container (for exports)
3. Schedule transport pickup
4. Complete dispatch at gate

---

## Security & QC

### Security Inward Checklist
1. Record vehicle number, driver, weight-in
2. Complete checklist with weight-out
3. Track all movements

### QC Inspections
1. Create inspection for GRN, Job Order, or Blend
2. Record batch number
3. Mark result: PASS, FAIL, or HOLD

---

## Notifications

### Event-Based Triggers (No Chat/Noise)
Only these events trigger notifications:

| Event | Recipients | Icon |
|-------|------------|------|
| RFQ Quote Received | Procurement, Admin | Green (FileText) |
| PO Pending Approval | Finance, Admin | Amber (DollarSign) |
| Production Blocked | Production, Procurement | Red (AlertTriangle) |
| GRN Payables Review | Finance, Admin | Blue (Package) |

### Notification Bell
- Located in top-right header
- Shows unread count badge
- Click to view notifications
- Click notification to navigate to relevant page

---

## SMTP Configuration

To enable email sending, configure in `backend/.env`:
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=erp@yourcompany.com
```

Without SMTP config:
- Emails remain in QUEUED status
- "SMTP Not Configured" banner shown
- No emails sent (nothing mocked)

---

## Quick Reference

### URL Paths
| Page | Path |
|------|------|
| Dashboard | /dashboard |
| Quotations | /quotations |
| Sales Orders | /sales-orders |
| Job Orders | /job-orders |
| Drum Schedule | /drum-schedule |
| Inventory | /inventory |
| Procurement | /procurement |
| Finance Approval | /finance-approval |
| GRN | /grn |
| Shipping | /shipping |
| QC | /qc |

### Key Collections (MongoDB)
- `job_orders`, `sales_orders`, `quotations`
- `product_boms`, `product_bom_items` (RAW materials)
- `packaging_boms`, `packaging_bom_items` (PACK materials)
- `inventory_items`, `inventory_balances`
- `purchase_orders`, `rfq`, `procurement_requisitions`
- `grn`, `delivery_orders`
- `notifications`, `email_outbox`

---

## Support

For issues or questions, contact your system administrator.
