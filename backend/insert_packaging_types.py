"""
Script to insert packaging types from the Product-Packaging Configs table
Extracts unique packaging names and net weights, then inserts them into the packaging collection
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

# Packaging data from the image - extracted from PACKING and Qty-STANDARD columns
PACKAGING_DATA = [
    {"name": "MS Recon Dark Blue", "net_weight": 185, "capacity": 210},
    {"name": "MS Plain Dark Blue New", "net_weight": 185, "capacity": 210},
    {"name": "MS RECON Radiant", "net_weight": 185, "capacity": 210},
    {"name": "MS-Dark Blue Recon Drums", "net_weight": 185, "capacity": 210},
    {"name": "MS-New Dark Blue with Logo", "net_weight": 185, "capacity": 210},
    {"name": "MS Recon Drums Tank 5", "net_weight": 185, "capacity": 210},
    {"name": "MS Recon Drums Low Purity-Tank 3", "net_weight": 185, "capacity": 210},
    {"name": "New HDPE Drums with logo IRAN", "net_weight": 160, "capacity": 210},
    {"name": "New HDPE Drums logo 96%", "net_weight": 800, "capacity": 1000},
    {"name": "IBC", "net_weight": 165, "capacity": 1000},
    {"name": "MS RECON", "net_weight": 168, "capacity": 210},
    {"name": "New HDPE Drums + Logo", "net_weight": 190, "capacity": 210},
    {"name": "New MS Drums", "net_weight": 200, "capacity": 210},
    {"name": "MS DRUMS", "net_weight": 225, "capacity": 210},
    {"name": "MS New Light Blue Drums", "net_weight": 170, "capacity": 210},
    {"name": "MS Recon Drums", "net_weight": 185, "capacity": 210},
    {"name": "MS Recon light Blue", "net_weight": 185, "capacity": 210},
    {"name": "MS New Drum LIGHT BLUE", "net_weight": 185, "capacity": 210},
    {"name": "MS New Dark Blue", "net_weight": 185, "capacity": 210},
    {"name": "New HDPE Drum Neutral", "net_weight": 850, "capacity": 1000},
    {"name": "New HDPE Drum with logo", "net_weight": 165, "capacity": 210},
    {"name": "NEW HDPE PLAIN Drum", "net_weight": 165, "capacity": 210},
    {"name": "MS PLAIN", "net_weight": 185, "capacity": 210},
    {"name": "New HDPE Drum +Logo", "net_weight": 165, "capacity": 210},
    {"name": "NEW HDPE DRUM+LOGO", "net_weight": 165, "capacity": 210},
    {"name": "HDPE Neutral Drums", "net_weight": 165, "capacity": 210},
    {"name": "MS New Drums DOKAT-BYB", "net_weight": 185, "capacity": 210},
    {"name": "MS Recon Drums Light Blue", "net_weight": 185, "capacity": 210},
    {"name": "Bag", "net_weight": 500, "capacity": 500},
    {"name": "Box-Brown", "net_weight": 1000, "capacity": 1000},
    {"name": "Bags", "net_weight": 135, "capacity": 135},
]

def generate_id():
    return str(uuid.uuid4())

def normalize_name(name):
    """Normalize packaging name for SKU generation"""
    # Remove special characters, convert to uppercase, replace spaces with hyphens
    normalized = re.sub(r'[^\w\s-]', '', name.upper())
    normalized = re.sub(r'\s+', '-', normalized.strip())
    # Remove redundant parts and clean up
    normalized = re.sub(r'-+', '-', normalized)  # Replace multiple hyphens with single
    return normalized

def infer_category(name):
    """Infer category from packaging name"""
    name_lower = name.lower()
    if 'ibc' in name_lower:
        return 'IBC'
    elif 'bag' in name_lower or 'bags' in name_lower:
        return 'BAG'
    elif 'box' in name_lower:
        return 'BOX'
    else:
        return 'DRUM'

def infer_material_type(name):
    """Infer material type from packaging name"""
    name_lower = name.lower()
    if 'hdpe' in name_lower:
        return 'HDPE'
    elif 'recon' in name_lower or 'reconditioned' in name_lower:
        return 'STEEL_RECON'
    elif 'ms' in name_lower or 'steel' in name_lower:
        return 'STEEL'
    else:
        return 'STEEL'  # Default

def generate_sku(name, index):
    """Generate SKU: PACK-{normalized-name}-{number}"""
    normalized = normalize_name(name)
    # Extract number from name if exists, otherwise use index
    number_match = re.search(r'(\d+)', name)
    number = number_match.group(1) if number_match else str(index + 1)
    return f"PACK-{normalized}-{number}"

async def insert_packaging_types():
    """Insert packaging types into the database"""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'erp_emergent')
    
    print("=" * 80)
    print("INSERT PACKAGING TYPES")
    print("=" * 80)
    print()
    print(f"Connecting to MongoDB: {mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url}")
    print(f"Database: {db_name}")
    print()
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Track inserted and skipped
        inserted_count = 0
        skipped_count = 0
        updated_count = 0
        seen_names = set()  # Track to avoid duplicates
        
        print(f"📦 PROCESSING {len(PACKAGING_DATA)} PACKAGING TYPES...")
        print("-" * 80)
        
        for index, pkg_data in enumerate(PACKAGING_DATA):
            name = pkg_data["name"]
            net_weight = pkg_data["net_weight"]
            capacity = pkg_data.get("capacity", 210)  # Default to 210L for drums
            
            # Skip if we've already processed this exact name (avoid redundant values)
            if name in seen_names:
                print(f"  ⏭️  Skipped (duplicate): {name}")
                skipped_count += 1
                continue
            
            seen_names.add(name)
            
            # Generate SKU: PACK-{normalized-name}-{number}
            sku = generate_sku(name, index)
            
            # Infer category and material type
            category = infer_category(name)
            material_type = infer_material_type(name)
            
            # Check if packaging with same name already exists
            existing = await db.packaging.find_one({"name": name})
            
            if existing:
                # Update if net_weight is different
                if existing.get("net_weight_kg_default") != net_weight:
                    await db.packaging.update_one(
                        {"name": name},
                        {"$set": {
                            "net_weight_kg_default": net_weight,
                            "capacity_liters": capacity,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    print(f"  🔄 Updated: {name} (SKU: {sku}) - Net Weight: {net_weight} KG")
                    updated_count += 1
                else:
                    print(f"  ⏭️  Skipped: {name} (already exists with same values)")
                    skipped_count += 1
            else:
                # Create new packaging
                packaging = {
                    "id": generate_id(),
                    "name": name,
                    "category": category,
                    "material_type": material_type,
                    "capacity_liters": capacity,
                    "tare_weight_kg": None,  # Can be filled later
                    "net_weight_kg_default": net_weight,
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.packaging.insert_one(packaging)
                print(f"  ✅ Inserted: {name} (SKU: {sku}) - Net Weight: {net_weight} KG, Capacity: {capacity}L")
                inserted_count += 1
        
        print("-" * 80)
        print()
        print("✅ OPERATION COMPLETE!")
        print()
        print("📋 SUMMARY:")
        print(f"   • New packaging types inserted: {inserted_count}")
        print(f"   • Existing packaging types updated: {updated_count}")
        print(f"   • Skipped (duplicates/already exists): {skipped_count}")
        print(f"   • Total processed: {len(PACKAGING_DATA)}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise
    finally:
        client.close()
        print()
        print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(insert_packaging_types())

