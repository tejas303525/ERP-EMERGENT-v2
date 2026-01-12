#!/usr/bin/env python3
"""
Complete Production Flow - Adds finished products to inventory
This script completes the production cycle for existing jobs
"""

import requests
import json
from datetime import datetime

API_BASE = "http://localhost:8001/api"

def get_token():
    response = requests.post(f"{API_BASE}/auth/login", json={
        "email": "admin@erp.com",
        "password": "admin123"
    })
    return response.json()['access_token']

def api_call(method, endpoint, **kwargs):
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    if 'headers' in kwargs:
        kwargs['headers'].update(headers)
    else:
        kwargs['headers'] = headers
    
    url = f"{API_BASE}{endpoint}"
    return getattr(requests, method)(url, **kwargs)

print("=" * 80)
print("COMPLETING PRODUCTION FLOW - ADDING FINISHED GOODS TO INVENTORY")
print("=" * 80)
print()

# Get current job orders
print("Step 1: Getting current job orders...")
response = api_call('get', '/job-orders')
job_orders = response.json()

in_production = [job for job in job_orders if job['status'] == 'in_production']

if not in_production:
    print("   ℹ️  No jobs currently in production")
    print("   Create a job order and set status to 'in_production' first")
    exit(0)

print(f"   Found {len(in_production)} job(s) in production:")
for job in in_production:
    print(f"   - {job['job_number']}: {job['product_name']} ({job['quantity']} units)")

print()

# For each job in production, complete it and add to inventory
for job in in_production:
    print(f"Step 2: Completing production for {job['job_number']}...")
    
    # Update status to ready_for_dispatch
    response = api_call('put', f"/job-orders/{job['id']}/status", params={"status": "ready_for_dispatch"})
    if response.status_code == 200:
        print(f"   ✅ Status updated to READY_FOR_DISPATCH")
    else:
        print(f"   ❌ Failed to update status: {response.status_code}")
        continue
    
    print()
    print(f"Step 3: Creating GRN to add finished goods to inventory...")
    
    # Create GRN for finished goods
    grn_data = {
        "supplier": "INTERNAL PRODUCTION",
        "items": [{
            "product_id": job['product_id'],
            "product_name": job['product_name'],
            "quantity": job['quantity'],
            "unit": "KG"
        }],
        "notes": f"Production completion for {job['job_number']}"
    }
    
    response = api_call('post', '/grn', json=grn_data)
    if response.status_code == 200:
        grn = response.json()
        print(f"   ✅ GRN created: {grn.get('grn_number', 'N/A')}")
        print(f"   ✅ Added {job['quantity']} {job.get('unit', 'KG')} of {job['product_name']} to inventory")
    else:
        print(f"   ❌ Failed to create GRN: {response.status_code}")
        print(f"   Response: {response.text[:200]}")
    
    print()

# Show updated inventory
print("Step 4: Checking updated inventory...")
response = api_call('get', '/inventory')
inventory = response.json()

print(f"\n📦 UPDATED INVENTORY:")
print("-" * 80)
for item in inventory:
    status = "✅" if item['current_stock'] > 0 else "⚠️"
    print(f"   {status} {item['name']:40} {item['current_stock']:>8} {item.get('unit', 'KG')}")

print()
print("=" * 80)
print("✅ PRODUCTION COMPLETION PROCESS FINISHED")
print("=" * 80)
print()
print("Next steps:")
print("1. View inventory at: /inventory")
print("2. Create Delivery Order at: /delivery-orders to dispatch to customer")
print("3. Creating DO will automatically deduct from inventory")
print()
