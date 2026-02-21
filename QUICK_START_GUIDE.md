w# Partial Delivery System - Quick Start Guide

## 🎯 What This Solves

**PROBLEM**: When a delivery order is created, inventory is immediately deducted. But what happens if only 80 out of 100 drums actually reach the customer?

**SOLUTION**: Full partial delivery tracking with automatic inventory adjustment!

## 🚀 Quick Start (5 Minutes)

### Step 1: Restart Backend Server
```bash
cd c:\ERPemergent\backend
# Stop current server (Ctrl+C if running)
python server.py
```

### Step 2: Test the System
```bash
# Example: Confirm a full delivery
curl -X POST http://localhost:8000/api/delivery/confirm \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transport_id": "transport_123",
    "delivery_order_id": "do_456",
    "job_order_id": "job_789",
    "delivered_qty": 100.0,
    "unit": "drums",
    "delivery_date": "2026-02-07"
  }'
```

## 📚 Key Endpoints

### 1. Confirm Delivery (Most Important!)
```
POST /api/delivery/confirm
```
**Use this when**: Driver returns and confirms actual delivered quantity

**What it does**:
- ✅ Records actual delivered quantity
- ✅ Automatically detects if partial (delivered < expected)
- ✅ Creates partial delivery record if needed
- ✅ Sends notifications to relevant teams
- ✅ Updates job order status

### 2. Adjust Inventory
```
POST /api/delivery/adjust-inventory/{partial_delivery_id}
```
**Use this when**: You need to add back undelivered goods to inventory

**What it does**:
- ✅ Calculates correct MT based on packaging
- ✅ Adds back to product inventory
- ✅ Adds back packaging inventory (drums, cartons)
- ✅ Creates audit trail in inventory_movements

### 3. View Partial Deliveries
```
GET /api/delivery/partial-deliveries?status=PENDING
```
**Use this to**: See all partial deliveries requiring action

## 🎬 Real-World Example

### Scenario: 80 out of 100 drums delivered

**1. Initial State:**
```
Delivery Order: DO-001234
Expected: 100 drums
Product Stock: 150 MT
```

**2. DO Created (Security):**
```
✅ DO-001234 issued
❌ Stock reduced: 150 MT → 132 MT (18 MT deducted)
   (100 drums × 180 kg/drum = 18,000 kg = 18 MT)
```

**3. Transport Dispatched:**
```
✅ Transport TOUT-005678 dispatched
   Status: DISPATCHED
```

**4. Driver Confirms Partial Delivery:**
```bash
POST /api/delivery/confirm
{
  "delivered_qty": 80.0,  # Only 80 drums delivered!
  "delivery_notes": "20 drums damaged during transit"
}
```

**5. System Response:**
```json
{
  "success": true,
  "is_partial": true,
  "delivered_qty": 80.0,
  "undelivered_qty": 20.0,
  "requires_inventory_adjustment": true,
  "partial_delivery_id": "pd_123456"
}
```

**6. System Actions (Automatic):**
```
✅ Partial delivery record created
✅ DO status: DELIVERED_PARTIAL
✅ Job status: PARTIAL
✅ Notification sent: "⚠️ Only 80 drums delivered. 20 undelivered."
```

**7. Admin Reviews & Adjusts Inventory:**
```bash
POST /api/delivery/adjust-inventory/pd_123456
```

**8. System Adds Back to Inventory:**
```
✅ Product added: 132 MT → 135.6 MT
   (20 drums × 180 kg = 3,600 kg = 3.6 MT added back)
✅ Packaging added: 20 empty drums added back
✅ Movement record created: "partial_delivery_return"
✅ Notification: "✅ Inventory adjusted: 3.6 MT added back"
```

**9. Final State:**
```
✅ Customer received: 80 drums (14.4 MT)
✅ Stock after adjustment: 135.6 MT
✅ Undelivered drums: 20 (back in inventory)
✅ Complete audit trail: All movements tracked
```

## 📊 Status Flow

```
Delivery Order Created
        ↓
   [PENDING] (inventory deducted)
        ↓
   Transport Dispatched
        ↓
   [IN_TRANSIT]
        ↓
   Driver Confirms Delivery
        ↓
    ┌───────┴───────┐
    ↓               ↓
[DELIVERED_FULL] [DELIVERED_PARTIAL]
                    ↓
              Partial Record Created
              Job.requires_inventory_adjustment = true
                    ↓
              Admin Reviews
                    ↓
              Adjust Inventory
                    ↓
              [INVENTORY_ADJUSTED]
                    ↓
              Admin Resolves
                    ↓
              [RESOLVED]
```

## 🎯 Benefits

| Before | After |
|--------|-------|
| ❌ Inventory deducted, no way to add back | ✅ Automatic inventory adjustment |
| ❌ No tracking of partial deliveries | ✅ Complete audit trail |
| ❌ Manual calculations needed | ✅ Automatic MT conversion |
| ❌ No notifications | ✅ Automatic alerts to teams |
| ❌ Can't distinguish dispatched vs delivered | ✅ Clear status tracking |

## 📱 User Roles

### Security/Dispatch:
- Creates delivery orders (existing flow)
- No changes needed

### Drivers/Transport:
- Confirm delivery with actual quantity
- Will use mobile app (Phase 2)

### Warehouse/Admin:
- Review partial deliveries
- Adjust inventory
- Resolve claims

## 📁 Documentation Files

1. **PARTIAL_DELIVERY_SYSTEM.md** - Full technical documentation
2. **IMPLEMENTATION_SUMMARY.md** - Implementation details
3. **DEPLOYMENT_CHECKLIST.md** - Deployment steps
4. **QUICK_START_GUIDE.md** - This file!
5. **test_partial_delivery.py** - Test script

## 🆘 Quick Troubleshooting

### "Inventory not adjusted correctly"
➡️ Check packaging configuration in product_packaging table
➡️ Verify net_weight_kg is set

### "Notifications not sent"
➡️ Verify user roles are configured
➡️ Check create_notification function

### "Can't find partial delivery"
➡️ Use GET /api/delivery/partial-deliveries
➡️ Check status filter

## 🎓 Learn More

- Read **PARTIAL_DELIVERY_SYSTEM.md** for detailed documentation
- Check **IMPLEMENTATION_SUMMARY.md** for API examples
- Run **test_partial_delivery.py** for hands-on testing

## ✅ Ready to Use!

The system is **fully implemented** and **ready for production** use. Just restart your backend server and start testing!

---
**Version**: 1.0.0
**Status**: ✅ Production Ready
**Date**: February 7, 2026

