#!/usr/bin/env python3
"""
Migration script to backfill net_weight_kg in existing job orders from sales orders.
This fixes job orders created before the net_weight_kg preservation feature was implemented.

Usage: python migrate_net_weight_to_job_orders.py [--execute]
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

async def migrate_net_weight(dry_run=True):
    """Backfill net_weight_kg in job orders from sales orders"""
    
    print("=" * 80)
    print("MIGRATION: Backfill net_weight_kg in Job Orders")
    print("=" * 80)
    if dry_run:
        print("⚠️  DRY RUN MODE - No changes will be made")
    else:
        print("✓ LIVE MODE - Changes will be applied")
    print()
    
    # Get all job orders with net_weight_kg = None or not set
    jobs = await db.job_orders.find({
        "$or": [
            {"net_weight_kg": {"$exists": False}},
            {"net_weight_kg": None}
        ]
    }, {"_id": 0}).to_list(1000)
    
    print(f"Found {len(jobs)} job order(s) without net_weight_kg")
    print()
    
    updated = 0
    skipped = 0
    errors = 0
    
    for job in jobs:
        job_id = job.get("id")
        job_number = job.get("job_number", "Unknown")
        product_name = job.get("product_name", "Unknown")
        packaging = job.get("packaging", "Bulk")
        sales_order_id = job.get("sales_order_id")
        
        if not sales_order_id:
            print(f"  ⚠️  {job_number} ({product_name}): No sales order ID, skipping")
            skipped += 1
            continue
        
        # Get sales order
        sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
        if not sales_order:
            print(f"  ⚠️  {job_number} ({product_name}): Sales order not found, skipping")
            skipped += 1
            continue
        
        # Find matching item in sales order
        net_weight_kg = None
        items = sales_order.get("items", [])
        
        if items:
            # Multiple items - find matching product
            matching_item = next((item for item in items if item.get("product_name") == product_name), None)
            if matching_item:
                net_weight_kg = matching_item.get("net_weight_kg")
        else:
            # Single product sales order
            if sales_order.get("product_name") == product_name:
                net_weight_kg = sales_order.get("net_weight_kg")
        
        # Determine what to set
        if net_weight_kg is not None:
            # Found net_weight_kg in sales order
            if not dry_run:
                await db.job_orders.update_one(
                    {"id": job_id},
                    {"$set": {
                        "net_weight_kg": net_weight_kg,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            print(f"  ✓ {job_number} ({product_name}, {packaging}): Set net_weight_kg = {net_weight_kg}")
            updated += 1
        elif packaging == "Bulk":
            # Bulk packaging - set to None explicitly
            if not dry_run:
                await db.job_orders.update_one(
                    {"id": job_id},
                    {"$set": {
                        "net_weight_kg": None,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            print(f"  = {job_number} ({product_name}, {packaging}): Already None (Bulk), no change needed")
            skipped += 1
        else:
            # Not found in sales order and not Bulk - this is an issue
            print(f"  ❌ {job_number} ({product_name}, {packaging}): net_weight_kg not found in sales order!")
            print(f"     Will default to 200 in calculations")
            errors += 1
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total job orders checked: {len(jobs)}")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")
    print(f"Errors: {errors}")
    
    if dry_run:
        print()
        print("⚠️  This was a dry run. Run with --execute to apply changes.")
    
    return updated

async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Backfill net_weight_kg in job orders from sales orders')
    parser.add_argument('--execute', action='store_true', help='Actually apply changes (default is dry-run)')
    
    args = parser.parse_args()
    dry_run = not args.execute
    
    try:
        await migrate_net_weight(dry_run=dry_run)
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

