#!/usr/bin/env python3
"""
Script to trace net_weight_kg flow from quotation → sales order → job order
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

async def trace_net_weight(job_number: str):
    """Trace net_weight_kg from quotation to job order"""
    
    print("=" * 80)
    print(f"TRACING NET_WEIGHT_KG FLOW FOR: {job_number}")
    print("=" * 80)
    print()
    
    # Step 1: Get Job Order
    print("STEP 1: Job Order")
    print("-" * 80)
    job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
    
    if not job:
        print(f"❌ Job order {job_number} not found!")
        return
    
    print(f"✓ Job Order: {job_number}")
    print(f"  - Product: {job.get('product_name', 'N/A')}")
    print(f"  - Quantity: {job.get('quantity', 0)}")
    print(f"  - Packaging: {job.get('packaging', 'N/A')}")
    print(f"  - net_weight_kg: {job.get('net_weight_kg', 'NOT SET')}")
    print(f"  - Sales Order ID: {job.get('sales_order_id', 'N/A')}")
    print()
    
    # Step 2: Get Sales Order
    sales_order_id = job.get('sales_order_id')
    if not sales_order_id:
        print("❌ No sales order ID found in job order!")
        return
    
    print("STEP 2: Sales Order")
    print("-" * 80)
    sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
    
    if not sales_order:
        print(f"❌ Sales order {sales_order_id} not found!")
        return
    
    print(f"✓ Sales Order: {sales_order.get('spa_number', 'N/A')}")
    print(f"  - Customer: {sales_order.get('customer_name', 'N/A')}")
    print(f"  - Quotation ID: {sales_order.get('quotation_id', 'N/A')}")
    print()
    
    # Check sales order items
    items = sales_order.get('items', [])
    if items:
        print(f"  Sales Order Items ({len(items)} item(s)):")
        for idx, item in enumerate(items, 1):
            print(f"    Item {idx}:")
            print(f"      - Product: {item.get('product_name', 'N/A')}")
            print(f"      - Quantity: {item.get('quantity', 0)}")
            print(f"      - Packaging: {item.get('packaging', 'N/A')}")
            print(f"      - net_weight_kg: {item.get('net_weight_kg', 'NOT SET')}")
    else:
        print(f"  ⚠️  No items array found in sales order")
        print(f"  - Product: {sales_order.get('product_name', 'N/A')}")
        print(f"  - Quantity: {sales_order.get('quantity', 0)}")
        print(f"  - Packaging: {sales_order.get('packaging', 'N/A')}")
        print(f"  - net_weight_kg: {sales_order.get('net_weight_kg', 'NOT SET')}")
    print()
    
    # Step 3: Get Quotation
    quotation_id = sales_order.get('quotation_id')
    if not quotation_id:
        print("❌ No quotation ID found in sales order!")
        return
    
    print("STEP 3: Quotation")
    print("-" * 80)
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    
    if not quotation:
        print(f"❌ Quotation {quotation_id} not found!")
        return
    
    print(f"✓ Quotation: {quotation.get('pfi_number', 'N/A')}")
    print(f"  - Customer: {quotation.get('customer_name', 'N/A')}")
    print(f"  - Status: {quotation.get('status', 'N/A')}")
    print()
    
    # Check quotation items
    quot_items = quotation.get('items', [])
    if quot_items:
        print(f"  Quotation Items ({len(quot_items)} item(s)):")
        for idx, item in enumerate(quot_items, 1):
            print(f"    Item {idx}:")
            print(f"      - Product: {item.get('product_name', 'N/A')}")
            print(f"      - Quantity: {item.get('quantity', 0)}")
            print(f"      - Packaging: {item.get('packaging', 'N/A')}")
            print(f"      - net_weight_kg: {item.get('net_weight_kg', 'NOT SET')}")
            print(f"      - weight_mt: {item.get('weight_mt', 'NOT SET')}")
    else:
        print(f"  ⚠️  No items found in quotation")
    print()
    
    # Step 4: Analysis
    print("=" * 80)
    print("ANALYSIS")
    print("=" * 80)
    
    # Find the specific product in each stage
    product_name = job.get('product_name')
    
    print(f"Tracking: {product_name}")
    print()
    
    # Job Order
    job_net_weight = job.get('net_weight_kg', 'NOT SET')
    print(f"1. Job Order net_weight_kg: {job_net_weight}")
    
    # Sales Order
    so_item = None
    if items:
        so_item = next((item for item in items if item.get('product_name') == product_name), None)
    if so_item:
        so_net_weight = so_item.get('net_weight_kg', 'NOT SET')
        print(f"2. Sales Order Item net_weight_kg: {so_net_weight}")
    else:
        so_net_weight = sales_order.get('net_weight_kg', 'NOT SET')
        print(f"2. Sales Order net_weight_kg: {so_net_weight}")
    
    # Quotation
    quot_item = None
    if quot_items:
        quot_item = next((item for item in quot_items if item.get('product_name') == product_name), None)
    if quot_item:
        quot_net_weight = quot_item.get('net_weight_kg', 'NOT SET')
        print(f"3. Quotation Item net_weight_kg: {quot_net_weight}")
    else:
        print(f"3. Quotation Item: NOT FOUND")
        quot_net_weight = 'NOT SET'
    
    print()
    
    # Identify where it was lost
    if quot_net_weight != 'NOT SET' and quot_net_weight is not None:
        print(f"✓ Quotation has net_weight_kg = {quot_net_weight}")
        
        if so_item:
            if so_net_weight == quot_net_weight:
                print(f"✓ Sales Order preserved it: {so_net_weight}")
            else:
                print(f"❌ LOST at Sales Order: {quot_net_weight} → {so_net_weight}")
                print(f"   Check: Sales order creation endpoint (/sales-orders POST)")
        else:
            print(f"❌ Sales Order doesn't have items array or matching item")
        
        if job_net_weight == quot_net_weight:
            print(f"✓ Job Order preserved it: {job_net_weight}")
        else:
            print(f"❌ LOST at Job Order: {quot_net_weight} → {job_net_weight}")
            print(f"   Check: Job order creation endpoint (/job-orders POST)")
    else:
        print(f"❌ Quotation doesn't have net_weight_kg set")
        print(f"   This job was created before the fix or quotation is missing data")
    print()

async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python trace_net_weight_flow.py <JOB_NUMBER>")
        print("Example: python trace_net_weight_flow.py JOB-000075")
        sys.exit(1)
    
    job_number = sys.argv[1].upper()
    if not job_number.startswith("JOB-"):
        job_number = f"JOB-{job_number}"
    
    try:
        await trace_net_weight(job_number)
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

