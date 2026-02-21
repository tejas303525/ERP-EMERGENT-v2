# Partial Delivery System - Quick Reference Card

## 🚀 Quick Start (2 Minutes)

### For Drivers/Transport:
1. Go to **Transport Window** → **Local Dispatch** tab
2. Find your transport (status: DISPATCHED)
3. Click **"Confirm Delivery"** button
4. Enter actual delivered quantity
5. Click Confirm

### For Warehouse/Admin:
1. Go to **Outbound Partial Deliveries** page (`/outbound-partial-deliveries`)
2. Review pending partial deliveries
3. Click **"Adjust"** to restore inventory
4. Click **"Resolve"** when issue is resolved

---

## 📡 API Endpoints Cheat Sheet

```javascript
// Confirm delivery
POST /api/delivery/confirm
Body: { transport_id, delivery_order_id, job_order_id, delivered_qty, unit, delivery_date, receiver_name }

// Get partial deliveries
GET /api/delivery/partial-deliveries?status=PENDING

// Adjust inventory
POST /api/delivery/adjust-inventory/{partial_delivery_id}

// Resolve
PUT /api/delivery/partial-deliveries/{id}/resolve
Body: { resolution_notes }
```

---

## 🗄️ MongoDB Quick Queries

```javascript
// View all partial deliveries
db.outbound_partial_deliveries.find({})

// View pending only
db.outbound_partial_deliveries.find({"status": "PENDING"})

// Count by status
db.outbound_partial_deliveries.aggregate([
  {$group: {_id: "$status", count: {$sum: 1}}}
])

// View inventory adjustments
db.inventory_movements.find({"movement_type": "partial_delivery_return"})
```

---

## 🎯 Status Codes

| Status | Meaning | Next Action |
|--------|---------|-------------|
| PENDING | Just created | Review and adjust inventory |
| INVENTORY_ADJUSTED | Stock restored | Resolve with notes |
| RESOLVED | Closed | Archive/report |

---

## 🔍 Reason Codes

- **DAMAGED**: Goods damaged during transit
- **LOST**: Goods lost/missing
- **REJECTED**: Customer rejected goods
- **SHORT_LOADED**: Not loaded completely
- **OTHER**: Other reasons

---

## 📁 File Locations

### Frontend:
```
frontend/src/components/DeliveryConfirmationDialog.js
frontend/src/pages/OutboundPartialDeliveriesPage.js
frontend/src/pages/TransportWindowPage.js (modified)
frontend/src/App.js (modified)
```

### Backend:
```
backend/server.py (lines 688-767: models, 17807-18234: endpoints)
```

### Documentation:
```
PARTIAL_DELIVERY_SYSTEM.md - Technical docs
IMPLEMENTATION_SUMMARY.md - Implementation details
FRONTEND_IMPLEMENTATION.md - Frontend guide
QUICK_START_GUIDE.md - Detailed guide
COMPLETE_IMPLEMENTATION_SUMMARY.md - Executive summary
QUICK_REFERENCE.md - This card
```

---

## ⚡ Common Tasks

### Task: Confirm full delivery
```
1. Click "Confirm Delivery"
2. Quantity = Expected
3. Enter receiver name
4. Click Confirm
Result: ✅ Job marked as "delivered"
```

### Task: Confirm partial delivery
```
1. Click "Confirm Delivery"
2. Quantity < Expected
3. Fill delivery notes (required)
4. Enter receiver name
5. Click Confirm
Result: ⚠️ Redirects to partial deliveries page
```

### Task: Adjust inventory
```
1. Go to Outbound Partial Deliveries
2. Find record (status: PENDING)
3. Click "Adjust"
4. Click Confirm
Result: ✅ Inventory increased, status: INVENTORY_ADJUSTED
```

### Task: Resolve claim
```
1. Go to Outbound Partial Deliveries
2. Find record (status: INVENTORY_ADJUSTED)
3. Click "Resolve"
4. Enter resolution notes
5. Click Confirm
Result: ✅ Status: RESOLVED
```

---

## 🐛 Troubleshooting

### "Confirm Delivery button not showing"
- Check transport status = DISPATCHED
- Check transport has job_order_id
- Refresh page

### "Inventory not adjusted correctly"
- Check packaging configuration exists
- Check net_weight_kg is set
- Verify inventory_balances has item

### "Can't see partial deliveries"
- Go to `/outbound-partial-deliveries` directly
- Check MongoDB: `db.outbound_partial_deliveries.find({})`
- Refresh page

---

## 📞 Support

1. Check server logs: `backend/*.log`
2. Check MongoDB collections
3. Check browser console (F12)
4. Review documentation files

---

## 🎓 Training Resources

**5-Minute Guide**: QUICK_START_GUIDE.md
**Full Documentation**: PARTIAL_DELIVERY_SYSTEM.md
**Frontend Guide**: FRONTEND_IMPLEMENTATION.md
**Executive Summary**: COMPLETE_IMPLEMENTATION_SUMMARY.md

---

**Version**: 1.0.0
**Last Updated**: February 7, 2026
**Status**: ✅ Production Ready

