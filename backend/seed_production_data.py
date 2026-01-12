"""
Seed data for Production Scheduling (Drums-Only)
Run this to initialize packaging types, inventory items, BOMs, etc.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import uuid
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def generate_id():
    return str(uuid.uuid4())

async def seed_packaging():
    """Seed drum packaging types"""
    print("Seeding packaging types...")
    
    drum_types = [
        {
            "id": generate_id(),
            "name": "Steel Drum 200L",
            "category": "DRUM",
            "material_type": "STEEL",
            "capacity_liters": 200,
            "tare_weight_kg": 25.0,
            "net_weight_kg_default": 180.0,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": generate_id(),
            "name": "HDPE Drum 210L",
            "category": "DRUM",
            "material_type": "HDPE",
            "capacity_liters": 210,
            "tare_weight_kg": 12.0,
            "net_weight_kg_default": 190.0,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": generate_id(),
            "name": "Reconditioned Steel Drum 200L",
            "category": "DRUM",
            "material_type": "RECON",
            "capacity_liters": 200,
            "tare_weight_kg": 23.0,
            "net_weight_kg_default": 180.0,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for drum in drum_types:
        existing = await db.packaging.find_one({"name": drum["name"]})
        if not existing:
            await db.packaging.insert_one(drum)
            print(f"  Created: {drum['name']}")
    
    return drum_types

async def seed_inventory_items():
    """Seed RAW and PACK inventory items"""
    print("\nSeeding inventory items...")
    
    # RAW materials
    raw_materials = [
        {
            "id": generate_id(),
            "sku": "RAW-001",
            "name": "Base Oil SN150",
            "item_type": "RAW",
            "uom": "KG",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": generate_id(),
            "sku": "RAW-002",
            "name": "Additive Package A",
            "item_type": "RAW",
            "uom": "KG",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": generate_id(),
            "sku": "RAW-003",
            "name": "Viscosity Modifier",
            "item_type": "RAW",
            "uom": "KG",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    # PACK materials
    pack_materials = [
        {
            "id": generate_id(),
            "sku": "PACK-DRUM-STEEL",
            "name": "Steel Drum Shell",
            "item_type": "PACK",
            "uom": "EA",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": generate_id(),
            "sku": "PACK-CLOSURE",
            "name": "Drum Closure (Bung)",
            "item_type": "PACK",
            "uom": "EA",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": generate_id(),
            "sku": "PACK-LABEL",
            "name": "Product Label",
            "item_type": "PACK",
            "uom": "EA",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": generate_id(),
            "sku": "PACK-PALLET",
            "name": "Wooden Pallet",
            "item_type": "PACK",
            "uom": "EA",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    all_items = raw_materials + pack_materials
    
    for item in all_items:
        existing = await db.inventory_items.find_one({"sku": item["sku"]})
        if not existing:
            await db.inventory_items.insert_one(item)
            print(f"  Created: {item['name']}")
            
            # Create initial balance
            balance = {
                "id": generate_id(),
                "item_id": item["id"],
                "warehouse_id": "MAIN",
                "on_hand": 0  # Start with 0, will be updated via GRN
            }
            await db.inventory_balances.insert_one(balance)
    
    return all_items

async def seed_sample_products():
    """Seed sample manufactured products"""
    print("\nSeeding sample products...")
    
    products = [
        {
            "id": generate_id(),
            "sku": "LUB-001",
            "name": "Hydraulic Oil ISO 68",
            "description": "Industrial hydraulic oil",
            "unit": "KG",
            "type": "MANUFACTURED",
            "density_kg_per_l": 0.9,
            "category": "finished_product",
            "price_usd": 5.0,
            "price_aed": 18.0,
            "price_eur": 4.5,
            "min_stock": 1000,
            "current_stock": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": generate_id(),
            "sku": "LUB-002",
            "name": "Engine Oil 15W40",
            "description": "Diesel engine oil",
            "unit": "KG",
            "type": "MANUFACTURED",
            "density_kg_per_l": 0.88,
            "category": "finished_product",
            "price_usd": 6.5,
            "price_aed": 24.0,
            "price_eur": 6.0,
            "min_stock": 1500,
            "current_stock": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for product in products:
        existing = await db.products.find_one({"sku": product["sku"]})
        if not existing:
            await db.products.insert_one(product)
            print(f"  Created: {product['name']}")
    
    return products

async def seed_product_boms(products, raw_materials):
    """Seed product BOMs (KG-based)"""
    print("\nSeeding product BOMs...")
    
    for product in products:
        # Create BOM for each product
        bom = {
            "id": generate_id(),
            "product_id": product["id"],
            "version": 1,
            "is_active": True,
            "notes": "Standard formulation",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        existing_bom = await db.product_boms.find_one({"product_id": product["id"], "version": 1})
        if not existing_bom:
            await db.product_boms.insert_one(bom)
            print(f"  Created BOM for: {product['name']}")
            
            # Add BOM items (example ratios)
            bom_items = [
                {
                    "id": generate_id(),
                    "bom_id": bom["id"],
                    "material_item_id": raw_materials[0]["id"],  # Base Oil
                    "qty_kg_per_kg_finished": 0.85  # 85% base oil
                },
                {
                    "id": generate_id(),
                    "bom_id": bom["id"],
                    "material_item_id": raw_materials[1]["id"],  # Additive
                    "qty_kg_per_kg_finished": 0.10  # 10% additives
                },
                {
                    "id": generate_id(),
                    "bom_id": bom["id"],
                    "material_item_id": raw_materials[2]["id"],  # VM
                    "qty_kg_per_kg_finished": 0.05  # 5% VM
                }
            ]
            
            for item in bom_items:
                await db.product_bom_items.insert_one(item)

async def seed_product_packaging_specs(products, drum_types):
    """Seed product-packaging conversion specs"""
    print("\nSeeding product-packaging conversion specs...")
    
    for product in products:
        for drum in drum_types[:1]:  # Just use first drum type for now
            spec = {
                "id": generate_id(),
                "product_id": product["id"],
                "packaging_id": drum["id"],
                "net_weight_kg": drum["net_weight_kg_default"],  # Use drum default
                "is_default": True
            }
            
            existing = await db.product_packaging_specs.find_one({
                "product_id": product["id"],
                "packaging_id": drum["id"]
            })
            
            if not existing:
                await db.product_packaging_specs.insert_one(spec)
                print(f"  Created spec: {product['name']} + {drum['name']}")

async def seed_packaging_boms(drum_types, pack_materials):
    """Seed packaging BOMs (components needed per drum)"""
    print("\nSeeding packaging BOMs...")
    
    # Find specific pack items
    drum_shell = next((p for p in pack_materials if "Shell" in p["name"]), pack_materials[0])
    closure = next((p for p in pack_materials if "Closure" in p["name"]), pack_materials[1])
    label = next((p for p in pack_materials if "Label" in p["name"]), pack_materials[2])
    pallet = next((p for p in pack_materials if "Pallet" in p["name"]), pack_materials[3])
    
    for drum in drum_types:
        # Create packaging BOM
        pack_bom = {
            "id": generate_id(),
            "packaging_id": drum["id"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        existing_bom = await db.packaging_boms.find_one({"packaging_id": drum["id"]})
        if not existing_bom:
            await db.packaging_boms.insert_one(pack_bom)
            print(f"  Created packaging BOM for: {drum['name']}")
            
            # Add components
            components = [
                {
                    "id": generate_id(),
                    "packaging_bom_id": pack_bom["id"],
                    "pack_item_id": drum_shell["id"],
                    "qty_per_drum": 1.0,
                    "uom": "EA"
                },
                {
                    "id": generate_id(),
                    "packaging_bom_id": pack_bom["id"],
                    "pack_item_id": closure["id"],
                    "qty_per_drum": 2.0,  # 2 bungs per drum
                    "uom": "EA"
                },
                {
                    "id": generate_id(),
                    "packaging_bom_id": pack_bom["id"],
                    "pack_item_id": label["id"],
                    "qty_per_drum": 1.0,
                    "uom": "EA"
                },
                {
                    "id": generate_id(),
                    "packaging_bom_id": pack_bom["id"],
                    "pack_item_id": pallet["id"],
                    "qty_per_drum": 0.25,  # 4 drums per pallet
                    "uom": "EA"
                }
            ]
            
            for component in components:
                await db.packaging_bom_items.insert_one(component)

async def seed_sample_job_orders(products, drum_types):
    """Seed sample job orders for testing"""
    print("\nSeeding sample job orders...")
    
    # Create a sample job order
    job_order = {
        "id": generate_id(),
        "customer_name": "ABC Trading LLC",
        "status": "OPEN",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing = await db.job_orders.find_one({"customer_name": job_order["customer_name"]})
    if not existing:
        await db.job_orders.insert_one(job_order)
        print(f"  Created job order for: {job_order['customer_name']}")
        
        # Create job order items
        delivery_date = (datetime.now() + timedelta(days=14)).isoformat()
        
        job_items = [
            {
                "id": generate_id(),
                "job_order_id": job_order["id"],
                "product_id": products[0]["id"],
                "packaging_id": drum_types[0]["id"],
                "qty_drums": 100,
                "delivery_date": delivery_date,
                "spec_id": None,
                "bom_version": 1,
                "status": "OPEN",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": generate_id(),
                "job_order_id": job_order["id"],
                "product_id": products[1]["id"] if len(products) > 1 else products[0]["id"],
                "packaging_id": drum_types[0]["id"],
                "qty_drums": 150,
                "delivery_date": delivery_date,
                "spec_id": None,
                "bom_version": 1,
                "status": "OPEN",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ]
        
        for item in job_items:
            await db.job_order_items.insert_one(item)
            print(f"    Created job item: {item['qty_drums']} drums")

async def seed_capacity_config():
    """Seed production capacity configuration"""
    print("\nSeeding capacity configuration...")
    
    config = {
        "id": generate_id(),
        "line_type": "DRUM",
        "daily_capacity": 600
    }
    
    existing = await db.production_capacity_config.find_one({"line_type": "DRUM"})
    if not existing:
        await db.production_capacity_config.insert_one(config)
        print(f"  Created capacity config: {config['daily_capacity']} drums/day")

async def main():
    print("=" * 60)
    print("PRODUCTION SCHEDULING SEED DATA")
    print("=" * 60)
    
    try:
        # Seed in order
        drum_types = await seed_packaging()
        inventory_items = await seed_inventory_items()
        
        raw_materials = [i for i in inventory_items if i["item_type"] == "RAW"]
        pack_materials = [i for i in inventory_items if i["item_type"] == "PACK"]
        
        products = await seed_sample_products()
        await seed_product_boms(products, raw_materials)
        await seed_product_packaging_specs(products, drum_types)
        await seed_packaging_boms(drum_types, pack_materials)
        await seed_sample_job_orders(products, drum_types)
        await seed_capacity_config()
        
        print("\n" + "=" * 60)
        print("SEED DATA COMPLETED SUCCESSFULLY!")
        print("=" * 60)
        print("\nYou can now:")
        print("1. View packaging types at /api/packaging")
        print("2. View inventory items at /api/inventory-items")
        print("3. Regenerate schedule at POST /api/production/drum-schedule/regenerate?week_start=YYYY-MM-DD")
        
    except Exception as e:
        print(f"\nERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())
