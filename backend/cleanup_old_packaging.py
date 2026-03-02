"""
Script to clean up old packaging names in product_packaging collection
that don't exist in the packaging collection.

This script:
1. Finds all product_packaging records with packaging names that don't exist in packaging collection
2. Attempts to map old names to new names
3. Inserts missing packaging names into the packaging collection (if they don't already exist)
4. Provides a report of changes
"""

import os
import asyncio
import uuid
import re
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
MONGO_URI = os.environ.get('MONGO_URL', os.environ.get('MONGO_URI', 'mongodb://localhost:27017'))
DB_NAME = os.environ.get('DB_NAME', 'erp_emergent')

client = AsyncIOMotorClient(MONGO_URI)
db = client[DB_NAME]

def generate_id():
    return str(uuid.uuid4())

# Mapping of old packaging names to new names
PACKAGING_NAME_MAPPING = {
    "HDPE DRUMS 210LTRS": "HDPE Drum 210L",
    "HDPE DRUMS 210L": "HDPE Drum 210L",
    "HDPE DRUMS 210 LTRS": "HDPE Drum 210L",
    "STEEL DRUMS 200L": "Steel Drum 200L",
    "STEEL DRUM 200L": "Steel Drum 200L",
    "STEEL DRUMS 200 L": "Steel Drum 200L",
}

def infer_packaging_properties(name: str) -> Dict:
    """Infer packaging properties from the name"""
    name_lower = name.lower()
    
    # Default values
    category = "DRUM"
    material_type = "STEEL"
    capacity_liters = 200
    tare_weight_kg = 25.0
    net_weight_kg_default = 180.0
    
    # Extract capacity
    capacity_match = re.search(r'(\d+)\s*L', name, re.IGNORECASE)
    if capacity_match:
        capacity_liters = int(capacity_match.group(1))
    
    # Determine material type
    if "hdpe" in name_lower:
        material_type = "HDPE"
        tare_weight_kg = 12.0 if capacity_liters == 210 else 14.0
        if capacity_liters == 210:
            net_weight_kg_default = 190.0
        elif capacity_liters == 250:
            net_weight_kg_default = 225.0
        else:
            net_weight_kg_default = capacity_liters * 0.9  # Estimate
    elif "ms" in name_lower or "steel" in name_lower:
        material_type = "STEEL"
        tare_weight_kg = 25.0 if capacity_liters == 210 else 23.0
        if capacity_liters == 210:
            net_weight_kg_default = 185.0
        elif capacity_liters == 200:
            net_weight_kg_default = 180.0
        else:
            net_weight_kg_default = capacity_liters * 0.88  # Estimate
    
    # Check if reconditioned
    if "recon" in name_lower or "reconditioned" in name_lower:
        material_type = material_type + "_RECON"
        tare_weight_kg = tare_weight_kg - 2.0  # Recon drums are lighter
        net_weight_kg_default = net_weight_kg_default - 5.0  # Slightly less capacity
    
    # Check for IBC
    if "ibc" in name_lower or "ibcs" in name_lower:
        category = "IBC"
        material_type = "HDPE" if "recon" not in name_lower else "HDPE_RECON"
        capacity_liters = 1000  # Default IBC capacity
        tare_weight_kg = 60.0
        net_weight_kg_default = 850.0
    
    # Check for flexi bags
    if "flexi" in name_lower or ("bag" in name_lower and "drum" not in name_lower):
        category = "BAG"
        material_type = "FLEXI"
        capacity_liters = 20000
        tare_weight_kg = 50.0
        net_weight_kg_default = 20000.0
    
    # Check for boxes
    if "box" in name_lower:
        category = "BOX"
        material_type = "CARDBOARD"
        capacity_liters = 0
        tare_weight_kg = 1.0
        net_weight_kg_default = 0.0
    
    # For MS (Mild Steel) drums, use steel defaults
    if "ms" in name_lower and "drum" in name_lower:
        material_type = "STEEL_RECON" if "recon" in name_lower else "STEEL"
        if capacity_liters == 0:  # If capacity not found, default to 210L
            capacity_liters = 210
            net_weight_kg_default = 185.0
    
    return {
        "category": category,
        "material_type": material_type,
        "capacity_liters": capacity_liters,
        "tare_weight_kg": tare_weight_kg,
        "net_weight_kg_default": net_weight_kg_default,
        "is_active": True
    }

async def get_all_packaging_names() -> List[str]:
    """Get all valid packaging names from BOTH packaging collection AND inventory_items"""
    # Get from packaging collection
    packaging_records = await db.packaging.find(
        {"is_active": True},
        {"_id": 0, "name": 1}
    ).to_list(1000)
    packaging_names = [p["name"] for p in packaging_records]
    
    # Get from inventory_items (PACK)
    inventory_packaging = await db.inventory_items.find(
        {"item_type": "PACK", "is_active": True},
        {"_id": 0, "name": 1}
    ).to_list(1000)
    inventory_names = [p["name"] for p in inventory_packaging]
    
    # Combine and deduplicate
    all_names = list(set(packaging_names + inventory_names))
    return all_names

