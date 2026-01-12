#!/usr/bin/env python3
"""
Script to sync inventory data between products table and inventory_balances table.
This ensures consistency when items exist in both places.

Usage: python sync_inventory_data.py [--dry-run] [--item-name ITEM_NAME] [--sync-all-products]
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import argparse
from datetime import datetime, timezone
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def format_number(num):
    """Format large numbers with commas"""
    return f"{num:,.2f}"

async def sync_products_to_inventory_balances(dry_run=True):
    """Create inventory_balances records for products that don't have them yet.
    Does NOT overwrite existing balance records - they are the source of truth.
    """
    print("=" * 80)
    print("SYNCING PRODUCTS TO INVENTORY_BALANCES")
    print("=" * 80)
    if dry_run:
        print("⚠️  DRY RUN MODE - No changes will be made")
    else:
        print("✓ LIVE MODE - Changes will be applied")
    print()
    print("Strategy: Only CREATE missing balance records from products.current_stock")
    print("          Do NOT overwrite existing balance records (they are source of truth)")
    print()
    
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    
    synced = 0
    created = 0
    skipped = 0
    
    print(f"Found {len(products)} product(s) to check")
    print()
    
    for product in products:
        product_id = product.get("id")
        product_name = product.get("name", "Unknown")
        product_sku = product.get("sku", "N/A")
        current_stock = product.get("current_stock", 0)
        
        balance = await db.inventory_balances.find_one({"item_id": product_id}, {"_id": 0})
        
        if balance:
            on_hand = balance.get("on_hand", 0)
            # Balance record exists - don't overwrite it
            print(f"  = {product_name} ({product_sku}): Balance exists ({format_number(on_hand)}), skipping")
            skipped += 1
        else:
            # Create new balance record from products.current_stock
            if not dry_run:
                await db.inventory_balances.insert_one({
                    "id": str(uuid.uuid4()),
                    "item_id": product_id,
                    "on_hand": current_stock,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                })
            print(f"  + {product_name} ({product_sku}): Created balance record with {format_number(current_stock)}")
            created += 1
            synced += 1
    
    print()
    print(f"Summary: {created} created, {skipped} skipped (already exist), {synced} total synced")
    return synced

async def sync_inventory_data(dry_run=True, item_name=None):
    """Sync inventory data between products and inventory_balances"""
    
    print("=" * 80)
    print("INVENTORY DATA SYNC")
    print("=" * 80)
    if dry_run:
        print("⚠️  DRY RUN MODE - No changes will be made")
    else:
        print("✓ LIVE MODE - Changes will be applied")
    print()
    
    # Find items that exist in both products and inventory_balances
    print("STEP 1: Finding Items in Both Tables")
    print("-" * 80)
    
    # Get all products
    products_query = {}
    if item_name:
        products_query["name"] = {"$regex": item_name, "$options": "i"}
    
    products = await db.products.find(products_query, {"_id": 0}).to_list(1000)
    
    # Get all inventory_balances
    all_balances = await db.inventory_balances.find({}, {"_id": 0}).to_list(1000)
    balance_map = {b["item_id"]: b for b in all_balances}
    
    sync_items = []
    
    for product in products:
        product_id = product.get("id")
        product_name = product.get("name", "Unknown")
        product_stock = product.get("current_stock", 0)
        
        # Check if this product has a balance record
        if product_id in balance_map:
            balance = balance_map[product_id]
            balance_stock = balance.get("on_hand", 0)
            
            if abs(product_stock - balance_stock) > 0.01:  # More than 0.01 difference
                sync_items.append({
                    "product_id": product_id,
                    "product_name": product_name,
                    "product_sku": product.get("sku", "N/A"),
                    "product_stock": product_stock,
                    "balance_stock": balance_stock,
                    "difference": balance_stock - product_stock
                })
    
    if not sync_items:
        print("✓ No discrepancies found. All items are in sync.")
        return
    
    print(f"✓ Found {len(sync_items)} item(s) with discrepancies:")
    print()
    
    for item in sync_items:
        print(f"  {item['product_name']} ({item['product_sku']}):")
        print(f"    - Products.current_stock: {format_number(item['product_stock'])}")
        print(f"    - Inventory_balances.on_hand: {format_number(item['balance_stock'])}")
        print(f"    - Difference: {format_number(item['difference'])}")
        print()
    
    # Step 2: Sync strategy - use inventory_balances as source of truth
    print("STEP 2: Sync Strategy")
    print("-" * 80)
    print("  Strategy: Update products.current_stock to match inventory_balances.on_hand")
    print("  Reason: inventory_balances is the authoritative source for procurement")
    print()
    
    if not dry_run:
        print("STEP 3: Applying Changes")
        print("-" * 80)
        
        for item in sync_items:
            print(f"  Updating {item['product_name']}...")
            result = await db.products.update_one(
                {"id": item["product_id"]},
                {"$set": {
                    "current_stock": item["balance_stock"],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            if result.modified_count > 0:
                print(f"    ✓ Updated products.current_stock to {format_number(item['balance_stock'])}")
            else:
                print(f"    ⚠️  No changes made (product may not exist)")
            print()
    else:
        print("STEP 3: Would Apply Changes (DRY RUN)")
        print("-" * 80)
        for item in sync_items:
            print(f"  Would update {item['product_name']}:")
            print(f"    products.current_stock: {format_number(item['product_stock'])} → {format_number(item['balance_stock'])}")
            print()
    
    print("=" * 80)
    print("SYNC COMPLETE")
    print("=" * 80)

async def main():
    parser = argparse.ArgumentParser(description='Sync inventory data between products and inventory_balances')
    parser.add_argument('--dry-run', action='store_true', help='Run in dry-run mode (no changes)')
    parser.add_argument('--item-name', type=str, help='Sync only items matching this name (case-insensitive)')
    parser.add_argument('--execute', action='store_true', help='Actually apply changes (default is dry-run)')
    parser.add_argument('--sync-all-products', action='store_true', help='Sync all products to inventory_balances')
    
    args = parser.parse_args()
    
    dry_run = not args.execute
    
    try:
        if args.sync_all_products:
            await sync_products_to_inventory_balances(dry_run=dry_run)
        else:
            await sync_inventory_data(dry_run=dry_run, item_name=args.item_name)
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

