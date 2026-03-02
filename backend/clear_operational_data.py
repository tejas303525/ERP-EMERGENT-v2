"""
Comprehensive Database Cleanup Script
Clears all operational data while preserving configuration and master data.

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

# Collections to CLEAR (operational/transactional data)
COLLECTIONS_TO_CLEAR = [
    # Stock/Inventory
    'inventory_items',
    'inventory_balances',
    'inventory_reservations',
    'inventory_movements',
    'stock_adjustments',
    
    # PFI (Purchase Finance Invoice - part of quotations)
    'quotations',
    
    # Shipping
    'shipping_bookings',
    
    # Transportation
    'transport_inward',
    'transport_outward',
    'transport_schedules',
    
    # Import
    'imports',
    'import_checklists',
    
    # Security & QC
    'security_checklists',
    'qc_inspections',
    'qc_batches',
    
    # GRN (Goods Receipt Note)
    'grn',
    
    # DO (Delivery Orders)
    'delivery_orders',
    
    # Finance
    'receivables',
    'payables',
    'bills',
    'invoices',
    'payments',
    
    # Order Fulfillment & Sales Contract
    'sales_orders',
    'job_orders',
    
    # Procurement
    'rfq',
    'purchase_orders',
    'material_shortages',
    
    # Reports
    'blend_reports',
    
    # Notifications
    'notifications',
]

# Collections to PRESERVE (configuration and master data)
COLLECTIONS_TO_PRESERVE = [
    'settings',
    'products',
    'users',
    'roles',
    'customers',
    'companies',
    'counters',
    'product_boms',
    'product_bom_items',
    'packaging_boms',
    'packaging_bom_items',
    'packaging',
    'product_packaging',
    'transport_routes',
]

async def clear_operational_data():
    """Clear all operational/transactional data from the database"""
    # Connect to MongoDB using same configuration as server.py
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'erp_emergent')
    
    print("=" * 80)
    print("COMPREHENSIVE DATABASE CLEANUP SCRIPT")
    print("=" * 80)
    print()
    print(f"Connecting to MongoDB: {mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url}")
    print(f"Database: {db_name}")
    print()
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Count records in each collection before deletion
        print("📊 COUNTING RECORDS IN COLLECTIONS TO BE CLEARED:")
        print("-" * 80)
        collection_counts = {}
        total_records = 0
        
        for collection_name in COLLECTIONS_TO_CLEAR:
            try:
                count = await db[collection_name].count_documents({})
                collection_counts[collection_name] = count
                total_records += count
                if count > 0:
                    print(f"  {collection_name:35} {count:>10} records")
            except Exception as e:
                print(f"  {collection_name:35} {'ERROR':>10} ({str(e)[:30]})")
                collection_counts[collection_name] = 0
        
        print("-" * 80)
        print(f"  {'TOTAL':35} {total_records:>10} records")
        print()
        
        # Show preserved collections
        print("🔒 COLLECTIONS TO BE PRESERVED:")
        print("-" * 80)
        for collection_name in COLLECTIONS_TO_PRESERVE:
            try:
                count = await db[collection_name].count_documents({})
                print(f"  {collection_name:35} {count:>10} records (PRESERVED)")
            except Exception as e:
                print(f"  {collection_name:35} {'N/A':>10} (collection may not exist)")
        print()
        
        if total_records == 0:
            print("✅ No records to delete. Database is already clean.")
            return
        
        # Confirm deletion
        print("⚠️  WARNING: This will permanently delete all operational data!")
        print("   This includes:")
        print("   • Stock/Inventory records")
        print("   • PFI/Quotations")
        print("   • Shipping & Transportation records")
        print("   • Import records")
        print("   • Security & QC records")
        print("   • GRN & Delivery Orders")
        print("   • Finance records (Receivables, Payables, Bills, Invoices, Payments)")
        print("   • Sales Orders & Job Orders")
        print("   • RFQ & Purchase Orders")
        print("   • Reports & Notifications")
        print()
        print("   The following will be PRESERVED:")
        print("   • Settings")
        print("   • Products")
        print("   • Users & Roles")
        print("   • Customers")
        print("   • Companies")
        print("   • BOMs (Product & Packaging)")
        print("   • Packaging types")
        print("   • Transport routes (configuration)")
        print()
        
        response = input("Type 'YES' to confirm deletion: ")
        
        if response != 'YES':
            print("❌ Deletion cancelled.")
            return
        
        print()
        print("🗑️  DELETING RECORDS...")
        print("-" * 80)
        
        total_deleted = 0
        successful_deletions = 0
        failed_deletions = []
        
        for collection_name in COLLECTIONS_TO_CLEAR:
            try:
                count_before = collection_counts.get(collection_name, 0)
                
                if count_before > 0:
                    result = await db[collection_name].delete_many({})
                    deleted_count = result.deleted_count
                    total_deleted += deleted_count
                    successful_deletions += 1
                    print(f"  ✅ {collection_name:35} {deleted_count:>10} records deleted")
                else:
                    print(f"  ⏭️  {collection_name:35} {'0':>10} records (skipped)")
                    
            except Exception as e:
                failed_deletions.append((collection_name, str(e)))
                print(f"  ❌ {collection_name:35} {'ERROR':>10} - {str(e)[:50]}")
        
        print("-" * 80)
        print(f"  {'TOTAL DELETED':35} {total_deleted:>10} records")
        print()
        
        if failed_deletions:
            print("⚠️  FAILED DELETIONS:")
            for collection_name, error in failed_deletions:
                print(f"  • {collection_name}: {error}")
            print()
        
        # Verify deletion
        print("🔍 VERIFICATION:")
        print("-" * 80)
        remaining_total = 0
        for collection_name in COLLECTIONS_TO_CLEAR:
            try:
                remaining = await db[collection_name].count_documents({})
                remaining_total += remaining
                if remaining > 0:
                    print(f"  ⚠️  {collection_name:35} {remaining:>10} records remaining")
            except Exception as e:
                print(f"  ❌ {collection_name:35} {'ERROR':>10} - {str(e)[:50]}")
        
        if remaining_total == 0:
            print("  ✅ All collections cleared successfully!")
        else:
            print(f"  ⚠️  {remaining_total} records still remain in collections to be cleared")
        
        print()
        print("✅ CLEANUP COMPLETE!")
        print()
        print("📋 SUMMARY:")
        print(f"   • Collections processed: {len(COLLECTIONS_TO_CLEAR)}")
        print(f"   • Successful deletions: {successful_deletions}")
        print(f"   • Failed deletions: {len(failed_deletions)}")
        print(f"   • Total records deleted: {total_deleted}")
        print(f"   • Collections preserved: {len(COLLECTIONS_TO_PRESERVE)}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise
    finally:
        client.close()
        print()
        print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(clear_operational_data())

