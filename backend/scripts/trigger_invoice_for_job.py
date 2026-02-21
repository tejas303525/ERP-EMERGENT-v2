"""
Script to manually trigger invoice generation for a specific job or sales order.

Usage:
    python trigger_invoice_for_job.py --job-number JOB-000246
    python trigger_invoice_for_job.py --sales-order-id <sales_order_id>
    python trigger_invoice_for_job.py --find-missing  # Find all jobs without invoices
"""

import argparse
import requests
import os
from dotenv import load_dotenv

load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
API_TOKEN = os.getenv("API_TOKEN", "")

def find_sales_order_id_by_job_number(job_number):
    """Find sales_order_id for a given job number"""
    # This would require database access - for now, return None
    # In production, you'd query MongoDB directly
    print(f"To find sales_order_id for {job_number}, use MongoDB query:")
    print(f"db.job_orders.findOne({{job_number: '{job_number}'}}, {{sales_order_id: 1}})")
    return None

def trigger_invoice_generation(sales_order_id, token):
    """Call the API endpoint to generate invoice"""
    url = f"{API_BASE_URL}/api/receivables/generate-invoice-for-sales-order/{sales_order_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, headers=headers)
        response.raise_for_status()
        result = response.json()
        print(f"✓ Success: {result.get('message')}")
        print(f"  Invoice Number: {result.get('invoice_number')}")
        print(f"  Invoice ID: {result.get('invoice_id')}")
        print(f"  Amount: {result.get('currency')} {result.get('amount')}")
        return result
    except requests.exceptions.HTTPError as e:
        print(f"✗ Error: {e}")
        if e.response.status_code == 404:
            print(f"  Sales order {sales_order_id} not found")
        elif e.response.status_code == 400:
            error_detail = e.response.json().get("detail", "Bad request")
            print(f"  {error_detail}")
        elif e.response.status_code == 403:
            print(f"  Access denied. Check your token and permissions.")
        else:
            print(f"  Response: {e.response.text}")
        return None
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Trigger invoice generation for sales orders")
    parser.add_argument("--job-number", help="Job number (e.g., JOB-000246)")
    parser.add_argument("--sales-order-id", help="Sales order ID")
    parser.add_argument("--token", help="API token (or set API_TOKEN env var)")
    parser.add_argument("--find-missing", action="store_true", help="Find jobs without invoices")
    
    args = parser.parse_args()
    
    token = args.token or API_TOKEN
    if not token:
        print("Error: API token required. Set API_TOKEN env var or use --token")
        return
    
    if args.find_missing:
        print("To find missing invoices, use MongoDB query:")
        print("See trigger_invoice_generation.js for the aggregation query")
        return
    
    if args.job_number:
        sales_order_id = find_sales_order_id_by_job_number(args.job_number)
        if not sales_order_id:
            print("\nPlease find the sales_order_id using MongoDB and use --sales-order-id instead")
            return
    elif args.sales_order_id:
        sales_order_id = args.sales_order_id
    else:
        parser.print_help()
        return
    
    print(f"Triggering invoice generation for sales order: {sales_order_id}")
    trigger_invoice_generation(sales_order_id, token)

if __name__ == "__main__":
    main()

