#!/usr/bin/env python3
"""
Migration script to add vehicle_type, vehicle_number, and driver_name fields to existing records.
This populates the new vehicle-related fields that were added to TransportInward, TransportOutward, and DeliveryOrder models.

Usage: python migrate_vehicle_fields.py [--execute]
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

async def migrate_vehicle_fields(dry_run=True):
    """Add vehicle-related fields to existing transport and delivery order records"""
    
    print("=" * 80)
    print("MIGRATION: Add Vehicle Fields to Existing Records")
    print("=" * 80)
    if dry_run:
        print("⚠️  DRY RUN MODE - No changes will be made")
    else:
        print("✓ LIVE MODE - Changes will be applied")
    print()
    
    results = {
        "transport_inward": {"updated": 0, "total": 0},
        "transport_outward": {"updated": 0, "total": 0, "vehicle_type": 0, "driver_name": 0},
        "delivery_orders": {"updated": 0, "total": 0}
    }
    
    # 1. Update TransportInward records - add vehicle_type if missing
    print("1. Processing TransportInward records...")
    inward_count = await db.transport_inward.count_documents({})
    inward_missing = await db.transport_inward.count_documents({"vehicle_type": {"$exists": False}})
    print(f"   Total records: {inward_count}")
    print(f"   Missing vehicle_type: {inward_missing}")
    
    if inward_missing > 0:
        if not dry_run:
            inward_result = await db.transport_inward.update_many(
                {"vehicle_type": {"$exists": False}},
                {"$set": {"vehicle_type": None}}
            )
            results["transport_inward"]["updated"] = inward_result.modified_count
            print(f"   ✓ Updated {inward_result.modified_count} records")
        else:
            results["transport_inward"]["updated"] = inward_missing
            print(f"   [DRY RUN] Would update {inward_missing} records")
    else:
        print("   ✓ All records already have vehicle_type")
    
    results["transport_inward"]["total"] = inward_count
    print()
    
    # 2. Update TransportOutward records - add vehicle_type and driver_name if missing
    print("2. Processing TransportOutward records...")
    outward_count = await db.transport_outward.count_documents({})
    outward_missing_vehicle_type = await db.transport_outward.count_documents({"vehicle_type": {"$exists": False}})
    outward_missing_driver_name = await db.transport_outward.count_documents({"driver_name": {"$exists": False}})
    print(f"   Total records: {outward_count}")
    print(f"   Missing vehicle_type: {outward_missing_vehicle_type}")
    print(f"   Missing driver_name: {outward_missing_driver_name}")
    
    if outward_missing_vehicle_type > 0:
        if not dry_run:
            outward_vehicle_type_result = await db.transport_outward.update_many(
                {"vehicle_type": {"$exists": False}},
                {"$set": {"vehicle_type": None}}
            )
            results["transport_outward"]["vehicle_type"] = outward_vehicle_type_result.modified_count
            print(f"   ✓ Updated vehicle_type in {outward_vehicle_type_result.modified_count} records")
        else:
            results["transport_outward"]["vehicle_type"] = outward_missing_vehicle_type
            print(f"   [DRY RUN] Would update vehicle_type in {outward_missing_vehicle_type} records")
    else:
        print("   ✓ All records already have vehicle_type")
    
    if outward_missing_driver_name > 0:
        if not dry_run:
            outward_driver_result = await db.transport_outward.update_many(
                {"driver_name": {"$exists": False}},
                {"$set": {"driver_name": None}}
            )
            results["transport_outward"]["driver_name"] = outward_driver_result.modified_count
            print(f"   ✓ Updated driver_name in {outward_driver_result.modified_count} records")
        else:
            results["transport_outward"]["driver_name"] = outward_missing_driver_name
            print(f"   [DRY RUN] Would update driver_name in {outward_missing_driver_name} records")
    else:
        print("   ✓ All records already have driver_name")
    
    results["transport_outward"]["updated"] = max(
        results["transport_outward"]["vehicle_type"],
        results["transport_outward"]["driver_name"]
    )
    results["transport_outward"]["total"] = outward_count
    print()
    
    # 3. Update DeliveryOrder records - add vehicle_type if missing
    # Also try to populate from related transport_outward records
    print("3. Processing DeliveryOrder records...")
    do_count = await db.delivery_orders.count_documents({})
    do_missing = await db.delivery_orders.count_documents({"vehicle_type": {"$exists": False}})
    print(f"   Total records: {do_count}")
    print(f"   Missing vehicle_type: {do_missing}")
    
    if do_missing > 0:
        if not dry_run:
            # First, set vehicle_type to None for all missing records
            do_result = await db.delivery_orders.update_many(
                {"vehicle_type": {"$exists": False}},
                {"$set": {"vehicle_type": None}}
            )
            results["delivery_orders"]["updated"] = do_result.modified_count
            print(f"   ✓ Added vehicle_type field to {do_result.modified_count} records")
            
            # Try to populate from related transport_outward records
            print("   Attempting to populate from transport records...")
            dos = await db.delivery_orders.find({}, {"_id": 0}).to_list(1000)
            populated_count = 0
            
            for do in dos:
                job_order_id = do.get("job_order_id")
                if not job_order_id:
                    continue
                
                # Find transport_outward record linked to this job
                transport = await db.transport_outward.find_one(
                    {"job_order_id": job_order_id},
                    {"_id": 0, "vehicle_type": 1, "vehicle_number": 1, "driver_name": 1}
                )
                
                if transport:
                    update_fields = {}
                    if transport.get("vehicle_type") and not do.get("vehicle_type"):
                        update_fields["vehicle_type"] = transport.get("vehicle_type")
                    if transport.get("vehicle_number") and not do.get("vehicle_number"):
                        update_fields["vehicle_number"] = transport.get("vehicle_number")
                    if transport.get("driver_name") and not do.get("driver_name"):
                        update_fields["driver_name"] = transport.get("driver_name")
                    
                    if update_fields:
                        await db.delivery_orders.update_one(
                            {"id": do.get("id")},
                            {"$set": update_fields}
                        )
                        populated_count += 1
                        print(f"   ✓ Populated DO {do.get('do_number', 'unknown')} from transport record")
            
            if populated_count > 0:
                print(f"   ✓ Populated {populated_count} delivery orders from transport records")
        else:
            results["delivery_orders"]["updated"] = do_missing
            print(f"   [DRY RUN] Would update {do_missing} records")
            print(f"   [DRY RUN] Would attempt to populate from transport records")
    else:
        print("   ✓ All records already have vehicle_type")
    
    results["delivery_orders"]["total"] = do_count
    print()
    
    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"TransportInward:")
    print(f"  Total: {results['transport_inward']['total']}")
    print(f"  Updated: {results['transport_inward']['updated']}")
    print()
    print(f"TransportOutward:")
    print(f"  Total: {results['transport_outward']['total']}")
    print(f"  Updated vehicle_type: {results['transport_outward']['vehicle_type']}")
    print(f"  Updated driver_name: {results['transport_outward']['driver_name']}")
    print()
    print(f"DeliveryOrders:")
    print(f"  Total: {results['delivery_orders']['total']}")
    print(f"  Updated: {results['delivery_orders']['updated']}")
    print()
    
    total_updated = (
        results["transport_inward"]["updated"] +
        results["transport_outward"]["updated"] +
        results["delivery_orders"]["updated"]
    )
    print(f"Total records updated: {total_updated}")
    
    if dry_run:
        print()
        print("⚠️  This was a dry run. Run with --execute to apply changes.")
    
    return total_updated

async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Add vehicle fields to existing transport and delivery order records')
    parser.add_argument('--execute', action='store_true', help='Actually apply changes (default is dry-run)')
    
    args = parser.parse_args()
    dry_run = not args.execute
    
    try:
        await migrate_vehicle_fields(dry_run=dry_run)
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

