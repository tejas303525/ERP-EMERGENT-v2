#!/usr/bin/env python3
"""
Test script to verify net_weight_kg preservation from quotation to job order.
This simulates the complete flow and verifies the fix.
"""

import asyncio
import pytest
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

@pytest.mark.asyncio
async def test_net_weight_preservation():
    """Test that net_weight_kg is preserved through the entire flow"""
    
    print("=" * 80)
    print("TEST: Net Weight Preservation")
    print("=" * 80)
    print()
    
    # Get the most recent job order
    job = await db.job_orders.find_one(
        {},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    
    if not job:
        print("❌ No job orders found in database")
        return False
    
    job_number = job.get("job_number", "Unknown")
    job_net_weight = job.get("net_weight_kg")
    packaging = job.get("packaging", "Bulk")
    product_name = job.get("product_name", "Unknown")
    
    print(f"Testing Most Recent Job Order: {job_number}")
    print(f"  Product: {product_name}")
    print(f"  Packaging: {packaging}")
    print(f"  net_weight_kg in job order: {job_net_weight}")
    print()
    
    # Get sales order
    sales_order_id = job.get("sales_order_id")
    if not sales_order_id:
        print("❌ No sales order ID in job order")
        return False
    
    sales_order = await db.sales_orders.find_one({"id": sales_order_id}, {"_id": 0})
    if not sales_order:
        print("❌ Sales order not found")
        return False
    
    # Find matching item in sales order
    so_net_weight = None
    items = sales_order.get("items", [])
    if items:
        matching_item = next((item for item in items if item.get("product_name") == product_name), None)
        if matching_item:
            so_net_weight = matching_item.get("net_weight_kg")
    else:
        so_net_weight = sales_order.get("net_weight_kg")
    
    print(f"  net_weight_kg in sales order: {so_net_weight}")
    print()
    
    # Get quotation
    quotation_id = sales_order.get("quotation_id")
    if not quotation_id:
        print("❌ No quotation ID in sales order")
        return False
    
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not quotation:
        print("❌ Quotation not found")
        return False
    
    # Find matching item in quotation
    quot_net_weight = None
    quot_items = quotation.get("items", [])
    if quot_items:
        matching_item = next((item for item in quot_items if item.get("product_name") == product_name), None)
        if matching_item:
            quot_net_weight = matching_item.get("net_weight_kg")
    
    print(f"  net_weight_kg in quotation: {quot_net_weight}")
    print()
    
    # Verify preservation
    print("=" * 80)
    print("VERIFICATION")
    print("=" * 80)
    
    all_passed = True
    
    # Test 1: Quotation → Sales Order
    if quot_net_weight == so_net_weight:
        print("✅ Test 1 PASSED: Quotation → Sales Order preserved net_weight_kg")
    else:
        print(f"❌ Test 1 FAILED: Quotation ({quot_net_weight}) → Sales Order ({so_net_weight})")
        all_passed = False
    
    # Test 2: Sales Order → Job Order
    if so_net_weight == job_net_weight:
        print("✅ Test 2 PASSED: Sales Order → Job Order preserved net_weight_kg")
    else:
        print(f"❌ Test 2 FAILED: Sales Order ({so_net_weight}) → Job Order ({job_net_weight})")
        all_passed = False
    
    # Test 3: End-to-end
    if quot_net_weight == job_net_weight:
        print("✅ Test 3 PASSED: End-to-end preservation (Quotation → Job Order)")
    else:
        print(f"❌ Test 3 FAILED: Quotation ({quot_net_weight}) → Job Order ({job_net_weight})")
        all_passed = False
    
    # Test 4: Bulk packaging should have None
    if packaging == "Bulk":
        if job_net_weight is None:
            print("✅ Test 4 PASSED: Bulk packaging correctly has net_weight_kg = None")
        else:
            print(f"❌ Test 4 FAILED: Bulk packaging should have None, got {job_net_weight}")
            all_passed = False
    else:
        if job_net_weight is not None:
            print(f"✅ Test 4 PASSED: Packaged item has net_weight_kg = {job_net_weight}")
        else:
            print(f"❌ Test 4 FAILED: Packaged item should have net_weight_kg, got None")
            all_passed = False
    
    print()
    
    if all_passed:
        print("🎉 ALL TESTS PASSED! Net weight preservation is working correctly.")
    else:
        print("⚠️  SOME TESTS FAILED. Please check the implementation.")
    
    return all_passed

async def main():
    try:
        success = await test_net_weight_preservation()
        exit_code = 0 if success else 1
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        exit_code = 1
    finally:
        client.close()
    
    return exit_code

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)

