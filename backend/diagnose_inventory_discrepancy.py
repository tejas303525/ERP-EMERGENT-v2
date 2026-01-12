#!/usr/bin/env python3
"""
Diagnostic script to investigate inventory discrepancies between GUI and database.
Specifically checks for ETHANOL and compares different data sources.

Usage: python diagnose_inventory_discrepancy.py [ITEM_NAME]
Example: python diagnose_inventory_discrepancy.py ETHANOL
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def format_number(num):
    """Format large numbers with commas"""
    return f"{num:,.2f}"

async def diagnose_inventory(item_name: str = "ETHANOL"):
    """Diagnose inventory discrepancies for a specific item"""
    
    print("=" * 80)
    print(f"INVENTORY DIAGNOSTIC FOR: {item_name}")
    print("=" * 80)
    print()
    
    # Step 1: Find all items matching the name (case-insensitive)
    print("STEP 1: Finding All Items Matching Name")
    print("-" * 80)
    
    # Search in inventory_items
    inventory_items = await db.inventory_items.find({
        "name": {"$regex": item_name, "$options": "i"},
        "is_active": True
    }, {"_id": 0}).to_list(100)
    
    # Search in products (in case it's stored there)
    products = await db.products.find({
        "name": {"$regex": item_name, "$options": "i"}
    }, {"_id": 0}).to_list(100)
    
    all_items = inventory_items + products
    
    if not all_items:
        print(f"❌ ERROR: No items found matching '{item_name}'!")
        return
    
    print(f"✓ Found {len(all_items)} item(s) matching '{item_name}':")
    for idx, item in enumerate(all_items, 1):
        item_type = item.get("item_type", "N/A")
        if "item_type" not in item:
            item_type = "PRODUCT" if "current_stock" in item else "INVENTORY_ITEM"
        print(f"  {idx}. {item.get('name', 'Unknown')} (SKU: {item.get('sku', 'N/A')})")
        print(f"     - ID: {item.get('id')}")
        print(f"     - Type: {item_type}")
        print(f"     - UOM: {item.get('uom') or item.get('unit', 'N/A')}")
    print()
    
    # Step 2: Check inventory balances for each item
    print("STEP 2: Checking Inventory Balances (Direct Database Query)")
    print("-" * 80)
    
    for item in all_items:
        item_id = item.get("id")
        item_name_display = item.get("name", "Unknown")
        item_sku = item.get("sku", "N/A")
        
        print(f"\n  Item: {item_name_display} ({item_sku})")
        print(f"  Item ID: {item_id}")
        
        # Get balance directly from database
        balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
        if balance:
            on_hand = balance.get("on_hand", 0)
            print(f"  ✓ Balance Record Found:")
            print(f"    - On Hand (from inventory_balances): {format_number(on_hand)}")
            print(f"    - Balance ID: {balance.get('id', 'N/A')}")
            print(f"    - Last Updated: {balance.get('updated_at', 'N/A')}")
        else:
            print(f"  ⚠️  No balance record found in inventory_balances!")
            on_hand = 0
        
        # Get reservations
        reservations = await db.inventory_reservations.find({"item_id": item_id}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        
        print(f"  - Reserved: {format_number(reserved)} KG")
        if reservations:
            print(f"    (from {len(reservations)} reservation(s))")
            for res in reservations[:5]:  # Show first 5
                print(f"      • {format_number(res.get('qty', 0))} KG - {res.get('job_number', 'N/A')} - {res.get('status', 'N/A')}")
            if len(reservations) > 5:
                print(f"      ... and {len(reservations) - 5} more")
        
        # Calculate available
        available = on_hand - reserved
        print(f"  - Available: {format_number(available)} KG")
        print()
    
    # Step 3: Check what the API endpoint returns (simulate GUI call)
    print("STEP 3: Simulating GUI API Call (/inventory-items)")
    print("-" * 80)
    
    for item in all_items:
        item_id = item.get("id")
        item_name_display = item.get("name", "Unknown")
        item_sku = item.get("sku", "N/A")
        
        print(f"\n  Item: {item_name_display} ({item_sku})")
        
        # Simulate the API endpoint logic (from server.py lines 4138-4184)
        balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        
        reservations = await db.inventory_reservations.find({"item_id": item_id}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        
        # Get inbound from PO lines
        po_lines = await db.purchase_order_lines.find({
            "item_id": item_id,
            "status": {"$in": ["OPEN", "PARTIAL"]}
        }, {"_id": 0}).to_list(1000)
        inbound = sum(line.get("qty", 0) - line.get("received_qty", 0) for line in po_lines)
        
        available = on_hand - reserved
        
        # Determine status (same logic as API)
        if available > 0:
            status = "IN_STOCK"
        elif inbound > 0:
            status = "INBOUND"
        else:
            status = "OUT_OF_STOCK"
        
        print(f"  API Endpoint Would Return:")
        print(f"    - on_hand: {format_number(on_hand)}")
        print(f"    - reserved: {format_number(reserved)}")
        print(f"    - available: {format_number(available)}")
        print(f"    - inbound: {format_number(inbound)}")
        print(f"    - status: {status}")
        print()
    
    # Step 4: Check transaction history (recent movements)
    print("STEP 4: Recent Inventory Transactions (Last 20)")
    print("-" * 80)
    
    for item in all_items:
        item_id = item.get("id")
        item_name_display = item.get("name", "Unknown")
        
        print(f"\n  Item: {item_name_display}")
        
        # Check inventory movements
        movements = await db.inventory_movements.find({
            "item_id": item_id
        }, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
        
        if movements:
            print(f"  ✓ Found {len(movements)} recent movement(s):")
            for mov in movements:
                mov_type = mov.get("movement_type", "UNKNOWN")
                qty = mov.get("quantity", 0)
                created = mov.get("created_at", "N/A")
                reference = mov.get("reference_number", mov.get("grn_number", "N/A"))
                print(f"    • {created[:10]} | {mov_type:15} | {format_number(qty):>15} KG | Ref: {reference}")
        else:
            print(f"  ⚠️  No inventory movements found")
        
        # Check GRN records
        grns = await db.grn.find({
            "items.item_id": item_id
        }, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
        
        if grns:
            print(f"  ✓ Found {len(grns)} recent GRN(s) containing this item:")
            for grn in grns:
                grn_date = grn.get("created_at", "N/A")[:10]
                grn_num = grn.get("grn_number", "N/A")
                items = grn.get("items", [])
                for grn_item in items:
                    if grn_item.get("item_id") == item_id:
                        qty = grn_item.get("quantity", 0)
                        print(f"    • {grn_date} | GRN {grn_num} | +{format_number(qty)} KG")
        print()
    
    # Step 5: Check if item appears in products table (finished products)
    print("STEP 5: Checking Products Table (Finished Products)")
    print("-" * 80)
    
    for item in all_items:
        item_id = item.get("id")
        item_name_display = item.get("name", "Unknown")
        
        product = await db.products.find_one({"id": item_id}, {"_id": 0})
        if product:
            current_stock = product.get("current_stock", 0)
            print(f"  {item_name_display}:")
            print(f"    ✓ Also exists in products table")
            print(f"    - current_stock: {format_number(current_stock)}")
            print(f"    ⚠️  NOTE: Products table has separate stock tracking!")
            print()
    
    # Step 6: Summary and Recommendations
    print("=" * 80)
    print("SUMMARY & RECOMMENDATIONS")
    print("=" * 80)
    
    for item in all_items:
        item_id = item.get("id")
        item_name_display = item.get("name", "Unknown")
        item_sku = item.get("sku", "N/A")
        
        balance = await db.inventory_balances.find_one({"item_id": item_id}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        
        reservations = await db.inventory_reservations.find({"item_id": item_id}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        available = on_hand - reserved
        
        print(f"\n{item_name_display} ({item_sku}):")
        print(f"  Database On Hand: {format_number(on_hand)}")
        print(f"  Reserved: {format_number(reserved)}")
        print(f"  Available: {format_number(available)}")
        
        # Check if there are multiple items with same name
        if len(all_items) > 1:
            print(f"  ⚠️  WARNING: Multiple items found with name '{item_name_display}'!")
            print(f"     This could cause confusion. Check SKUs to ensure correct item is used.")
    
    print("\n" + "=" * 80)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 80)

async def main():
    import sys
    
    item_name = "ETHANOL"
    if len(sys.argv) > 1:
        item_name = sys.argv[1]
    
    try:
        await diagnose_inventory(item_name)
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

