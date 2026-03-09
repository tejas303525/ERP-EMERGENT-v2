#!/usr/bin/env python3
"""
Import Stock Report as GPN (Goods Produced Note) Entries
Reads stock report (Excel/CSV) and creates GPN production entries in the Production Scheduling page
"""

import requests
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
import re

# Try to import pandas for Excel support, fallback to CSV only
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False
    print("⚠️  pandas not installed. Only CSV files supported.")
    print("   Install with: pip install pandas openpyxl")

API_BASE = os.environ.get('API_BASE', 'http://localhost:8001/api')
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@erp.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

def get_token():
    """Get authentication token"""
    response = requests.post(f"{API_BASE}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        raise Exception(f"Login failed: {response.text}")
    return response.json()['access_token']

def api_call(method, endpoint, **kwargs):
    """Make authenticated API call"""
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    if 'headers' in kwargs:
        kwargs['headers'].update(headers)
    else:
        kwargs['headers'] = headers
    
    url = f"{API_BASE}{endpoint}"
    return getattr(requests, method)(url, **kwargs)

def normalize_product_name(name: str) -> str:
    """Normalize product name for matching"""
    if not name:
        return ""
    # Remove extra spaces, convert to uppercase
    name = re.sub(r'\s+', ' ', name.strip().upper())
    return name

def normalize_packaging_name(name: str) -> str:
    """Normalize packaging name for matching"""
    if not name:
        return ""
    name = name.strip().upper()
    # Common variations
    name = re.sub(r'\s+', ' ', name)
    # Remove common prefixes/suffixes
    name = re.sub(r'^(NEW|MS|HDPE|RECON|RECONDITIONED)\s+', '', name)
    name = re.sub(r'\s+(DRUM|DRUMS|CONTAINER|BAG|BAGS|BOX|BOXES)$', '', name)
    return name

def find_product_by_name(products: List[Dict], product_name: str) -> Optional[Dict]:
    """Find product by name (fuzzy matching)"""
    normalized_search = normalize_product_name(product_name)
    
    # Exact match first
    for product in products:
        if normalize_product_name(product.get('name', '')) == normalized_search:
            return product
    
    # Partial match
    for product in products:
        normalized = normalize_product_name(product.get('name', ''))
        if normalized_search in normalized or normalized in normalized_search:
            return product
    
    return None

def find_packaging_by_name(packagings: List[Dict], packaging_name: str) -> Optional[str]:
    """Find packaging name (returns normalized name)"""
    normalized_search = normalize_packaging_name(packaging_name)
    
    # Try to match against packaging names
    for pkg in packagings:
        pkg_name = pkg.get('name', '')
        normalized_pkg = normalize_packaging_name(pkg_name)
        
        if normalized_search == normalized_pkg:
            return pkg_name
        
        # Check if search term is in packaging name
        if normalized_search in normalized_pkg or normalized_pkg in normalized_search:
            return pkg_name
    
    # If not found, try to extract from the original name
    # Common patterns: "200L", "185 Kg", "160KG", etc.
    volume_match = re.search(r'(\d+)\s*(L|LITRE|LITER|KG|KILO)', packaging_name, re.IGNORECASE)
    if volume_match:
        volume = volume_match.group(1)
        unit = volume_match.group(2).upper()
        if unit.startswith('L'):
            return f"{volume}L Drum"
        elif unit.startswith('K'):
            return f"{volume}Kg Drum"
    
    return None

def parse_quantity(qty_str) -> float:
    """Parse quantity string to float"""
    if HAS_PANDAS and pd.isna(qty_str):
        return 0.0
    if qty_str is None or qty_str == '':
        return 0.0
    
    # Convert to string and clean
    qty_str = str(qty_str).strip()
    # Remove commas
    qty_str = qty_str.replace(',', '')
    # Extract number
    match = re.search(r'(\d+\.?\d*)', qty_str)
    if match:
        return float(match.group(1))
    return 0.0

def parse_standard_qty(qty_str) -> float:
    """Parse standard quantity per packing (e.g., '185 Kg', '200L')"""
    if HAS_PANDAS and pd.isna(qty_str):
        return 0.0
    if qty_str is None or qty_str == '':
        return 0.0
    
    qty_str = str(qty_str).strip()
    # Remove 'Kg', 'L', etc. and extract number
    match = re.search(r'(\d+\.?\d*)', qty_str)
    if match:
        return float(match.group(1))
    return 0.0

def read_stock_report(file_path: str) -> List[Dict]:
    """Read stock report from Excel or CSV"""
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    print(f"📖 Reading stock report from: {file_path}")
    
    if file_path.suffix.lower() in ['.xlsx', '.xls']:
        if not HAS_PANDAS:
            raise ImportError("pandas required for Excel files. Install with: pip install pandas openpyxl")
        df = pd.read_excel(file_path)
    elif file_path.suffix.lower() == '.csv':
        if HAS_PANDAS:
            df = pd.read_csv(file_path)
        else:
            # Basic CSV reading without pandas
            import csv
            rows = []
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            return rows
    else:
        raise ValueError(f"Unsupported file format: {file_path.suffix}")
    
    # Convert DataFrame to list of dicts
    return df.to_dict('records')

def import_stock_as_gpn(file_path: str, dry_run: bool = False):
    """Import stock report as GPN entries"""
    
    print("=" * 80)
    print("IMPORT STOCK REPORT AS GPN ENTRIES")
    print("=" * 80)
    print()
    
    # Read stock report
    try:
        stock_data = read_stock_report(file_path)
        print(f"✅ Loaded {len(stock_data)} rows from stock report")
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return
    
    # Get products and packagings from API
    print("\n📦 Loading products and packagings from database...")
    try:
        products_res = api_call('get', '/products')
        products = products_res.json()
        
        packagings_res = api_call('get', '/packaging')
        packagings = packagings_res.json()
        
        print(f"✅ Loaded {len(products)} products and {len(packagings)} packagings")
    except Exception as e:
        print(f"❌ Error loading data: {e}")
        return
    
    # Process each row
    print("\n🔄 Processing stock data...")
    print("-" * 80)
    
    successful = []
    failed = []
    skipped = []
    
    for idx, row in enumerate(stock_data, 1):
        # Extract data (adjust column names based on your file)
        # Try multiple possible column name variations
        product_name = None
        for col in ['PRODUCT', 'Product', 'product', 'PRODUCT NAME', 'Product Name']:
            if col in row and row[col]:
                product_name = str(row[col]).strip()
                break
        
        packing = None
        for col in ['PACKING', 'Packing', 'packing', 'PACKAGING', 'Packaging']:
            if col in row and row[col]:
                packing = str(row[col]).strip()
                break
        
        standard_qty = 0.0
        for col in ['Qty-STANDARD', 'Standard Qty', 'standard_qty', 'QTY-STANDARD', 'Standard Quantity']:
            if col in row:
                standard_qty = parse_standard_qty(row[col])
                if standard_qty > 0:
                    break
        
        closing_stock = 0.0
        for col in ['Closing Stock', 'closing_stock', 'Closing_Stock', 'CLOSING STOCK', 'Closing Stock Qty']:
            if col in row:
                closing_stock = parse_quantity(row[col])
                if closing_stock > 0:
                    break
        
        if not product_name or closing_stock <= 0:
            skipped.append({
                'row': idx,
                'product': product_name or 'N/A',
                'reason': 'Missing product name or zero stock'
            })
            continue
        
        # Find product
        product = find_product_by_name(products, product_name)
        if not product:
            failed.append({
                'row': idx,
                'product': product_name,
                'packaging': packing or 'N/A',
                'reason': f'Product not found: {product_name}'
            })
            print(f"❌ Row {idx}: Product not found - {product_name}")
            continue
        
        # Find packaging
        packaging_name = None
        if packing:
            packaging_name = find_packaging_by_name(packagings, packing)
        
        if not packaging_name:
            # Try to get packaging from product configuration or standard qty
            if standard_qty > 0:
                # Try to match by volume
                for pkg in packagings:
                    pkg_name = pkg.get('name', '')
                    pkg_vol = parse_standard_qty(pkg_name)
                    if abs(pkg_vol - standard_qty) < 5:  # Within 5 units
                        packaging_name = pkg_name
                        break
            
            if not packaging_name:
                failed.append({
                    'row': idx,
                    'product': product_name,
                    'packaging': packing or 'N/A',
                    'reason': f'Packaging not found: {packing or "N/A"}'
                })
                print(f"❌ Row {idx}: Packaging not found - {packing or 'N/A'}")
                continue
        
        # Calculate number of drums
        if standard_qty > 0:
            num_drums = closing_stock / standard_qty
        else:
            # If no standard qty, assume 1 drum = closing stock
            num_drums = closing_stock
        
        # Round to reasonable number
        num_drums = round(num_drums, 2)
        
        if num_drums <= 0:
            skipped.append({
                'row': idx,
                'product': product_name,
                'reason': 'Calculated drums <= 0'
            })
            continue
        
        # Get net weight from packaging or use standard qty
        net_weight_kg = standard_qty if standard_qty > 0 else 180  # Default 180kg
        
        # Generate batch number
        batch_number = f"STOCK-{datetime.now().strftime('%Y%m%d')}-{idx:04d}"
        
        print(f"\n📝 Row {idx}: {product_name}")
        print(f"   Packaging: {packaging_name}")
        print(f"   Closing Stock: {closing_stock}")
        print(f"   Standard Qty: {standard_qty}")
        print(f"   Calculated Drums: {num_drums}")
        print(f"   Net Weight: {net_weight_kg} kg")
        print(f"   Batch: {batch_number}")
        
        if dry_run:
            print("   [DRY RUN - Would create GPN]")
            successful.append({
                'row': idx,
                'product': product_name,
                'packaging': packaging_name,
                'num_drums': num_drums,
                'net_weight_kg': net_weight_kg,
                'batch_number': batch_number
            })
        else:
            # Create GPN
            try:
                gpn_data = {
                    "batch_number": batch_number,
                    "product_id": product['id'],
                    "packaging": packaging_name,
                    "net_weight_kg": net_weight_kg,
                    "num_drums": num_drums
                }
                
                response = api_call('post', '/production/gpn-create', json=gpn_data)
                
                if response.status_code == 200:
                    result = response.json()
                    job_number = result.get('job_number', result.get('data', {}).get('job_number', 'N/A'))
                    print(f"   ✅ GPN created: {job_number}")
                    successful.append({
                        'row': idx,
                        'product': product_name,
                        'job_number': job_number,
                        'num_drums': num_drums
                    })
                else:
                    error_msg = response.json().get('detail', 'Unknown error') if response.status_code != 200 else 'Unknown error'
                    print(f"   ❌ Failed: {error_msg}")
                    failed.append({
                        'row': idx,
                        'product': product_name,
                        'reason': error_msg
                    })
            except Exception as e:
                print(f"   ❌ Error: {str(e)}")
                failed.append({
                    'row': idx,
                    'product': product_name,
                    'reason': str(e)
                })
    
    # Summary
    print("\n" + "=" * 80)
    print("IMPORT SUMMARY")
    print("=" * 80)
    print(f"✅ Successful: {len(successful)}")
    print(f"❌ Failed: {len(failed)}")
    print(f"⏭️  Skipped: {len(skipped)}")
    print()
    
    if successful:
        print("✅ Successfully created GPN entries:")
        for s in successful[:10]:  # Show first 10
            job_num = s.get('job_number', 'N/A')
            print(f"  Row {s['row']}: {s['product']} - {job_num} ({s.get('num_drums', 0)} drums)")
        if len(successful) > 10:
            print(f"  ... and {len(successful) - 10} more")
        print()
    
    if failed:
        print("❌ Failed entries:")
        for f in failed[:10]:  # Show first 10
            print(f"  Row {f['row']}: {f['product']} - {f['reason']}")
        if len(failed) > 10:
            print(f"  ... and {len(failed) - 10} more")
        print()
    
    if skipped:
        print("⏭️  Skipped entries:")
        for s in skipped[:10]:
            print(f"  Row {s['row']}: {s['product']} - {s['reason']}")
        if len(skipped) > 10:
            print(f"  ... and {len(skipped) - 10} more")
        print()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Import stock report as GPN entries')
    parser.add_argument('file', help='Path to stock report file (Excel or CSV)')
    parser.add_argument('--dry-run', action='store_true', help='Dry run - do not create GPN entries')
    parser.add_argument('--api-base', default='http://localhost:8001/api', help='API base URL')
    parser.add_argument('--email', default='admin@erp.com', help='Admin email')
    parser.add_argument('--password', default='admin123', help='Admin password')
    
    args = parser.parse_args()
    
    API_BASE = args.api_base
    ADMIN_EMAIL = args.email
    ADMIN_PASSWORD = args.password
    
    import_stock_as_gpn(args.file, dry_run=args.dry_run)



































