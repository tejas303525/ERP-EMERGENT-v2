#!/usr/bin/env python3
"""
Quick script to delete ALL shipping bookings.
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

async def delete_all_bookings():
    """Delete all shipping bookings"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Connecting to database: {db_name}")
    
    # Count bookings first
    count = await db.shipping_bookings.count_documents({})
    print(f"Found {count} shipping booking(s)")
    
    if count == 0:
        print("No bookings to delete.")
        client.close()
        return
    
    # Delete all bookings
    result = await db.shipping_bookings.delete_many({})
    print(f"✓ Deleted {result.deleted_count} booking(s)")
    
    # Also clean up references in job_orders
    print("\nCleaning up references in job_orders...")
    result = await db.job_orders.update_many(
        {},
        {"$unset": {"shipping_booking_id": "", "transport_outward_id": ""}}
    )
    print(f"✓ Removed shipping/transport references from {result.modified_count} job orders")
    
    # Also delete transport schedules related to bookings
    transport_schedules_count = await db.transport_schedules.count_documents({})
    if transport_schedules_count > 0:
        result = await db.transport_schedules.delete_many({})
        print(f"✓ Deleted {result.deleted_count} transport schedule(s)")
    
    # Also delete transport outward records related to bookings
    transport_outward_count = await db.transport_outward.count_documents({})
    if transport_outward_count > 0:
        result = await db.transport_outward.delete_many({})
        print(f"✓ Deleted {result.deleted_count} transport outward record(s)")
    
    client.close()
    print("\nDone! All bookings deleted.")

if __name__ == "__main__":
    asyncio.run(delete_all_bookings())

