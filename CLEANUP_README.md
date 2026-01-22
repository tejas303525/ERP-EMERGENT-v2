# Database Cleanup Script

This script will **permanently delete** all records from the following collections:

- `shipping_bookings` - All shipping container bookings
- `purchase_orders` - All purchase orders
- `transport_inward` - All inward transport records
- `transport_outward` - All outward transport records
- `transport_schedules` - All transport schedules
- `imports` - All import records
- `import_checklists` - All import checklists

**Note:** `transport_routes` is **NOT** deleted as it contains configuration data.

## Usage

### Option 1: Python Script (Recommended)
```bash
cd backend
python cleanup_shipping_transport.py
```

### Option 2: Windows Batch File
Double-click `cleanup_database.bat` or run:
```cmd
cleanup_database.bat
```

### Option 3: PowerShell
```powershell
.\cleanup_database.ps1
```

## Safety Features

1. **Confirmation Required**: The script will show you how many records will be deleted and ask for confirmation
2. **Type 'YES' to confirm**: You must type exactly 'YES' to proceed
3. **Reference Cleanup**: Also removes shipping/transport references from job_orders

## What Gets Cleaned

- All shipping bookings (SHP-*)
- All purchase orders (PO-*)
- All transport records (inward and outward)
- All transport schedules
- All import records
- All import checklists
- Shipping/transport references in job_orders (but not the job orders themselves)

## What is NOT Deleted

- Job orders (only references are cleaned)
- Sales orders
- Quotations
- Customers
- Products
- Users
- Transport routes (configuration)
- Other business data

## Requirements

- Python 3.7+
- motor (MongoDB async driver)
- python-dotenv
- MongoDB connection configured in `.env` file

## Example Output

```
Connecting to database: erp_database
MongoDB URL: localhost:27017

============================================================
WARNING: This will DELETE ALL records from the following collections:
============================================================
  - shipping_bookings: 75 records
  - transport_inward: 10 records
  - transport_outward: 25 records
  - transport_schedules: 30 records
  - purchase_orders: 44 records
  - imports: 5 records
  - import_checklists: 8 records
============================================================

Are you sure you want to proceed? Type 'YES' to confirm: YES

Starting cleanup...
✓ shipping_bookings: Deleted 75 records
✓ transport_inward: Deleted 10 records
✓ transport_outward: Deleted 25 records
✓ transport_schedules: Deleted 30 records
✓ purchase_orders: Deleted 44 records
✓ imports: Deleted 5 records
✓ import_checklists: Deleted 8 records

============================================================
Cleanup complete! Total records deleted: 197
============================================================

Cleaning up references in job_orders...
✓ Removed shipping/transport references from 15 job orders

Done!
```

