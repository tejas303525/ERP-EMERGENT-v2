## Manufacturing ERP System – Architecture, Workflows & Bugs

### 1. System Overview

This ERP is a full‑stack manufacturing system covering:

- **Sales & Quotations**: Local/export quotations, incoterms, container types, payment terms, document checklist, PDF generation.
- **Production & Job Orders**: BOM‑driven job orders, automated material availability checks, production scheduling, procurement integration.
- **Inventory & Procurement**: Central inventory balances, stock adjustments, procurement from shortages, GRN handling, product‑packaging relationships.
- **Transport & Logistics**: Transport window (inward/outward raw, inward/outward containers), CRO integration, transport dispatch and delivery confirmation.
- **Security Gate & QC**: Security checklists, weighment, seal tracking → QC inspections → GRN/DO creation.
- **Finance (Payables/Receivables)**: Purchase orders, payables integration, receivables invoices (local tax invoices and export commercial invoices).
- **Partial Delivery System**: Tracks partial outward deliveries, inventory returns, and resolution workflow.

High‑level backend flow (from `README.md` and `memory/PRD.md`):

- **Job Order Flow (A–Z)**:
  1. User creates quotation and sales order (SPA).
  2. Job order created from SPA with BOM and material availability check.
  3. Shortages push into procurement; purchase orders generated from shortages.
  4. Inward flow: security checklist → QC → GRN → inventory update → notify payables.
  5. Outward flow: security checklist → QC → DO → transport → delivery confirmation → notify receivables.
  6. Export docs auto‑generated for international shipments (packing list, COO, BL draft, COA).

### 2. Technical Architecture

- **Backend**
  - **Framework**: `FastAPI` (`backend/server.py` – monolithic API).
  - **Database**: MongoDB via `AsyncIOMotorClient` with retry logic and backoff.
  - **Auth**: JWT (HS256), roles such as `admin`, `sales`, `finance`, `production`, `procurement`, `inventory`, `security`, `qc`, `shipping`, `transport`, `documentation`.
  - **Key services/scripts**:
    - `inventory_service.py`, `costing_service.py`, `unit_conversion_engine.py`
    - Sync/diagnostic scripts (`sync_inventory_data.py`, `diagnose_inventory_discrepancy.py`, `trace_job_calculation.py`, `trace_net_weight_flow.py`, etc.).
  - **API entrypoints**:
    - Root app in `server.py` with `FastAPI(title="Manufacturing ERP System")`.
    - Router `api_router` under `/api` with endpoints for users, quotations, job orders, inventory, GRN, DO, transport, QC, security, receivables, etc.
  - **CORS**:
    - Configurable via `CORS_ORIGINS` env, defaulting to localhost ports 3000/3001.

- **Frontend**
  - **Framework**: React (`frontend/`), TailwindCSS, shadcn/ui, Axios.
  - **Structure**:
    - `src/lib/api.js`: central API client.
    - `src/pages/`: main feature pages (Quotations, JobOrders, Procurement, Inventory, TransportWindow, SecurityQC, DeliveryOrders, OutboundPartialDeliveries, etc.).
    - `src/components/`: shared UI components (e.g. `DeliveryConfirmationDialog`, costing modals, tables).

### 3. Key Business Modules & Flows

#### 3.1 Quotations & Costing

- Supports **local vs export** orders with:
  - Incoterms (FOB, CFR, CIF, EXW, DDP).
  - Container types (20ft, 40ft, ISO tank, bulk tankers).
  - Country of destination, ports, payment terms, document checklist.
- Costing logic:
  - Uses a **costing service** (`backend/costing_service.py`) to derive costing type (e.g. `EXPORT_40FT_NON_DG`, `EXPORT_GCC_ROAD`) based on `order_type`, `incoterm`, `transport_mode`, `container_type`, and DG flags.
  - Stores `margin_amount` and `margin_percentage` once costing is confirmed.
- Finance approval page now uses saved costing values as the **source of truth** for profit display (see `PROFIT_DISPLAY_FIX.md`).

#### 3.2 Job Orders & Production

