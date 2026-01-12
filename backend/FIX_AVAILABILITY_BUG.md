# Fix for Availability Bug in Job Order Page

## Problem
The availability column in the job order page shows 0 even when items are in stock. This happens because the `/inventory-items/{item_id}/availability` endpoint only checks `inventory_balances.on_hand` and doesn't fall back to `inventory_items.current_stock` when the balance record doesn't exist or is 0.

## Solution
Add a fallback to check `inventory_items.current_stock` when `inventory_balances.on_hand` is 0 or doesn't exist.

## Code Change

**File:** `backend/server.py`  
**Location:** Around line 5100-5103 in the `get_inventory_item_availability` function

**Replace this:**
```python
    # Get balance
    balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
    on_hand = balance.get("on_hand", 0) if balance else 0
    
    # Get reservations
```

**With this:**
```python
    # Get balance - use inventory_balances.on_hand as source of truth
    balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
    on_hand = balance.get("on_hand", 0) if balance else 0
    
    # Fallback: If no balance record or on_hand is 0, check inventory_items.current_stock
    if on_hand == 0 and item:
        # Check if item has current_stock field (for inventory_items)
        if item.get("current_stock") is not None and item.get("current_stock", 0) > 0:
            on_hand = item.get("current_stock", 0)
    
    # Get reservations
```

## Explanation

1. The endpoint first tries to get `on_hand` from `inventory_balances` collection (the source of truth)
2. If `on_hand` is 0 or the balance record doesn't exist, it falls back to checking `inventory_items.current_stock`
3. This ensures that items with stock in the `inventory_items` table will show correct availability even if they don't have a corresponding `inventory_balances` record

## Testing

After applying this fix:
1. Create a job order with materials that have stock in `inventory_items.current_stock`
2. Verify that the availability column shows the correct stock quantity
3. Verify that procurement warnings only appear when there's an actual shortage

