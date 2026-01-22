#!/usr/bin/env python3
"""
Cleanup script to remove all shipping, PO, and transportation records.
WARNING: This will permanently delete all data from these collections!
"""

import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME')

if not mongo_url or not db_name:
    print("ERROR: MONGO_URL and DB_NAME must be set in .env file")
    exit(1)

# Collections to clean up
COLLECTIONS_TO_CLEAN = [
    'shipping_bookings',
    'transport_inward',
    'transport_outward',
    'transport_schedules',
    'purchase_orders',
    'imports',
    'import_checklists',
    # Note: transport_routes is kept as it's configuration data
]

async def cleanup_collections():
    """Delete all records from specified collections"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Connecting to database: {db_name}")
    print(f"MongoDB URL: {mongo_url.split('@')[-1] if '@' in mongo_url else 'localhost'}")
    print("\n" + "="*60)
    print("WARNING: This will DELETE ALL records from the following collections:")
    print("="*60)
    for collection in COLLECTIONS_TO_CLEAN:
        count = await db[collection].count_documents({})
        print(f"  - {collection}: {count} records")
    print("="*60)
    
    # Ask for confirmation
    response = input("\nAre you sure you want to proceed? Type 'YES' to confirm: ")
    if response != 'YES':
        print("Cleanup cancelled.")
        client.close()
        return
    
    print("\nStarting cleanup...")
    total_deleted = 0
    
    for collection_name in COLLECTIONS_TO_CLEAN:
        try:
            # Count before deletion
            count_before = await db[collection_name].count_documents({})
            
            # Delete all documents
            result = await db[collection_name].delete_many({})
            deleted_count = result.deleted_count
            
            print(f"✓ {collection_name}: Deleted {deleted_count} records")
            total_deleted += deleted_count
            
        except Exception as e:
            print(f"✗ Error cleaning {collection_name}: {str(e)}")
    
    print("\n" + "="*60)
    print(f"Cleanup complete! Total records deleted: {total_deleted}")
    print("="*60)
    
    # Also clean up references in job_orders
    print("\nCleaning up references in job_orders...")
    try:
        result = await db.job_orders.update_many(
            {},
            {"$unset": {"shipping_booking_id": "", "transport_outward_id": ""}}
        )
        print(f"✓ Removed shipping/transport references from {result.modified_count} job orders")
    except Exception as e:
        print(f"✗ Error cleaning job_orders references: {str(e)}")
    
    client.close()
    print("\nDone!")

if __name__ == "__main__":
    asyncio.run(cleanup_collections())

