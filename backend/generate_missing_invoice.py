"""
Utility script to manually generate missing invoices
This script finds Sales Orders with all jobs dispatched/closed but no invoice created
"""
import asyncio
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import uuid
import re

# MongoDB connection
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "erp_emergent"

async def generate_sequence(db, prefix: str, collection: str) -> str:
    """Generate next sequence number"""
    counter = await db.counters.find_one_and_update(
        {"collection": collection},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq = counter.get("seq", 1)
    return f"{prefix}-{str(seq).zfill(6)}"

async def find_missing_invoices(db):
    """Find sales orders that need invoices"""
    print("=" * 80)
    print("SCANNING FOR MISSING INVOICES")
    print("=" * 80)
    
    # Get all sales orders
    sales_orders = await db.sales_orders.find({}, {"_id": 0}).to_list(1000)
    
    missing_invoices = []
    
    for so in sales_orders:
        so_id = so.get("id")
        spa_number = so.get("spa_number")
        
        # Get all job orders for this SO
        jobs = await db.job_orders.find(
            {"sales_order_id": so_id},
            {"_id": 0}
        ).to_list(1000)
        
        if not jobs:
            continue
        
        total_jobs = len(jobs)
        dispatched_or_closed = [j for j in jobs if j.get("status") in ["dispatched", "closed"]]
        
        # Check if all jobs are dispatched/closed
        if len(dispatched_or_closed) == total_jobs and total_jobs > 0:
            # Check if invoice exists
            existing_invoice = await db.receivable_invoices.find_one(
                {"sales_order_id": so_id},
                {"_id": 0}
            )
            
            if not existing_invoice:
                # Check if any DOs exist
                dos = []
                for job in jobs:
                    do = await db.delivery_orders.find_one(
                        {"job_order_id": job["id"]},
                        {"_id": 0}
                    )
                    if do:
                        dos.append(do)
                
                missing_invoices.append({
                    "sales_order": so,
                    "jobs": jobs,
                    "delivery_orders": dos
                })
                
                print(f"\n⚠️  MISSING INVOICE FOUND:")
                print(f"   Sales Order: {spa_number}")
                print(f"   Customer: {so.get('customer_name', 'N/A')}")
                print(f"   Jobs: {total_jobs} (all dispatched/closed)")
                print(f"   DOs: {len(dos)}")
    
    return missing_invoices

async def create_invoice_for_sales_order(db, so, jobs, dos):
    """Create invoice for a sales order"""
    so_id = so.get("id")
    spa_number = so.get("spa_number")
    customer_id = so.get("customer_id")
    quotation_id = so.get("quotation_id")
    
    print(f"\n{'=' * 80}")
    print(f"CREATING INVOICE FOR {spa_number}")
    print(f"{'=' * 80}")
    
    # Get customer details
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0}) if customer_id else None
    
    # Get quotation
    quotation = await db.quotations.find_one({"id": quotation_id}, {"_id": 0}) if quotation_id else None
    
    # Determine invoice type
    invoice_type = "EXPORT" if quotation and quotation.get("order_type") == "export" else "LOCAL"
    
    # Create line items
    line_items = []
    total_weight_mt = 0
    
    for idx, job in enumerate(jobs):
        job_total_weight = job.get("total_weight_mt", 0)
        total_weight_mt += job_total_weight
        
        # Find corresponding DO
        job_do = next((do for do in dos if do.get("job_order_id") == job["id"]), None)
        
        line_items.append({
            "line_number": idx + 1,
            "product_id": job.get("product_id"),
            "product_name": job.get("product_name"),
            "sku": job.get("product_sku", ""),
            "quantity": job.get("quantity"),
            "packaging": job.get("packaging", "Bulk"),
            "net_weight_kg": job.get("net_weight_kg"),
            "total_weight_mt": job_total_weight,
            "unit_price": 0,
            "total": 0,
            "job_number": job.get("job_number"),
            "do_number": job_do.get("do_number") if job_do else ""
        })
    
    # Get amount
    amount = so.get("total", 0)
    if amount == 0 and quotation:
        amount = quotation.get("total", 0)
    
    currency = so.get("currency") or (quotation.get("currency") if quotation else "USD")
    payment_terms = so.get("payment_terms") or (quotation.get("payment_terms") if quotation else "Net 30")
    
    # Calculate proportional amounts
    if total_weight_mt > 0 and amount > 0:
        for item in line_items:
            item_weight = item["total_weight_mt"]
            item_proportion = item_weight / total_weight_mt
            item["total"] = amount * item_proportion
            if item["quantity"] > 0:
                item["unit_price"] = item["total"] / item["quantity"]
    
    # Calculate due date
    due_days = 30
    if payment_terms:
        match = re.search(r'(\d+)', payment_terms)
        if match:
            due_days = int(match.group(1))
    
    due_date = (datetime.now(timezone.utc) + timedelta(days=due_days)).isoformat()
    
    # Generate invoice number
    prefix = "APL" if invoice_type == "LOCAL" else "APE"
    invoice_number = await generate_sequence(db, prefix, "receivable_invoices")
    
    # Collect DO info
    do_numbers = [do.get("do_number") for do in dos if do.get("do_number")]
    do_ids = [do.get("id") for do in dos if do.get("id")]
    
    # Create invoice
    invoice = {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "invoice_type": invoice_type,
        "customer_id": customer_id,
        "customer_name": customer.get("name") if customer else so.get("customer_name"),
        "customer_address": customer.get("address") if customer else "",
        "customer_city": customer.get("city") if customer else "",
        "customer_country": customer.get("country") if customer else so.get("country_of_destination", ""),
        "customer_phone": customer.get("phone") if customer else "",
        "customer_email": customer.get("email") if customer else "",
        "sales_order_id": so_id,
        "spa_number": spa_number,
        "quotation_id": quotation_id,
        "pfi_number": quotation.get("pfi_number") if quotation else "",
        "delivery_order_ids": do_ids,
        "do_numbers": ", ".join(do_numbers),
        "amount": amount,
        "subtotal": amount,
        "currency": currency,
        "payment_terms": payment_terms,
        "due_date": due_date,
        "status": "PENDING",
        "amount_paid": 0,
        "line_items": line_items,
        "notes": f"Consolidated invoice for Sales Order {spa_number}, Delivery Orders: {', '.join(do_numbers)}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "finance_approved": False
    }
    
    await db.receivable_invoices.insert_one(invoice)
    
    print(f"✅ INVOICE CREATED: {invoice_number}")
    print(f"   Type: {invoice_type}")
    print(f"   Customer: {invoice['customer_name']}")
    print(f"   Amount: {currency} {amount:.2f}")
    print(f"   Line Items: {len(line_items)}")
    print(f"   DOs: {', '.join(do_numbers)}")
    
    return invoice

async def main():
    """Main function"""
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    try:
        print("\n🔍 Searching for missing invoices...")
        missing = await find_missing_invoices(db)
        
        if not missing:
            print("\n✅ No missing invoices found. All sales orders have invoices!")
            return
        
        print(f"\n📊 Found {len(missing)} sales order(s) missing invoices\n")
        
        # Ask user confirmation
        response = input("Do you want to create invoices for all missing entries? (yes/no): ")
        
        if response.lower() in ['yes', 'y']:
            created_count = 0
            for item in missing:
                try:
                    await create_invoice_for_sales_order(
                        db,
                        item["sales_order"],
                        item["jobs"],
                        item["delivery_orders"]
                    )
                    created_count += 1
                except Exception as e:
                    print(f"❌ Error creating invoice: {e}")
            
            print(f"\n{'=' * 80}")
            print(f"✅ COMPLETED: Created {created_count} invoice(s)")
            print(f"{'=' * 80}")
        else:
            print("\n⏭️  Skipped invoice creation")
    
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())

