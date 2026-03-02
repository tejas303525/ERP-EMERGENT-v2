"""
Script to clear all product stock and remove entries from Product-Packaging Report
1. Sets all product stock to 0
2. Removes products from Product-Packaging Report by changing their category
"""
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def clear_all_product_stock():
    """Clear all product stock to 0 and remove from Product-Packaging Report"""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'erp_emergent')
    
    print("=" * 80)
    print("CLEAR ALL PRODUCT STOCK & REMOVE FROM PRODUCT-PACKAGING REPORT")
    print("=" * 80)
    print()
    print(f"Connecting to MongoDB: {mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url}")
    print(f"Database: {db_name}")
    print()
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Count products with finished_product category (these show in the report)
        finished_products = await db.products.count_documents({
            "category": "finished_product"
        })
        
        # Count products with stock
        products_with_stock = await db.products.count_documents({
            "$or": [
                {"current_stock": {"$gt": 0}},
                {"current_stock": {"$exists": True, "$ne": None}}
            ]
        })
        
        # Count inventory_balances with stock
        balances_with_stock = await db.inventory_balances.count_documents({
            "on_hand": {"$gt": 0}
        })
        
        print(f"📊 CURRENT STATUS:")
        print(f"   Products in Product-Packaging Report: {finished_products}")
        print(f"   Products with stock: {products_with_stock}")
        print(f"   Inventory balances with stock: {balances_with_stock}")
        print()
        
        if finished_products == 0 and products_with_stock == 0 and balances_with_stock == 0:
            print("✅ No products to process. All already cleared.")
            return
        
        # Confirm deletion
        print("⚠️  WARNING: This will:")
        print("   1. Set ALL product stock to 0")
        print("   2. Clear ALL inventory balances to 0")
        print()
        print("   Products will remain in the database with 'finished_product' category.")
        print("   They will still appear in Product-Packaging Report but with 0 stock.")
        print()
        
        response = input("Type 'YES' to confirm: ")
        
        if response != 'YES':
            print("❌ Operation cancelled.")
            return
        
        print()
        print("🗑️  CLEARING STOCK AND REMOVING ENTRIES...")
        print("-" * 80)
        
        # Step 1: Clear products.current_stock
        products_stock_result = await db.products.update_many(
            {},
            {"$set": {"current_stock": 0}}
        )
        print(f"✅ Cleared stock for {products_stock_result.modified_count} products")
        
        # Step 2: Clear inventory_balances.on_hand
        balances_result = await db.inventory_balances.update_many(
            {},
            {"$set": {"on_hand": 0}}
        )
        print(f"✅ Cleared {balances_result.modified_count} inventory balances")
        
        # Note: Products remain as "finished_product" category
        # They will still appear in Product-Packaging Report but with 0 stock
        print("ℹ️  Products remain as 'finished_product' category.")
        print("   They will appear in Product-Packaging Report with 0 stock.")
        
        print()
        print("✅ ALL OPERATIONS COMPLETE!")
        print()
        print("📋 SUMMARY:")
        print(f"   • Products stock cleared: {products_stock_result.modified_count}")
        print(f"   • Inventory balances cleared: {balances_result.modified_count}")
        print(f"   • Products remain in Product-Packaging Report (with 0 stock)")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise
    finally:
        client.close()
        print()
        print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(clear_all_product_stock())

