# Partial Delivery Tracking System

## Overview
This system handles the edge case where the delivered amount of a product has not completely reached the customer. It provides full tracking, inventory adjustment, and resolution workflows for partial deliveries.

## Problem Statement
Previously, when a Delivery Order (DO) was created, inventory was deducted immediately. If only part of the shipment reached the customer (due to damage, loss, rejection, or other reasons), there was:
- ❌ No way to track actual delivered vs. expected quantities
- ❌ No mechanism to adjust inventory for undelivered goods
- ❌ No audit trail for partial deliveries
- ❌ No job order status differentiation between dispatched and delivery-confirmed

## Solution Components

### 1. Data Models

#### **OutboundPartialDelivery**
Tracks partial deliveries with full details:
```python
{
    "id": "uuid",
    "transport_id": "transport_id",
    "transport_number": "TOUT-000123",
    "delivery_order_id": "do_id",
    "do_number": "DO-000456",
    "job_order_id": "job_id",
    "job_number": "JOB-000789",
    "product_id": "product_id",
    "product_name": "Hydraulic Oil ISO 32",
    "packaging": "200L Drums",
    "expected_qty": 100.0,
    "delivered_qty": 80.0,
    "undelivered_qty": 20.0,
    "unit": "drums",
    "reason": "DAMAGED",  # DAMAGED, LOST, REJECTED, SHORT_LOADED, OTHER
    "reason_details": "20 drums damaged during transit",
    "status": "PENDING",  # PENDING, UNDER_REVIEW, INVENTORY_ADJUSTED, RESOLVED, DISPUTED
    "inventory_adjusted": false,
    "created_by": "user_id",
    "created_at": "2026-02-07T..."
}
```

#### **DeliveryConfirmation**
Records delivery confirmation with actual quantities:
```python
{
    "id": "uuid",
    "transport_id": "transport_id",
    "delivery_order_id": "do_id",
    "job_order_id": "job_id",
    "delivered_qty": 80.0,
    "unit": "drums",
    "delivery_date": "2026-02-07",
    "is_partial": true,
    "customer_name": "ABC Company",
    "receiver_name": "John Doe",
    "receiver_signature": "signature_data",
    "delivery_notes": "20 drums rejected due to leakage",
    "photos": ["photo1.jpg", "photo2.jpg"],
    "confirmed_by": "user_id",
    "confirmed_at": "2026-02-07T..."
}
```

#### **DeliveryOrder Updates**
Enhanced with tracking fields:
- `delivery_status`: PENDING, IN_TRANSIT, DELIVERED_FULL, DELIVERED_PARTIAL, UNDELIVERED
- `delivered_qty`: Actual quantity delivered
- `delivery_confirmed_at`: Timestamp of delivery confirmation
- `delivery_confirmed_by`: User who confirmed delivery
- `is_partial_delivery`: Boolean flag

### 2. API Endpoints

#### **POST /delivery/confirm**
Confirm delivery with actual delivered quantities
```json
Request:
{
    "transport_id": "transport_id",
    "delivery_order_id": "do_id",
    "job_order_id": "job_id",
    "delivered_qty": 80.0,
    "unit": "drums",
    "delivery_date": "2026-02-07",
    "customer_name": "ABC Company",
    "receiver_name": "John Doe",
    "delivery_notes": "20 drums damaged",
    "photos": ["photo1.jpg"]
}

Response (Partial Delivery):
{
    "success": true,
    "message": "Partial delivery recorded. 20.0 drums undelivered.",
    "is_partial": true,
    "delivered_qty": 80.0,
    "undelivered_qty": 20.0,
    "partial_delivery_id": "partial_delivery_id",
    "requires_inventory_adjustment": true
}

Response (Full Delivery):
{
    "success": true,
    "message": "Full delivery confirmed successfully",
    "is_partial": false,
    "delivered_qty": 100.0,
    "confirmation_id": "confirmation_id"
}
```

