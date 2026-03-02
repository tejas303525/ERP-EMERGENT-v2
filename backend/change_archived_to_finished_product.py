"""
Script to change all products with category "archived" to "finished_product"
"""
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def change_archived_to_finished_product():
    """Change all products with category 'archived' to 'finished_product'"""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'erp_emergent')
    
    print("=" * 80)
    print("CHANGE ARCHIVED PRODUCTS TO FINISHED_PRODUCT")
    print("=" * 80)
    print()
    print(f"Connecting to MongoDB: {mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url}")
    print(f"Database: {db_name}")
    print()
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Count products with archived category
        archived_count = await db.products.count_documents({"category": "archived"})
        
        print(f"📊 CURRENT STATUS:")
        print(f"   Products with 'archived' category: {archived_count}")
        print()
        
        if archived_count == 0:
            print("✅ No products with 'archived' category found. Nothing to change.")
            return
        
        # Confirm operation
        print("⚠️  WARNING: This will change all products with category 'archived' to 'finished_product'.")
        print()
        
        response = input("Type 'YES' to confirm: ")
        
        if response != 'YES':
            print("❌ Operation cancelled.")
            return
        
        print()
        print("🔄 CHANGING CATEGORIES...")
        print("-" * 80)
        
        # Update all products with archived category to finished_product
        result = await db.products.update_many(
            {"category": "archived"},
            {"$set": {
                "category": "finished_product",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        print(f"✅ Changed {result.modified_count} products from 'archived' to 'finished_product'")
        
        # Verify the change
        remaining_archived = await db.products.count_documents({"category": "archived"})
        finished_product_count = await db.products.count_documents({"category": "finished_product"})
        
        print()
        print("✅ OPERATION COMPLETE!")
        print()
        print("📋 SUMMARY:")
        print(f"   • Products changed: {result.modified_count}")
        print(f"   • Remaining 'archived' products: {remaining_archived}")
        print(f"   • Total 'finished_product' products: {finished_product_count}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise
    finally:
        client.close()
        print()
        print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(change_archived_to_finished_product())

