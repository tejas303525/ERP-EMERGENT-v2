# Backend Changes for Transport Booking Enhancement

This file contains all the backend code changes needed to implement the transport booking enhancements.

## 1. Update GET /transport/inward endpoint (around line 7789-7804)

**Location:** `backend/server.py`, function `get_transport_inward`

**Replace this code:**
```python
    # Enrich with PO items/products
    for record in records:
        if record.get("po_id"):
            po = await db.purchase_orders.find_one({"id": record["po_id"]}, {"_id": 0})
            if po:
                record["po_items"] = po.get("items", [])
                # Calculate total quantity
                total_qty = sum(item.get("quantity", 0) for item in po.get("items", []))
                record["total_quantity"] = total_qty
                # Get product names summary
                product_names = [item.get("product_name", "Unknown") for item in po.get("items", [])]
                record["products_summary"] = ", ".join(product_names[:3])  # First 3 products
                if len(product_names) > 3:
                    record["products_summary"] += f" (+{len(product_names) - 3} more)"
    
    return records
```

**With this code:**
```python
    # Enrich with PO items/products
    for record in records:
        if record.get("po_id"):
            po = await db.purchase_orders.find_one({"id": record["po_id"]}, {"_id": 0})
            if po:
                # Get PO lines from purchase_order_lines collection
                po_lines = await db.purchase_order_lines.find({"po_id": record["po_id"]}, {"_id": 0}).to_list(1000)
                
                # Enrich PO lines with product details
                enriched_items = []
                for line in po_lines:
                    item_id = line.get("item_id")
                    if item_id:
                        # Try inventory_items first
                        item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
                        if not item:
                            # Try products
                            item = await db.products.find_one({"id": item_id}, {"_id": 0})
                        
                        if item:
                            line["product_name"] = item.get("name", line.get("item_name", "Unknown"))
                            line["sku"] = item.get("sku", line.get("item_sku", "-"))
                    
                    enriched_items.append(line)
                
                record["po_items"] = enriched_items
                # Calculate total quantity
                total_qty = sum(line.get("qty", line.get("quantity", 0)) for line in po_lines)
                record["total_quantity"] = total_qty
                record["total_unit"] = po_lines[0].get("unit", "KG") if po_lines else "KG"
                
                # Get product names summary
                product_names = [line.get("product_name") or line.get("item_name", "Unknown") for line in enriched_items]
                record["products_summary"] = ", ".join(product_names[:3])  # First 3 products
                if len(product_names) > 3:
                    record["products_summary"] += f" (+{len(product_names) - 3} more)"
                
                # Check for container/drum information
                if po.get("container_count"):
                    record["container_count"] = po.get("container_count")
                elif po.get("drum_count"):
                    record["drum_count"] = po.get("drum_count")
        
        # For imports, get data from import record
        if record.get("import_id"):
            import_record = await db.imports.find_one({"id": record["import_id"]}, {"_id": 0})
            if import_record:
                record["import_number"] = import_record.get("import_number")
    
    return records
```

---

## 2. Update POST /transport/inward/book endpoint (around line 7856-7895)

**Location:** `backend/server.py`, function `book_transport_inward`

**Find this section in the transport_data dictionary:**
```python
        "eta": data.get("scheduled_date") or data.get("eta"),
        "status": "SCHEDULED" if data.get("scheduled_date") else "PENDING",
        "source": "EXW",
        "transporter_name": data.get("transporter_name"),
        "vehicle_type": data.get("vehicle_type"),
        "notes": data.get("notes"),
```

**Replace with:**
```python
        "eta": data.get("scheduled_date") or data.get("eta"),
        "status": "PENDING",  # Start as PENDING, can be marked IN_TRANSIT after booking
        "source": "EXW",
        "transporter_name": data.get("transporter_name"),
        "vehicle_type": data.get("vehicle_type", "tanker"),
        "transport_charges": data.get("transport_charges"),  # Add charges field
        "notes": data.get("notes"),
```