- Job order creation:
  - Auto‑fills from SPA items (product, quantity, packaging).
  - Loads BOM from BOM management and calculates material requirements.
  - Sets `procurement_required` and `material_shortages` based on BOM vs `inventory_balances`.
- Net weight (`net_weight_kg`) handling:
  - Preserved from quotation → sales order → job order.
  - Used throughout BOM and procurement calculations (see *Net Weight Preservation* docs).

#### 3.3 Inventory & Stock Management

- **Canonical source**: `inventory_balances.on_hand` is the single source of truth for quantities.
- `products.current_stock` is kept in sync by:
  - API endpoints (`/products`, `/stock/{item_id}/adjust`) now reading/writing through `inventory_balances` where possible.
  - Sync script `sync_inventory_data.py` to reconcile historical data (see `INVENTORY_FIX_SUMMARY.md`, `STOCK_SYNC_FIX_SUMMARY.md`).

#### 3.4 GRN (Goods Receipt Note) & QC

- GRN creation:
  - Handles both **bulk** and **product‑with‑package** procurement.
  - Supports `procurement_type`, `packaging_item_id`, `packaging_qty`, `net_weight_kg`.
  - Updates both **product stock** and **packaging stock**, and writes to `inventory_movements` and `product_packaging`.
- Unit conversion:
  - GRN quantities in MT are correctly converted to inventory units (KG or MT) based on item UOM (see `GRN_UNIT_CONVERSION_FIX.md`).
- GRN from QC:
  - QC inspection pass can automatically create GRN; same unit conversion logic is used.

#### 3.5 Transport, Delivery Orders & Partial Deliveries

- **Transport Window**:
  - Tabs for inward/outward raw, inward/outward container.
  - Integrated with CRO and booking information, delivery dates, and statuses.

- **Delivery Orders (DO)**:
  - Created after QC/security approval for outward shipments.
  - Stock reduction logic for drummed vs bulk products:
    - Correctly adjusts `product_packaging` quantities and **does not** incorrectly deduct bulk stock when product is in drums.
    - Adjusts packaging material balances in `inventory_balances` (e.g., steel/HDPE drums, IBCs).
    - Extensive debug logging around stock movements (see `DELIVERY_ORDER_STOCK_FIX.md`, `FIXES_REPORT.md`).

- **Partial Delivery System**:
  - Fully implemented backend + frontend (see `PARTIAL_DELIVERY_SYSTEM.md`, `PARTIAL_DELIVERY_SYSTEM` implementation summaries).
  - On delivery confirmation (`POST /api/delivery/confirm`):
    - Determines if delivery is full vs partial.
    - Creates `outbound_partial_deliveries` and `delivery_confirmations` records for partials.
    - Flags job orders for inventory adjustment.
  - Admin can adjust inventory (`POST /api/delivery/adjust-inventory/{partial_delivery_id}`) and then mark partial deliveries as resolved.
  - Frontend pages:
    - Delivery confirmation dialog.
    - Outbound Partial Deliveries management page.

#### 3.6 Finance: Invoices & Payables

- Receivables:
  - Invoices generated when all jobs in a SPA are dispatched/closed.
  - New endpoint `/api/receivables/generate-missing-invoices` to backfill missing invoices (see `FIXES_REPORT.md`).
- Payables:
  - Purchase Orders generated directly from shortages (Phase 2 – Bug 5 fix).
  - POs go to finance approval with DRAFT status.

---

### 4. Known Bugs (Open / High‑Risk Behaviour)

This section lists issues that are **currently not fully fixed** or represent accepted but risky behaviour.

#### 4.1 Bug 1 – IBC Quantity Calculation (Over‑allocating Containers)

**Symptom** (see `BUG_FIXES_SUMMARY.md`):

- For a quotation of **10 MT** with `net_weight_kg = 1000` per IBC:
  - System calculates **12 IBCs** instead of **10**.
- Observed behaviour:
  - Product‑packaging config for IBC has `net_weight = 850kg`.
  - Calculation uses packaging config (850kg) instead of quotation’s 1000kg:
    - $10{,}000\text{ kg} ÷ 850\text{ kg} ≈ 11.76$ → rounded up to 12 IBCs.

