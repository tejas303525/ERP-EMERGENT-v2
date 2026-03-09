# Manufacturing ERP System — Beginner End-to-End Guide

## Who this guide is for
This guide is for a **first-time user** (and junior operator/admin) who wants to understand the full system from GUI screens to backend logic.

It explains:
- what each window does,
- how data moves from one department to the next,
- what key concepts mean,
- where common bugs happened historically,
- and how to troubleshoot safely.

---

## 1) System at a glance

This ERP is a **React frontend + FastAPI backend + MongoDB** system.

- **Frontend (GUI):** `frontend/src` (routes, pages, layouts, role-based nav)
- **Backend API:** `backend/server.py` (auth, masters, transactions, scheduling, finance, documents, settings)
- **Database:** MongoDB collections used by API modules

Primary architecture:
1. User logs in.
2. GUI calls `/api/...` endpoints using Axios.
3. Backend validates role/data, writes to MongoDB.
4. Downstream modules read same records and advance workflow.

---

## 2) Core concepts (plain English)

### Commercial chain
1. **Quotation**: Offer to customer (pricing/terms/products)
2. **Sales Order (Contract/SPA)**: Confirmed agreement
3. **Job Order**: Manufacturing execution instruction
4. **Delivery Order (DO)**: Goods release note for dispatch
5. **Invoice (AR)**: Receivable generated against completed dispatch flow

### Procurement chain
1. **Material shortage** from BOM requirements
2. **RFQ** to suppliers
3. **Purchase Order (PO)** issued
4. **GRN** on goods receipt
5. **Payables bill/payment**

### Production chain
- Product BOM + Packaging BOM drive material requirements.
- Schedule engines organize jobs into operational windows.
- QC/Blend checkpoints validate quality and release.

### Inventory math
- `available = on_hand - reserved`
- Stock status categories are derived from availability + inbound context.

### Access control
- JWT authentication
- Role-based menu filtering with optional `allowed_pages` overrides.

---

## 3) GUI map (what each main window means)

Main navigation is rendered from `MainLayout` and filtered by role/allowed pages.

### Primary operational windows
- **Commercial Contracts** (`/quotations`): customer-facing pricing docs
- **Contracts** (`/sales-orders`): confirmed customer deals
- **Order Fulfillment** (`/job-orders`): manufacturing jobs
- **Production** (`/production-schedule`, unified schedule variants)
- **Procurement Window** (`/procurement`)
- **Logistics Inwards (Imports)** (`/import-window`)
- **Shipping Window** (`/shipping`)
- **Transport Window** (`/transport-window`)
- **Security & Q.C.** (`/security-qc`)

### Supporting windows
- Inventory, Stock Management, GRN, Delivery Orders
- QC Inspection, Documentation
- Finance Approval, Payables, Receivables
- Customers, Products, Settings
- User Management + Role Management

---

## 4) First-time setup (developer/admin quick start)

1. Start backend (`uvicorn server:app --host 0.0.0.0 --port 8001 --reload`)
2. Start frontend (`npm start` in `frontend`)
3. Open `http://localhost:3000`
4. Login with a seeded/test user
5. Confirm health endpoint at `GET /api/health`

Environment basics:
- Backend needs `MONGO_URL`, `DB_NAME`, `JWT_SECRET`
- Frontend needs `REACT_APP_BACKEND_URL` (optional; defaults to `http://localhost:8001`)

---

## 5) End-to-end business walkthrough (GUI perspective)

## Step A — Login + role context
- Login screen posts credentials to `/api/auth/login`.
- Token and user profile are stored in localStorage.
- Sidebar is filtered based on role or explicit `allowed_pages`.

**Beginner tip:** if you cannot see a menu, it is usually permission config, not a UI bug.

## Step B — Master data readiness
Before transactions, ensure:
- Customers exist
- Products exist
- Packaging/Settings are configured
- (If used) product-packaging configuration has realistic net weight defaults

## Step C — Quotation lifecycle
1. Sales creates quotation.
2. Finance/admin approval steps run.
3. Approved quotation is converted downstream to contract/sales order.

Key checks:
- Country/port and transport attributes should be coherent.
- Net weight and packaging assumptions should match real commercial terms.

## Step D — Sales order to job order
1. Sales order is created/confirmed.
2. Job orders are generated for execution.
3. BOM/material availability logic determines whether procurement action is needed.

Status flow generally follows pending → production-related statuses → dispatch/completion states.

## Step E — Production + scheduling
1. Production screens show jobs, shortages, planning windows.
2. Scheduling applies capacity and material constraints.
3. Blend report records execution and QC checkpoints.

Beginner rule:
- **Do not manually bypass shortage logic**; fix BOM/config data first.

## Step F — Procurement
1. Procurement sees shortages.
2. Creates RFQ and captures supplier quotes.
3. Converts quoted RFQ to PO.
4. Finance approves/rejects PO.
5. Approved POs are sent to supplier.

## Step G — Inward logistics, GRN, inventory
1. Inbound material arrives.
2. Security/QC/GRN process records received quantity and quality.
3. Inventory updates for product and (where relevant) packaging.
4. Finance can review GRN for payables actions.

## Step H — Delivery + outward logistics
1. Create Delivery Order from executable jobs.
2. Plan shipping/transport.
3. Complete dispatch and delivery confirmation.
4. Handle partial deliveries through dedicated workflows.

## Step I — Finance closeout
- **Payables:** supplier bills, approvals, payments
- **Receivables:** invoice generation, payment recording, aging visibility