async def packaging_exists(name: str) -> bool:
    """Check if packaging exists in EITHER packaging collection OR inventory_items"""
    # Check packaging collection (exact match)
    exact_match_packaging = await db.packaging.find_one(
        {"name": name},
        {"_id": 0, "name": 1}
    )
    if exact_match_packaging:
        return True
    
    # Check packaging collection (case-insensitive)
    case_insensitive_packaging = await db.packaging.find_one(
        {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        {"_id": 0, "name": 1}
    )
    if case_insensitive_packaging:
        return True
    
    # Check inventory_items (PACK) - exact match
    exact_match_inventory = await db.inventory_items.find_one(
        {"item_type": "PACK", "name": name},
        {"_id": 0, "name": 1}
    )
    if exact_match_inventory:
        return True
    
    # Check inventory_items (PACK) - case-insensitive
    case_insensitive_inventory = await db.inventory_items.find_one(
        {"item_type": "PACK", "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        {"_id": 0, "name": 1}
    )
    if case_insensitive_inventory:
        return True
    
    return False

async def find_invalid_packaging_records() -> List[Dict]:
    """Find all product_packaging records with invalid packaging names"""
    valid_names = await get_all_packaging_names()
    
    # Get all product_packaging records
    all_records = await db.product_packaging.find({}, {"_id": 0}).to_list(10000)
    
    invalid_records = []
    for record in all_records:
        packaging_name = record.get("packaging_name", "")
        if packaging_name and packaging_name not in valid_names:
            invalid_records.append(record)
    
    return invalid_records

async def find_similar_packaging(old_name: str, valid_names: List[str]) -> Optional[str]:
    """Try to find a similar packaging name"""
    old_lower = old_name.lower()
    
    # Direct mapping first
    if old_name in PACKAGING_NAME_MAPPING:
        mapped = PACKAGING_NAME_MAPPING[old_name]
        if mapped in valid_names:
            return mapped
    
    # Try fuzzy matching
    for valid_name in valid_names:
        valid_lower = valid_name.lower()
        
        # Check if key words match
        if "210" in old_name and "210" in valid_name:
            if "hdpe" in old_lower and "hdpe" in valid_lower:
                return valid_name
            if "steel" in old_lower and "steel" in valid_lower:
                return valid_name
        
        if "200" in old_name and "200" in valid_name:
            if "steel" in old_lower and "steel" in valid_lower:
                return valid_name
    
    return None

async def create_packaging_record(name: str) -> bool:
    """Create packaging in BOTH packaging collection AND inventory_items (PACK)"""
    # Check if it already exists in either collection
    exists = await packaging_exists(name)
    
    if exists:
        print(f"      ℹ️  Packaging '{name}' already exists. Skipping creation.")
        return False
    
    # Infer properties from name
    properties = infer_packaging_properties(name)
    
    # Create in packaging collection
    packaging_record = {
        "id": generate_id(),
        "name": name,
        **properties,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.packaging.insert_one(packaging_record)
    
    # Also create in inventory_items (PACK) - this is what GPN dropdown uses
    # Generate SKU from name
    sku_base = name.upper().replace(' ', '-').replace('_', '-')
    # Remove special characters and limit length
    sku_base = re.sub(r'[^A-Z0-9-]', '', sku_base)[:20]
    sku = f"PACK-{sku_base}"
    
    # Check if SKU already exists, if so append number
    existing_sku = await db.inventory_items.find_one({"sku": sku})
    if existing_sku:
        counter = 1
        while existing_sku:
            sku = f"PACK-{sku_base}-{counter}"
            existing_sku = await db.inventory_items.find_one({"sku": sku})
            counter += 1
    
    inventory_record = {
        "id": generate_id(),
        "sku": sku,
        "name": name,
        "item_type": "PACK",
        "uom": "EA",
        "capacity_liters": properties["capacity_liters"],
        "net_weight_kg_default": properties["net_weight_kg_default"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_items.insert_one(inventory_record)
    
    print(f"      ✅ Created packaging in both collections: {name}")
    print(f"         Category: {properties['category']}, Material: {properties['material_type']}")
    print(f"         Capacity: {properties['capacity_liters']}L, Net Weight: {properties['net_weight_kg_default']}KG")
    print(f"         SKU: {sku}")
    return True

async def cleanup_old_packaging():
    """Main cleanup function"""
    print("=" * 80)
    print("CLEANING UP OLD PACKAGING NAMES")
    print("=" * 80)
    print()
    
    # Get valid packaging names
    print("1. Fetching valid packaging names...")
    valid_names = await get_all_packaging_names()
    print(f"   Found {len(valid_names)} valid packaging types")
    print()
    
    # Find invalid records
    print("2. Finding invalid product_packaging records...")
    invalid_records = await find_invalid_packaging_records()
    print(f"   Found {len(invalid_records)} records with invalid packaging names")
    print()
    
    if not invalid_records:
        print("✅ No invalid records found. Database is clean!")
        return
    
    # Group by packaging name
    by_packaging_name = {}
    for record in invalid_records:
        pkg_name = record.get("packaging_name", "")
        if pkg_name not in by_packaging_name:
            by_packaging_name[pkg_name] = []
        by_packaging_name[pkg_name].append(record)
    
    print("3. Invalid packaging names found:")
    for pkg_name, records in by_packaging_name.items():
        total_qty = sum(r.get("quantity", 0) for r in records)
        print(f"   - {pkg_name}: {len(records)} records, {total_qty} total drums")
    print()
    
    # Process each invalid packaging name
    print("4. Processing invalid records...")
    print()
    
    updates_made = 0
    deletions_made = 0
    insertions_made = 0
    skipped_existing = 0
    
    for old_packaging_name, records in by_packaging_name.items():
        print(f"   Processing: {old_packaging_name}")
        
        # Try to find similar packaging
        new_packaging_name = await find_similar_packaging(old_packaging_name, valid_names)
        
        if new_packaging_name:
            print(f"   → Mapping to: {new_packaging_name}")
            
            # Update all records with this old packaging name
            for record in records:
                product_id = record.get("product_id")
                quantity = record.get("quantity", 0)
                net_weight_kg = record.get("net_weight_kg", 0)
                
                # Check if a record with new packaging name already exists
                existing = await db.product_packaging.find_one({
                    "product_id": product_id,
                    "packaging_name": new_packaging_name
                })
                
                if existing:
                    # Merge quantities
                    new_quantity = existing.get("quantity", 0) + quantity
                    await db.product_packaging.update_one(
                        {"product_id": product_id, "packaging_name": new_packaging_name},
                        {"$set": {
                            "quantity": new_quantity,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    print(f"      Merged {quantity} drums into existing record for product {product_id}")
                else:
                    # Update the old record to use new name
                    await db.product_packaging.update_one(
                        {"product_id": product_id, "packaging_name": old_packaging_name},
                        {"$set": {
                            "packaging_name": new_packaging_name,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    print(f"      Updated packaging name for product {product_id}")
                
                updates_made += 1
            
            # Delete old records (if any duplicates remain)
            result = await db.product_packaging.delete_many({
                "product_id": {"$in": [r.get("product_id") for r in records]},
                "packaging_name": old_packaging_name
            })
            
        else:
            # No matching packaging found - check if it already exists, then create if needed
            print(f"   → No matching packaging found. Checking if '{old_packaging_name}' exists...")
            
            # Check if packaging already exists
            exists = await packaging_exists(old_packaging_name)
            
            if exists:
                print(f"      ℹ️  Packaging '{old_packaging_name}' already exists. No action needed.")
                skipped_existing += 1
                # Refresh valid names list
                if old_packaging_name not in valid_names:
                    valid_names.append(old_packaging_name)
            else:
                # Check if all records have zero quantity
                all_zero = all(r.get("quantity", 0) == 0 for r in records)
                
                if all_zero:
                    print(f"      ⚠️  All records have zero quantity. Skipping creation.")
                    deletions_made += len(records)
                else:
                    # Create the packaging record
                    created = await create_packaging_record(old_packaging_name)
                    if created:
                        insertions_made += 1
                        # Refresh valid names list
                        valid_names.append(old_packaging_name)
                        print(f"      ✅ Packaging '{old_packaging_name}' is now valid")
    
    print()
    print("=" * 80)
    print("CLEANUP SUMMARY")
    print("=" * 80)
    print(f"Records updated: {updates_made}")
    print(f"Packaging records created: {insertions_made}")
    print(f"Packaging records skipped (already exist): {skipped_existing}")
    print(f"Records deleted (zero quantity): {deletions_made}")
    print()
    print("✅ Cleanup completed!")
    print()
    if insertions_made > 0:
        print("Note: New packaging records have been added to BOTH collections:")
        print("      - packaging collection (for packaging types)")
        print("      - inventory_items collection (item_type=PACK, for GPN dropdown)")
        print("      You may want to review and adjust the properties (capacity, net_weight, etc.)")
        print("      for the newly created packaging records if needed.")

if __name__ == "__main__":
    asyncio.run(cleanup_old_packaging())
