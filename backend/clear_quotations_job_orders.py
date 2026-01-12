"""
Script to clear all quotations and job orders from the database.
WARNING: This is a destructive operation and cannot be undone!
"""
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def clear_data():
    """Clear all quotations and job orders from the database"""
    # Connect to MongoDB using same configuration as server.py
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'erp_emergent')
    
    print(f"Connecting to MongoDB: {mongo_url}")
    print(f"Database: {db_name}")
    print()
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Count current records
        quotations_count = await db.quotations.count_documents({})
        job_orders_count = await db.job_orders.count_documents({})
        
        print(f"Current records:")
        print(f"  - Quotations: {quotations_count}")
        print(f"  - Job Orders: {job_orders_count}")
        print()
        
        if quotations_count == 0 and job_orders_count == 0:
            print("✅ No records to delete. Database is already empty.")
            return
        
        # Confirm deletion
        response = input("⚠️  WARNING: This will permanently delete all quotations and job orders!\n"
                        "Type 'YES' to confirm deletion: ")
        
        if response != 'YES':
            print("❌ Deletion cancelled.")
            return
        
        print()
        print("Deleting records...")
        
        # Delete all quotations
        if quotations_count > 0:
            quotations_result = await db.quotations.delete_many({})
            print(f"✅ Deleted {quotations_result.deleted_count} quotations")
        else:
            print("✅ No quotations to delete")
        
        # Delete all job orders
        if job_orders_count > 0:
            job_orders_result = await db.job_orders.delete_many({})
            print(f"✅ Deleted {job_orders_result.deleted_count} job orders")
        else:
            print("✅ No job orders to delete")
        
        print()
        print("✅ Data cleared successfully!")
        
        # Verify deletion
        remaining_quotations = await db.quotations.count_documents({})
        remaining_job_orders = await db.job_orders.count_documents({})
        
        print()
        print("Verification:")
        print(f"  - Remaining Quotations: {remaining_quotations}")
        print(f"  - Remaining Job Orders: {remaining_job_orders}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise
    finally:
        client.close()
        print()
        print("Database connection closed.")

if __name__ == "__main__":
    print("=" * 60)
    print("Clear Quotations and Job Orders Script")
    print("=" * 60)
    print()
    asyncio.run(clear_data())

