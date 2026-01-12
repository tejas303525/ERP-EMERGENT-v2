#!/usr/bin/env python3
"""
Script to retroactively fix inventory updates for a specific GRN.
This can be used to fix GRNs that didn't update inventory correctly.

Usage: python fix_grn_inventory.py [GRN_NUMBER] [--dry-run]
Example: python fix_grn_inventory.py GRN-000016
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import sys
import argparse
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def format_number(num):
    """Format large numbers with commas"""
    return f"{num:,.2f}"

async def find_inventory_item_id(product_id: str, product_name: str = None, sku: str = None) -> str:
    """
    Helper function to find the correct inventory_item.id for a given product_id.
    Same logic as in server.py
    """
    # Strategy 1: Direct ID match
    inventory_item = await db.inventory_items.find_one({"id": product_id}, {"_id": 0})
    if inventory_item:
        return inventory_item["id"]
    
    # Strategy 2: Get product and try to find inventory_item by name or SKU
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if product:
        # Use provided name/SKU or get from product
        search_name = product_name or product.get("name")
        search_sku = sku or product.get("sku")
        
        # Try exact name match (case-insensitive)
        if search_name:
            inventory_item = await db.inventory_items.find_one({
                "name": {"$regex": f"^{search_name}$", "$options": "i"}
            }, {"_id": 0})
            if inventory_item:
                return inventory_item["id"]
        
        # Try SKU match (case-insensitive)
        if search_sku:
            inventory_item = await db.inventory_items.find_one({
                "sku": {"$regex": f"^{search_sku}$", "$options": "i"}
            }, {"_id": 0})
            if inventory_item:
                return inventory_item["id"]
        
        # Try partial name match (case-insensitive) - more lenient
        if search_name:
            inventory_item = await db.inventory_items.find_one({
                "name": {"$regex": search_name, "$options": "i"}
            }, {"_id": 0})
            if inventory_item:
                return inventory_item["id"]
    
    # Strategy 3: Fallback - use product_id
    return product_id

async def fix_grn_inventory(grn_number: str, dry_run: bool = True):
    """
    Fix inventory updates for a specific GRN by re-processing the items
    """
    print("=" * 80)
    print(f"{'DRY RUN: ' if dry_run else ''}FIXING INVENTORY FOR {grn_number}")
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
    
    items = grn.get("items", [])
    if not items:
        print("⚠️  No items found in GRN")
        return
    
    print(f"Processing {len(items)} item(s)...")
    print()
    
    fixed_count = 0
    
    for idx, item in enumerate(items, 1):
        product_id = item.get("product_id")
        product_name = item.get("product_name", "Unknown")
        quantity = item.get("quantity", 0)
        unit = item.get("unit", "KG")
        sku = item.get("sku")
        
        print(f"Item {idx}: {product_name}")
        print(f"  - product_id: {product_id}")
        print(f"  - quantity: {quantity} {unit}")
        
        # Find correct inventory_item_id
        item_id_for_balance = await find_inventory_item_id(product_id, product_name, sku)
        print(f"  - Found inventory_item_id: {item_id_for_balance}")
        
        # Get inventory item and product for unit conversion
        inventory_item = await db.inventory_items.find_one({"id": item_id_for_balance}, {"_id": 0})
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        
        # Determine unit
        if inventory_item:
            inventory_item_unit = inventory_item.get("uom", "KG").upper()
        elif product:
            inventory_item_unit = product.get("unit", "KG").upper()
        else:
            inventory_item_unit = "KG"
        
        # Convert quantity
        grn_unit = unit.upper() if unit else "KG"
        
        if inventory_item_unit == "KG":
            if grn_unit == "MT":
                quantity_to_add = quantity * 1000
            else:
                quantity_to_add = quantity
        elif inventory_item_unit == "MT":
            if grn_unit == "KG":
                quantity_to_add = quantity / 1000
            else:
                quantity_to_add = quantity
        else:
            quantity_to_add = quantity if grn_unit == "KG" else quantity * 1000
        
        print(f"  - Converted quantity: {format_number(quantity_to_add)} {inventory_item_unit}")
        
        # Check current balance
        balance = await db.inventory_balances.find_one({"item_id": item_id_for_balance}, {"_id": 0})
        current_on_hand = balance.get("on_hand", 0) if balance else 0
        print(f"  - Current on_hand: {format_number(current_on_hand)}")
        
        # Check if this GRN was already applied (by checking movements)
        movement = await db.inventory_movements.find_one({
            "reference_type": "grn",
            "reference_id": grn.get("id"),
            "product_id": product_id
        }, {"_id": 0})
        
        if movement:
            print(f"  ⚠️  Movement record exists - GRN may have been partially processed")
            print(f"     Movement quantity: {format_number(movement.get('quantity', 0))}")
            
            # Check if balance needs updating
            expected_on_hand = current_on_hand
            if abs(expected_on_hand - (current_on_hand - movement.get('quantity', 0) + quantity_to_add)) > 0.01:
                print(f"  ⚠️  Balance may be incorrect")
        
        # Update inventory_balances
        if not dry_run:
            result = await db.inventory_balances.update_one(
                {"item_id": item_id_for_balance},
                {"$inc": {"on_hand": quantity_to_add}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True
            )
            
            if result.upserted_id:
                print(f"  ✓ Created new balance record")
            elif result.modified_count > 0:
                print(f"  ✓ Updated balance record")
            else:
                print(f"  ⚠️  No changes made to balance")
            
            # Update products table if it exists
            if product:
                prev_stock = product.get("current_stock", 0)
                new_stock = prev_stock + quantity_to_add
                await db.products.update_one(
                    {"id": product_id},
                    {"$set": {"current_stock": new_stock, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                print(f"  ✓ Updated products.current_stock: {format_number(prev_stock)} → {format_number(new_stock)}")
        else:
            new_on_hand = current_on_hand + quantity_to_add
            print(f"  [DRY RUN] Would update on_hand: {format_number(current_on_hand)} → {format_number(new_on_hand)}")
        
        fixed_count += 1
        print()
    
    print("=" * 80)
    if dry_run:
        print(f"DRY RUN COMPLETE - {fixed_count} item(s) would be fixed")
        print("Run with --execute to apply changes")
    else:
        print(f"FIX COMPLETE - {fixed_count} item(s) fixed")
    print("=" * 80)

async def main():
    parser = argparse.ArgumentParser(description='Fix inventory updates for a specific GRN')
    parser.add_argument('grn_number', nargs='?', default='GRN-000016', help='GRN number to fix (default: GRN-000016)')
    parser.add_argument('--execute', action='store_true', help='Actually apply changes (default is dry-run)')
    
    args = parser.parse_args()
    dry_run = not args.execute
    
    try:
        await fix_grn_inventory(args.grn_number, dry_run=dry_run)
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

