#!/usr/bin/env python3
"""
Diagnostic script to trace material requirement calculations for a specific job order.
This helps understand why certain quantities are required.

Usage: python trace_job_calculation.py JOB-000044
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def format_number(num):
    """Format large numbers with commas"""
    return f"{num:,.2f}"

async def trace_job_calculation(job_number: str):
    """Trace the complete calculation for a job order"""
    
    print("=" * 80)
    print(f"TRACING CALCULATION FOR: {job_number}")
    print("=" * 80)
    print()
    
    # Step 1: Get Job Order
    print("STEP 1: Fetching Job Order Details")
    print("-" * 80)
    job = await db.job_orders.find_one({"job_number": job_number}, {"_id": 0})
    
    if not job:
        print(f"❌ ERROR: Job order {job_number} not found!")
        return
    
    print(f"✓ Job Found: {job_number}")
    print(f"  - Product ID: {job.get('product_id', 'N/A')}")
    print(f"  - Product Name: {job.get('product_name', 'N/A')}")
    print(f"  - Quantity: {format_number(job.get('quantity', 0))}")
    print(f"  - Packaging: {job.get('packaging', 'N/A')}")
    net_weight = job.get('net_weight_kg')
    if net_weight is None:
        packaging = job.get('packaging', 'Bulk')
        net_weight = 200 if packaging != 'Bulk' else None
    net_weight_display = format_number(net_weight) if net_weight is not None else "N/A (Bulk)"
    print(f"  - Net Weight (KG): {net_weight_display}")
    print(f"  - Status: {job.get('status', 'N/A')}")
    print(f"  - Procurement Required: {job.get('procurement_required', False)}")
    print()
    
    # Extract key values
    product_id = job.get('product_id')
    quantity = job.get('quantity', 0)
    packaging = job.get('packaging', 'Bulk')
    # Handle net_weight_kg - preserve None for Bulk, default to 200 for packaged items
    net_weight_kg = job.get('net_weight_kg')
    if net_weight_kg is None and packaging != 'Bulk':
        net_weight_kg = 200  # Default only when needed
    
    # Step 2: Calculate Total Finished KG
    print("STEP 2: Calculating Total Finished Product (KG)")
    print("-" * 80)
    if packaging != "Bulk" and net_weight_kg is not None:
        total_kg = quantity * net_weight_kg
        print(f"  Formula: quantity × net_weight_kg = total_kg")
        print(f"  Calculation: {format_number(quantity)} × {format_number(net_weight_kg)} = {format_number(total_kg)} KG")
    else:
        total_kg = quantity * 1000
        print(f"  Formula: quantity × 1000 = total_kg (Bulk packaging)")
        print(f"  Calculation: {format_number(quantity)} × 1,000 = {format_number(total_kg)} KG")
    print(f"  → Total Finished Product Needed: {format_number(total_kg)} KG")
    print()
    
    # Step 3: Get Product BOM
    print("STEP 3: Fetching Product BOM (Bill of Materials)")
    print("-" * 80)
    product_bom = await db.product_boms.find_one({
        "product_id": product_id,
        "is_active": True
    }, {"_id": 0})
    
    if not product_bom:
        print(f"❌ ERROR: No active BOM found for product {product_id}!")
        print("   Please check BOM Management to ensure an active BOM exists.")
        return
    
    print(f"✓ Active BOM Found: {product_bom.get('id')}")
    print(f"  - BOM Name: {product_bom.get('name', 'N/A')}")
    print()
    
    # Step 4: Get BOM Items
    print("STEP 4: Fetching BOM Items")
    print("-" * 80)
    bom_items = await db.product_bom_items.find({
        "bom_id": product_bom["id"]
    }, {"_id": 0}).to_list(100)
    
    if not bom_items:
        print(f"❌ ERROR: No BOM items found for BOM {product_bom['id']}!")
        return
    
    print(f"✓ Found {len(bom_items)} BOM item(s)")
    print()
    
    # Step 5: Calculate Material Requirements
    print("STEP 5: Calculating Material Requirements")
    print("-" * 80)
    print(f"  Formula for each material: total_kg × qty_kg_per_kg_finished = required_qty")
    print()
    
    material_requirements = []
    
    for idx, bom_item in enumerate(bom_items, 1):
        material_id = bom_item.get("material_item_id")
        qty_per_kg = bom_item.get("qty_kg_per_kg_finished", 0)
        required_qty = total_kg * qty_per_kg
        
        # Get material details
        material = await db.inventory_items.find_one({"id": material_id}, {"_id": 0})
        if not material:
            material = await db.products.find_one({"id": material_id}, {"_id": 0})
        
        material_name = material.get("name", "Unknown") if material else "Unknown"
        material_sku = material.get("sku", "N/A") if material else "N/A"
        
        material_requirements.append({
            "material_id": material_id,
            "material_name": material_name,
            "material_sku": material_sku,
            "qty_per_kg": qty_per_kg,
            "required_qty": required_qty
        })
        
        print(f"  Material {idx}: {material_name} ({material_sku})")
        print(f"    - BOM Ratio: {format_number(qty_per_kg)} KG per 1 KG finished product")
        print(f"    - Calculation: {format_number(total_kg)} × {format_number(qty_per_kg)} = {format_number(required_qty)} KG")
        print()
    
    # Step 6: Check Inventory Levels
    print("STEP 6: Checking Current Inventory Levels")
    print("-" * 80)
    
    for req in material_requirements:
        material_id = req["material_id"]
        material_name = req["material_name"]
        required_qty = req["required_qty"]
        
        # Get inventory balance
        balance = await db.inventory_balances.find_one({"item_id": material_id}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        
        # Get reservations
        reservations = await db.inventory_reservations.find({"item_id": material_id}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        
        available = on_hand - reserved
        shortage = max(0, required_qty - available)
        
        print(f"  {material_name}:")
        print(f"    - Required: {format_number(required_qty)} KG")
        print(f"    - On Hand: {format_number(on_hand)} KG")
        print(f"    - Reserved: {format_number(reserved)} KG")
        print(f"    - Available: {format_number(available)} KG")
        print(f"    - Shortage: {format_number(shortage)} KG")
        
        if shortage > 0:
            print(f"    ⚠️  SHORTAGE DETECTED!")
        else:
            print(f"    ✓ Sufficient stock available")
        print()
    
    # Step 7: Check Job's Material Shortages Array
    print("STEP 7: Checking Job's Stored Material Shortages")
    print("-" * 80)
    material_shortages = job.get("material_shortages", [])
    
    if material_shortages:
        print(f"✓ Job has {len(material_shortages)} material shortage record(s) stored:")
        for idx, shortage in enumerate(material_shortages, 1):
            print(f"  Shortage {idx}:")
            print(f"    - Material: {shortage.get('item_name', 'Unknown')}")
            print(f"    - Required Qty: {format_number(shortage.get('required_qty', 0))} KG")
            print(f"    - Available: {format_number(shortage.get('available', 0))} KG")
            print(f"    - Shortage: {format_number(shortage.get('shortage', 0))} KG")
            print()
    else:
        print("  No material shortages stored in job order (may be calculated on-the-fly)")
        print()
    
    # Step 8: Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Job: {job_number}")
    print(f"Product: {job.get('product_name', 'N/A')}")
    print(f"Quantity: {format_number(quantity)} units")
    print(f"Total Finished Product: {format_number(total_kg)} KG")
    print()
    print("Material Requirements:")
    for req in material_requirements:
        shortage_info = ""
        # Find shortage for this material
        balance = await db.inventory_balances.find_one({"item_id": req["material_id"]}, {"_id": 0})
        on_hand = balance.get("on_hand", 0) if balance else 0
        reservations = await db.inventory_reservations.find({"item_id": req["material_id"]}, {"_id": 0}).to_list(1000)
        reserved = sum(r.get("qty", 0) for r in reservations)
        available = on_hand - reserved
        shortage = max(0, req["required_qty"] - available)
        
        if shortage > 0:
            shortage_info = f" (SHORTAGE: {format_number(shortage)} KG)"
        
        print(f"  - {req['material_name']}: {format_number(req['required_qty'])} KG{shortage_info}")
    print()
    
    # Highlight Butanol specifically
    butanol_req = next((r for r in material_requirements if 'butanol' in r['material_name'].lower()), None)
    if butanol_req:
        print("=" * 80)
        print("BUTANOL REQUIREMENT BREAKDOWN")
        print("=" * 80)
        print(f"Material: {butanol_req['material_name']} ({butanol_req['material_sku']})")
        print(f"BOM Ratio: {format_number(butanol_req['qty_per_kg'])} KG Butanol per 1 KG finished product")
        print(f"Total Finished Product: {format_number(total_kg)} KG")
        print(f"Required Butanol: {format_number(butanol_req['required_qty'])} KG")
        print()
        print("Calculation Chain:")
        print(f"  1. Job Quantity: {format_number(quantity)} units")
        if packaging != "Bulk" and net_weight_kg is not None:
            print(f"  2. Net Weight: {format_number(net_weight_kg)} KG per unit")
            print(f"  3. Total Finished: {format_number(quantity)} × {format_number(net_weight_kg)} = {format_number(total_kg)} KG")
        else:
            print(f"  2. Bulk Conversion: 1,000 KG per unit")
            print(f"  3. Total Finished: {format_number(quantity)} × 1,000 = {format_number(total_kg)} KG")
        print(f"  4. Butanol Required: {format_number(total_kg)} × {format_number(butanol_req['qty_per_kg'])} = {format_number(butanol_req['required_qty'])} KG")
        print()
        
        # Check if this matches the 200M requirement
        if abs(butanol_req['required_qty'] - 200000000) < 0.01:
            print("⚠️  This matches the 200,000,000 KG requirement shown in Material Shortages!")
        print()

async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python trace_job_calculation.py <JOB_NUMBER>")
        print("Example: python trace_job_calculation.py JOB-000044")
        sys.exit(1)
    
    job_number = sys.argv[1].upper()
    if not job_number.startswith("JOB-"):
        job_number = f"JOB-{job_number}"
    
    try:
        await trace_job_calculation(job_number)
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

