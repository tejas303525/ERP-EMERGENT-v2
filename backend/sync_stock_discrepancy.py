"""
Script to fix stock discrepancy between products.current_stock and inventory_balances.on_hand

This script syncs inventory_balances.on_hand with products.current_stock for all finished products
to ensure both Inventory Page and Stock Management Page show the same stock values.

Usage: python sync_stock_discrepancy.py [--dry-run]
"""

import asyncio
import sys
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
from dotenv import load_dotenv
from pathlib import Path
import uuid
import argparse

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection settings from environment
MONGO_URI = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DATABASE_NAME = os.environ.get('DB_NAME', 'erp_emergent')

async def sync_stock_data(dry_run=False):
    """Sync inventory_balances.on_hand with products.current_stock"""
    try:
        # Connect to MongoDB
        client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[DATABASE_NAME]
        
        if dry_run:
            print("⚠️  DRY RUN MODE - No changes will be made\n")
        
        # Test connection
        await client.admin.command('ping')
        print("✓ Connected to MongoDB")
        
        # Get all finished products
        products = await db.products.find({}, {"_id": 0}).to_list(1000)
        print(f"\n📦 Found {len(products)} products to sync\n")
        
        synced_count = 0
        created_count = 0
        updated_count = 0
        discrepancies_found = 0
        
        for product in products:
            product_id = product.get("id")
            product_name = product.get("name", "Unknown")
            product_sku = product.get("sku", "N/A")
            current_stock = product.get("current_stock", 0)
            
            # Check if balance record exists
            balance = await db.inventory_balances.find_one({"item_id": product_id}, {"_id": 0})
            
            if balance:
                on_hand = balance.get("on_hand", 0)
                
                # Check if there's a discrepancy
                if on_hand != current_stock:
                    discrepancies_found += 1
                    print(f"⚠️  DISCREPANCY: {product_name} ({product_sku})")
                    print(f"   products.current_stock: {current_stock}")
                    print(f"   inventory_balances.on_hand: {on_hand}")
                    
                    if not dry_run:
                        # Update to match products.current_stock
                        await db.inventory_balances.update_one(
                            {"item_id": product_id},
                            {"$set": {"on_hand": current_stock}}
                        )
                        updated_count += 1
                        print(f"   ✓ Updated inventory_balances.on_hand to {current_stock}\n")
                    else:
                        print(f"   [DRY RUN] Would update inventory_balances.on_hand to {current_stock}\n")
                else:
                    print(f"✓ {product_name} ({product_sku}): Already in sync ({current_stock})")
            else:
                # Create balance record if it doesn't exist
                print(f"📝 Creating balance record for {product_name} ({product_sku}): {current_stock}")
                if not dry_run:
                    await db.inventory_balances.insert_one({
                        "id": str(uuid.uuid4()),
                        "item_id": product_id,
                        "warehouse_id": "MAIN",
                        "on_hand": current_stock,
                        "reserved": 0,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                    created_count += 1
                    print(f"   ✓ Created inventory_balances record\n")
                else:
                    print(f"   [DRY RUN] Would create inventory_balances record with on_hand={current_stock}\n")
            
            synced_count += 1
        
        # Summary
        print("\n" + "="*80)
        print("SYNC SUMMARY")
        print("="*80)
        print(f"Total products processed: {synced_count}")
        print(f"Discrepancies found and fixed: {discrepancies_found}")
        print(f"Balance records updated: {updated_count}")
        print(f"Balance records created: {created_count}")
        print(f"Products already in sync: {synced_count - updated_count - created_count}")
        print("="*80)
        
        if discrepancies_found > 0:
            print(f"\n✅ Successfully fixed {discrepancies_found} discrepancies!")
            print("   Both Inventory Page and Stock Management Page should now show the same stock values.")
        else:
            print("\n✅ All products are already in sync!")
        
        client.close()
        return True
        
    except ConnectionFailure:
        print("❌ Error: Could not connect to MongoDB")
        print(f"   Make sure MongoDB is running at {MONGO_URI}")
        return False
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

async def verify_sync():
    """Verify that all products are in sync after the fix"""
    try:
        client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[DATABASE_NAME]
        
        products = await db.products.find({}, {"_id": 0}).to_list(1000)
        discrepancies = []
        
        for product in products:
            product_id = product.get("id")
            product_name = product.get("name", "Unknown")
            current_stock = product.get("current_stock", 0)
            
            balance = await db.inventory_balances.find_one({"item_id": product_id}, {"_id": 0})
            on_hand = balance.get("on_hand", 0) if balance else None
            
            if on_hand is None:
                discrepancies.append({
                    "product": product_name,
                    "issue": "Missing inventory_balances record",
                    "current_stock": current_stock
                })
            elif on_hand != current_stock:
                discrepancies.append({
                    "product": product_name,
                    "issue": "Mismatch",
                    "current_stock": current_stock,
                    "on_hand": on_hand
                })
        
        client.close()
        
        if discrepancies:
            print("\n⚠️  VERIFICATION: Found remaining discrepancies:")
            for disc in discrepancies:
                print(f"   - {disc['product']}: {disc['issue']}")
            return False
        else:
            print("\n✅ VERIFICATION: All products are in sync!")
            return True
            
    except Exception as e:
        print(f"❌ Verification error: {str(e)}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Fix stock discrepancy between products and inventory_balances')
    parser.add_argument('--dry-run', action='store_true', help='Run in dry-run mode (no changes will be made)')
    args = parser.parse_args()
    
    print("="*80)
    print("STOCK DISCREPANCY FIX SCRIPT")
    print("="*80)
    print("This script will sync inventory_balances.on_hand with products.current_stock")
    print("to fix discrepancies between Inventory Page and Stock Management Page.\n")
    
    # Run the sync
    success = asyncio.run(sync_stock_data(dry_run=args.dry_run))
    
    if success and not args.dry_run:
        # Verify the sync
        print("\n" + "="*80)
        print("VERIFYING SYNC...")
        print("="*80)
        asyncio.run(verify_sync())
    
    sys.exit(0 if success else 1)

