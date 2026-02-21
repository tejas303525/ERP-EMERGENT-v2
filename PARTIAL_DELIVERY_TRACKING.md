# Partial Delivery Tracking System

## Overview

This system handles the edge case where procured goods arrive partially - tracking what was ordered vs. what was received, and automatically creating claims for procurement managers to follow up on shortages.

## Implementation Summary

### Backend Changes

#### 1. Updated Models (server.py)

**GRNItem Model** - Enhanced with partial delivery tracking:
- `ordered_qty` (Optional[float]): Quantity ordered from PO
- `po_line_id` (Optional[str]): Link to specific PO line

**New PartialDeliveryClaim Model**:
- Tracks shortages automatically when received < ordered
- Status flow: PENDING → CLAIMED → RESOLVED/CANCELLED
- Links to GRN, PO, and specific item
- Captures ordered qty, received qty, and shortage qty

#### 2. GRN Creation Logic (server.py, lines ~4912-5010)

When creating a GRN with a linked PO:
1. **Tracks each item** against its PO line
2. **Updates PO line received_qty** incrementally
3. **Updates PO line status**:
   - `OPEN`: No goods received yet
   - `PARTIAL`: Some goods received (received < ordered)
   - `RECEIVED`: All goods received (received >= ordered)
4. **Creates PartialDeliveryClaim** automatically if shortage exists
5. **Updates overall PO status**:
   - `SENT`: No lines received yet
   - `PARTIAL`: Some lines partially/fully received
   - `RECEIVED`: All lines fully received
6. **Sends notification** to procurement manager if partial deliveries exist

#### 3. New API Endpoints

```
GET    /partial-delivery-claims          # List all claims (with optional status filter)
GET    /partial-delivery-claims/{id}     # Get specific claim
PUT    /partial-delivery-claims/{id}/claim    # Procurement claims shortage
PUT    /partial-delivery-claims/{id}/resolve  # Mark shortage as resolved
PUT    /partial-delivery-claims/{id}/cancel   # Cancel claim
```

**Permissions**: `admin`, `procurement` roles

#### 4. Page Permission Added

- Path: `/partial-deliveries`
- Label: "Partial Deliveries"
- Category: "Procurement"

### Frontend Changes

#### 1. Enhanced GRN Modal (GRNPage.js)

**New Features**:
- **PO Selection dropdown**: Links GRN to a Purchase Order
- **Auto-populated supplier**: When PO is selected
- **Ordered Qty field**: Shows expected quantity from PO
- **Received Qty field**: Actual quantity received
- **Partial delivery warning**: Visual indicator when received < ordered
- **Updated items table**: Shows both ordered and received quantities with "Partial" badge

**UI Flow**:
1. User selects PO (optional) → Auto-loads supplier name and PO lines
2. User selects product → If product is in PO, auto-fills ordered_qty
3. User enters received quantity
4. If received < ordered → Yellow warning shows shortage amount
5. On submit → Shows toast notification if partial deliveries were detected

#### 2. New Partial Deliveries Page (PartialDeliveriesPage.js)

**Features**:
- **Claims list** with filtering by status
- **Color-coded status badges** with icons
- **Shortage highlighting** in red
- **Action buttons**:
  - PENDING claims: "Claim" button
  - CLAIMED claims: "Resolve" button
  - Both: "Cancel" button
- **Action dialog** for adding notes when claiming/resolving
- **Detailed claim info**: GRN#, PO#, item, ordered, received, shortage

**Permissions**: Only `admin` and `procurement` roles can access

#### 3. Routing (App.js)

Added route: `/partial-deliveries` → `PartialDeliveriesPage`

## How It Works

### Scenario 1: Complete Delivery

**PO**: Order 1000 KG of Base Oil  
**GRN**: Receive 1000 KG

**Result**:
- PO line status: `RECEIVED`
- PO status: `RECEIVED` (if all lines complete)
- No claim created
- Inventory updated with +1000 KG

### Scenario 2: Partial Delivery

**PO**: Order 1000 KG of Base Oil  
**GRN**: Receive 750 KG

**Result**:
- PO line `received_qty`: 750
- PO line status: `PARTIAL`
- PO status: `PARTIAL`
- **PartialDeliveryClaim created**:
  - Ordered: 1000 KG
  - Received: 750 KG
  - Shortage: 250 KG
  - Status: `PENDING`
