# Invoice Generation Trigger Scripts

This directory contains scripts to manually trigger invoice generation for sales orders.

## Problem
When a job is closed, invoices should be automatically generated. However, if there was an error during DO creation (like the `UnboundLocalError` we fixed), the invoice might not have been created.

## Solution

### Option 1: Use the API Endpoint (Recommended)

**Endpoint:** `POST /api/receivables/generate-invoice-for-sales-order/{sales_order_id}`

**Authentication:** Requires admin or finance role

**Example using curl:**
```bash
curl -X POST "http://localhost:8000/api/receivables/generate-invoice-for-sales-order/{sales_order_id}" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Example using Python:**
```python
import requests

sales_order_id = "your-sales-order-id"
token = "your-api-token"

response = requests.post(
    f"http://localhost:8000/api/receivables/generate-invoice-for-sales-order/{sales_order_id}",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
)

print(response.json())
```

### Option 2: Find Sales Order ID using MongoDB

**Step 1: Find sales_order_id for a job number**

Connect to MongoDB and run:
```javascript
// Find sales_order_id for JOB-000246
db.job_orders.findOne(
  { job_number: "JOB-000246" },
  { sales_order_id: 1, job_number: 1, status: 1, _id: 0 }
);
```

**Step 2: Find all closed jobs without invoices**

```javascript
db.job_orders.aggregate([
  {
    $match: {
      status: { $in: ["closed", "dispatched"] },
      sales_order_id: { $exists: true, $ne: null }
    }
  },
  {
    $lookup: {
      from: "receivable_invoices",
      localField: "sales_order_id",
      foreignField: "sales_order_id",
      as: "invoices"
    }
  },
  {
    $match: {
      invoices: { $size: 0 }
    }
  },
  {
    $group: {
      _id: "$sales_order_id",
      jobs: { $push: { job_number: "$job_number", status: "$status" } },
      job_count: { $sum: 1 }
    }
  },
  {
    $lookup: {
      from: "sales_orders",
      localField: "_id",
      foreignField: "id",
      as: "sales_order"
    }
  },
  {
    $project: {
      sales_order_id: "$_id",
      spa_number: { $arrayElemAt: ["$sales_order.spa_number", 0] },
      jobs: 1,
      job_count: 1
    }
  }
]);
```

**Step 3: Use the sales_order_id to trigger invoice generation**

Use the API endpoint or Python script with the found `sales_order_id`.

### Option 3: Use the Python Script

```bash
# Set your API token
export API_TOKEN="your-token-here"

# Trigger for a specific sales order
python scripts/trigger_invoice_for_job.py --sales-order-id <sales_order_id>

# Find missing invoices (shows MongoDB query)
python scripts/trigger_invoice_for_job.py --find-missing
```

## What the Endpoint Does

1. Checks if invoice already exists (returns existing invoice if found)
2. Validates that all jobs for the sales order are dispatched/closed
3. Validates that delivery orders exist
4. Creates the consolidated invoice with all line items
5. Sends notification to finance team
6. Returns the created invoice details

## Error Handling

The endpoint will return appropriate errors for:
- Sales order not found (404)
- Not all jobs dispatched/closed (400)
- No delivery orders found (400)
- Invoice already exists (returns existing invoice info)
- Permission denied (403)

## Notes

- The safeguard fix ensures that invoices are only created when delivery orders exist
- The endpoint can be called multiple times safely (returns existing invoice if already created)
- All invoices are created with status "PENDING" and require finance approval