**Probable root causes:**

- Priority order for `net_weight_kg` is wrong or inconsistent across flows:
  - Code prefers `product_packaging` defaults instead of user‑entered `net_weight_kg` from quotation/sales order/job order.
- Missing propagation of `net_weight_kg` into the specific path where IBC container count is calculated.

**Impact:**

- Overestimates required IBC count and possibly cost.
- May affect:
  - Job order creation from quotation.
  - Procurement of packaging.
  - Transport/container planning.

**Suggested fix direction (not yet applied):**

- Enforce a consistent priority everywhere container counts are calculated:
  1. `quotation.items[].net_weight_kg` (user input).
  2. `sales_order.items[].net_weight_kg`.
  3. `job_order.net_weight_kg` or item‑level equivalent.
  4. `product_packaging_specs.net_weight_kg` (fallback).
- Add a regression test around a 10 MT / 1000 kg IBC scenario.

#### 4.2 Costing Validation Removed (Design Trade‑off / Data‑Quality Risk)

**Context** (see `BUG_10_MARGINAL_PROFIT_FIX.md` and `MARGINAL_PROFIT_VALIDATION_REMOVAL.md`):

- Bug 10 originally added **strict validation**:
  - Blocked confirming costing if raw material cost was zero.
  - Warned if packaging cost was zero for drummed products.
  - Showed warnings in Finance Approval.
- Later change **removed** these validations:
  - Users can **save** and **confirm** costing even if raw material or packaging cost is 0.
  - Warnings and banners were removed from the UI.

**Current behaviour:**

- Marginal profit is always shown and confirmation is not blocked, even when:
  - Raw material cost = 0.
  - Packaging cost = 0 for non‑bulk products.

**Risk / possible consequence:**

- Profit and margin figures may look very high (or unrealistic) if underlying cost data is missing or incomplete.
- Finance can approve quotations with incomplete costing data without any UI guardrails.

**Mitigation ideas:**

- Treat this as a **configuration decision**:
  - If you want stricter controls back, re‑enable lightweight warnings (not hard blocks) or re‑introduce blocking only for raw material cost = 0.
  - Add reporting to list quotations where `margin_amount` was computed with missing cost components.

---

### 5. Historical Critical Bugs & Root Causes (Now Fixed)

This section documents important bugs that **have been fixed**, grouped by domain. Understanding them helps when diagnosing any future regressions.

#### 5.1 Net Weight & Packaging Flow

**Problems (historical):**

- `net_weight_kg` set during quotation was **lost** in:
  - Sales order.
  - Job order.
  - Procurement calculations.
- Various parts of the system defaulted to 200kg for non‑bulk packaging.
- BOM and material requirements were sometimes computed using wrong or default weights.

**Fixes (see `NET_WEIGHT_FIX_SUMMARY.md`, `PERMANENT_NET_WEIGHT_FIX_SUMMARY.md`):**

- Backend:
  - Job order creation stores `net_weight_kg` properly.
  - BOM and procurement calculations use `net_weight_kg` from job orders.
  - Sales order conversion preserves `net_weight_kg` from quotation.
- Frontend:
  - `JobOrdersPage.js` includes `net_weight_kg` in form state and passes it to backend.
  - Selecting a sales order or product from SPA carries `net_weight_kg` through.
- Migration:
  - `migrate_net_weight_to_job_orders.py` backfilled existing job orders.

**Result:**

- `net_weight_kg` is now preserved from quotation → sales order → job order.
- Defaults to 200kg **only** when not provided and packaging is not Bulk.
- Bulk packaging avoids net weight entirely (uses MT directly).

#### 5.2 Inventory Source‑of‑Truth & Sync

**Problems (historical, see `INVENTORY_FIX_SUMMARY.md`, `STOCK_SYNC_FIX_SUMMARY.md`):**

- `products.current_stock` and `inventory_balances.on_hand` diverged:
  - GUI inventory used `products.current_stock`.
  - Procurement and other flows used `inventory_balances`.
- Example: ETHANOL showing 195,261.59 KG vs 933,720.27 KG in different pages.

**Fixes:**