- Inventory updated with +750 KG
- Notification sent to procurement team

**Procurement Action**:
1. Procurement manager sees notification
2. Opens `/partial-deliveries` page
3. Clicks "Claim" on the shortage
4. Adds notes (e.g., "Contacted supplier, balance expected by 2026-02-15")
5. Status → `CLAIMED`
6. When balance arrives, clicks "Resolve"
7. Adds resolution notes
8. Status → `RESOLVED`

### Scenario 3: Multiple Partial Deliveries

**PO**: Order 1000 KG of Base Oil

**GRN #1**: Receive 500 KG
- PO line `received_qty`: 500
- Claim created for 500 KG shortage

**GRN #2**: Receive 300 KG  
- PO line `received_qty`: 800 (cumulative)
- Original claim updated OR new claim created for 200 KG shortage

**GRN #3**: Receive 200 KG
- PO line `received_qty`: 1000 (complete)
- PO line status: `RECEIVED`
- No new claim (fully received)

## Production Scheduling Integration

The existing production scheduling logic already accounts for this:

```python
# From production_scheduling.py line 384-408
inbound_qty = qty - received_qty  # Only counts unreceived portion
available = on_hand - reserved + inbound_qty
```

**Example**:
- PO: 1000 KG ordered, 750 KG received → `inbound_qty = 250 KG`
- On hand: 750 KG (from GRN)
- Reserved: 100 KG (for production)
- **Available for new production**: 750 - 100 + 250 = **900 KG**

This correctly accounts for:
1. Goods already in stock (750 KG)
2. Goods already allocated (100 KG)
3. Goods still expected from supplier (250 KG)

## Database Collections

### partial_delivery_claims
```javascript
{
  id: "uuid",
  grn_id: "uuid",
  grn_number: "GRN-2026-001",
  po_id: "uuid",
  po_number: "PO-2026-045",
  po_line_id: "uuid",
  item_id: "uuid",
  item_name: "Base Oil SN500",
  ordered_qty: 1000,
  received_qty: 750,
  shortage_qty: 250,
  unit: "KG",
  claim_status: "PENDING",
  notes: null,
  created_at: "2026-02-07T...",
  created_by: "user_id",
  claimed_by: null,
  claimed_at: null,
  claim_notes: null,
  resolved_by: null,
  resolved_at: null
}
```

## User Guide

### For Security/Inventory (Creating GRN)

1. Go to **GRN** page
2. Click **New GRN**
3. **Select Purchase Order** (optional but recommended)
   - If selected, supplier auto-fills
   - Products will show expected quantities
4. Add items:
   - Select product
   - **Ordered Qty** shows automatically (from PO)
   - Enter **Received Qty** (actual received)
   - If received < ordered → Yellow warning appears
5. Click **Create GRN**
6. If partial delivery:
   - Toast shows: "GRN created with X partial delivery item(s)"
   - Shortage automatically tracked

### For Procurement Manager

1. Receive notification: "Partial Delivery: GRN-XXXX"
2. Go to **Partial Deliveries** page
3. See all pending shortages
4. For each shortage:
   - Review details (GRN#, PO#, item, shortage amount)
   - Click **Claim** button
   - Add notes (contacted supplier, expected date, etc.)
   - Click **Claim Shortage**
5. When balance arrives:
   - Find claimed shortage
   - Click **Resolve** button
   - Add resolution notes
   - Click **Mark as Resolved**

### Filter Options

- **All Statuses**: Show everything
- **Pending**: New shortages needing attention
- **Claimed**: Shortages being followed up
- **Resolved**: Completed shortages
- **Cancelled**: Cancelled claims

## Benefits

1. **No manual tracking**: System automatically detects and logs partial deliveries
2. **Complete audit trail**: Every shortage is documented with dates and notes
3. **Production-aware**: Scheduling correctly accounts for expected deliveries
4. **Procurement accountability**: Clear ownership and status tracking
5. **Supplier follow-up**: Notes field for tracking communications
6. **Historical data**: Track supplier performance over time

## Future Enhancements (Optional)

- Email notifications to suppliers about shortages
- Automatic credit note generation for partial deliveries
- Supplier performance metrics based on delivery completeness
- Integration with payment terms (hold payment until complete)
- Dashboard widget showing total outstanding shortages