## Step J — Documentation and PDFs
System can generate operational/commercial PDFs (quotation, invoice, GRN, job order, delivery note, etc.) from API PDF endpoints.

---

## 6) How data flows between teams (mental model)

- **Sales** creates commercial demand.
- **Production + Procurement** consume that demand and plan materials.
- **Inventory + Security + QC** validate physical movement and quality.
- **Logistics/Transport/Shipping** execute movement.
- **Finance** validates payable/receivable outcomes.

If one step is incomplete, the next module often appears "stuck" (which is usually expected gating behavior).

---

## 7) API domains behind the GUI (for debugging)

Major endpoint groups in `backend/server.py`:
- Auth + Users + Roles
- Customers/Products/Quotations/Sales Orders
- Job Orders + production planning
- GRN + delivery + shipping + transport
- Inventory + stock adjustments/reporting
- Procurement/RFQ/PO/logistics routing
- Payables + Receivables
- QC + Security operations
- Notifications
- Settings + file upload + document/PDF generation

Use this when troubleshooting a broken button:
1. Find page component
2. Find API call in `frontend/src/lib/api.js` or page file
3. Match endpoint in backend
4. Validate payload + response

---

## 8) Known bug history and lessons learned

Below are documented bugs/fixes captured in repository notes.

### A) Packaging stock not updating from Security/QC GRN
- Symptom: Product stock updated but packaging stock did not.
- Cause: Missing packaging fields in frontend GRN payload.
- Lesson: Ensure drummed-item payload always includes packaging metadata.

### B) Net weight not auto-filled in Security/QC GRN
- Symptom: manual entry required every time.
- Cause: config lookup fallback gap.
- Lesson: always keep product-packaging configuration complete.

### C) Procurement quantity conversion errors (KG vs MT)
- Symptom: quantities inflated by x1000 in some cases.
- Cause: unit conversion assumptions.
- Lesson: enforce explicit UOM in calculations and payloads.

### D) Transport window delivery date confusion
- Symptom: empty delivery date column for some import rows.
- Cause: missing source fields in data rather than UI-only issue.
- Lesson: verify backend fields (`delivery_date`, `expected_delivery`, `eta`).

### E) IBC quantity mismatch (rounding/weight source precedence)
- Symptom: 10 MT sometimes becoming 12 IBC.
- Cause: config default net weight overriding intended commercial value.
- Lesson: define source-of-truth priority for net weight and enforce consistently.

### F) Transport mode field-name mismatch
- Symptom: data not flowing correctly between modules.
- Cause: inconsistent naming across payload/backend model.
- Lesson: maintain strict API schema conventions.

### G) Availability and stock sync inconsistencies
- Symptom: pages showing different stock/availability results.
- Cause: differing logic paths and missing sync updates.
- Lesson: centralize inventory calculations and post-transaction reconciliation.

### H) GRN unit conversion defects
- Symptom: wrong quantities when receiving in alternate units.
- Cause: conversion logic gaps.
- Lesson: use shared conversion engine and test both UOM directions.

### I) Delivery-order/invoice closeout edge cases
- Symptom: invoice not generated when job status transitions too early.
- Cause: strict status filter missed newly closed jobs.
- Lesson: account for terminal status variants in downstream generation logic.

### J) Marginal profit calculation bugs
- Symptom: incorrect margin output in costing/profit views.
- Cause: formula/field handling defects.
- Lesson: test with multiple costing modes and real-world edge inputs.

---

## 9) Beginner troubleshooting playbook

1. **Check login/session**: expired token causes redirect to login.
2. **Check backend health**: `/api/health` must be OK.
3. **Check browser network tab**:
   - Request URL
   - Request payload
   - Response status/body
4. **Check CORS/env**: frontend base URL must match backend reachability.
5. **Check role permissions**: missing menu/action may be access-related.
6. **Check master data completeness**: products/BOM/packaging/settings.
7. **Check status gating**: many actions require prior status transitions.
8. **Check unit consistency**: KG/MT/L/EA mismatches are high-risk.
9. **Check documented fixes**: many recurring issues are already documented in repo markdown notes.

---

## 10) Recommended onboarding path for a new end user

Day-1 practice order:
1. Login and understand your role menu.
2. Create a customer + product.
3. Create quotation and move it through approval.
4. Convert/confirm sales order and inspect job order creation.
5. Visit production/procurement windows to understand shortage behavior.
6. Simulate GRN and verify stock movement.
7. Create delivery order and complete dispatch.
8. Verify receivable/payable entries.
9. Open notification bell and follow one full alert-driven workflow.

---

## 11) File map for deeper learning

- Architecture/startup: `README.md`
- Beginner functional manual: `USER_MANUAL.md`
- GUI routing: `frontend/src/App.js`
- Sidebar + role navigation: `frontend/src/components/layout/MainLayout.js`
- Auth/session handling: `frontend/src/context/AuthContext.js`
- Frontend API client: `frontend/src/lib/api.js`
- Backend API implementation: `backend/server.py`
- Change and bug logs:
  - `CHANGELOG.md`
  - `BUG_FIXES_SUMMARY.md`
  - `FIXES_REPORT.md`
  - backend fix notes in `backend/*.md`

---

## 12) Final beginner advice

- Treat the system as a **chain of validated steps**, not isolated screens.
- Most "bugs" in operations are actually one of these:
  - missing prerequisite data,
  - wrong unit/packaging config,
  - status transition not completed,
  - permission restriction.
- When in doubt: trace **UI action → API call → DB update → downstream dependency**.