- `/inventory` and `/products` endpoints:
  - Prefer `inventory_balances.on_hand` when available.
  - Fall back to `products.current_stock` only if no balance record exists.
- Stock adjustment endpoint `/stock/{item_id}/adjust`:
  - For products: updates both `products.current_stock` and `inventory_balances.on_hand`.
  - For raw materials: updates `inventory_balances`.
- `sync_inventory_data.py`:
  - Syncs product stock from balances.
  - Creates missing `inventory_balances` records.

**Result:**

- All pages use `inventory_balances.on_hand` as canonical quantity.
- Adjustments maintain both tables in sync automatically.

#### 5.3 GRN Unit Conversion & Product‑With‑Package Procurement

**Issues (see `GRN_UNIT_CONVERSION_FIX.md`, `GRN_PACKAGING_FIX.md`):**

1. **Unit Conversion Bug**
   - GRNs entered in MT but added directly as KG or vice versa.
   - Example: 15.93 MT recorded as 15.93 KG.

2. **Product + Packaging Procurement**
   - When procuring product and packaging together (e.g. IPA in drums):
     - Product stock updated.
     - Packaging stock **not** updated.
   - Manual GRNs (without PO) could not update packaging stock.

**Fixes:**

- GRN endpoints:
  - Look up inventory item unit (`inventory_items.uom` or `products.unit`).
  - Convert GRN quantity appropriately (MT ↔ KG).
  - Use converted `quantity_to_add` for:
    - `products.current_stock`
    - `inventory_balances.on_hand`
    - `inventory_movements`
- GRNItem model extended with `procurement_type`, `packaging_item_id`, `packaging_qty`, `net_weight_kg`.
- GRN logic:
  - Detect drummed procurement via PO **or** directly from GRN item.
  - Update packaging stock and product‑packaging records.
- Frontend GRN page:
  - Adds fields for procurement type, packaging type, packaging quantity, and net weight per package.

**Result:**

- GRN correctly updates product and packaging inventory, with proper unit conversions.
- Manual GRNs without PO behave correctly.

#### 5.4 Delivery Orders & Stock Reduction

**Issues (see `DELIVERY_ORDER_STOCK_FIX.md`, `FIXES_REPORT.md`):**

- For drummed products:
  - Bulk stock reduced by drum count instead of MT.
  - `product_packaging` drum counts not reduced.
  - Packaging materials sometimes incorrectly calculated or double counted.
- Packaging name mismatches caused product_packaging lookups to fail (exact match only).
- Some flows caused stock to go negative.

**Fixes:**

- `net_weight_kg` fallback logic:
  - If missing, infer from `total_weight_mt` or known packaging defaults (e.g. 250L drum → 180kg).
- Flexible `product_packaging` matching:
  - Multi‑stage: exact match → regex/keyword matching.
- Corrected bulk vs packaged behaviour:
  - Packaged products:
    - Reduce `product_packaging.quantity` by drum count.
    - Do **not** alter bulk `products.current_stock`.
  - Bulk products:
    - Adjust `products.current_stock` and `inventory_balances`.
- Simplified packaging material reductions:
  - For drummed products, quantity is already drum count; no recalculation.
- Extensive `[DO-STOCK]` and other logging added.

**Result:**

- DO creation now:
  - Keeps bulk and packaging stocks accurate.
  - Avoids negative stock where data is consistent.
  - Provides rich logs for any future discrepancy analysis.

#### 5.5 Transport Mode Field & Costing Type

**Issue (see `BUG_TRANSPORT_MODE_FIX.md`, `TRANSPORT_MODE_FIX_SUMMARY.md`):**

- Backend used `mode_of_transport` while model and costing service expected `transport_mode`.
- Frontend auto‑set `transport_mode = 'road'` for all GCC exports.
- Result: container exports to GCC (e.g., Bahrain) used `EXPORT_GCC_ROAD` costing instead of container‑specific costing (`EXPORT_40FT_NON_DG`, etc.).

**Fixes:**

- Backend:
  - Renamed all references to `transport_mode`.
  - Added migration endpoint `/api/quotations/migrate-transport-mode`.
