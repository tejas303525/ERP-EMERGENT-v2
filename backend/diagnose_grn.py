#!/usr/bin/env python3
"""
Diagnostic script to check a specific GRN and why inventory wasn't updated

Usage: python diagnose_grn.py [GRN_NUMBER]
Example: python diagnose_grn.py GRN-000016
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def format_number(num):
    """Format large numbers with commas"""
    return f"{num:,.2f}"

async def diagnose_grn(grn_number: str):
    print("=" * 80)
    print(f"DIAGNOSING {grn_number}")
    print("=" * 80)
    print()
    
    # Find the GRN
    grn = await db.grn.find_one({"grn_number": grn_number}, {"_id": 0})
    if not grn:
        print(f"❌ GRN {grn_number} not found!")
        return
    
    print(f"✓ Found GRN {grn_number}")
    print(f"  Created: {grn.get('created_at', 'N/A')}")
    print(f"  Supplier: {grn.get('supplier', 'N/A')}")
    print()
    
    # Check each item in the GRN
    items = grn.get("items", [])
    print(f"Items in GRN: {len(items)}")
    print()
    
    for idx, item in enumerate(items, 1):
        product_id = item.get("product_id")
        product_name = item.get("product_name", "Unknown")
        quantity = item.get("quantity", 0)
        unit = item.get("unit", "KG")
        
        print(f"Item {idx}: {product_name}")
        print(f"  - product_id: {product_id}")
        print(f"  - quantity: {quantity} {unit}")
        print()
        
        # Check if product exists
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if product:
            print(f"  ✓ Product found in products table")
            print(f"    - Name: {product.get('name')}")
            print(f"    - SKU: {product.get('sku', 'N/A')}")
            print(f"    - Unit: {product.get('unit', 'N/A')}")
            print(f"    - current_stock: {format_number(product.get('current_stock', 0))}")
        else:
            print(f"  ❌ Product NOT found in products table!")
        
        # Check if inventory_item exists with this ID
        inventory_item = await db.inventory_items.find_one({"id": product_id}, {"_id": 0})
        if inventory_item:
            print(f"  ✓ Inventory item found with matching ID")
            print(f"    - Name: {inventory_item.get('name')}")
            print(f"    - SKU: {inventory_item.get('sku', 'N/A')}")
            print(f"    - UOM: {inventory_item.get('uom', 'N/A')}")
            correct_item_id = inventory_item.get("id")
        else:
            print(f"  ⚠️  No inventory_item found with ID={product_id}")
            
            # Try to find by name or SKU
            if product:
                inventory_item_by_name = await db.inventory_items.find_one({
                    "$or": [
                        {"name": product.get("name")},
                        {"sku": product.get("sku")}
                    ]
                }, {"_id": 0})
                
                if inventory_item_by_name:
                    print(f"  ✓ Found inventory_item by name/SKU lookup")
                    print(f"    - ID: {inventory_item_by_name.get('id')}")
                    print(f"    - Name: {inventory_item_by_name.get('name')}")
                    print(f"    - SKU: {inventory_item_by_name.get('sku', 'N/A')}")
                    correct_item_id = inventory_item_by_name.get('id')
                else:
                    print(f"  ❌ No inventory_item found by name/SKU either!")
                    print(f"     This is likely the problem - no matching inventory_item!")
                    correct_item_id = product_id  # Fallback (this is the problem)
            else:
                correct_item_id = product_id
        
        # Check inventory_balances
        item_id_for_balance = correct_item_id if 'correct_item_id' in locals() else (inventory_item.get("id") if inventory_item else product_id)
        
        print(f"  Checking inventory_balances with item_id={item_id_for_balance}")
        balance = await db.inventory_balances.find_one({"item_id": item_id_for_balance}, {"_id": 0})
        if balance:
            print(f"  ✓ Balance record found")
            print(f"    - on_hand: {format_number(balance.get('on_hand', 0))}")
            print(f"    - Last updated: {balance.get('updated_at', 'N/A')}")
        else:
            print(f"  ❌ NO balance record found! This is the problem!")
            print(f"     The GRN should have created/updated this record.")
        
        # Check if there are other inventory_items with similar names
        if product:
            similar_items = await db.inventory_items.find({
                "name": {"$regex": product.get("name", ""), "$options": "i"}
            }, {"_id": 0}).to_list(10)
            
            if similar_items:
                print(f"  ℹ️  Found {len(similar_items)} inventory_item(s) with similar names:")
                for sim_item in similar_items:
                    print(f"     - ID: {sim_item.get('id')}, Name: {sim_item.get('name')}, SKU: {sim_item.get('sku', 'N/A')}")
        
        print()
    
    print("=" * 80)
    print("DIAGNOSIS COMPLETE")
    print("=" * 80)

async def main():
    grn_number = "GRN-000016"
    if len(sys.argv) > 1:
        grn_number = sys.argv[1]
    
    try:
        await diagnose_grn(grn_number)
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