#### **POST /delivery/partial-claim**
Manually create a partial delivery claim
```json
Request:
{
    "transport_id": "transport_id",
    "delivery_order_id": "do_id",
    "job_order_id": "job_id",
    "expected_qty": 100.0,
    "delivered_qty": 75.0,
    "reason": "REJECTED",
    "reason_details": "25 drums rejected by customer QC",
    "photos": ["photo1.jpg", "photo2.jpg"],
    "notes": "Customer QC found contamination"
}

Response:
{
    "success": true,
    "message": "Partial delivery claim created successfully",
    "partial_delivery_id": "partial_delivery_id",
    "undelivered_qty": 25.0
}
```

#### **POST /delivery/adjust-inventory/{partial_delivery_id}**
Adjust inventory to add back undelivered goods
```json
Response:
{
    "success": true,
    "message": "Inventory adjusted successfully. Added back 4.0 MT",
    "qty_added_mt": 4.0,
    "new_stock": 154.0,
    "previous_stock": 150.0
}
```

#### **GET /delivery/partial-deliveries**
Get all partial delivery records (with optional status filter)
```
GET /delivery/partial-deliveries?status=PENDING
```

#### **GET /delivery/partial-deliveries/{partial_delivery_id}**
Get specific partial delivery record

#### **PUT /delivery/partial-deliveries/{partial_delivery_id}/resolve**
Mark a partial delivery as resolved
```json
Request:
{
    "resolution_notes": "Customer accepted replacement shipment"
}
```

### 3. Workflow

#### **Scenario 1: Full Delivery (100% delivered)**
1. Security creates Delivery Order → Inventory deducted
2. Transport dispatched → Status: DISPATCHED
3. Driver confirms delivery → POST /delivery/confirm with delivered_qty = expected_qty
4. System marks:
   - DeliveryOrder.delivery_status = "DELIVERED_FULL"
   - Transport.status = "DELIVERED"
   - JobOrder.status = "delivered"
5. No inventory adjustment needed ✅

#### **Scenario 2: Partial Delivery (e.g., 80/100 delivered)**
1. Security creates Delivery Order → Inventory deducted (100 units)
2. Transport dispatched → Status: DISPATCHED
3. Driver confirms delivery → POST /delivery/confirm with delivered_qty = 80
4. System automatically:
   - Creates OutboundPartialDelivery record (undelivered_qty = 20)
   - Marks DeliveryOrder.delivery_status = "DELIVERED_PARTIAL"
   - Sets JobOrder.delivery_status = "PARTIAL"
   - Flags JobOrder.requires_inventory_adjustment = true
   - Sends notification to admin, warehouse, inventory teams ⚠️
5. Warehouse/Admin reviews partial delivery
6. Admin triggers inventory adjustment → POST /delivery/adjust-inventory/{id}
7. System:
   - Adds back 20 units to inventory (products.current_stock & inventory_balances)
   - Adds back packaging (drums/cartons) if applicable
   - Creates inventory_movement record (type: "partial_delivery_return")
   - Marks partial_delivery.inventory_adjusted = true
   - Updates JobOrder.requires_inventory_adjustment = false
   - Sends confirmation notification ✅
8. Admin resolves claim → PUT /delivery/partial-deliveries/{id}/resolve

### 4. Inventory Adjustment Logic

The system intelligently handles inventory adjustment based on packaging:

#### **Bulk Products**
```
undelivered_qty (MT) → Add back directly to inventory
```

#### **Packaged Products (Drums, Cartons, IBCs)**
```
Step 1: Get packaging configuration (net_weight_kg per unit)
Step 2: Convert units to MT: qty_mt = (undelivered_qty × net_weight_kg) / 1000
Step 3: Add back qty_mt to product inventory
Step 4: Add back undelivered_qty units to packaging inventory
```

Example:
- Undelivered: 20 drums
- Net weight: 180 kg/drum
- Product added back: (20 × 180) / 1000 = 3.6 MT
- Packaging added back: 20 empty drums

### 5. Notifications

The system automatically sends notifications for:

