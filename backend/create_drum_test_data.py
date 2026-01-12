"""
Create sample job orders for drum scheduling testing
This integrates with the existing ERP flow
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone, timedelta
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def generate_id():
    return str(uuid.uuid4())

async def get_sequence(collection_name: str, prefix: str = "") -> str:
    """Generate next sequence number"""
    counter = await db.counters.find_one_and_update(
        {"_id": collection_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq = counter.get("seq", 1)
    return f"{prefix}{seq:06d}" if prefix else str(seq)

async def create_test_workflow():
    """Create complete test workflow: Customer -> Quotation -> Sales Order -> Job Orders"""
    
    print("=" * 60)
    print("CREATING DRUM SCHEDULING TEST WORKFLOW")
    print("=" * 60)
    
    # Step 1: Get products and packaging
    products = await db.products.find({"type": "MANUFACTURED"}, {"_id": 0}).to_list(10)
    packaging = await db.packaging.find({"category": "DRUM"}, {"_id": 0}).limit(1).to_list(1)
    
    if not products:
        print("❌ No MANUFACTURED products found. Run seed_production_data.py first.")
        return
    
    if not packaging:
        print("❌ No DRUM packaging found. Run seed_production_data.py first.")
        return
    
    product = products[0]
    drum = packaging[0]
    
    print(f"\n1. Using product: {product['name']}")
    print(f"   Using packaging: {drum['name']}")
    
    # Step 2: Create customer
    customer_id = generate_id()
    customer = {
        "id": customer_id,
        "name": "Drum Test Customer LLC",
        "company": "Drum Test Co",
        "email": "drum@test.com",
        "phone": "+971501234567",
        "country": "UAE",
        "customer_type": "local",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing_customer = await db.customers.find_one({"email": customer["email"]})
    if not existing_customer:
        await db.customers.insert_one(customer)
        print(f"\n2. Created customer: {customer['name']}")
    else:
        customer = existing_customer
        customer_id = customer['id']
        print(f"\n2. Using existing customer: {customer['name']}")
    
    # Step 3: Create quotation
    pfi_number = await get_sequence("quotations", "PFI-")
    quotation_id = generate_id()
    quotation = {
        "id": quotation_id,
        "pfi_number": pfi_number,
        "customer_id": customer_id,
        "customer_name": customer['name'],
        "currency": "USD",
        "order_type": "local",
        "payment_terms": "CAD",
        "items": [{
            "product_id": product['id'],
            "product_name": product['name'],
            "quantity": 100,  # 100 drums
            "unit_price": product['price_usd'],
            "total": 100 * product['price_usd']
        }],
        "total": 100 * product['price_usd'],
        "status": "approved",
        "created_by": "admin",
        "approved_by": "finance",
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.quotations.insert_one(quotation)
    print(f"\n3. Created and approved quotation: {pfi_number}")
    
    # Step 4: Create sales order
    spa_number = await get_sequence("sales_orders", "SPA-")
    sales_order_id = generate_id()
    sales_order = {
        "id": sales_order_id,
        "spa_number": spa_number,
        "quotation_id": quotation_id,
        "customer_id": customer_id,
        "customer_name": customer['name'],
        "currency": "USD",
        "order_type": "local",
        "payment_terms": "CAD",
        "items": quotation["items"],
        "total": quotation["total"],
        "payment_status": "paid",
        "amount_paid": quotation["total"],
        "balance": 0,
        "created_by": "admin",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sales_orders.insert_one(sales_order)
    print(f"\n4. Created sales order: {spa_number}")
    
    # Step 5: Create job order for drums
    job_number = await get_sequence("job_orders", "JOB-")
    job_order_id = generate_id()
    
    # Get product BOM
    product_bom = await db.product_boms.find_one({
        "product_id": product['id'],
        "is_active": True
    }, {"_id": 0})
    
    bom_items = []
    if product_bom:
        bom_item_docs = await db.product_bom_items.find(
            {"bom_id": product_bom['id']},
            {"_id": 0}
        ).to_list(100)
        
        for bom_item in bom_item_docs:
            material = await db.inventory_items.find_one({"id": bom_item['material_item_id']}, {"_id": 0})
            if material:
                # Calculate required quantity for 100 drums
                # Assuming 180 kg per drum (from net_weight_kg_default)
                finished_kg = 100 * drum.get('net_weight_kg_default', 180)
                required_kg = finished_kg * bom_item['qty_kg_per_kg_finished']
                
                bom_items.append({
                    "material_id": material['id'],
                    "material_name": material['name'],
                    "required_quantity": required_kg,
                    "available_quantity": 50000,  # We set this in inventory
                    "unit": material['uom'],
                    "status": "available"
                })
    
    delivery_date = datetime.now(timezone.utc) + timedelta(days=14)
    
    job_order = {
        "id": job_order_id,
        "job_number": job_number,
        "spa_number": spa_number,
        "sales_order_id": sales_order_id,
        "product_id": product['id'],
        "product_name": product['name'],
        "quantity": 100,  # 100 drums
        "packaging_type": "DRUM",  # Add this field for drum scheduling
        "packaging_id": drum['id'],  # Add this field
        "delivery_date": delivery_date.isoformat(),  # Add this field
        "bom": bom_items,
        "priority": "normal",
        "status": "pending",
        "procurement_status": "not_required",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.job_orders.insert_one(job_order)
    print(f"\n5. Created job order: {job_number}")
    print(f"   - Product: {product['name']}")
    print(f"   - Quantity: 100 drums ({drum['name']})")
    print(f"   - Delivery Date: {delivery_date.date()}")
    print(f"   - BOM Items: {len(bom_items)}")
    
    # Create another job order for variety
    job_number2 = await get_sequence("job_orders", "JOB-")
    job_order_id2 = generate_id()
    
    product2 = products[1] if len(products) > 1 else products[0]
    product_bom2 = await db.product_boms.find_one({
        "product_id": product2['id'],
        "is_active": True
    }, {"_id": 0})
    
    bom_items2 = []
    if product_bom2:
        bom_item_docs2 = await db.product_bom_items.find(
            {"bom_id": product_bom2['id']},
            {"_id": 0}
        ).to_list(100)
        
        for bom_item in bom_item_docs2:
            material = await db.inventory_items.find_one({"id": bom_item['material_item_id']}, {"_id": 0})
            if material:
                finished_kg = 150 * drum.get('net_weight_kg_default', 180)
                required_kg = finished_kg * bom_item['qty_kg_per_kg_finished']
                
                bom_items2.append({
                    "material_id": material['id'],
                    "material_name": material['name'],
                    "required_quantity": required_kg,
                    "available_quantity": 50000,
                    "unit": material['uom'],
                    "status": "available"
                })
    
    job_order2 = {
        "id": job_order_id2,
        "job_number": job_number2,
        "spa_number": spa_number,
        "sales_order_id": sales_order_id,
        "product_id": product2['id'],
        "product_name": product2['name'],
        "quantity": 150,  # 150 drums
        "packaging_type": "DRUM",
        "packaging_id": drum['id'],
        "delivery_date": delivery_date.isoformat(),
        "bom": bom_items2,
        "priority": "high",
        "status": "pending",
        "procurement_status": "not_required",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.job_orders.insert_one(job_order2)
    print(f"\n6. Created second job order: {job_number2}")
    print(f"   - Product: {product2['name']}")
    print(f"   - Quantity: 150 drums ({drum['name']})")
    
    print("\n" + "=" * 60)
    print("✅ TEST WORKFLOW CREATED SUCCESSFULLY!")
    print("=" * 60)
    print("\nYou can now:")
    print(f"1. View job orders at: /job-orders")
    print(f"2. Regenerate drum schedule for week starting Monday")
    print(f"3. View the schedule at: /drum-schedule")
    print(f"\nJob Orders created: {job_number}, {job_number2}")
    print(f"Total drums: 250 drums (within 600/day capacity)")

async def main():
    try:
        await create_test_workflow()
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())
