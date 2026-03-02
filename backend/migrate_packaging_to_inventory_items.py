"""
Script to migrate all packaging items from 'packaging' collection 
to 'inventory_items' collection with item_type='PACK'
"""
import asyncio
import os
import re
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

def generate_id():
    return str(uuid.uuid4())

def normalize_name_for_sku(name):
    """Normalize packaging name for SKU generation"""
    # Remove special characters, convert to uppercase, replace spaces with hyphens
    normalized = re.sub(r'[^\w\s-]', '', name.upper())
    normalized = re.sub(r'\s+', '-', normalized.strip())
    normalized = re.sub(r'-+', '-', normalized)  # Replace multiple hyphens with single
    return normalized

def generate_sku_from_name(name, index):
    """Generate SKU from packaging name: PACK-{normalized-name}-{number}"""
    normalized = normalize_name_for_sku(name)
    # Extract number from name if exists, otherwise use index
    number_match = re.search(r'(\d+)', name)
    number = number_match.group(1) if number_match else str(index + 1)
    return f"PACK-{normalized}-{number}"

async def migrate_packaging_to_inventory_items():
    """Migrate all packaging items to inventory_items with item_type='PACK'"""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'erp_emergent')
    
    print("=" * 80)
    print("MIGRATE PACKAGING TO INVENTORY_ITEMS")
    print("=" * 80)
    print()
    print(f"Connecting to MongoDB: {mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url}")
    print(f"Database: {db_name}")
    print()
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Get all active packaging items
        packaging_items = await db.packaging.find({"is_active": True}, {"_id": 0}).to_list(1000)
        
        print(f"📦 FOUND {len(packaging_items)} PACKAGING ITEMS")
        print("-" * 80)
        
        if len(packaging_items) == 0:
            print("✅ No packaging items found. Nothing to migrate.")
            return
        
        # Count existing inventory items with PACK type
        existing_pack_count = await db.inventory_items.count_documents({"item_type": "PACK"})
        print(f"   Existing PACK inventory items: {existing_pack_count}")
        print()
        
        # Confirm operation
        print("⚠️  WARNING: This will:")
        print("   1. Create inventory_items for all active packaging items")
        print("   2. Set item_type='PACK' and uom='EA'")
        print("   3. Create initial inventory_balance records")
        print("   4. Skip items that already exist (by name)")
        print()
        
        response = input("Type 'YES' to confirm: ")
        
        if response != 'YES':
            print("❌ Operation cancelled.")
            return
        
        print()
        print("🔄 MIGRATING PACKAGING ITEMS...")
        print("-" * 80)
        
        inserted_count = 0
        skipped_count = 0
        balance_created_count = 0
        
        for index, pkg in enumerate(packaging_items):
            pkg_name = pkg.get("name", "")
            
            # Check if inventory item with same name already exists
            existing_item = await db.inventory_items.find_one({
                "name": pkg_name,
                "item_type": "PACK"
            })
            
            if existing_item:
                print(f"  ⏭️  Skipped: {pkg_name} (already exists in inventory_items)")
                skipped_count += 1
                continue
            
            # Generate SKU if not present in packaging
            sku = pkg.get("sku") or generate_sku_from_name(pkg_name, index)
            
            # Create inventory item
            inventory_item = {
                "id": generate_id(),
                "sku": sku,
                "name": pkg_name,
                "item_type": "PACK",
                "uom": "EA",  # Each/Unit for packaging items
                "is_active": pkg.get("is_active", True),
                "capacity_liters": pkg.get("capacity_liters"),
                "net_weight_kg": pkg.get("net_weight_kg_default"),  # Map from net_weight_kg_default
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Insert inventory item
            await db.inventory_items.insert_one(inventory_item)
            print(f"  ✅ Inserted: {pkg_name} (SKU: {sku})")
            inserted_count += 1
            
            # Create initial inventory balance record
            balance = {
                "id": generate_id(),
                "item_id": inventory_item["id"],
                "warehouse_id": "MAIN",  # Default warehouse
                "on_hand": 0.0,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.inventory_balances.insert_one(balance)
            balance_created_count += 1
        
        print("-" * 80)
        print()
        print("✅ MIGRATION COMPLETE!")
        print()
        print("📋 SUMMARY:")
        print(f"   • New inventory items created: {inserted_count}")
        print(f"   • Inventory balance records created: {balance_created_count}")
        print(f"   • Skipped (already exists): {skipped_count}")
        print(f"   • Total packaging items processed: {len(packaging_items)}")
        
        # Verify final count
        final_pack_count = await db.inventory_items.count_documents({"item_type": "PACK"})
        print()
        print(f"📊 FINAL STATUS:")
        print(f"   • Total PACK inventory items: {final_pack_count}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise
    finally:
        client.close()
        print()
        print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(migrate_packaging_to_inventory_items())