- Frontend:
  - `QuotationsPage.js`:
    - FOB/CFR/CIF + container → `transport_mode = 'ocean'` (even for GCC).
    - DDP/EXW to GCC without container → `transport_mode = 'road'`.
  - `ViewQuote.jsx`: display uses `transport_mode`.

**Result:**

- New quotations pick correct costing types for container vs road.
- Existing data verified via migration endpoint (no updates needed in your current DB).

#### 5.6 Invoice Creation & Missing Invoices

**Issue (see `FIXES_REPORT.md`):**

- Race condition:
  - All jobs for a SPA were moved from `dispatched` → `closed` before invoice generation.
  - Invoice creation only considered jobs with `status == "dispatched"`.
  - Example: RIJOY order completed but never produced an invoice.

**Fixes:**

- Invoice logic:
  - Changed check from:
    - `status == "dispatched"`  
    to
    - `status in ["dispatched", "closed"]`.
- New endpoint `/api/receivables/generate-missing-invoices`:
  - Scans existing sales orders with completed jobs but no invoice.
  - Generates invoices retroactively.

**Result:**

- Invoices now created reliably when all jobs are complete.
- Missing historical invoices can be generated on demand.

#### 5.7 Unit Conversion Engine Robustness

**Issues (see `UNIT_CONVERSION_ENGINE_FIXES.md`):**

- `is_reversible` flag was almost always `False` due to how precision was applied.
- Data access mixed with business logic in helper functions.
- Dispatch rules for weight‑based units weren’t clearly enforced.
- Rounding rules not fully respected by code.
- Audit trail sometimes hid rounding or conversion factors.

**Fixes:**

- Proper tracking of whether precision was actually applied.
- Separation of data access from validation logic.
- Explicit dispatch rules forbidding direct weight‑based dispatch (must use package/volume units).
- Dynamic rounding via configured methods (currently `ROUND_HALF_UP`).
- Rich, accurate conversion breakdown with raw values, steps, and factor sources.

**Result:**

- Safer, auditable, and more predictable unit conversions across ERP flows.

---

### 6. Known Design Limitations & Operational Considerations

- **Monolithic backend file**:
  - `backend/server.py` is very large (~28k lines).
  - Refactoring into modules (auth, inventory, procurement, transport, finance, etc.) is recommended for long‑term maintainability but not yet done.
- **Strict engine invariants**:
  - Unit Conversion Engine now treats unknown units, missing packaging snapshots, or missing density information as **hard errors**.
  - This is intentional for financial safety, but it means:
    - Any new UOM or packaging type must be correctly configured and whitelisted.
- **Costing validations disabled (see §4.2)**:
  - Current behaviour prioritises **unblocked workflow** over data validation.
  - Governance reliance shifts to process and review rather than technical blocking.

---

### 7. How to Use this Document

- **For debugging**:
  - Start with the relevant section (e.g. Inventory, DOs, Quotation & Costing) and cross‑check the underlying markdowns:
    - `BUG_FIXES_SUMMARY.md`
    - `FIXES_REPORT.md`
    - `INVENTORY_FIX_SUMMARY.md`
    - `NET_WEIGHT_FIX_SUMMARY.md`
    - `PERMANENT_NET_WEIGHT_FIX_SUMMARY.md`
    - `STOCK_SYNC_FIX_SUMMARY.md`
    - `GRN_UNIT_CONVERSION_FIX.md`
    - `GRN_PACKAGING_FIX.md`
    - `DELIVERY_ORDER_STOCK_FIX.md`
    - `BUG_TRANSPORT_MODE_FIX.md`, `TRANSPORT_MODE_FIX_SUMMARY.md`
    - `BUG_10_MARGINAL_PROFIT_FIX.md`, `MARGINAL_PROFIT_VALIDATION_REMOVAL.md`, `PROFIT_DISPLAY_FIX.md`
- **For onboarding**:
  - Use sections 1–3 as a high‑level overview of what the ERP does and how main flows work.
- **For future improvements**:
  - Use sections 4–6 to decide:
    - Which open bug(s) to fix next (especially the IBC quantity issue).
    - Which design trade‑offs to revisit (e.g. costing validation, backend modularization).