#### **Partial Delivery Detected**
- **Event**: `PARTIAL_DELIVERY_DETECTED`
- **Recipients**: admin, transport, warehouse, inventory
- **Type**: warning
- **Message**: "Only 80 drums of 100 drums was delivered for Hydraulic Oil ISO 32. Shortage: 20 drums. Inventory adjustment required."

#### **Inventory Adjusted**
- **Event**: `INVENTORY_ADJUSTED_PARTIAL_DELIVERY`
- **Recipients**: admin, warehouse, inventory
- **Type**: success
- **Message**: "Inventory adjusted for partial delivery. 4.00 MT of Hydraulic Oil ISO 32 added back to stock."

#### **Full Delivery Completed**
- **Event**: `DELIVERY_COMPLETED`
- **Recipients**: admin, transport, sales
- **Type**: success
- **Message**: "Full delivery of 100 drums completed for Hydraulic Oil ISO 32 to ABC Company"

### 6. Database Collections

#### **New Collections:**
- `outbound_partial_deliveries` - Stores partial delivery records
- `delivery_confirmations` - Stores delivery confirmation records

#### **Updated Collections:**
- `delivery_orders` - Added delivery status and tracking fields
- `job_orders` - Added delivery_status, delivered_qty, undelivered_qty, requires_inventory_adjustment
- `transport_outward` - Added delivered_qty, is_partial_delivery
- `inventory_movements` - New movement_type: "partial_delivery_return"

## Usage Examples

### Example 1: Confirm Full Delivery
```bash
curl -X POST http://localhost:8000/api/delivery/confirm \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "transport_id": "trans_123",
    "delivery_order_id": "do_456",
    "job_order_id": "job_789",
    "delivered_qty": 100.0,
    "unit": "drums",
    "delivery_date": "2026-02-07",
    "customer_name": "ABC Company",
    "receiver_name": "John Doe"
  }'
```

### Example 2: Confirm Partial Delivery
```bash
curl -X POST http://localhost:8000/api/delivery/confirm \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "transport_id": "trans_123",
    "delivery_order_id": "do_456",
    "job_order_id": "job_789",
    "delivered_qty": 80.0,
    "unit": "drums",
    "delivery_date": "2026-02-07",
    "delivery_notes": "20 drums damaged during transit"
  }'
```

### Example 3: Adjust Inventory for Undelivered Goods
```bash
curl -X POST http://localhost:8000/api/delivery/adjust-inventory/partial_delivery_id \
  -H "Authorization: Bearer <token>"
```

### Example 4: Get Pending Partial Deliveries
```bash
curl -X GET "http://localhost:8000/api/delivery/partial-deliveries?status=PENDING" \
  -H "Authorization: Bearer <token>"
```

## Benefits

✅ **Complete Audit Trail** - Every partial delivery is tracked with full details
✅ **Accurate Inventory** - Undelivered goods are properly added back to stock
✅ **Automatic Notifications** - Relevant teams are alerted immediately
✅ **Flexible Reasons** - Multiple reason codes (DAMAGED, LOST, REJECTED, etc.)
✅ **Photo Evidence** - Support for photo attachments
✅ **Status Tracking** - Clear workflow from PENDING → INVENTORY_ADJUSTED → RESOLVED
✅ **Packaging Aware** - Correctly handles bulk and packaged products
✅ **Job Order Integration** - Job orders track delivery completion status

## Next Steps

1. **Frontend UI**: Create delivery confirmation page with quantity input
2. **Mobile App**: Build driver app for on-site delivery confirmation
3. **Customer Portal**: Allow customers to confirm delivery and report issues
4. **Analytics Dashboard**: Track partial delivery trends and reasons
5. **Insurance Integration**: Auto-generate insurance claims for losses

## Migration Notes

Existing delivery orders will have:
- `delivery_status` = "PENDING" (default)
- `is_partial_delivery` = false (default)
- No impact on existing functionality

The system is backward compatible and doesn't require data migration.