**Find this notification section:**
```python
    # Create notification
    await create_notification(
        event_type="TRANSPORT_ARRIVAL_SCHEDULED",
        title="Transport Booked - Inward",
        message=f"Transport {transport_number} booked for PO {po.get('po_number')} from {po.get('supplier_name')}",
        link="/transport-planner",
        ref_type="transport_inward",
        ref_id=transport_data["id"],
        target_roles=["admin", "warehouse", "security", "transport"],
        notification_type="info"
    )
```

**Replace with:**
```python
    # Create notification for security team
    await create_notification(
        event_type="TRANSPORT_BOOKED",
        title="Transport Booked - Inward",
        message=f"Transport {transport_number} booked for PO {po.get('po_number')} from {po.get('supplier_name')}. Vehicle: {data.get('vehicle_type', 'tanker')} - {data.get('vehicle_number', 'TBD')}",
        link="/transport-window",
        ref_type="transport_inward",
        ref_id=transport_data["id"],
        target_roles=["admin", "security", "warehouse", "transport"],
        notification_type="info"
    )
```

---

## 3. Update POST /transport/inward/book-import endpoint (around line 7927-7967)

**Location:** `backend/server.py`, function `book_transport_inward_import`

**Find this section in the transport_data dictionary:**
```python
        "eta": data.get("scheduled_date") or import_record.get("eta"),
        "status": "SCHEDULED" if data.get("scheduled_date") else "PENDING",
        "source": "IMPORT",
        "transporter_name": data.get("transporter_name"),
        "vehicle_type": data.get("vehicle_type", "container"),
        "notes": data.get("notes"),
```

**Replace with:**
```python
        "eta": data.get("scheduled_date") or import_record.get("eta"),
        "status": "PENDING",  # Start as PENDING
        "source": "IMPORT",
        "transporter_name": data.get("transporter_name"),
        "vehicle_type": data.get("vehicle_type", "container"),
        "transport_charges": data.get("transport_charges"),  # Add charges field
        "notes": data.get("notes"),
```

**Find this notification section:**
```python
    # Create notification
    await create_notification(
        event_type="TRANSPORT_ARRIVAL_SCHEDULED",
        title="Transport Booked - Import",
        message=f"Transport {transport_number} booked for Import {import_record.get('import_number')} (PO {po.get('po_number')})",
        link="/transport-planner",
        ref_type="transport_inward",
        ref_id=transport_data["id"],
        target_roles=["admin", "warehouse", "security", "transport"],
        notification_type="info"
    )
```

**Replace with:**
```python
    # Create notification for security team
    await create_notification(
        event_type="TRANSPORT_BOOKED",
        title="Transport Booked - Import",
        message=f"Transport {transport_number} booked for Import {import_record.get('import_number')} (PO {po.get('po_number')}). Vehicle: {data.get('vehicle_type', 'container')} - {data.get('vehicle_number', 'TBD')}",
        link="/transport-window",
        ref_type="transport_inward",
        ref_id=transport_data["id"],
        target_roles=["admin", "security", "warehouse", "transport"],
        notification_type="info"
    )
```

---

## 4. Update POST /transport/outward/book endpoint (around line 8356-8389)

**Location:** `backend/server.py`, function `book_transport_outward`

**Find this section in the transport_data dictionary:**
```python
        "dispatch_date": data.get("scheduled_date") or data.get("dispatch_date"),
        "status": "SCHEDULED" if data.get("scheduled_date") else "PENDING",
        "transporter_name": data.get("transporter_name"),
        "vehicle_type": data.get("vehicle_type"),
        "notes": data.get("notes"),
        "destination": job.get("delivery_address") or job.get("destination"),
```

