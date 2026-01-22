#!/usr/bin/env python3
"""
Quick script to check what bookings still exist and optionally delete them.
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

async def check_and_cleanup():
    """Check what bookings exist and optionally delete them"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Checking database: {db_name}\n")
    
    # Check shipping bookings
    bookings = await db.shipping_bookings.find({}, {"_id": 0, "booking_number": 1, "status": 1, "po_id": 1, "po_number": 1, "po_ids": 1}).to_list(1000)
    
    if bookings:
        print(f"Found {len(bookings)} shipping booking(s):")
        print("-" * 60)
        for b in bookings:
            po_refs = []
            if b.get("po_id"):
                po_refs.append(f"po_id: {b['po_id']}")
            if b.get("po_number"):
                po_refs.append(f"po_number: {b['po_number']}")
            if b.get("po_ids"):
                po_refs.append(f"po_ids: {b['po_ids']}")
            
            po_info = f" | PO refs: {', '.join(po_refs)}" if po_refs else ""
            print(f"  - {b.get('booking_number', 'N/A')} (status: {b.get('status', 'N/A')}){po_info}")
        print("-" * 60)
        
        response = input(f"\nDelete all {len(bookings)} booking(s)? (yes/no): ")
        if response.lower() in ['yes', 'y']:
            result = await db.shipping_bookings.delete_many({})
            print(f"✓ Deleted {result.deleted_count} booking(s)")
        else:
            print("No bookings deleted.")
    else:
        print("✓ No shipping bookings found")
    
    # Check purchase orders
    pos = await db.purchase_orders.find({}, {"_id": 0, "po_number": 1, "status": 1}).to_list(1000)
    if pos:
        print(f"\nFound {len(pos)} purchase order(s)")
        approved = [po for po in pos if po.get("status") == "APPROVED"]
        print(f"  - {len(approved)} APPROVED")
        print(f"  - {len(pos) - len(approved)} other status")
        
        if approved:
            print("\nApproved POs:")
            for po in approved[:10]:  # Show first 10
                print(f"  - {po.get('po_number', 'N/A')}")
            if len(approved) > 10:
                print(f"  ... and {len(approved) - 10} more")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_and_cleanup())

