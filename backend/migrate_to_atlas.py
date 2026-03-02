"""
Migrate manufacturing_erp database from localhost to MongoDB Atlas
This script copies all collections and documents from local MongoDB to Atlas
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import AutoReconnect, ServerSelectionTimeoutError
from dotenv import load_dotenv
import os
from pathlib import Path
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Local MongoDB
LOCAL_URI = "mongodb://localhost:27017"
LOCAL_DB_NAME = "manufacturing_erp"

# Atlas MongoDB - Update this with your actual connection string
# Get it from: MongoDB Atlas -> Connect -> Connect your application
# Format: mongodb+srv://username:password@erp.0vkf5b2.mongodb.net/manufacturing_erp?retryWrites=true&w=majority
ATLAS_URI = os.environ.get('ATLAS_URI') or "mongodb+srv://admin:admin%40123@erp.0vkf5b2.mongodb.net/manufacturing_erp?retryWrites=true&w=majority"
ATLAS_DB_NAME = "manufacturing_erp"

async def get_collection_stats(db, collection_name):
    """Get document count for a collection"""
    try:
        count = await db[collection_name].count_documents({})
        return count
    except Exception as e:
        return 0

async def migrate_collection(local_db, atlas_db, collection_name, drop_existing=False):
    """Copy a collection from local to Atlas"""
    print(f"\n📦 Migrating collection: {collection_name}")
    
    try:
        # Get document count from local
        local_count = await get_collection_stats(local_db, collection_name)
        print(f"   Local documents: {local_count}")
        
        if local_count == 0:
            print(f"   ⚠️  Skipping (no documents)")
            return
        
        # Drop existing collection in Atlas if requested
        if drop_existing:
            try:
                await atlas_db[collection_name].drop()
                print(f"   🗑️  Dropped existing collection in Atlas")
            except Exception as e:
                print(f"   ℹ️  Could not drop collection (may not exist): {e}")
        
        # Get all documents from local
        print(f"   📥 Reading documents from local...")
        cursor = local_db[collection_name].find({})
        documents = await cursor.to_list(length=None)
        
        if not documents:
            print(f"   ⚠️  No documents to migrate")
            return
        
        # Remove _id field to avoid conflicts (MongoDB will generate new ones)
        # Or keep _id if you want to preserve them
        for doc in documents:
            # Keep the _id field to preserve document IDs
            pass
        
        # Insert into Atlas in smaller batches with retry logic
        batch_size = 100  # Reduced from 1000 to avoid connection timeouts
        total_inserted = 0
        
        print(f"   📤 Inserting {len(documents)} documents into Atlas...")
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            batch_num = i//batch_size + 1
            
            # Retry logic for connection errors
            max_retries = 5
            retry_delay = 1  # Start with 1 second
            
            for attempt in range(max_retries):
                try:
                    result = await atlas_db[collection_name].insert_many(batch, ordered=False)
                    total_inserted += len(result.inserted_ids)
                    print(f"   ✅ Inserted batch {batch_num} ({total_inserted}/{len(documents)} documents)")
                    break  # Success, exit retry loop
                    
                except (AutoReconnect, ServerSelectionTimeoutError, OSError) as e:
                    if attempt < max_retries - 1:
                        wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                        print(f"   ⚠️  Connection error on batch {batch_num}, attempt {attempt + 1}/{max_retries}. Retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                    else:
                        print(f"   ❌ Failed to insert batch {batch_num} after {max_retries} attempts: {e}")
                        raise
                except Exception as e:
                    print(f"   ❌ Error inserting batch {batch_num}: {e}")
                    raise
            
            # Small delay between batches to avoid overwhelming the connection
            if i + batch_size < len(documents):
                await asyncio.sleep(0.1)
        
        # Verify the import
        atlas_count = await get_collection_stats(atlas_db, collection_name)
        print(f"   ✅ Migration complete! Atlas documents: {atlas_count}")
        
        if atlas_count != local_count:
            print(f"   ⚠️  WARNING: Document count mismatch! Local: {local_count}, Atlas: {atlas_count}")
        
    except Exception as e:
        print(f"   ❌ Error migrating {collection_name}: {e}")
        import traceback
        traceback.print_exc()

async def main():
    print("=" * 60)
    print("MongoDB Migration: localhost -> Atlas")
    print("=" * 60)
    print(f"Local: {LOCAL_URI}/{LOCAL_DB_NAME}")
    print(f"Atlas: {ATLAS_URI.split('@')[1] if '@' in ATLAS_URI else 'Not configured'}")
    print("=" * 60)
    
    # Check if Atlas URI is configured
    if "YOUR_PASSWORD" in ATLAS_URI:
        print("\n❌ ERROR: Please configure your Atlas connection string!")
        print("\nOption 1: Set ATLAS_URI in your .env file:")
        print("   ATLAS_URI=mongodb+srv://username:password@erp.0vkf5b2.mongodb.net/manufacturing_erp?retryWrites=true&w=majority")
        print("\nOption 2: Update ATLAS_URI in this script directly")
        return
    
    # Connect to databases
    print("\n🔌 Connecting to databases...")
    try:
        local_client = AsyncIOMotorClient(LOCAL_URI, serverSelectionTimeoutMS=5000)
        await local_client.admin.command('ping')
        print("   ✅ Connected to local MongoDB")
    except Exception as e:
        print(f"   ❌ Failed to connect to local MongoDB: {e}")
        print("   Make sure MongoDB is running on localhost:27017")
        return
    
    try:
        # Enhanced connection settings for better reliability
        atlas_client = AsyncIOMotorClient(
            ATLAS_URI,
            serverSelectionTimeoutMS=30000,  # Increased from 10000
            connectTimeoutMS=30000,
            socketTimeoutMS=60000,  # Allow longer for operations
            maxPoolSize=10,  # Limit connection pool
            retryWrites=True,
            retryReads=True
        )
        await atlas_client.admin.command('ping')
        print("   ✅ Connected to MongoDB Atlas")
    except Exception as e:
        print(f"   ❌ Failed to connect to MongoDB Atlas: {e}")
        print("   Check your connection string and network access settings")
        return
    
    local_db = local_client[LOCAL_DB_NAME]
    atlas_db = atlas_client[ATLAS_DB_NAME]
    
    # Get all collection names from local database
    print("\n📋 Discovering collections...")
    collections = await local_db.list_collection_names()
    
    if not collections:
        print("   ⚠️  No collections found in local database")
        return
    
    print(f"   Found {len(collections)} collections:")
    for col in collections:
        count = await get_collection_stats(local_db, col)
        print(f"      - {col}: {count} documents")
    
    # Ask for confirmation
    print("\n" + "=" * 60)
    print("⚠️  WARNING: This will migrate all data to Atlas")
    print("   Existing collections in Atlas will be replaced if they exist")
    print("=" * 60)
    
    response = input("\nDo you want to proceed? (yes/no): ").strip().lower()
    if response not in ['yes', 'y']:
        print("Migration cancelled.")
        return
    
    # Ask about dropping existing collections
    drop_response = input("Drop existing collections in Atlas before importing? (yes/no, default: yes): ").strip().lower()
    drop_existing = drop_response in ['yes', 'y', '']
    
    print("\n🚀 Starting migration...")
    print("=" * 60)
    
    start_time = datetime.now()
    
    # Migrate each collection
    success_count = 0
    error_count = 0
    
    for collection_name in collections:
        try:
            await migrate_collection(local_db, atlas_db, collection_name, drop_existing)
            success_count += 1
        except Exception as e:
            print(f"   ❌ Failed to migrate {collection_name}: {e}")
            error_count += 1
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Migration Summary")
    print("=" * 60)
    print(f"   Collections migrated: {success_count}/{len(collections)}")
    print(f"   Errors: {error_count}")
    print(f"   Duration: {duration:.2f} seconds")
    
    # Verify final counts
    print("\n📈 Final Verification:")
    print("-" * 60)
    for collection_name in collections:
        local_count = await get_collection_stats(local_db, collection_name)
        atlas_count = await get_collection_stats(atlas_db, collection_name)
        status = "✅" if local_count == atlas_count else "⚠️"
        print(f"   {status} {collection_name}: Local={local_count}, Atlas={atlas_count}")
    
    print("\n✅ Migration complete!")
    print("\nNext steps:")
    print("1. Verify data in MongoDB Compass (connect to Atlas)")
    print("2. Update your .env file with Atlas connection string:")
    print("   MONGO_URL=mongodb+srv://username:password@erp.0vkf5b2.mongodb.net/manufacturing_erp?retryWrites=true&w=majority")
    print("   DB_NAME=manufacturing_erp")
    print("3. Restart your backend server")
    
    # Close connections
    local_client.close()
    atlas_client.close()

if __name__ == "__main__":
    asyncio.run(main())