**Replace with:**
```python
        "product_name": job.get("product_name", ""),
        "quantity": job.get("quantity", 0),
        "packaging": job.get("packaging", "Bulk"),
        "dispatch_date": data.get("scheduled_date") or data.get("dispatch_date"),
        "status": "PENDING",  # Start as PENDING
        "transporter_name": data.get("transporter_name"),
        "vehicle_type": data.get("vehicle_type", "tanker"),
        "transport_charges": data.get("transport_charges"),  # Add charges field
        "notes": data.get("notes"),
        "delivery_date": job.get("delivery_date"),
        "destination": job.get("delivery_address") or job.get("destination"),
```

**Add this after creating the transport record (after `await db.transport_outward.insert_one(transport_data)`):**
```python
    # Update job order to mark transport booked
    await db.job_orders.update_one(
        {"id": job_order_id},
        {"$set": {"transport_booked": True, "transport_number": transport_number}}
    )
```

**Find this notification section:**
```python
    # Create notification
    await create_notification(
        event_type="TRANSPORT_ARRIVAL_SCHEDULED",
        title="Transport Booked - Dispatch",
        message=f"Transport {transport_number} booked for Job {job.get('job_number')} - {job.get('product_name', 'Product')} to {customer_name}",
        link="/transport-planner",
        ref_type="transport_outward",
        ref_id=transport_data["id"],
        target_roles=["admin", "warehouse", "security", "transport"],
        notification_type="info"
    )
```

**Replace with:**
```python
    # Create notification for security team
    await create_notification(
        event_type="TRANSPORT_BOOKED",
        title="Transport Booked - Dispatch",
        message=f"Transport {transport_number} booked for Job {job.get('job_number')} to {customer_name}. Vehicle: {data.get('vehicle_type', 'tanker')} - {data.get('vehicle_number', 'TBD')}",
        link="/transport-window",
        ref_type="transport_outward",
        ref_id=transport_data["id"],
        target_roles=["admin", "security", "warehouse", "transport"],
        notification_type="info"
    )
```

---

## Summary of Changes

1. **GET /transport/inward**: Enhanced to fetch PO lines from `purchase_order_lines` collection, enrich with product details, calculate quantities with units, and include container/drum information.

2. **POST /transport/inward/book**: 
   - Changed initial status to "PENDING" (instead of "SCHEDULED")
   - Added `transport_charges` field
   - Updated notification to "TRANSPORT_BOOKED" event type
   - Changed notification link to "/transport-window"
   - Reordered target_roles to prioritize "security"

3. **POST /transport/inward/book-import**:
   - Changed initial status to "PENDING"
   - Added `transport_charges` field
   - Updated notification to "TRANSPORT_BOOKED" event type
   - Changed notification link to "/transport-window"
   - Reordered target_roles to prioritize "security"

4. **POST /transport/outward/book**:
   - Added `product_name`, `quantity`, `packaging`, `delivery_date` fields
   - Changed initial status to "PENDING"
   - Added `transport_charges` field
   - Added job order update to mark transport as booked
   - Updated notification to "TRANSPORT_BOOKED" event type
   - Changed notification link to "/transport-window"
   - Reordered target_roles to prioritize "security"

---

## Testing Checklist

After applying these changes, verify:

- [ ] GET /transport/inward returns PO items with product names and quantities
- [ ] GET /transport/inward includes container_count or drum_count when available
- [ ] POST /transport/inward/book creates transport with PENDING status
- [ ] POST /transport/inward/book saves transport_charges field
- [ ] POST /transport/inward/book sends notification to security team
- [ ] POST /transport/inward/book-import creates transport with PENDING status
- [ ] POST /transport/inward/book-import saves transport_charges field
- [ ] POST /transport/outward/book creates transport with product details
- [ ] POST /transport/outward/book saves transport_charges field
- [ ] POST /transport/outward/book updates job order with transport_booked flag
- [ ] All booking endpoints send notifications with TRANSPORT_BOOKED event type

---

## Notes

- The frontend changes have already been completed and are ready to use
- All booking endpoints now start with "PENDING" status, allowing users to book transport first, then mark as "IN_TRANSIT" later
- Security team will receive notifications for all transport bookings
- Transport charges are optional fields that can be filled during booking

