# Fix for Stock Sync Issue Between Inventory Page and Stock Management Page

## Problem
When a Delivery Order (DO) is generated, the stock is deducted in the Stock Management window but not reflected in the Inventory page. This happens because:

1. **Stock Management Page** uses `/stock/all` endpoint which reads directly from `products.current_stock`
2. **Inventory Page** uses `/products` endpoint which uses `inventory_balances.on_hand` as the source of truth
3. When DO is created, only `products.current_stock` is updated, but `inventory_balances.on_hand` is NOT updated

## Solution
Update the DO creation endpoint to also update `inventory_balances.on_hand` when deducting stock.

## Code Change

**File:** `backend/server.py`  
**Location:** Around line 2435-2455 in the `create_delivery_order` function

**Find this code:**
```python
    # Update inventory - DEDUCT (for finished product)
    product = await db.products.find_one({"id": job["product_id"]}, {"_id": 0})
    if product:
        prev_stock = product["current_stock"]
        new_stock = max(0, prev_stock - job["quantity"])
        await db.products.update_one({"id": job["product_id"]}, {"$set": {"current_stock": new_stock}})
        
        movement = InventoryMovement(
            product_id=job["product_id"],
            product_name=job["product_name"],
            sku=product["sku"],
            movement_type="do_deduct",
            quantity=job["quantity"],
            reference_type="delivery_order",
            reference_id=delivery_order.id,
            reference_number=do_number,
            previous_stock=prev_stock,
            new_stock=new_stock,
            created_by=current_user["id"]
        )
        await db.inventory_movements.insert_one(movement.model_dump())
```

**Replace with:**
```python
    # Update inventory - DEDUCT (for finished product)
    product = await db.products.find_one({"id": job["product_id"]}, {"_id": 0})
    if product:
        prev_stock = product["current_stock"]
        new_stock = max(0, prev_stock - job["quantity"])
        
        # Update products.current_stock
        await db.products.update_one({"id": job["product_id"]}, {"$set": {"current_stock": new_stock}})
        
        # Also update inventory_balances.on_hand to keep both pages in sync
        balance = await db.inventory_balances.find_one({"item_id": job["product_id"]}, {"_id": 0})
        if balance:
            # Update existing balance record
            await db.inventory_balances.update_one(
                {"item_id": job["product_id"]},
                {"$set": {"on_hand": new_stock}}
            )
        else:
            # Create balance record if it doesn't exist
            await db.inventory_balances.insert_one({
                "id": str(uuid.uuid4()),
                "item_id": job["product_id"],
                "warehouse_id": "MAIN",
                "on_hand": new_stock,
                "reserved": 0,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        
        movement = InventoryMovement(
            product_id=job["product_id"],
            product_name=job["product_name"],
            sku=product["sku"],
            movement_type="do_deduct",
            quantity=job["quantity"],
            reference_type="delivery_order",
            reference_id=delivery_order.id,
            reference_number=do_number,
            previous_stock=prev_stock,
            new_stock=new_stock,
            created_by=current_user["id"]
        )
        await db.inventory_movements.insert_one(movement.model_dump())
```

## Explanation

1. When a DO is created, it deducts stock from the finished product
2. The fix ensures both `products.current_stock` AND `inventory_balances.on_hand` are updated
3. If a balance record doesn't exist, it creates one
4. This keeps both the Inventory page (which uses `inventory_balances.on_hand`) and Stock Management page (which uses `products.current_stock`) in sync

## Testing

After applying this fix:
1. Check current stock of ETAC (or any finished product) in both Inventory page and Stock Management page - they should match
2. Generate a Delivery Order for a job order
3. Verify that stock is deducted in BOTH pages
4. Both pages should show the same updated stock quantity

## Additional Notes

- The `/products` endpoint (line 785-808) uses `inventory_balances.on_hand` as the source of truth when available
- The `/stock/all` endpoint (line 2951-2972) reads directly from `products.current_stock`
- This fix ensures both sources are updated simultaneously when DO is created

