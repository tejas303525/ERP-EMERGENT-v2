"""
Cleanup script to remove hardcoded packaging items from the packaging collection.
These items are duplicates that don't have SKU codes and conflict with inventory_items.
Run this once to clean up the database.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def cleanup_packaging_collection():
    """Remove all items from packaging collection and clean up related data"""
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    
    print("=" * 60)
    print("PACKAGING COLLECTION CLEANUP")
    print("=" * 60)
    print()
    
    # Step 1: Check what we have
    print("Step 1: Checking current packaging collection...")
    packaging_count = await db.packaging.count_documents({})
    print(f"  Found {packaging_count} items in packaging collection")
    
    if packaging_count == 0:
        print("  ✓ Collection is already empty!")
        client.close()
        return
    
    # Show sample items
    print("\n  Sample items to be deleted:")
    sample_items = await db.packaging.find({}, {"name": 1, "sku": 1, "_id": 0}).limit(5).to_list(5)
    for item in sample_items:
        sku = item.get("sku", "NO SKU")
        name = item.get("name", "NO NAME")
        print(f"    - {name} (SKU: {sku})")
    
    # Step 2: Get IDs for cleanup
    print("\nStep 2: Getting packaging IDs for cleanup...")
    packaging_items = await db.packaging.find({}, {"id": 1, "_id": 0}).to_list(1000)
    packaging_ids = [p.get("id") for p in packaging_items if p.get("id")]
    print(f"  Found {len(packaging_ids)} packaging IDs")
    
    # Step 3: Check for orphaned balances
    print("\nStep 3: Checking for orphaned inventory balances...")
    orphaned_balances = 0
    for pkg_id in packaging_ids:
        balance = await db.inventory_balances.find_one({"item_id": pkg_id})
        if balance:
            orphaned_balances += 1
    print(f"  Found {orphaned_balances} balances referencing packaging items")
    
    # Step 4: Confirm deletion
    print("\n" + "=" * 60)
    print("READY TO DELETE:")
    print(f"  - {packaging_count} items from packaging collection")
    print(f"  - {orphaned_balances} orphaned balance records")
    print("=" * 60)
    
    confirm = input("\nType 'DELETE' to confirm: ")
    if confirm != 'DELETE':
        print("\n❌ Cancelled - no changes made")
        client.close()
        return
    
    # Step 5: Delete packaging items
    print("\nStep 5: Deleting packaging collection...")
    result = await db.packaging.delete_many({})
    print(f"  ✓ Deleted {result.deleted_count} items from packaging collection")
    
    # Step 6: Clean up orphaned balances
    print("\nStep 6: Cleaning up orphaned balances...")
    deleted_balances = 0
    for pkg_id in packaging_ids:
        result = await db.inventory_balances.delete_many({"item_id": pkg_id})
        deleted_balances += result.deleted_count
    print(f"  ✓ Deleted {deleted_balances} orphaned balance records")
    
    # Step 7: Verify cleanup
    print("\nStep 7: Verifying cleanup...")
    remaining_packaging = await db.packaging.count_documents({})
    print(f"  Packaging collection: {remaining_packaging} items (should be 0)")
    
    # Check inventory_items
    inventory_pack_items = await db.inventory_items.count_documents({"item_type": "PACK", "is_active": True})
    print(f"  Inventory items (PACK): {inventory_pack_items} items")
    
    print("\n" + "=" * 60)
    print("✅ CLEANUP COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Refresh your Stock Management page")
    print("2. All packaging items should now have SKU codes")
    print("3. Delete button will work for all items")
    print()
    
    client.close()

if __name__ == "__main__":
    asyncio.run(cleanup_packaging_collection())

